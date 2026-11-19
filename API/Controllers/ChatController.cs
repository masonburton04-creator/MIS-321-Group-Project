using System.Diagnostics;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using API.Data;
using API.Models;
using API.Services;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using MySqlConnector;

namespace API.Controllers;

// The "Ask Val" chatbot. Anyone can use it (signed in or not).
//
//   POST /api/chat           streams a reply as NDJSON, one JSON object per line:
//                            {type:"meta", conversationId}  then  {type:"token", text} ...
//                            then optionally {type:"quote", quote}  and finally  {type:"done", messageId, outcome}
//                            or {type:"error", message}
//   POST /api/chat/quote     Quick estimate form (no AI, instant). Same formula as the application.
//   POST /api/chat/feedback  thumbs up / down on a reply
//   POST /api/chat/event     { type: "apply_click" } when the customer starts an application from the chat
//   GET  /api/chat/status    is Ollama running with the model downloaded? Also warms the model up.
//
// Every reply is logged to chat_sessions / chat_messages for the dashboard (09_ai_chatbot.sql).
// If those tables are missing, the chat still works; it just isn't counted.
[ApiController]
[Route("api/chat")]
public partial class ChatController : ControllerBase
{
    private const int MaxQuestionChars = 600;
    private const int HistoryTurns = 8;            // older messages are dropped to keep replies fast

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private readonly Database _db;
    private readonly OllamaClient _ollama;
    private readonly KnowledgeBase _knowledge;
    private readonly ILogger<ChatController> _log;

    public ChatController(Database db, OllamaClient ollama, KnowledgeBase knowledge, ILogger<ChatController> log)
    {
        _knowledge = knowledge;
        _db = db;
        _ollama = ollama;
        _log = log;
    }

    [HttpGet("status")]
    public async Task<IActionResult> Status(CancellationToken ct)
    {
        var (available, problem) = await _ollama.CheckAsync(ct);
        if (available)
        {
            _ollama.WarmUpInBackground("chat opened");
            _ = _knowledge.EnsureLoadedAsync(); // retries if the embedding model was missing at startup
        }
        return Ok(new
        {
            available, model = _ollama.Model, problem,
            knowledge = new { ready = _knowledge.Ready, sections = _knowledge.ChunkCount, problem = _knowledge.Problem }
        });
    }

    [HttpPost]
    [EnableRateLimiting("chat")]
    public async Task Chat([FromBody] ChatRequest request, CancellationToken ct)
    {
        // ---- Check the request ----
        var history = request.Messages
            .Where(m => m.Role is "user" or "assistant" && !string.IsNullOrWhiteSpace(m.Content))
            .TakeLast(HistoryTurns)
            .Select(m => new ChatTurn { Role = m.Role, Content = Cut(m.Content.Trim(), m.Role == "user" ? MaxQuestionChars : 1500) })
            .ToList();
        if (history.Count == 0 || history[^1].Role != "user")
        {
            Response.StatusCode = 400;
            await Response.WriteAsJsonAsync(new { error = "Send a question." }, ct);
            return;
        }
        if (request.Messages.LastOrDefault()?.Content.Length > MaxQuestionChars)
        {
            Response.StatusCode = 400;
            await Response.WriteAsJsonAsync(new { error = $"Please keep questions under {MaxQuestionChars} characters." }, ct);
            return;
        }

        var question = history[^1].Content;
        var accountId = await CurrentCustomerAsync();
        var conversation = await StartConversationAsync(request.ConversationId, accountId, request.StateCode);

        // ---- Start streaming ----
        Response.ContentType = "application/x-ndjson; charset=utf-8";
        Response.Headers.CacheControl = "no-cache";
        HttpContext.Features.Get<IHttpResponseBodyFeature>()?.DisableBuffering();
        await SendAsync(new { type = "meta", conversationId = conversation.PublicId }, ct);

        var clock = Stopwatch.StartNew();
        int? firstTokenMs = null;
        int? outputTokens = null;
        var reply = new StringBuilder();
        string outcome = "answered";
        string? quoteLines = null;
        string? sources = null;

        try
        {
            var priceRequest = InjectionRegex().IsMatch(question) ? null : PriceQuestion(history, request.StateCode);
            if (InjectionRegex().IsMatch(question))
            {
                // Obvious attempts to override the rules never reach the model
                reply.Append(ChatKnowledge.OffTopicReply).Append(" Ask me about homeowners, flood, jewelry, or auto coverage.");
                firstTokenMs = 0;
                outcome = "off_topic";
                await SendAsync(new { type = "token", text = reply.ToString() }, ct);
            }
            else if (priceRequest != null)
            {
                // Price questions skip the model: same formula as the application, answered instantly
                var (text, quoteOutcome, quote) = priceRequest.Lines.Count == 0
                    ? (ChatQuoteBuilder.WhichLine, "quote_incomplete", (QuoteResponse?)null)
                    : await RunQuoteAsync(priceRequest, ct);
                firstTokenMs = (int)clock.ElapsedMilliseconds;
                reply.Append(text);
                outcome = quoteOutcome;
                quoteLines = quote == null ? null : string.Join(",", quote.Lines.Select(l => l.LineCode));
                await SendAsync(new { type = "token", text }, ct);
                if (quote != null && quoteOutcome is "quote" or "quote_referred")
                    await SendAsync(new { type = "quote", quote }, ct);
            }
            else
            {
                var messages = new List<object> { new { role = "system", content = ChatKnowledge.SystemPrompt } };
                messages.AddRange(history.Take(history.Count - 1).Select(m => new { role = m.Role, content = m.Content }));

                // Embedding search over API/Knowledge. The notes go right before the question, after the
                // fixed system prompt, so Ollama can keep reusing the prompt it has already read.
                var matches = await FindNotesAsync(history, request.StateCode, ct);
                if (matches.Count > 0)
                {
                    messages.Add(new { role = "system", content = KnowledgeBase.FormatNotes(matches, request.StateCode?.Trim().ToUpperInvariant()) });
                    sources = string.Join("; ", matches.Select(m => m.Chunk.Section));
                    await SendAsync(new { type = "sources", sources = matches.Select(m => new { document = m.Chunk.Document, section = m.Chunk.Section }) }, ct);
                }
                messages.Add(new { role = "user", content = question });

                await foreach (var chunk in _ollama.StreamChatAsync(messages, ct))
                {
                    if (chunk.Content.Length > 0)
                    {
                        firstTokenMs ??= (int)clock.ElapsedMilliseconds;
                        reply.Append(chunk.Content);
                        await SendAsync(new { type = "token", text = chunk.Content }, ct);
                    }
                    if (chunk.Done) outputTokens = chunk.OutputTokens;
                }

                if (reply.ToString().Contains("I can only help with insurance", StringComparison.OrdinalIgnoreCase))
                    outcome = "off_topic";
                else if (reply.Length == 0)
                {
                    reply.Append("Sorry, I didn't catch that. Could you ask it another way?");
                    await SendAsync(new { type = "token", text = reply.ToString() }, ct);
                }
            }
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            // The customer pressed Stop or closed the page. Log what was said so far.
            outcome = "stopped";
        }
        catch (Exception ex) when (ex is HttpRequestException or OllamaException or IOException)
        {
            outcome = "error";
            var message = ex is OllamaException oe ? oe.Message
                : "The chatbot isn't running. Start the Ollama app (or run: ollama serve), then try again.";
            _log.LogWarning("Chat reply failed: {Error}", ex.Message);
            if (!ct.IsCancellationRequested) await SendAsync(new { type = "error", message }, CancellationToken.None);
        }

        var messageId = await LogTurnAsync(conversation.ChatId, question, reply.ToString(), DetectTopic(question, quoteLines),
            outcome, quoteLines, "chat", firstTokenMs, (int)clock.ElapsedMilliseconds, outputTokens, sources);
        if (!ct.IsCancellationRequested)
            await SendAsync(new { type = "done", messageId, outcome, ms = clock.ElapsedMilliseconds }, CancellationToken.None);
    }

    // Quick estimate form inside the chat panel: no AI involved, so it's instant
    [HttpPost("quote")]
    [EnableRateLimiting("chat")]
    public async Task<IActionResult> Quote([FromBody] ChatQuoteRequest request, CancellationToken ct)
    {
        var clock = Stopwatch.StartNew();
        var accountId = await CurrentCustomerAsync();
        var conversation = await StartConversationAsync(request.ConversationId, accountId, request.StateCode);
        var (text, outcome, quote) = await RunQuoteAsync(request, ct);
        var lines = string.Join(",", request.Lines.Select(ChatQuoteBuilder.NormalizeLine).Where(l => l != null));
        var asked = "Quick estimate: " + string.Join(", ", request.Lines.Select(l => ChatQuoteBuilder.LineNames.GetValueOrDefault(l, l)));
        var messageId = await LogTurnAsync(conversation.ChatId, asked, text, DetectTopic("", lines), outcome,
            quote == null ? null : lines, "form", (int)clock.ElapsedMilliseconds, (int)clock.ElapsedMilliseconds, null);
        return Ok(new { conversationId = conversation.PublicId, messageId, outcome, text, quote = outcome == "quote_incomplete" ? null : quote });
    }

    [HttpPost("feedback")]
    public async Task<IActionResult> Feedback([FromBody] ChatFeedbackRequest request)
    {
        try
        {
            await using var conn = await _db.OpenAsync();
            var cmd = new MySqlCommand(
                @"UPDATE chat_messages m JOIN chat_sessions s ON s.chat_id = m.chat_id
                  SET m.helpful = @helpful
                  WHERE m.message_id = @id AND s.public_id = @conversation AND m.sender = 'assistant'", conn);
            cmd.Parameters.AddWithValue("@helpful", request.Helpful);
            cmd.Parameters.AddWithValue("@id", request.MessageId);
            cmd.Parameters.AddWithValue("@conversation", request.ConversationId);
            await cmd.ExecuteNonQueryAsync();
        }
        catch (MySqlException ex)
        {
            _log.LogWarning("Chat feedback not saved: {Error}", ex.Message);
        }
        return NoContent();
    }

    [HttpPost("event")]
    public async Task<IActionResult> Event([FromBody] ChatEventRequest request)
    {
        if (request.Type != "apply_click") return BadRequest(new { error = "Unknown event." });
        try
        {
            await using var conn = await _db.OpenAsync();
            var cmd = new MySqlCommand("UPDATE chat_sessions SET clicked_apply = TRUE WHERE public_id = @conversation", conn);
            cmd.Parameters.AddWithValue("@conversation", request.ConversationId);
            await cmd.ExecuteNonQueryAsync();
        }
        catch (MySqlException ex)
        {
            _log.LogWarning("Chat event not saved: {Error}", ex.Message);
        }
        return NoContent();
    }

    // ---------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------

    private async Task<(string Text, string Outcome, QuoteResponse? Quote)> RunQuoteAsync(ChatQuoteRequest request, CancellationToken ct)
    {
        var askedState = request.StateCode?.Trim().ToUpperInvariant();
        var detail = ChatQuoteBuilder.ToApplication(request, out var extraMissing);
        if (detail.LineCodes.Count == 0)
            return ("Which insurance would you like an estimate for: Homeowners, Flood, Jewelry, or Auto?", "quote_incomplete", null);
        try
        {
            await using var conn = await _db.OpenAsync();
            var quote = await ApplicationsController.BuildQuoteAsync(conn, detail);
            var (text, outcome) = ChatQuoteBuilder.Describe(quote, extraMissing, askedState);
            return (text, outcome, quote);
        }
        catch (Exception ex) when (ex is MySqlException or InvalidOperationException)
        {
            _log.LogWarning("Chat quote failed: {Error}", ex.Message);
            return ("I can't calculate estimates right now because the quote rates aren't available. " +
                    "You can still start an application, and an agent will price it.", "error", null);
        }
    }

    private async Task<int?> CurrentCustomerAsync()
    {
        var result = await HttpContext.AuthenticateAsync(CustomerTokenAuthHandler.SchemeName);
        return result.Succeeded ? CustomerTokenAuthHandler.CurrentAccountId(result.Principal!) : null;
    }

    private record Conversation(int? ChatId, string PublicId);

    // Finds the conversation the browser is continuing, or starts one
    private async Task<Conversation> StartConversationAsync(string? publicId, int? accountId, string? stateCode)
    {
        var id = Guid.TryParse(publicId, out var g) ? g.ToString() : Guid.NewGuid().ToString();
        var state = stateCode?.Trim().ToUpperInvariant() is { Length: 2 } s ? s : null;
        try
        {
            await using var conn = await _db.OpenAsync();
            var cmd = new MySqlCommand(
                @"INSERT INTO chat_sessions (public_id, account_id, state_code, last_message_at)
                  VALUES (@id, @account, @state, NOW())
                  ON DUPLICATE KEY UPDATE last_message_at = NOW(),
                                          account_id = COALESCE(@account, account_id),
                                          state_code = COALESCE(@state, state_code);
                  SELECT chat_id FROM chat_sessions WHERE public_id = @id;", conn);
            cmd.Parameters.AddWithValue("@id", id);
            cmd.Parameters.AddWithValue("@account", accountId);
            cmd.Parameters.AddWithValue("@state", state);
            return new Conversation(Convert.ToInt32(await cmd.ExecuteScalarAsync()), id);
        }
        catch (MySqlException ex)
        {
            _log.LogWarning("Chat not logged (run Database/09_ai_chatbot.sql?): {Error}", ex.Message);
            return new Conversation(null, id);
        }
    }

    // Short follow-ups ("what about Texas?") are searched together with the question before them
    private async Task<List<KnowledgeBase.Match>> FindNotesAsync(List<ChatTurn> history, string? pageState, CancellationToken ct)
    {
        var question = history[^1].Content;
        var previous = history.Take(history.Count - 1).LastOrDefault(m => m.Role == "user")?.Content;
        var query = previous != null && question.Split(' ', StringSplitOptions.RemoveEmptyEntries).Length < 6
            ? previous + " " + question
            : question;
        try
        {
            return await _knowledge.SearchAsync(query, pageState, ct);
        }
        catch (Exception ex) when (ex is HttpRequestException or OllamaException)
        {
            _log.LogWarning("Knowledge search skipped: {Error}", ex.Message);
            return new List<KnowledgeBase.Match>();
        }
    }

    private async Task<long?> LogTurnAsync(int? chatId, string question, string reply, string topic, string outcome,
        string? quoteLines, string quoteSource, int? firstTokenMs, int totalMs, int? outputTokens, string? sources = null)
    {
        if (chatId == null) return null;
        try
        {
            await using var conn = await _db.OpenAsync();
            var cmd = new MySqlCommand(
                @"INSERT INTO chat_messages (chat_id, sender, content, topic) VALUES (@chat, 'customer', @question, @topic);
                  INSERT INTO chat_messages (chat_id, sender, content, topic, outcome, quote_lines, quote_source,
                                             first_token_ms, total_ms, output_tokens, model, sources)
                  VALUES (@chat, 'assistant', @reply, @topic, @outcome, @lines, @source, @first, @total, @tokens, @model, @sources);
                  SELECT LAST_INSERT_ID();", conn);
            cmd.Parameters.AddWithValue("@chat", chatId);
            cmd.Parameters.AddWithValue("@question", Cut(question, 500));
            cmd.Parameters.AddWithValue("@reply", Cut(reply.Length == 0 ? "(no reply)" : reply, 2000));
            cmd.Parameters.AddWithValue("@topic", topic);
            cmd.Parameters.AddWithValue("@outcome", outcome);
            cmd.Parameters.AddWithValue("@lines", quoteLines);
            cmd.Parameters.AddWithValue("@source", quoteLines == null ? null : quoteSource);
            cmd.Parameters.AddWithValue("@first", firstTokenMs);
            cmd.Parameters.AddWithValue("@total", totalMs);
            cmd.Parameters.AddWithValue("@tokens", outputTokens);
            cmd.Parameters.AddWithValue("@model", quoteSource == "form" ? "quick-estimate-form" : _ollama.Model);
            cmd.Parameters.AddWithValue("@sources", sources == null ? null : Cut(sources, 255));
            return Convert.ToInt64(await cmd.ExecuteScalarAsync());
        }
        catch (MySqlException ex)
        {
            _log.LogWarning("Chat message not logged: {Error}", ex.Message);
            return null;
        }
    }

    private async Task SendAsync(object payload, CancellationToken ct)
    {
        await Response.WriteAsync(JsonSerializer.Serialize(payload, Json) + "\n", ct);
        await Response.Body.FlushAsync(ct);
    }

    // Server replies that ask the customer for quote details (so their next message continues the quote)
    private static bool IsQuotePrompt(string reply) =>
        reply.StartsWith("To estimate") || reply.StartsWith("Which insurance would you like an estimate");

    // Is this a price question (or an answer to "To estimate ..., I still need")? Returns the facts if so.
    private static ChatQuoteRequest? PriceQuestion(List<ChatTurn> history, string? pageState)
    {
        var latest = history[^1].Content;
        var thread = new List<string> { latest };
        var startsHere = ChatQuoteBuilder.AsksForPrice(latest);

        if (!startsHere)
        {
            // Walk back through "I still need..." prompts to the message that asked for a price
            var continuing = false;
            for (var i = history.Count - 2; i >= 0; i--)
            {
                var m = history[i];
                if (m.Role == "assistant")
                {
                    if (!IsQuotePrompt(m.Content)) break;
                    continue;
                }
                thread.Insert(0, m.Content);
                if (ChatQuoteBuilder.AsksForPrice(m.Content)) { continuing = true; break; }
            }
            if (!continuing) return null;
        }

        var request = ChatQuoteBuilder.FromText(string.Join("\n", thread), latest, pageState, out var factsInLatest);
        // A follow-up with no new facts is probably a new question ("what's liability?"): let the model answer
        return startsHere || (factsInLatest > 0 && !ChatQuoteBuilder.IsQuestion(latest)) ? request : null;
    }

    private static string DetectTopic(string question, string? quoteLines)
    {
        if (!string.IsNullOrEmpty(quoteLines)) return quoteLines.Split(',')[0];
        var q = question.ToLowerInvariant();
        if (FloodRegex().IsMatch(q)) return "FLOOD";
        if (JewelryRegex().IsMatch(q)) return "JEWELRY";
        if (AutoRegex().IsMatch(q)) return "AUTO";
        if (HomeRegex().IsMatch(q)) return "HOME";
        return "GENERAL";
    }

    private static string Cut(string s, int max) => s.Length <= max ? s : s[..max];

    [GeneratedRegex(@"\b(quote|quotes|estimate|estimates|price|prices|pricing|cost|costs|how much|premium|premiums|rate|rates|afford|cheap|cheaper|expensive|per year|per month)\b", RegexOptions.IgnoreCase)]
    private static partial Regex QuoteIntentRegex();
    [GeneratedRegex(@"(ignore|disregard|forget)\s+(all\s+|any\s+|the\s+|your\s+)?(previous|prior|above|earlier)?\s*(instructions|rules|prompt)|system prompt|jailbreak|\bDAN\b|developer mode", RegexOptions.IgnoreCase)]
    private static partial Regex InjectionRegex();
    [GeneratedRegex(@"\b(flood|nfip|storm surge|flood zone|zone (x|a|ae|v|ve))\b")]
    private static partial Regex FloodRegex();
    [GeneratedRegex(@"\b(jewel\w*|ring|rings|necklace|diamond\w*|bracelet|earrings?|watch|watches|appraisal|floater)\b")]
    private static partial Regex JewelryRegex();
    [GeneratedRegex(@"\b(auto|car|cars|vehicle\w*|driver\w*|truck|collision|comprehensive|pip|uninsured|motorist|liability limits)\b")]
    private static partial Regex AutoRegex();
    [GeneratedRegex(@"\b(home\w*|house|dwelling|roof|condo|rebuild|coverage [a-f]|personal property|loss of use|hurricane|wind|hail)\b")]
    private static partial Regex HomeRegex();
}

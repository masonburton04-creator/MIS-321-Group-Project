using System.Net.Http.Json;
using System.Runtime.CompilerServices;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace API.Services;

// Settings from appsettings.json "Ollama" (or user secrets / environment variables).
public class OllamaOptions
{
    public string BaseUrl { get; set; } = "http://localhost:11434";
    public string Model { get; set; } = "llama3.2:3b";
    public string EmbeddingModel { get; set; } = "nomic-embed-text"; // for searching API/Knowledge
    public string KeepAlive { get; set; } = "60m";  // keep the model in memory between messages
    public int ContextTokens { get; set; } = 4096;  // smaller = less memory and faster
    public int MaxReplyTokens { get; set; } = 320;  // caps how long one answer can run
    public double Temperature { get; set; } = 0.2;  // low = consistent, sticks to the facts
}

public class OllamaChunk
{
    public string Content { get; set; } = "";
    public bool Done { get; set; }
    public int? OutputTokens { get; set; }
}

public class OllamaException : Exception
{
    public bool ModelMissing { get; }
    public OllamaException(string message, bool modelMissing = false) : base(message) { ModelMissing = modelMissing; }
}

// Talks to the local Ollama server (https://github.com/ollama/ollama/blob/main/docs/api.md).
// Replies are streamed word by word so the customer sees text right away.
public class OllamaClient
{
    private static readonly JsonSerializerOptions Json = new()
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    private readonly HttpClient _http;
    private readonly OllamaOptions _options;
    private readonly ILogger<OllamaClient> _log;
    private DateTime _lastWarm = DateTime.MinValue;
    private int _warming;

    public OllamaClient(HttpClient http, OllamaOptions options, ILogger<OllamaClient> log)
    {
        _http = http;
        _options = options;
        _log = log;
        _http.BaseAddress = new Uri(options.BaseUrl);
        _http.Timeout = Timeout.InfiniteTimeSpan; // long replies stream for a while; callers cancel instead
    }

    public string Model => _options.Model;
    public string EmbeddingModel => _options.EmbeddingModel;

    public async IAsyncEnumerable<OllamaChunk> StreamChatAsync(IEnumerable<object> messages,
        [EnumeratorCancellation] CancellationToken ct)
    {
        var body = new
        {
            model = _options.Model,
            messages,
            stream = true,
            keep_alive = _options.KeepAlive,
            options = new
            {
                num_ctx = _options.ContextTokens,
                num_predict = _options.MaxReplyTokens,
                temperature = _options.Temperature,
                top_p = 0.9
            }
        };

        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/chat")
        {
            Content = JsonContent.Create(body, options: Json)
        };
        using var response = await _http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
        if (!response.IsSuccessStatusCode)
            throw ToException(await response.Content.ReadAsStringAsync(ct));

        _lastWarm = DateTime.UtcNow;
        await using var stream = await response.Content.ReadAsStreamAsync(ct);
        using var reader = new StreamReader(stream);
        while (await reader.ReadLineAsync(ct) is { } line)
        {
            if (line.Length == 0) continue;
            using var doc = JsonDocument.Parse(line);
            var root = doc.RootElement;
            if (root.TryGetProperty("error", out var error))
                throw ToException(line);

            var chunk = new OllamaChunk { Done = root.TryGetProperty("done", out var done) && done.GetBoolean() };
            if (root.TryGetProperty("message", out var message))
            {
                if (message.TryGetProperty("content", out var content))
                    chunk.Content = content.GetString() ?? "";
            }
            if (chunk.Done && root.TryGetProperty("eval_count", out var evalCount))
                chunk.OutputTokens = evalCount.GetInt32();
            yield return chunk;
        }
    }

    // Text -> vectors with the embedding model, for KnowledgeBase. Several texts per call.
    public async Task<List<float[]>> EmbedAsync(List<string> texts, CancellationToken ct)
    {
        var body = new { model = _options.EmbeddingModel, input = texts, keep_alive = _options.KeepAlive };
        using var response = await _http.PostAsJsonAsync("/api/embed", body, ct);
        var text = await response.Content.ReadAsStringAsync(ct);
        if (!response.IsSuccessStatusCode)
        {
            var problem = ToException(text);
            throw problem.ModelMissing
                ? new OllamaException($"The embedding model isn't downloaded. Run: ollama pull {_options.EmbeddingModel}", modelMissing: true)
                : problem;
        }
        using var doc = JsonDocument.Parse(text);
        return doc.RootElement.GetProperty("embeddings").EnumerateArray()
            .Select(v => v.EnumerateArray().Select(x => x.GetSingle()).ToArray())
            .ToList();
    }

    // Loads the model and reads the system prompt once, so the first real question doesn't
    // pay for it. Runs in the background at API startup and when the chat panel opens.
    public void WarmUpInBackground(string reason)
    {
        if (DateTime.UtcNow - _lastWarm < TimeSpan.FromMinutes(20)) return;
        if (Interlocked.Exchange(ref _warming, 1) == 1) return;
        _ = Task.Run(async () =>
        {
            var started = DateTime.UtcNow;
            try
            {
                var messages = new object[]
                {
                    new { role = "system", content = ChatKnowledge.SystemPrompt },
                    new { role = "user", content = "Hi" }
                };
                using var cts = new CancellationTokenSource(TimeSpan.FromMinutes(5));
                var body = new
                {
                    model = _options.Model, messages, stream = false, keep_alive = _options.KeepAlive,
                    options = new { num_ctx = _options.ContextTokens, num_predict = 1, temperature = _options.Temperature }
                };
                using var response = await _http.PostAsJsonAsync("/api/chat", body, cts.Token);
                if (response.IsSuccessStatusCode)
                {
                    _lastWarm = DateTime.UtcNow;
                    _log.LogInformation("Chatbot model {Model} is ready ({Seconds:0.0}s, {Reason}).",
                        _options.Model, (DateTime.UtcNow - started).TotalSeconds, reason);
                }
                else
                {
                    _log.LogWarning("Chatbot warm-up failed: {Error}", ToException(await response.Content.ReadAsStringAsync()).Message);
                }
            }
            catch (Exception ex)
            {
                _log.LogWarning("Chatbot warm-up skipped: Ollama isn't reachable at {Url} ({Error}).", _options.BaseUrl, ex.Message);
            }
            finally
            {
                Interlocked.Exchange(ref _warming, 0);
            }
        });
    }

    // Is Ollama running, and is the model downloaded?
    public async Task<(bool Available, string? Problem)> CheckAsync(CancellationToken ct)
    {
        try
        {
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            cts.CancelAfter(TimeSpan.FromSeconds(3));
            using var doc = JsonDocument.Parse(await _http.GetStringAsync("/api/tags", cts.Token));
            var wanted = WithTag(_options.Model);
            var installed = doc.RootElement.GetProperty("models").EnumerateArray()
                .Any(m => WithTag(m.GetProperty("name").GetString() ?? "") == wanted);
            return installed
                ? (true, null)
                : (false, $"The chatbot model isn't downloaded. Run: ollama pull {_options.Model}");
        }
        catch (Exception) when (!ct.IsCancellationRequested)
        {
            return (false, "The chatbot isn't running. Start the Ollama app, then try again.");
        }
    }

    private static string WithTag(string name) => name.Contains(':') ? name : name + ":latest";

    private OllamaException ToException(string body)
    {
        string message;
        try { message = JsonDocument.Parse(body).RootElement.GetProperty("error").GetString() ?? body; }
        catch (Exception) { message = body; }

        if (message.Contains("not found", StringComparison.OrdinalIgnoreCase))
            return new OllamaException($"The chatbot model isn't downloaded. Run: ollama pull {_options.Model}", modelMissing: true);
        if (message.Contains("allocate", StringComparison.OrdinalIgnoreCase) || message.Contains("memory", StringComparison.OrdinalIgnoreCase))
            return new OllamaException("The computer doesn't have enough free memory to run the chatbot model. Close some programs or use a smaller model.");
        return new OllamaException("The chatbot model returned an error: " + message);
    }
}

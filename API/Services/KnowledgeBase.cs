using System.Text.RegularExpressions;

namespace API.Services;

// Embedding search over the context documents in API/Knowledge/*.md, for the chatbot.
//
//   Startup:  each "## " section of each document becomes one chunk, and Ollama's embedding model
//             (nomic-embed-text) turns every chunk into a vector, kept in memory (~1-3 seconds).
//   Question: the question is turned into a vector too, and the closest chunks (cosine similarity)
//             are handed to the chat model as reference notes for that one answer.
//
// To add knowledge, add or edit a .md file in API/Knowledge and restart the API. No database needed.
// If the embedding model isn't downloaded, the chatbot still works from its built-in prompt.
public partial class KnowledgeBase
{
    public record Chunk(string File, string Document, string Section, string Text, string? StateCode, float[] Vector);
    public record Match(Chunk Chunk, double Score);

    private const int MaxChunks = 2;          // more notes = more for the model to read = slower answers
    private const double MinScore = 0.55;     // below this, a chunk isn't really about the question
    private const double MaxGapFromBest = 0.08; // extra chunks must be nearly as close as the best one

    private static readonly Dictionary<string, string> StateWords = new(StringComparer.OrdinalIgnoreCase)
    {
        ["alabama"] = "AL", ["texas"] = "TX", ["new york"] = "NY"
    };

    private readonly OllamaClient _ollama;
    private readonly ILogger<KnowledgeBase> _log;
    private readonly string _folder;
    private List<Chunk> _chunks = new();
    private Task? _loading;

    public KnowledgeBase(OllamaClient ollama, ILogger<KnowledgeBase> log, IWebHostEnvironment env)
    {
        _ollama = ollama;
        _log = log;
        // The .md files are copied next to the API's .dll on build; fall back to the source folder
        var built = Path.Combine(AppContext.BaseDirectory, "Knowledge");
        _folder = Directory.Exists(built) ? built : Path.Combine(env.ContentRootPath, "Knowledge");
    }

    public bool Ready => _chunks.Count > 0;
    public int ChunkCount => _chunks.Count;
    public string? Problem { get; private set; } = "The knowledge documents haven't loaded yet.";

    // Builds the index in the background (startup), or again later if the first try failed
    public Task EnsureLoadedAsync()
    {
        if (Ready) return Task.CompletedTask;
        if (_loading is { IsCompleted: false }) return _loading;
        return _loading = Task.Run(LoadAsync);
    }

    private async Task LoadAsync()
    {
        var started = DateTime.UtcNow;
        try
        {
            var parsed = Directory.GetFiles(_folder, "*.md").OrderBy(f => f).SelectMany(ParseFile).ToList();
            if (parsed.Count == 0)
            {
                Problem = $"No .md files found in {_folder}.";
                return;
            }

            // Sections that haven't changed since last time reuse their saved vectors (Knowledge/.embeddings.json
            // next to the .dll), so restarts don't re-embed everything
            var texts = parsed.Select(p => "search_document: " + p.Document + ". " + p.Section + ". " + p.Text).ToList();
            var cache = LoadCache();
            var missing = texts.Where(t => !cache.ContainsKey(Hash(t))).Distinct().ToList();
            if (missing.Count > 0)
            {
                using var cts = new CancellationTokenSource(TimeSpan.FromMinutes(3));
                var fresh = await _ollama.EmbedAsync(missing, cts.Token);
                for (var i = 0; i < missing.Count; i++) cache[Hash(missing[i])] = fresh[i];
                SaveCache(texts.Select(Hash).ToHashSet(), cache);
            }
            _chunks = parsed.Select((p, i) => p with { Vector = Normalize(cache[Hash(texts[i])]) }).ToList();
            Problem = null;
            _log.LogInformation("Chatbot knowledge: {Chunks} sections from {Files} documents ready in {Seconds:0.0}s ({New} newly embedded).",
                _chunks.Count, _chunks.Select(c => c.File).Distinct().Count(), (DateTime.UtcNow - started).TotalSeconds, missing.Count);
        }
        catch (Exception ex)
        {
            Problem = ex is OllamaException oe ? oe.Message : "Couldn't index the knowledge documents: " + ex.Message;
            _log.LogWarning("Chatbot knowledge not indexed: {Error}", Problem);
        }
    }

    // The closest sections to the question. pageState = the state picked on the website.
    public async Task<List<Match>> SearchAsync(string question, string? pageState, CancellationToken ct)
    {
        if (!Ready) return new List<Match>();

        var query = Normalize((await _ollama.EmbedAsync(new List<string> { "search_query: " + question }, ct))[0]);

        // A question that names a state only gets that state's rules. Otherwise the state picked on
        // the site wins ties, so "what's the minimum auto coverage?" answers for the customer's state.
        var named = StateRegex().Matches(question)
            .Select(m => m.Value.Length == 2 ? m.Value.ToUpperInvariant() : StateWords[m.Value])
            .ToHashSet();

        return _chunks
            .Where(c => c.StateCode == null || named.Count == 0 || named.Contains(c.StateCode))
            .Select(c =>
            {
                var score = Dot(query, c.Vector);
                if (c.StateCode != null && named.Count == 0)
                    score += c.StateCode == pageState ? 0.03 : -0.04;
                return new Match(c, score);
            })
            .Where(m => m.Score >= MinScore)
            .OrderByDescending(m => m.Score)
            .Take(MaxChunks)
            .ToList()
            is var top && top.Count > 0
                ? top.Where(m => m.Score >= top[0].Score - MaxGapFromBest).ToList() // drop weak extras: less to read, faster answers
                : top;
    }

    // Reference notes as they're shown to the chat model
    public static string FormatNotes(List<Match> matches, string? pageState)
    {
        var state = StateWords.FirstOrDefault(s => s.Value == pageState).Key;
        var picked = state == null || matches.All(m => m.Chunk.StateCode == null)
            ? ""
            : $" The customer picked {CultureInfoTitle(state)} on the website, so if the question doesn't name a state, answer for {CultureInfoTitle(state)}.";
        return "REFERENCE NOTES from Valent Partners documents. Answer from these when they are relevant; " +
               "if they don't answer the question, say a licensed agent can confirm." + picked + "\n\n" +
               string.Join("\n\n", matches.Select(m => $"[{m.Chunk.Section}]\n{m.Chunk.Text}"));
    }

    private static string CultureInfoTitle(string s) =>
        System.Globalization.CultureInfo.InvariantCulture.TextInfo.ToTitleCase(s);

    // ---------------------------------------------------------------
    // Parsing and math
    // ---------------------------------------------------------------

    private static IEnumerable<Chunk> ParseFile(string path)
    {
        var text = CommentRegex().Replace(File.ReadAllText(path), "");
        var file = Path.GetFileName(path);
        var document = TitleRegex().Match(text) is { Success: true } t ? t.Groups[1].Value.Trim() : file;
        var state = StateWords.FirstOrDefault(s => document.StartsWith(s.Key, StringComparison.OrdinalIgnoreCase)).Value;

        foreach (var section in Regex.Split(text, @"^## ", RegexOptions.Multiline).Skip(1))
        {
            var newline = section.IndexOf('\n');
            if (newline < 0) continue;
            var heading = section[..newline].Trim();
            var body = Regex.Replace(section[(newline + 1)..].Trim(), @"\s+", " ");
            if (body.Length > 0) yield return new Chunk(file, document, heading, body, state, Array.Empty<float>());
        }
    }

    // Cache entries are keyed by the embedding model + section text, so editing a section or
    // switching models re-embeds just what changed. The file is a build artifact (not in the repo).
    private string CachePath => Path.Combine(_folder, ".embeddings.json");

    private string Hash(string text) => Convert.ToHexString(
        System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(_ollama.EmbeddingModel + "\n" + text)));

    private Dictionary<string, float[]> LoadCache()
    {
        try
        {
            return File.Exists(CachePath)
                ? System.Text.Json.JsonSerializer.Deserialize<Dictionary<string, float[]>>(File.ReadAllText(CachePath)) ?? new()
                : new();
        }
        catch (Exception) { return new(); } // corrupt or unreadable: just re-embed
    }

    private void SaveCache(HashSet<string> keep, Dictionary<string, float[]> cache)
    {
        try
        {
            File.WriteAllText(CachePath, System.Text.Json.JsonSerializer.Serialize(cache.Where(kv => keep.Contains(kv.Key)).ToDictionary()));
        }
        catch (Exception ex) { _log.LogInformation("Embedding cache not saved: {Error}", ex.Message); }
    }

    private static float[] Normalize(float[] v)
    {
        var length = Math.Sqrt(v.Sum(x => (double)x * x));
        return length == 0 ? v : v.Select(x => (float)(x / length)).ToArray();
    }

    private static double Dot(float[] a, float[] b)
    {
        double sum = 0;
        for (var i = 0; i < a.Length && i < b.Length; i++) sum += a[i] * b[i];
        return sum;
    }

    [GeneratedRegex(@"<!--.*?-->", RegexOptions.Singleline)]
    private static partial Regex CommentRegex();
    [GeneratedRegex(@"^# (.+)$", RegexOptions.Multiline)]
    private static partial Regex TitleRegex();
    [GeneratedRegex(@"(?i:\b(alabama|texas|new york)\b)|\b(AL|TX|NY)\b")]
    private static partial Regex StateRegex();
}

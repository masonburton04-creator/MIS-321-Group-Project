using System.Text.Json;
using System.Text.RegularExpressions;
using API.Data;
using API.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using MySqlConnector;

namespace API.Controllers;

// POST /api/events: behavior tracking from the customer site (mockup 1), saved to
// analytics_sessions / analytics_events for the dashboard's friction and visit-time metrics.
//
// The body is JSON (an EventBatch) but sent as text/plain, because the browser's
// navigator.sendBeacon (used when the visitor closes the tab) can only send plain types
// to another origin. Only event names, pages, step numbers, timings, and field NAMES are
// accepted: never what the customer typed.
[ApiController]
[Route("api/events")]
public class EventsController : ControllerBase
{
    private const int MaxEventsPerBatch = 50;
    private const int MaxDurationMs = 24 * 60 * 60 * 1000;

    private static readonly string[] EventNames =
    {
        "session_start", "page_view", "page_exit", "step_enter", "step_complete", "step_back",
        "validation_error", "save_for_later", "resume_application", "address_selected",
        "sign_in", "account_created", "guest_continue"
    };
    private static readonly string[] DeviceTypes = { "desktop", "mobile", "tablet" };
    private static readonly Regex SessionIdPattern = new("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$");
    private static readonly Regex KeyPattern = new("^[a-z0-9_]{1,50}$");
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly Database _db;

    public EventsController(Database db)
    {
        _db = db;
    }

    [HttpPost]
    [EnableRateLimiting("events")]
    [RequestSizeLimit(64 * 1024)]
    public async Task<IActionResult> Post()
    {
        EventBatch? batch;
        using (var bodyReader = new StreamReader(Request.Body))
        {
            try
            {
                batch = JsonSerializer.Deserialize<EventBatch>(await bodyReader.ReadToEndAsync(), JsonOptions);
            }
            catch (JsonException)
            {
                return BadRequest(new { error = "Events must be JSON." });
            }
        }

        if (batch == null || !SessionIdPattern.IsMatch(batch.SessionId))
            return BadRequest(new { error = "sessionId must be a UUID." });
        if (batch.Events.Count > MaxEventsPerBatch)
            return BadRequest(new { error = $"At most {MaxEventsPerBatch} events per request." });

        var events = new List<TrackedEvent>();
        foreach (var e in batch.Events)
        {
            if (!EventNames.Contains(e.Name)) continue; // unknown events are dropped, not errors
            if (e.Page != null && !KeyPattern.IsMatch(e.Page)) e.Page = null;
            if (e.StepNumber is < 1 or > 5) e.StepNumber = null;
            if (e.DurationMs is < 0 or > MaxDurationMs) e.DurationMs = null;
            events.Add(e);
        }

        await using var conn = await _db.OpenAsync();

        // The visit starts with its first batch; every later batch moves ended_at forward,
        // so started_at -> ended_at is the time from opening the site to leaving it
        var sessionCmd = new MySqlCommand(
            @"INSERT INTO analytics_sessions (session_id, state_code, device_type, ended_at)
              VALUES (@id, (SELECT state_code FROM states WHERE state_code = @state), @device, NOW())
              ON DUPLICATE KEY UPDATE ended_at = NOW(),
                                      state_code = COALESCE(VALUES(state_code), state_code)", conn);
        sessionCmd.Parameters.AddWithValue("@id", batch.SessionId);
        sessionCmd.Parameters.AddWithValue("@state", batch.StateCode?.Trim().ToUpperInvariant());
        sessionCmd.Parameters.AddWithValue("@device", DeviceTypes.Contains(batch.DeviceType) ? batch.DeviceType : null);
        await sessionCmd.ExecuteNonQueryAsync();

        foreach (var e in events)
        {
            var cmd = new MySqlCommand(
                @"INSERT INTO analytics_events (session_id, application_id, event_name, page, step_number, duration_ms, metadata)
                  VALUES (@session, (SELECT application_id FROM applications WHERE application_id = @app),
                          @name, @page, @step, @duration, @metadata)", conn);
            cmd.Parameters.AddWithValue("@session", batch.SessionId);
            cmd.Parameters.AddWithValue("@app", e.ApplicationId);
            cmd.Parameters.AddWithValue("@name", e.Name);
            cmd.Parameters.AddWithValue("@page", e.Page);
            cmd.Parameters.AddWithValue("@step", e.StepNumber);
            cmd.Parameters.AddWithValue("@duration", e.DurationMs);
            cmd.Parameters.AddWithValue("@metadata", CleanMetadata(e.Metadata));
            await cmd.ExecuteNonQueryAsync();
        }

        return NoContent();
    }

    // Up to 10 short key/value pairs, or NULL
    private static string? CleanMetadata(Dictionary<string, string?>? metadata)
    {
        if (metadata == null) return null;
        var clean = metadata
            .Where(kv => KeyPattern.IsMatch(kv.Key) && kv.Value != null)
            .Take(10)
            .ToDictionary(kv => kv.Key, kv => kv.Value!.Length > 100 ? kv.Value[..100] : kv.Value);
        return clean.Count == 0 ? null : JsonSerializer.Serialize(clean);
    }
}

using API.Data;
using API.Models;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;

namespace API.Controllers;

// GET /api/dashboard?state=AL&line=HOME&range=last30
// KPI, funnel, and friction numbers for the agent dashboard (mockup 2).
// Every filter is optional. range: last7 | last30 | last90 | ytd | all (default all)
[ApiController]
[Route("api/dashboard")]
public class DashboardController : ControllerBase
{
    // Leaving within this many seconds counts as a "quick exit".
    // Placeholder until the client defines what "leaving quickly" means.
    private const int QuickExitSeconds = 10;

    private readonly Database _db;

    public DashboardController(Database db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<IActionResult> Get([FromQuery] string? state, [FromQuery] string? line, [FromQuery] string? range)
    {
        DateTime? from;
        switch (range ?? "all")
        {
            case "last7": from = DateTime.Today.AddDays(-7); break;
            case "last30": from = DateTime.Today.AddDays(-30); break;
            case "last90": from = DateTime.Today.AddDays(-90); break;
            case "ytd": from = new DateTime(DateTime.Today.Year, 1, 1); break;
            case "all": from = null; break;
            default: return BadRequest(new { error = "range must be last7, last30, last90, ytd, or all." });
        }

        // Filters apply to applications (alias "a") in both queries below
        var conditions = new List<string>();
        if (!string.IsNullOrWhiteSpace(state)) conditions.Add("a.state_code = @state");
        if (!string.IsNullOrWhiteSpace(line))
            conditions.Add(@"EXISTS (SELECT 1 FROM application_lines al JOIN insurance_lines l ON l.line_id = al.line_id
                                     WHERE al.application_id = a.application_id AND l.line_code = @line)");
        if (from != null) conditions.Add("a.created_at >= @from");
        var filter = conditions.Count == 0 ? "TRUE" : string.Join(" AND ", conditions);

        void AddFilterParams(MySqlCommand cmd)
        {
            cmd.Parameters.AddWithValue("@state", state?.Trim().ToUpperInvariant());
            cmd.Parameters.AddWithValue("@line", line?.Trim().ToUpperInvariant());
            cmd.Parameters.AddWithValue("@from", from);
        }

        await using var conn = await _db.OpenAsync();
        var result = new DashboardResponse { QuickExitSeconds = QuickExitSeconds };

        // current_step = furthest step reached, so "reached step N" = current_step >= N
        var kpiCmd = new MySqlCommand(
            $@"SELECT COUNT(*) AS started,
                      COALESCE(SUM(a.submitted_at IS NOT NULL), 0) AS submitted,
                      COALESCE(SUM(a.status IN ('submitted', 'under_review', 'escalated')), 0) AS awaiting,
                      AVG(TIMESTAMPDIFF(SECOND, a.created_at, a.submitted_at)) / 60 AS avg_minutes,
                      COALESCE(SUM(a.current_step >= 2), 0) AS reached2,
                      COALESCE(SUM(a.current_step >= 3), 0) AS reached3,
                      COALESCE(SUM(a.current_step >= 4), 0) AS reached4,
                      COALESCE(SUM(a.current_step >= 5), 0) AS reached5
               FROM applications a
               WHERE {filter}", conn);
        AddFilterParams(kpiCmd);
        await using (var reader = await kpiCmd.ExecuteReaderAsync())
        {
            await reader.ReadAsync();
            result.Started = Convert.ToInt32(reader["started"]);
            result.Submitted = Convert.ToInt32(reader["submitted"]);
            result.AwaitingReview = Convert.ToInt32(reader["awaiting"]);
            result.AvgMinutesToSubmit = reader.IsDBNull(reader.GetOrdinal("avg_minutes"))
                ? null : Convert.ToDouble(reader["avg_minutes"]);
            result.Funnel = new List<int>
            {
                result.Started,
                Convert.ToInt32(reader["reached2"]),
                Convert.ToInt32(reader["reached3"]),
                Convert.ToInt32(reader["reached4"]),
                Convert.ToInt32(reader["reached5"]),
                result.Submitted
            };
        }

        // Behavior events (see the analytics_events comments in 01_schema.sql)
        var frictionCmd = new MySqlCommand(
            $@"SELECT e.step_number,
                      COUNT(DISTINCT CASE WHEN e.event_name = 'step_enter' THEN e.session_id END) AS visits,
                      AVG(CASE WHEN e.event_name IN ('step_complete', 'page_exit') THEN e.duration_ms END) / 1000 AS avg_dwell,
                      COALESCE(SUM(e.event_name = 'page_exit'), 0) AS exits,
                      COALESCE(SUM(e.event_name = 'page_exit' AND e.duration_ms < @quick), 0) AS quick_exits,
                      COUNT(DISTINCT CASE WHEN e.event_name = 'validation_error' THEN e.session_id END) AS error_sessions,
                      COALESCE(SUM(e.event_name = 'step_back'), 0) AS backs
               FROM analytics_events e
               JOIN applications a ON a.application_id = e.application_id
               WHERE e.step_number IS NOT NULL AND {filter}
               GROUP BY e.step_number
               ORDER BY e.step_number", conn);
        AddFilterParams(frictionCmd);
        frictionCmd.Parameters.AddWithValue("@quick", QuickExitSeconds * 1000);
        await using (var reader = await frictionCmd.ExecuteReaderAsync())
        {
            while (await reader.ReadAsync())
            {
                result.Friction.Add(new StepFriction
                {
                    StepNumber = reader.GetInt32("step_number"),
                    Visits = Convert.ToInt32(reader["visits"]),
                    AvgDwellSeconds = reader.IsDBNull(reader.GetOrdinal("avg_dwell")) ? null : Convert.ToDouble(reader["avg_dwell"]),
                    Exits = Convert.ToInt32(reader["exits"]),
                    QuickExits = Convert.ToInt32(reader["quick_exits"]),
                    ErrorSessions = Convert.ToInt32(reader["error_sessions"]),
                    BackClicks = Convert.ToInt32(reader["backs"])
                });
            }
        }

        return Ok(result);
    }
}

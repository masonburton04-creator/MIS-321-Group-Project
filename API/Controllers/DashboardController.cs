using API.Data;
using API.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;

namespace API.Controllers;

// GET /api/dashboard?state=AL&line=HOME&range=last30
// KPI, funnel, and friction numbers for the agent dashboard (mockup 2).
// Every filter is optional. range: last7 | last30 | last90 | ytd | all (default all)
[ApiController]
[Authorize] // signed-in staff only
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

        result.Agents = await LoadAgentUsageAsync(conn, filter, AddFilterParams);
        result.Pricing = await LoadPricingAsync(conn, filter, AddFilterParams, line?.Trim().ToUpperInvariant());

        return Ok(result);
    }

    // How often applications need an agent, plus each agent's status changes
    private static async Task<AgentUsage> LoadAgentUsageAsync(MySqlConnection conn, string filter, Action<MySqlCommand> addFilterParams)
    {
        var usage = new AgentUsage();

        var summaryCmd = new MySqlCommand(
            $@"SELECT COUNT(*) AS submitted,
                      COALESCE(SUM(EXISTS (SELECT 1 FROM application_status_history h
                                           WHERE h.application_id = a.application_id AND h.changed_by IS NOT NULL)), 0) AS handled,
                      COALESCE(SUM(EXISTS (SELECT 1 FROM application_status_history h
                                           WHERE h.application_id = a.application_id AND h.new_status = 'escalated')), 0) AS escalated
               FROM applications a
               WHERE a.submitted_at IS NOT NULL AND {filter}", conn);
        addFilterParams(summaryCmd);
        await using (var reader = await summaryCmd.ExecuteReaderAsync())
        {
            await reader.ReadAsync();
            usage.Submitted = Convert.ToInt32(reader["submitted"]);
            usage.HandledByAgent = Convert.ToInt32(reader["handled"]);
            usage.Escalated = Convert.ToInt32(reader["escalated"]);
        }

        // Only agents with at least one action on a matching application are listed
        var staffCmd = new MySqlCommand(
            $@"SELECT s.staff_id, CONCAT(s.first_name, ' ', s.last_name) AS name, s.role,
                      COUNT(*) AS actions,
                      COUNT(DISTINCT h.application_id) AS apps,
                      COALESCE(SUM(h.new_status = 'approved'), 0) AS approved,
                      COALESCE(SUM(h.new_status = 'rejected'), 0) AS rejected,
                      COALESCE(SUM(h.new_status = 'escalated'), 0) AS escalated,
                      MAX(h.changed_at) AS last_active
               FROM application_status_history h
               JOIN staff_users s ON s.staff_id = h.changed_by
               JOIN applications a ON a.application_id = h.application_id
               WHERE {filter}
               GROUP BY s.staff_id, s.first_name, s.last_name, s.role
               ORDER BY actions DESC, name", conn);
        addFilterParams(staffCmd);
        await using (var reader = await staffCmd.ExecuteReaderAsync())
        {
            while (await reader.ReadAsync())
            {
                usage.Staff.Add(new AgentActivity
                {
                    StaffId = reader.GetInt32("staff_id"),
                    Name = reader.GetString("name"),
                    Role = reader.GetString("role"),
                    Actions = Convert.ToInt32(reader["actions"]),
                    Applications = Convert.ToInt32(reader["apps"]),
                    Approved = Convert.ToInt32(reader["approved"]),
                    Rejected = Convert.ToInt32(reader["rejected"]),
                    Escalated = Convert.ToInt32(reader["escalated"]),
                    LastActive = reader.IsDBNull(reader.GetOrdinal("last_active")) ? null : reader.GetDateTime("last_active")
                });
            }
        }
        return usage;
    }

    // Min / max / average demo estimate per line for applications that reached the Quote step.
    // Recalculated with the current demo rates rather than read from the quotes table, so
    // applications created by 03_mock_data.sql (which never ran the Quote step) are included.
    private static async Task<PricingSummary> LoadPricingAsync(MySqlConnection conn, string filter,
        Action<MySqlCommand> addFilterParams, string? lineFilter)
    {
        var pricing = new PricingSummary();

        var idsCmd = new MySqlCommand(
            $"SELECT a.application_id FROM applications a WHERE a.current_step >= 4 AND {filter}", conn);
        addFilterParams(idsCmd);
        var ids = new List<int>();
        await using (var reader = await idsCmd.ExecuteReaderAsync())
        {
            while (await reader.ReadAsync()) ids.Add(reader.GetInt32(0));
        }
        pricing.QuotedApplications = ids.Count;

        var estimates = new List<LineQuote>();
        foreach (var id in ids)
        {
            var detail = await ApplicationsController.LoadDetailAsync(conn, id);
            if (detail == null) continue;
            QuoteResponse quote;
            try
            {
                quote = await ApplicationsController.BuildQuoteAsync(conn, detail);
            }
            catch (InvalidOperationException ex)
            {
                pricing.Error = ex.Message;
                return pricing;
            }
            pricing.RuleVersion = quote.RuleVersion;

            // With a line filter, a bundle only counts toward that line
            foreach (var lineQuote in quote.Lines.Where(l => lineFilter == null || l.LineCode == lineFilter))
            {
                if (lineQuote.Low != null && lineQuote.High != null) estimates.Add(lineQuote);
                else if (lineQuote.Status == "REFERRED") pricing.ReferredLines++;
                else pricing.IncompleteLines++;
            }
        }

        pricing.Lines = estimates
            .GroupBy(l => l.LineCode)
            .Select(g => new LinePricing
            {
                LineCode = g.Key,
                Estimates = g.Count(),
                Min = g.Min(l => l.Low!.Value),
                Max = g.Max(l => l.High!.Value),
                AvgLow = Math.Round(g.Average(l => l.Low!.Value)),
                AvgHigh = Math.Round(g.Average(l => l.High!.Value))
            })
            .ToList();
        return pricing;
    }
}

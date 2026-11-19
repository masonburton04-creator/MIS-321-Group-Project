using API.Data;
using API.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;

namespace API.Controllers;

// Admin Team page: who has how much work, and manual control over assignments.
// Automatic assignment stays on (escalations go to the specialist with the fewest open ones);
// these endpoints let an admin override it.
//
//   GET /api/team                         staff workload + unassigned counts
//   PUT /api/team/{staffId}/auto-assign   { autoAssign } include / skip this person in automatic assignment
//   PUT /api/team/assignments/{appId}     { staffId, note } assign an open application to someone (null = unassign)
//
// Admins only (403 for other staff).
[ApiController]
[Authorize] // signed-in staff
[Route("api/team")]
public class TeamController : ControllerBase
{
    private static readonly string[] OpenStatuses = { "submitted", "under_review", "escalated" };
    private const int MaxNoteLength = 255;
    private const string MissingScript = "Team management isn't set up. Run Database/10_team_management.sql in MySQL Workbench.";

    private readonly Database _db;

    public TeamController(Database db)
    {
        _db = db;
    }

    private bool IsAdmin => AuthController.CurrentStaffRole(User) == "admin";
    private IActionResult AdminsOnly() => StatusCode(403, new { error = "Only admins can manage the team." });

    [HttpGet]
    public async Task<IActionResult> Get()
    {
        if (!IsAdmin) return AdminsOnly();
        await using var conn = await _db.OpenAsync();
        var result = new TeamResponse();

        var staffCmd = new MySqlCommand(
            @"SELECT s.staff_id, s.first_name, s.last_name, s.email, s.role, s.is_active, s.auto_assign,
                     (SELECT COUNT(*) FROM applications a
                      WHERE a.assigned_staff_id = s.staff_id AND a.status IN ('submitted', 'under_review', 'escalated')) AS open_assigned,
                     (SELECT COUNT(*) FROM applications a
                      WHERE a.assigned_staff_id = s.staff_id AND a.status = 'escalated') AS open_escalations,
                     (SELECT COUNT(*) FROM application_status_history h
                      WHERE h.changed_by = s.staff_id AND h.new_status IN ('approved', 'rejected')
                        AND h.changed_at >= NOW() - INTERVAL 30 DAY) AS decided_30,
                     (SELECT MAX(h.changed_at) FROM application_status_history h WHERE h.changed_by = s.staff_id) AS last_active
              FROM staff_users s
              ORDER BY s.is_active DESC, FIELD(s.role, 'admin', 'specialist', 'employee'), s.last_name, s.first_name", conn);
        try
        {
            await using var reader = await staffCmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                result.Staff.Add(new TeamMember
                {
                    StaffId = reader.GetInt32("staff_id"),
                    FirstName = reader.GetString("first_name"),
                    LastName = reader.GetString("last_name"),
                    Email = reader.GetString("email"),
                    Role = reader.GetString("role"),
                    IsActive = reader.GetBoolean("is_active"),
                    AutoAssign = reader.GetBoolean("auto_assign"),
                    OpenAssigned = Convert.ToInt32(reader["open_assigned"]),
                    OpenEscalations = Convert.ToInt32(reader["open_escalations"]),
                    Decided30Days = Convert.ToInt32(reader["decided_30"]),
                    LastActive = reader.IsDBNull(reader.GetOrdinal("last_active")) ? null : reader.GetDateTime("last_active")
                });
            }
        }
        catch (MySqlException ex) when (ex.ErrorCode == MySqlErrorCode.BadFieldError)
        {
            return StatusCode(500, new { error = MissingScript });
        }

        var unassignedCmd = new MySqlCommand(
            @"SELECT COALESCE(SUM(status IN ('submitted', 'under_review')), 0) AS open_unassigned,
                     COALESCE(SUM(status = 'escalated'), 0) AS escalated_unassigned
              FROM applications WHERE assigned_staff_id IS NULL AND status IN ('submitted', 'under_review', 'escalated')", conn);
        await using (var reader = await unassignedCmd.ExecuteReaderAsync())
        {
            await reader.ReadAsync();
            result.OpenUnassigned = Convert.ToInt32(reader["open_unassigned"]);
            result.EscalatedUnassigned = Convert.ToInt32(reader["escalated_unassigned"]);
        }
        return Ok(result);
    }

    [HttpPut("{staffId:int}/auto-assign")]
    public async Task<IActionResult> SetAutoAssign(int staffId, AutoAssignRequest request)
    {
        if (!IsAdmin) return AdminsOnly();
        await using var conn = await _db.OpenAsync();
        var cmd = new MySqlCommand("UPDATE staff_users SET auto_assign = @on WHERE staff_id = @id", conn);
        cmd.Parameters.AddWithValue("@on", request.AutoAssign);
        cmd.Parameters.AddWithValue("@id", staffId);
        try
        {
            if (await cmd.ExecuteNonQueryAsync() == 0) return NotFound(new { error = $"Staff member {staffId} not found." });
        }
        catch (MySqlException ex) when (ex.ErrorCode == MySqlErrorCode.BadFieldError)
        {
            return StatusCode(500, new { error = MissingScript });
        }
        return NoContent();
    }

    [HttpPut("assignments/{applicationId:int}")]
    public async Task<IActionResult> Assign(int applicationId, AssignRequest request)
    {
        if (!IsAdmin) return AdminsOnly();
        var note = string.IsNullOrWhiteSpace(request.Note) ? null : request.Note.Trim();
        if (note != null && note.Length > 150) return BadRequest(new { error = "Keep the note under 150 characters." });

        await using var conn = await _db.OpenAsync();

        // The application and who has it now
        var appCmd = new MySqlCommand(
            @"SELECT a.status, a.assigned_staff_id, CONCAT(s.first_name, ' ', s.last_name) AS assigned_name
              FROM applications a LEFT JOIN staff_users s ON s.staff_id = a.assigned_staff_id
              WHERE a.application_id = @id", conn);
        appCmd.Parameters.AddWithValue("@id", applicationId);
        string status;
        int? currentId;
        string? currentName;
        await using (var reader = await appCmd.ExecuteReaderAsync())
        {
            if (!await reader.ReadAsync()) return NotFound(new { error = $"Application {applicationId} not found." });
            status = reader.GetString("status");
            currentId = reader.IsDBNull(reader.GetOrdinal("assigned_staff_id")) ? null : reader.GetInt32("assigned_staff_id");
            currentName = reader.IsDBNull(reader.GetOrdinal("assigned_name")) ? null : reader.GetString("assigned_name");
        }

        if (!OpenStatuses.Contains(status))
            return Conflict(new { error = $"Application {applicationId} is {status.Replace('_', ' ')}, so it can't be reassigned." });
        if (request.StaffId == currentId)
            return Ok(new { assignedStaffId = currentId, assignedTo = currentName });

        // Who it goes to: an active staff member; escalated work needs a specialist or admin
        string? targetName = null;
        if (request.StaffId == null)
        {
            if (status == "escalated")
                return BadRequest(new { error = "An escalated application needs a specialist. Pick one instead of unassigning it." });
        }
        else
        {
            var staffCmd = new MySqlCommand(
                "SELECT CONCAT(first_name, ' ', last_name) AS name, role, is_active FROM staff_users WHERE staff_id = @id", conn);
            staffCmd.Parameters.AddWithValue("@id", request.StaffId);
            await using var reader = await staffCmd.ExecuteReaderAsync();
            if (!await reader.ReadAsync()) return BadRequest(new { error = $"Staff member {request.StaffId} not found." });
            if (!reader.GetBoolean("is_active")) return BadRequest(new { error = $"{reader.GetString("name")} is inactive and can't take applications." });
            if (status == "escalated" && reader.GetString("role") == "employee")
                return BadRequest(new { error = "Escalated applications can only go to a specialist or an admin." });
            targetName = reader.GetString("name");
        }

        await using var tx = await conn.BeginTransactionAsync();

        // "AND status = @status" makes sure no one decided it while the admin was looking
        var updateCmd = new MySqlCommand(
            @"UPDATE applications SET assigned_staff_id = @staff
              WHERE application_id = @id AND status = @status", conn, tx);
        updateCmd.Parameters.AddWithValue("@staff", request.StaffId);
        updateCmd.Parameters.AddWithValue("@id", applicationId);
        updateCmd.Parameters.AddWithValue("@status", status);
        if (await updateCmd.ExecuteNonQueryAsync() == 0)
            return Conflict(new { error = $"Application {applicationId} was just changed by someone else. Refresh and try again." });

        // The open escalation follows the application
        if (status == "escalated")
        {
            var escCmd = new MySqlCommand(
                @"UPDATE escalations SET assigned_staff_id = @staff
                  WHERE application_id = @id AND status <> 'resolved'", conn, tx);
            escCmd.Parameters.AddWithValue("@staff", request.StaffId);
            escCmd.Parameters.AddWithValue("@id", applicationId);
            await escCmd.ExecuteNonQueryAsync();
        }

        // Recorded in the history the agents see (same status before and after: only the assignee changed)
        var admin = AuthController.CurrentStaffId(User);
        var change = (currentName, targetName) switch
        {
            (null, not null) => $"Assigned to {targetName} by an admin.",
            (not null, null) => $"Unassigned from {currentName} by an admin.",
            _ => $"Reassigned from {currentName} to {targetName} by an admin."
        };
        var historyNote = note == null ? change : change + " " + note;
        await ApplicationsController.AddStatusHistoryAsync(conn, tx, applicationId, status, status,
            historyNote.Length <= MaxNoteLength ? historyNote : historyNote[..(MaxNoteLength - 1)] + "…", admin);

        await tx.CommitAsync();
        return Ok(new { assignedStaffId = request.StaffId, assignedTo = targetName });
    }
}

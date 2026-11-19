namespace API.Models;

// ---- Admin Team page: GET /api/team and friends ----

public class TeamResponse
{
    public List<TeamMember> Staff { get; set; } = new();
    public int OpenUnassigned { get; set; }          // submitted / under review with nobody assigned
    public int EscalatedUnassigned { get; set; }     // escalated with no specialist (needs an admin now)
}

public class TeamMember
{
    public int StaffId { get; set; }
    public string FirstName { get; set; } = "";
    public string LastName { get; set; } = "";
    public string Email { get; set; } = "";
    public string Role { get; set; } = "";           // employee, specialist, admin
    public bool IsActive { get; set; }
    public bool AutoAssign { get; set; }             // may automatic assignment send them new work?
    public int OpenAssigned { get; set; }            // submitted + under review + escalated, assigned to them
    public int OpenEscalations { get; set; }         // ...of those, escalated (what auto-assignment balances)
    public int Approved30Days { get; set; }          // applications they approved in the last 30 days
    public int Rejected30Days { get; set; }          // applications they rejected in the last 30 days
    public DateTime? LastActive { get; set; }        // last status change they made
}

public class AutoAssignRequest
{
    public bool AutoAssign { get; set; }
}

public class AssignRequest
{
    public int? StaffId { get; set; }                // null = unassign (not allowed for escalated)
    public string? Note { get; set; }                // optional, saved in the status history
}

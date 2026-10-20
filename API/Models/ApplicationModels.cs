namespace API.Models;

// ---- Request bodies (what the front end sends) ----

public class CreateApplicationRequest
{
    // One or more of 'HOME', 'FLOOD', 'JEWELRY', 'AUTO'. More than one = a bundle.
    public List<string> LineCodes { get; set; } = new();
    public string StateCode { get; set; } = "";  // 'AL', 'TX', ...
}

public class SaveStepRequest
{
    // Form answers for one step, e.g. { "year_built": "1998", "zip": "35401" }
    public Dictionary<string, string?> Answers { get; set; } = new();

    // Repeatable items, e.g. { "vehicle": [ { "make": "Honda" }, { "make": "Ford" } ] }.
    // Each list sent replaces that type's saved list.
    public Dictionary<string, List<Dictionary<string, string?>>> Items { get; set; } = new();
}

// Agent decision on a submitted application (agent dashboard, mockup 2).
// Saved as the signed-in staff member, so it has no staff id.
public class UpdateStatusRequest
{
    public string Status { get; set; } = "";   // 'under_review', 'approved', 'rejected', 'escalated'
    public string? Note { get; set; }          // required for 'rejected' and 'escalated'
}

// ---- Response bodies (what the API sends back) ----

public class ApplicationSummary
{
    public int ApplicationId { get; set; }
    public List<string> LineCodes { get; set; } = new();
    public List<string> LineNames { get; set; } = new();
    public bool IsBundle => LineCodes.Count > 1;
    public string StateCode { get; set; } = "";
    public string Status { get; set; } = "";
    public int? CurrentStep { get; set; }
    public string? CustomerName { get; set; }
    public string? AssignedTo { get; set; }    // agent's name, if one has picked it up
    public string? LatestNote { get; set; }    // note from the most recent status change
    public DateTime CreatedAt { get; set; }
    public DateTime? SubmittedAt { get; set; }
}

public class ApplicationDetail : ApplicationSummary
{
    public string? FirstName { get; set; }
    public string? LastName { get; set; }
    public string? Email { get; set; }
    public string? Phone { get; set; }
    public string? RejectionReason { get; set; }
    public Dictionary<string, string?> Answers { get; set; } = new();
    public Dictionary<string, List<Dictionary<string, string?>>> Items { get; set; } = new();
    public List<StatusHistoryEntry> History { get; set; } = new();
    public List<DocumentInfo> Documents { get; set; } = new();
}

// An uploaded file (not its contents; download it from GET /api/applications/{id}/documents/{documentId})
public class DocumentInfo
{
    public int DocumentId { get; set; }
    public string DocType { get; set; } = "";      // 'current_policy'
    public string FileName { get; set; } = "";
    public string ContentType { get; set; } = "";
    public int SizeBytes { get; set; }
    public DateTime UploadedAt { get; set; }
}

public class StatusHistoryEntry
{
    public string? OldStatus { get; set; }
    public string NewStatus { get; set; } = "";
    public string? ChangedBy { get; set; }     // agent's name, NULL = customer/system
    public string? Note { get; set; }
    public DateTime ChangedAt { get; set; }
}

public class StaffMember
{
    public int StaffId { get; set; }
    public string FirstName { get; set; } = "";
    public string LastName { get; set; } = "";
    public string Email { get; set; } = "";
    public string Role { get; set; } = "";
}

// ---- Dashboard sign-in (POST /api/auth/login) ----

public class LoginRequest
{
    public string Email { get; set; } = "";
    public string Password { get; set; } = "";
}

public class LoginResponse
{
    public string Token { get; set; } = "";      // send as "Authorization: Bearer <token>"
    public DateTime ExpiresAt { get; set; }
    public StaffMember Staff { get; set; } = new();
}

// ---- Agent dashboard (GET /api/dashboard) ----

public class DashboardResponse
{
    public int Started { get; set; }
    public int Submitted { get; set; }
    public int AwaitingReview { get; set; }        // submitted + under_review + escalated
    public double? AvgMinutesToSubmit { get; set; }

    // How many applications reached each step: [Coverage, Details, Applicant, Quote, Submit, Submitted]
    public List<int> Funnel { get; set; } = new();

    public List<StepFriction> Friction { get; set; } = new();
    public int QuickExitSeconds { get; set; }

    public PricingSummary Pricing { get; set; } = new();
    public AgentUsage Agents { get; set; } = new();
}

// Demo estimate ranges for applications that reached the Quote step, recalculated
// with the current demo_quote_factors (same numbers the customer is shown)
public class PricingSummary
{
    public int QuotedApplications { get; set; }    // reached the Quote step
    public List<LinePricing> Lines { get; set; } = new();
    public int ReferredLines { get; set; }         // a specialist has to price it (no number shown)
    public int IncompleteLines { get; set; }       // missing answers, no number shown
    public string? RuleVersion { get; set; }
    public string? Error { get; set; }             // e.g. demo_quote_factors table not set up
}

public class LinePricing
{
    public string LineCode { get; set; } = "";
    public int Estimates { get; set; }             // lines with a dollar range
    public decimal Min { get; set; }               // lowest low end
    public decimal Max { get; set; }               // highest high end
    public decimal AvgLow { get; set; }
    public decimal AvgHigh { get; set; }
}

// How often applications need a human agent, and what each agent has done
public class AgentUsage
{
    public int Submitted { get; set; }
    public int HandledByAgent { get; set; }        // an agent changed its status at least once
    public int Escalated { get; set; }             // was escalated at any point
    public List<AgentActivity> Staff { get; set; } = new();
}

public class AgentActivity
{
    public int StaffId { get; set; }
    public string Name { get; set; } = "";
    public string Role { get; set; } = "";
    public int Actions { get; set; }               // status changes made
    public int Applications { get; set; }          // distinct applications touched
    public int Approved { get; set; }
    public int Rejected { get; set; }
    public int Escalated { get; set; }
    public DateTime? LastActive { get; set; }
}

// Behavior metrics for one application step, from analytics_events
public class StepFriction
{
    public int StepNumber { get; set; }
    public int Visits { get; set; }               // sessions that opened the step
    public double? AvgDwellSeconds { get; set; }  // average time spent before finishing or leaving
    public int Exits { get; set; }                // left the site on this step
    public int QuickExits { get; set; }           // left within QuickExitSeconds
    public int ErrorSessions { get; set; }        // sessions that hit at least one validation error
    public int BackClicks { get; set; }           // pressed Back from this step
}

// ---- Demo quote (GET/POST /api/applications/{id}/quote) ----
// Status values follow the research doc, section 10:
//   DEMO_ESTIMATE  ballpark range from national averages, clearly not a real quote
//   INCOMPLETE     answers the estimate needs are missing (see Missing)
//   REFERRED       a specialist has to price it; no number is shown

public class QuoteResponse
{
    public int ApplicationId { get; set; }
    public string StateCode { get; set; } = "";
    public string RuleVersion { get; set; } = "";
    public string Status { get; set; } = "";
    public decimal? TotalLow { get; set; }      // only when every line has an estimate
    public decimal? TotalHigh { get; set; }
    public List<LineQuote> Lines { get; set; } = new();
    public List<string> Notes { get; set; } = new();
    public DateTime CreatedAt { get; set; }
}

public class LineQuote
{
    public string LineCode { get; set; } = "";
    public string Status { get; set; } = "";
    public decimal? Low { get; set; }           // yearly, in dollars
    public decimal? High { get; set; }
    public List<string> Basis { get; set; } = new();     // what the estimate was based on
    public List<string> Notes { get; set; } = new();
    public List<MissingAnswer> Missing { get; set; } = new();
}

public class MissingAnswer
{
    public int Step { get; set; }               // form step the customer should go back to
    public string Field { get; set; } = "";
    public string Label { get; set; } = "";
}

using System.Net.Mail;
using System.Text.RegularExpressions;
using API.Data;
using API.Models;
using API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;

namespace API.Controllers;

// Endpoints the customer application form uses:
//   POST /api/applications                      start a new application (one line or a bundle)
//   PUT  /api/applications/{id}/steps/{step}    save one step's answers
//   POST /api/applications/{id}/submit          submit for agent review
// And for the agent dashboard (these require a signed-in staff member, see AuthController):
//   GET  /api/applications                      list applications
//   GET  /api/applications/{id}                 one application with its answers and history
//   PUT  /api/applications/{id}/status          agent starts review / approves / rejects / escalates
// Demo price estimate (customer Quote step, and the agent's detail view):
//   POST /api/applications/{id}/quote           calculate and save
//   GET  /api/applications/{id}/quote           calculate only (staff)
// Current-policy upload (customer step 1; agents download it from the dashboard):
//   POST   /api/applications/{id}/documents/current-policy   upload or replace (multipart, field "file")
//   DELETE /api/applications/{id}/documents/current-policy   remove (customer said they aren't switching)
//   GET    /api/applications/{id}/documents/{documentId}     download (staff)
[ApiController]
[Route("api/applications")]
public class ApplicationsController : ControllerBase
{
    // Application steps: 1 Coverage, 2 Property/Item Details, 3 Applicant, 4 Quote, 5 Submit
    private const int TotalSteps = 5;
    private const int ApplicantStep = 3;

    // Applicant fields are saved to the customers table instead of application_answers
    private static readonly string[] CustomerFields = { "first_name", "last_name", "email", "phone" };
    private static readonly Regex FieldKeyPattern = new("^[a-z0-9_]{1,100}$");
    private const int MaxValueLength = 2000;

    // Repeatable items (vehicles, drivers, jewelry) and how many of each one application may list
    private static readonly string[] ItemTypes = { "vehicle", "driver", "jewelry" };
    private const int MaxItemsPerType = 20;

    // Agent review workflow: which statuses an agent can act on, and what they can move them to
    private static readonly string[] ReviewableStatuses = { "submitted", "under_review", "escalated" };
    private static readonly string[] AgentStatuses = { "under_review", "approved", "rejected", "escalated" };
    private const int MaxNoteLength = 255;

    // Current-policy uploads: PDF or image, checked by extension AND the file's first bytes,
    // so a renamed file (e.g. a script saved as .pdf) is rejected
    private const int MaxDocumentBytes = 5 * 1024 * 1024;
    private const string CurrentPolicyDocType = "current_policy";
    private static readonly Dictionary<string, (string ContentType, byte[] Signature)> AllowedDocumentTypes = new()
    {
        [".pdf"] = ("application/pdf", "%PDF"u8.ToArray()),
        [".png"] = ("image/png", new byte[] { 0x89, 0x50, 0x4E, 0x47 }),
        [".jpg"] = ("image/jpeg", new byte[] { 0xFF, 0xD8, 0xFF }),
        [".jpeg"] = ("image/jpeg", new byte[] { 0xFF, 0xD8, 0xFF })
    };

    private readonly Database _db;

    public ApplicationsController(Database db)
    {
        _db = db;
    }

    [HttpPost]
    public async Task<IActionResult> Create(CreateApplicationRequest request)
    {
        var lineCodes = request.LineCodes
            .Select(code => code.Trim().ToUpperInvariant())
            .Distinct()
            .ToList();
        var stateCode = request.StateCode.Trim().ToUpperInvariant();

        if (lineCodes.Count == 0)
            return BadRequest(new { error = "Choose at least one insurance type." });

        await using var conn = await _db.OpenAsync();

        // Look up each line and make sure it is offered in this state
        var lineIds = new List<int>();
        foreach (var lineCode in lineCodes)
        {
            var lineCmd = new MySqlCommand(
                "SELECT line_id FROM insurance_lines WHERE line_code = @line AND is_active = TRUE", conn);
            lineCmd.Parameters.AddWithValue("@line", lineCode);
            var lineIdObj = await lineCmd.ExecuteScalarAsync();
            if (lineIdObj == null)
                return BadRequest(new { error = $"Unknown insurance line '{lineCode}'." });
            var lineId = Convert.ToInt32(lineIdObj);

            var availCmd = new MySqlCommand(
                @"SELECT COUNT(*) FROM line_state_availability
                  WHERE line_id = @line AND state_code = @state AND is_available = TRUE", conn);
            availCmd.Parameters.AddWithValue("@line", lineId);
            availCmd.Parameters.AddWithValue("@state", stateCode);
            if (Convert.ToInt32(await availCmd.ExecuteScalarAsync()) == 0)
                return BadRequest(new { error = $"{lineCode} coverage is not offered in '{request.StateCode}'." });

            lineIds.Add(lineId);
        }

        await using var tx = await conn.BeginTransactionAsync();

        // The customer row starts blank and is filled in at the Applicant step
        var customerCmd = new MySqlCommand("INSERT INTO customers (state_code) VALUES (@state)", conn, tx);
        customerCmd.Parameters.AddWithValue("@state", stateCode);
        await customerCmd.ExecuteNonQueryAsync();
        var customerId = customerCmd.LastInsertedId;

        var appCmd = new MySqlCommand(
            @"INSERT INTO applications (customer_id, state_code, status, current_step)
              VALUES (@customer, @state, 'in_progress', 1)", conn, tx);
        appCmd.Parameters.AddWithValue("@customer", customerId);
        appCmd.Parameters.AddWithValue("@state", stateCode);
        await appCmd.ExecuteNonQueryAsync();
        var applicationId = (int)appCmd.LastInsertedId;

        foreach (var lineId in lineIds)
        {
            var lineRowCmd = new MySqlCommand(
                "INSERT INTO application_lines (application_id, line_id) VALUES (@app, @line)", conn, tx);
            lineRowCmd.Parameters.AddWithValue("@app", applicationId);
            lineRowCmd.Parameters.AddWithValue("@line", lineId);
            await lineRowCmd.ExecuteNonQueryAsync();
        }

        var note = lineCodes.Count > 1 ? "Bundle started: " + string.Join(" + ", lineCodes) : "Application started";
        await AddStatusHistoryAsync(conn, tx, applicationId, null, "in_progress", note);
        await tx.CommitAsync();

        return CreatedAtAction(nameof(GetById), new { id = applicationId }, new { applicationId });
    }

    [HttpPut("{id:int}/steps/{step:int}")]
    public async Task<IActionResult> SaveStep(int id, int step, SaveStepRequest request)
    {
        if (step < 1 || step > TotalSteps)
            return BadRequest(new { error = $"Step must be between 1 and {TotalSteps}." });

        foreach (var (key, value) in request.Answers)
        {
            if (!FieldKeyPattern.IsMatch(key))
                return BadRequest(new { error = $"Invalid field name '{key}'." });
            if (value != null && value.Length > MaxValueLength)
                return BadRequest(new { error = $"'{key}' is too long." });
        }

        foreach (var (itemType, items) in request.Items)
        {
            if (!ItemTypes.Contains(itemType))
                return BadRequest(new { error = $"Unknown item type '{itemType}'." });
            if (items.Count > MaxItemsPerType)
                return BadRequest(new { error = $"At most {MaxItemsPerType} {itemType} entries are allowed." });
            foreach (var (key, value) in items.SelectMany(item => item))
            {
                if (!FieldKeyPattern.IsMatch(key))
                    return BadRequest(new { error = $"Invalid field name '{key}'." });
                if (value != null && value.Length > MaxValueLength)
                    return BadRequest(new { error = $"'{key}' is too long." });
            }
        }

        await using var conn = await _db.OpenAsync();

        var status = await GetStatusAsync(conn, id);
        if (status == null) return NotFound(new { error = $"Application {id} not found." });
        if (status != "in_progress")
            return Conflict(new { error = $"Application {id} is already {status} and can no longer be edited." });

        var answers = new Dictionary<string, string?>(request.Answers);
        Dictionary<string, string?>? customer = null;

        if (step == ApplicantStep)
        {
            customer = CustomerFields.ToDictionary(f => f, f => Clean(answers.GetValueOrDefault(f)));
            foreach (var f in CustomerFields) answers.Remove(f);

            if (customer["first_name"] == null || customer["last_name"] == null || customer["email"] == null)
                return BadRequest(new { error = "First name, last name, and email are required." });
            if (!IsValidEmail(customer["email"]!))
                return BadRequest(new { error = "Please enter a valid email address." });
        }

        await using var tx = await conn.BeginTransactionAsync();

        if (customer != null)
        {
            var custCmd = new MySqlCommand(
                @"UPDATE customers c JOIN applications a ON a.customer_id = c.customer_id
                  SET c.first_name = @first, c.last_name = @last, c.email = @email, c.phone = @phone
                  WHERE a.application_id = @id", conn, tx);
            custCmd.Parameters.AddWithValue("@first", customer["first_name"]);
            custCmd.Parameters.AddWithValue("@last", customer["last_name"]);
            custCmd.Parameters.AddWithValue("@email", customer["email"]);
            custCmd.Parameters.AddWithValue("@phone", customer["phone"]);
            custCmd.Parameters.AddWithValue("@id", id);
            await custCmd.ExecuteNonQueryAsync();
        }

        foreach (var (key, value) in answers)
        {
            // Insert the answer, or overwrite it if the customer went back and changed it
            var ansCmd = new MySqlCommand(
                @"INSERT INTO application_answers (application_id, step_number, field_key, field_value)
                  VALUES (@id, @step, @key, @value)
                  ON DUPLICATE KEY UPDATE field_value = VALUES(field_value), step_number = VALUES(step_number)",
                conn, tx);
            ansCmd.Parameters.AddWithValue("@id", id);
            ansCmd.Parameters.AddWithValue("@step", step);
            ansCmd.Parameters.AddWithValue("@key", key);
            ansCmd.Parameters.AddWithValue("@value", Clean(value));
            await ansCmd.ExecuteNonQueryAsync();
        }

        // Each item list sent replaces that type's saved list, so removed vehicles/drivers/items
        // disappear and the rest are renumbered 1, 2, 3...
        foreach (var (itemType, items) in request.Items)
        {
            var deleteCmd = new MySqlCommand(
                "DELETE FROM application_item_answers WHERE application_id = @id AND item_type = @type", conn, tx);
            deleteCmd.Parameters.AddWithValue("@id", id);
            deleteCmd.Parameters.AddWithValue("@type", itemType);
            await deleteCmd.ExecuteNonQueryAsync();

            for (var i = 0; i < items.Count; i++)
            {
                foreach (var (key, value) in items[i])
                {
                    var itemCmd = new MySqlCommand(
                        @"INSERT INTO application_item_answers (application_id, item_type, item_number, field_key, field_value)
                          VALUES (@id, @type, @number, @key, @value)", conn, tx);
                    itemCmd.Parameters.AddWithValue("@id", id);
                    itemCmd.Parameters.AddWithValue("@type", itemType);
                    itemCmd.Parameters.AddWithValue("@number", i + 1);
                    itemCmd.Parameters.AddWithValue("@key", key);
                    itemCmd.Parameters.AddWithValue("@value", Clean(value));
                    await itemCmd.ExecuteNonQueryAsync();
                }
            }
        }

        // current_step = furthest step reached, so the dashboard can see where people stop
        var stepCmd = new MySqlCommand(
            "UPDATE applications SET current_step = GREATEST(COALESCE(current_step, 1), @next) WHERE application_id = @id",
            conn, tx);
        stepCmd.Parameters.AddWithValue("@next", Math.Min(step + 1, TotalSteps));
        stepCmd.Parameters.AddWithValue("@id", id);
        await stepCmd.ExecuteNonQueryAsync();

        await tx.CommitAsync();
        return NoContent();
    }

    [HttpPost("{id:int}/submit")]
    public async Task<IActionResult> Submit(int id)
    {
        await using var conn = await _db.OpenAsync();

        var status = await GetStatusAsync(conn, id);
        if (status == null) return NotFound(new { error = $"Application {id} not found." });
        if (status != "in_progress")
            return Conflict(new { error = $"Application {id} has already been {status}." });

        var checkCmd = new MySqlCommand(
            @"SELECT c.first_name IS NOT NULL AND c.email IS NOT NULL
              FROM applications a JOIN customers c ON c.customer_id = a.customer_id
              WHERE a.application_id = @id", conn);
        checkCmd.Parameters.AddWithValue("@id", id);
        if (Convert.ToInt32(await checkCmd.ExecuteScalarAsync()) == 0)
            return BadRequest(new { error = "Applicant details must be completed before submitting." });

        await using var tx = await conn.BeginTransactionAsync();

        var submitCmd = new MySqlCommand(
            @"UPDATE applications
              SET status = 'submitted', submitted_at = NOW(), current_step = @last
              WHERE application_id = @id", conn, tx);
        submitCmd.Parameters.AddWithValue("@last", TotalSteps);
        submitCmd.Parameters.AddWithValue("@id", id);
        await submitCmd.ExecuteNonQueryAsync();

        await AddStatusHistoryAsync(conn, tx, id, "in_progress", "submitted", "Submitted by customer");
        await tx.CommitAsync();

        return Ok(new { applicationId = id, status = "submitted" });
    }

    [Authorize] // signed-in staff only
    [HttpPut("{id:int}/status")]
    public async Task<IActionResult> UpdateStatus(int id, UpdateStatusRequest request)
    {
        var newStatus = request.Status.Trim().ToLowerInvariant();
        var note = Clean(request.Note);

        if (!AgentStatuses.Contains(newStatus))
            return BadRequest(new { error = $"Status must be one of: {string.Join(", ", AgentStatuses)}." });
        if (note != null && note.Length > MaxNoteLength)
            return BadRequest(new { error = $"Note must be {MaxNoteLength} characters or fewer." });
        if (note == null && (newStatus == "rejected" || newStatus == "escalated"))
            return BadRequest(new { error = $"Please add a note explaining why the application is {newStatus}." });

        // Recorded as the signed-in agent (the sign-in check already confirmed they're active)
        var staffId = AuthController.CurrentStaffId(User);

        await using var conn = await _db.OpenAsync();

        var oldStatus = await GetStatusAsync(conn, id);
        if (oldStatus == null) return NotFound(new { error = $"Application {id} not found." });
        if (!ReviewableStatuses.Contains(oldStatus))
            return Conflict(new { error = $"Application {id} is {oldStatus} and can't be changed by an agent." });
        if (oldStatus == newStatus)
            return Conflict(new { error = $"Application {id} is already {newStatus}." });

        await using var tx = await conn.BeginTransactionAsync();

        // "AND status = @old" makes sure no one else changed it since we looked
        var updateCmd = new MySqlCommand(
            @"UPDATE applications
              SET status = @new, assigned_staff_id = @staff, rejection_reason = @reason
              WHERE application_id = @id AND status = @old", conn, tx);
        updateCmd.Parameters.AddWithValue("@new", newStatus);
        updateCmd.Parameters.AddWithValue("@staff", staffId);
        updateCmd.Parameters.AddWithValue("@reason", newStatus == "rejected" ? note : null);
        updateCmd.Parameters.AddWithValue("@id", id);
        updateCmd.Parameters.AddWithValue("@old", oldStatus);
        if (await updateCmd.ExecuteNonQueryAsync() == 0)
            return Conflict(new { error = $"Application {id} was just changed by someone else. Refresh and try again." });

        if (newStatus == "escalated")
        {
            var escCmd = new MySqlCommand(
                @"INSERT INTO escalations (application_id, reason, status, assigned_staff_id)
                  VALUES (@id, @reason, 'open', @staff)", conn, tx);
            escCmd.Parameters.AddWithValue("@id", id);
            escCmd.Parameters.AddWithValue("@reason", note);
            escCmd.Parameters.AddWithValue("@staff", staffId);
            await escCmd.ExecuteNonQueryAsync();
        }
        else if (newStatus is "approved" or "rejected")
        {
            // A final decision closes any open escalation
            var resolveCmd = new MySqlCommand(
                @"UPDATE escalations SET status = 'resolved', resolved_at = NOW()
                  WHERE application_id = @id AND status <> 'resolved'", conn, tx);
            resolveCmd.Parameters.AddWithValue("@id", id);
            await resolveCmd.ExecuteNonQueryAsync();
        }

        var defaultNote = newStatus switch
        {
            "under_review" => "Review started",
            "approved" => "Approved",
            _ => newStatus
        };
        await AddStatusHistoryAsync(conn, tx, id, oldStatus, newStatus, note ?? defaultNote, staffId);
        await tx.CommitAsync();

        return Ok(new { applicationId = id, status = newStatus });
    }

    [Authorize] // signed-in staff only
    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] string? status)
    {
        await using var conn = await _db.OpenAsync();

        var sql = SummarySelect + (status != null ? " WHERE a.status = @status" : "") +
                  " ORDER BY a.created_at DESC";
        var cmd = new MySqlCommand(sql, conn);
        if (status != null) cmd.Parameters.AddWithValue("@status", status);

        var results = new List<ApplicationSummary>();
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            var summary = new ApplicationSummary();
            ReadSummary(reader, summary);
            results.Add(summary);
        }
        return Ok(results);
    }

    [Authorize] // signed-in staff only
    [HttpGet("{id:int}")]
    public async Task<IActionResult> GetById(int id)
    {
        await using var conn = await _db.OpenAsync();
        var detail = await LoadDetailAsync(conn, id);
        return detail == null ? NotFound(new { error = $"Application {id} not found." }) : Ok(detail);
    }

    // Demo estimate for the agent dashboard: calculated from the saved answers, not stored
    [Authorize] // signed-in staff only
    [HttpGet("{id:int}/quote")]
    public async Task<IActionResult> GetQuote(int id)
    {
        await using var conn = await _db.OpenAsync();
        var detail = await LoadDetailAsync(conn, id);
        if (detail == null) return NotFound(new { error = $"Application {id} not found." });
        try
        {
            return Ok(await BuildQuoteAsync(conn, detail));
        }
        catch (InvalidOperationException ex)
        {
            return StatusCode(500, new { error = ex.Message });
        }
    }

    // Demo estimate for the customer's Quote step: calculated and saved to the quotes
    // table (replacing any earlier estimate), so agents can see what the customer was shown
    [HttpPost("{id:int}/quote")]
    public async Task<IActionResult> CreateQuote(int id)
    {
        await using var conn = await _db.OpenAsync();
        var detail = await LoadDetailAsync(conn, id);
        if (detail == null) return NotFound(new { error = $"Application {id} not found." });
        QuoteResponse quote;
        try
        {
            quote = await BuildQuoteAsync(conn, detail);
        }
        catch (InvalidOperationException ex)
        {
            return StatusCode(500, new { error = ex.Message });
        }

        await using var tx = await conn.BeginTransactionAsync();
        var deleteCmd = new MySqlCommand("DELETE FROM quotes WHERE application_id = @id", conn, tx);
        deleteCmd.Parameters.AddWithValue("@id", id);
        await deleteCmd.ExecuteNonQueryAsync();

        foreach (var line in quote.Lines)
        {
            // Lines without a number (needs info / specialist review) are saved with an empty range
            var insertCmd = new MySqlCommand(
                @"INSERT INTO quotes (application_id, line_id, state_code, estimate_low, estimate_high, rule_version, is_mock)
                  SELECT @id, line_id, @state, @low, @high, @version, TRUE FROM insurance_lines WHERE line_code = @line",
                conn, tx);
            insertCmd.Parameters.AddWithValue("@id", id);
            insertCmd.Parameters.AddWithValue("@state", detail.StateCode);
            insertCmd.Parameters.AddWithValue("@low", line.Low);
            insertCmd.Parameters.AddWithValue("@high", line.High);
            insertCmd.Parameters.AddWithValue("@version", quote.RuleVersion);
            insertCmd.Parameters.AddWithValue("@line", line.LineCode);
            await insertCmd.ExecuteNonQueryAsync();
        }
        await tx.CommitAsync();

        return Ok(quote);
    }

    // ---------------------------------------------------------------
    // Current-policy upload
    // ---------------------------------------------------------------

    // Upload (or replace) the declarations page of the policy the customer is switching from
    [HttpPost("{id:int}/documents/current-policy")]
    [RequestSizeLimit(MaxDocumentBytes + 64 * 1024)] // file plus multipart overhead
    public async Task<IActionResult> UploadCurrentPolicy(int id, IFormFile? file)
    {
        if (file == null || file.Length == 0)
            return BadRequest(new { error = "Choose a file to upload." });
        if (file.Length > MaxDocumentBytes)
            return BadRequest(new { error = "The file is too large. The limit is 5 MB." });

        var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (!AllowedDocumentTypes.TryGetValue(extension, out var type))
            return BadRequest(new { error = "Upload a PDF, JPG, or PNG file." });

        byte[] content;
        using (var buffer = new MemoryStream())
        {
            await file.CopyToAsync(buffer);
            content = buffer.ToArray();
        }
        if (!content.AsSpan().StartsWith(type.Signature))
            return BadRequest(new { error = "That file doesn't look like a real PDF, JPG, or PNG." });

        // Keep only the name (no folders) and drop characters that could break a download header
        var fileName = Regex.Replace(Path.GetFileName(file.FileName), @"[^\w.\- ()]", "_");
        if (fileName.Length > 255) fileName = fileName[^255..];

        await using var conn = await _db.OpenAsync();
        var status = await GetStatusAsync(conn, id);
        if (status == null) return NotFound(new { error = $"Application {id} not found." });
        if (status != "in_progress")
            return Conflict(new { error = $"Application {id} is already {status} and can no longer be edited." });

        var cmd = new MySqlCommand(
            @"INSERT INTO application_documents (application_id, doc_type, file_name, content_type, size_bytes, content)
              VALUES (@id, @type, @name, @contentType, @size, @content)
              ON DUPLICATE KEY UPDATE file_name = VALUES(file_name), content_type = VALUES(content_type),
                                      size_bytes = VALUES(size_bytes), content = VALUES(content), uploaded_at = NOW()",
            conn);
        cmd.Parameters.AddWithValue("@id", id);
        cmd.Parameters.AddWithValue("@type", CurrentPolicyDocType);
        cmd.Parameters.AddWithValue("@name", fileName);
        cmd.Parameters.AddWithValue("@contentType", type.ContentType);
        cmd.Parameters.AddWithValue("@size", content.Length);
        cmd.Parameters.AddWithValue("@content", content);
        try
        {
            await cmd.ExecuteNonQueryAsync();
        }
        catch (MySqlException ex) when (ex.ErrorCode == MySqlErrorCode.NoSuchTable)
        {
            return StatusCode(500, new { error = "File uploads aren't set up. Run Database/06_application_documents.sql in MySQL Workbench." });
        }

        return Ok(new { fileName, sizeBytes = content.Length });
    }

    [HttpDelete("{id:int}/documents/current-policy")]
    public async Task<IActionResult> DeleteCurrentPolicy(int id)
    {
        await using var conn = await _db.OpenAsync();
        var status = await GetStatusAsync(conn, id);
        if (status == null) return NotFound(new { error = $"Application {id} not found." });
        if (status != "in_progress")
            return Conflict(new { error = $"Application {id} is already {status} and can no longer be edited." });

        var cmd = new MySqlCommand(
            "DELETE FROM application_documents WHERE application_id = @id AND doc_type = @type", conn);
        cmd.Parameters.AddWithValue("@id", id);
        cmd.Parameters.AddWithValue("@type", CurrentPolicyDocType);
        await cmd.ExecuteNonQueryAsync();
        return NoContent();
    }

    // Always sent as a download (never shown inline) so a file can't run in the API's origin.
    [Authorize] // signed-in staff only
    [HttpGet("{id:int}/documents/{documentId:int}")]
    public async Task<IActionResult> DownloadDocument(int id, int documentId)
    {
        await using var conn = await _db.OpenAsync();
        var cmd = new MySqlCommand(
            @"SELECT file_name, content_type, content FROM application_documents
              WHERE document_id = @doc AND application_id = @id", conn);
        cmd.Parameters.AddWithValue("@doc", documentId);
        cmd.Parameters.AddWithValue("@id", id);
        await using var reader = await cmd.ExecuteReaderAsync();
        if (!await reader.ReadAsync()) return NotFound(new { error = "Document not found." });

        Response.Headers["X-Content-Type-Options"] = "nosniff";
        return File((byte[])reader["content"], reader.GetString("content_type"), reader.GetString("file_name"));
    }

    // The customer's info, answers, items, and status history. NULL if the application doesn't exist.
    // Also used by DashboardController for the pricing summary.
    internal static async Task<ApplicationDetail?> LoadDetailAsync(MySqlConnection conn, int id)
    {
        var cmd = new MySqlCommand(SummarySelect + " WHERE a.application_id = @id", conn);
        cmd.Parameters.AddWithValue("@id", id);

        var detail = new ApplicationDetail();
        await using (var reader = await cmd.ExecuteReaderAsync())
        {
            if (!await reader.ReadAsync()) return null;
            ReadSummary(reader, detail);
            detail.FirstName = reader.IsDBNull(reader.GetOrdinal("first_name")) ? null : reader.GetString("first_name");
            detail.LastName = reader.IsDBNull(reader.GetOrdinal("last_name")) ? null : reader.GetString("last_name");
            detail.Email = reader.IsDBNull(reader.GetOrdinal("email")) ? null : reader.GetString("email");
            detail.Phone = reader.IsDBNull(reader.GetOrdinal("phone")) ? null : reader.GetString("phone");
            detail.RejectionReason = reader.IsDBNull(reader.GetOrdinal("rejection_reason")) ? null : reader.GetString("rejection_reason");
        }

        var ansCmd = new MySqlCommand(
            "SELECT field_key, field_value FROM application_answers WHERE application_id = @id ORDER BY step_number, answer_id",
            conn);
        ansCmd.Parameters.AddWithValue("@id", id);
        await using (var reader = await ansCmd.ExecuteReaderAsync())
        {
            while (await reader.ReadAsync())
            {
                detail.Answers[reader.GetString("field_key")] =
                    reader.IsDBNull(reader.GetOrdinal("field_value")) ? null : reader.GetString("field_value");
            }
        }

        // Rebuild item lists: { "vehicle": [ {year, make, ...}, {...} ], "driver": [...] }
        var itemCmd = new MySqlCommand(
            @"SELECT item_type, item_number, field_key, field_value FROM application_item_answers
              WHERE application_id = @id ORDER BY item_type, item_number", conn);
        itemCmd.Parameters.AddWithValue("@id", id);
        await using (var reader = await itemCmd.ExecuteReaderAsync())
        {
            while (await reader.ReadAsync())
            {
                var type = reader.GetString("item_type");
                var index = reader.GetInt32("item_number") - 1;
                if (!detail.Items.TryGetValue(type, out var list))
                    detail.Items[type] = list = new List<Dictionary<string, string?>>();
                while (list.Count <= index) list.Add(new Dictionary<string, string?>());
                list[index][reader.GetString("field_key")] =
                    reader.IsDBNull(reader.GetOrdinal("field_value")) ? null : reader.GetString("field_value");
            }
        }

        var historyCmd = new MySqlCommand(
            @"SELECT h.old_status, h.new_status, h.note, h.changed_at,
                     CONCAT(s.first_name, ' ', s.last_name) AS changed_by
              FROM application_status_history h
              LEFT JOIN staff_users s ON s.staff_id = h.changed_by
              WHERE h.application_id = @id ORDER BY h.changed_at, h.history_id", conn);
        historyCmd.Parameters.AddWithValue("@id", id);
        await using (var reader = await historyCmd.ExecuteReaderAsync())
        {
            while (await reader.ReadAsync())
            {
                detail.History.Add(new StatusHistoryEntry
                {
                    OldStatus = reader.IsDBNull(reader.GetOrdinal("old_status")) ? null : reader.GetString("old_status"),
                    NewStatus = reader.GetString("new_status"),
                    Note = reader.IsDBNull(reader.GetOrdinal("note")) ? null : reader.GetString("note"),
                    ChangedAt = reader.GetDateTime("changed_at"),
                    ChangedBy = reader.IsDBNull(reader.GetOrdinal("changed_by")) ? null : reader.GetString("changed_by")
                });
            }
        }

        var docCmd = new MySqlCommand(
            @"SELECT document_id, doc_type, file_name, content_type, size_bytes, uploaded_at
              FROM application_documents WHERE application_id = @id ORDER BY uploaded_at", conn);
        docCmd.Parameters.AddWithValue("@id", id);
        try
        {
            await using var reader = await docCmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                detail.Documents.Add(new DocumentInfo
                {
                    DocumentId = reader.GetInt32("document_id"),
                    DocType = reader.GetString("doc_type"),
                    FileName = reader.GetString("file_name"),
                    ContentType = reader.GetString("content_type"),
                    SizeBytes = reader.GetInt32("size_bytes"),
                    UploadedAt = reader.GetDateTime("uploaded_at")
                });
            }
        }
        catch (MySqlException ex) when (ex.ErrorCode == MySqlErrorCode.NoSuchTable)
        {
            // 06_application_documents.sql hasn't been run yet; show the application without files
        }

        return detail;
    }

    // Throws InvalidOperationException if demo_quote_factors isn't set up. Also used by DashboardController.
    internal static async Task<QuoteResponse> BuildQuoteAsync(MySqlConnection conn, ApplicationDetail detail)
    {
        // Newest rule version in demo_quote_factors (see Database/04_demo_quote_rates.sql)
        var factorCmd = new MySqlCommand(
            @"SELECT rule_version, line_code, factor_key, factor_value FROM demo_quote_factors
              WHERE rule_version = (SELECT MAX(rule_version) FROM demo_quote_factors)", conn);
        var factors = new Dictionary<string, Dictionary<string, decimal>>();
        var ruleVersion = "";
        MySqlDataReader reader;
        try
        {
            reader = await factorCmd.ExecuteReaderAsync();
        }
        catch (MySqlException ex) when (ex.ErrorCode == MySqlErrorCode.NoSuchTable)
        {
            throw new InvalidOperationException("Quote rates aren't set up. Run Database/04_demo_quote_rates.sql in MySQL Workbench.");
        }
        await using (reader)
        {
            while (await reader.ReadAsync())
            {
                ruleVersion = reader.GetString("rule_version");
                var line = reader.GetString("line_code");
                if (!factors.TryGetValue(line, out var lineFactors))
                    factors[line] = lineFactors = new Dictionary<string, decimal>();
                lineFactors[reader.GetString("factor_key")] = reader.GetDecimal("factor_value");
            }
        }

        var lines = new DemoQuoteEngine(factors).Estimate(detail);
        var quote = new QuoteResponse
        {
            ApplicationId = detail.ApplicationId,
            StateCode = detail.StateCode,
            RuleVersion = ruleVersion,
            Lines = lines,
            CreatedAt = DateTime.Now,
            // Any missing answer makes the whole quote incomplete; otherwise any specialist line makes it referred
            Status = lines.Any(l => l.Status == "INCOMPLETE") ? "INCOMPLETE"
                   : lines.Any(l => l.Status == "REFERRED") ? "REFERRED"
                   : "DEMO_ESTIMATE"
        };

        // Research doc: only show a combined total when every line has a comparable estimate
        if (quote.Status == "DEMO_ESTIMATE")
        {
            quote.TotalLow = lines.Sum(l => l.Low);
            quote.TotalHigh = lines.Sum(l => l.High);
        }

        quote.Notes.Add("Prices vary a lot by state. This estimate uses national averages and isn't adjusted for your state yet.");
        if (detail.IsBundle)
        {
            quote.Notes.Add("Any multi-policy (bundle) discount isn't included in this estimate.");
            if (detail.LineCodes.Contains("FLOOD"))
                quote.Notes.Add("Flood policies through the NFIP usually don't count toward bundle discounts.");
        }
        return quote;
    }

    // ---------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------

    // line_codes / line_names list every line on the application (2+ for a bundle)
    private const string SummarySelect =
        @"SELECT a.application_id, a.state_code, a.status, a.current_step, a.rejection_reason,
                 a.created_at, a.submitted_at, c.first_name, c.last_name, c.email, c.phone,
                 CONCAT(s.first_name, ' ', s.last_name) AS assigned_to,
                 (SELECT GROUP_CONCAT(l.line_code ORDER BY l.line_id SEPARATOR ',')
                  FROM application_lines al JOIN insurance_lines l ON l.line_id = al.line_id
                  WHERE al.application_id = a.application_id) AS line_codes,
                 (SELECT GROUP_CONCAT(l.line_name ORDER BY l.line_id SEPARATOR '|')
                  FROM application_lines al JOIN insurance_lines l ON l.line_id = al.line_id
                  WHERE al.application_id = a.application_id) AS line_names,
                 (SELECT h.note FROM application_status_history h
                  WHERE h.application_id = a.application_id
                  ORDER BY h.changed_at DESC, h.history_id DESC LIMIT 1) AS latest_note
          FROM applications a
          JOIN customers c ON c.customer_id = a.customer_id
          LEFT JOIN staff_users s ON s.staff_id = a.assigned_staff_id";

    private static void ReadSummary(MySqlDataReader reader, ApplicationSummary summary)
    {
        summary.ApplicationId = reader.GetInt32("application_id");
        summary.LineCodes = reader.IsDBNull(reader.GetOrdinal("line_codes"))
            ? new List<string>() : reader.GetString("line_codes").Split(',').ToList();
        summary.LineNames = reader.IsDBNull(reader.GetOrdinal("line_names"))
            ? new List<string>() : reader.GetString("line_names").Split('|').ToList();
        summary.StateCode = reader.GetString("state_code");
        summary.Status = reader.GetString("status");
        summary.CurrentStep = reader.IsDBNull(reader.GetOrdinal("current_step")) ? null : reader.GetInt32("current_step");
        summary.CreatedAt = reader.GetDateTime("created_at");
        summary.SubmittedAt = reader.IsDBNull(reader.GetOrdinal("submitted_at")) ? null : reader.GetDateTime("submitted_at");

        var first = reader.IsDBNull(reader.GetOrdinal("first_name")) ? null : reader.GetString("first_name");
        var last = reader.IsDBNull(reader.GetOrdinal("last_name")) ? null : reader.GetString("last_name");
        summary.CustomerName = first == null && last == null ? null : $"{first} {last}".Trim();
        summary.AssignedTo = reader.IsDBNull(reader.GetOrdinal("assigned_to")) ? null : reader.GetString("assigned_to");
        summary.LatestNote = reader.IsDBNull(reader.GetOrdinal("latest_note")) ? null : reader.GetString("latest_note");
    }

    private static async Task<string?> GetStatusAsync(MySqlConnection conn, int id)
    {
        var cmd = new MySqlCommand("SELECT status FROM applications WHERE application_id = @id", conn);
        cmd.Parameters.AddWithValue("@id", id);
        return (string?)await cmd.ExecuteScalarAsync();
    }

    private static async Task AddStatusHistoryAsync(
        MySqlConnection conn, MySqlTransaction tx, int applicationId, string? oldStatus, string newStatus, string note,
        int? staffId = null)
    {
        var cmd = new MySqlCommand(
            @"INSERT INTO application_status_history (application_id, old_status, new_status, changed_by, note)
              VALUES (@id, @old, @new, @staff, @note)", conn, tx);
        cmd.Parameters.AddWithValue("@id", applicationId);
        cmd.Parameters.AddWithValue("@old", oldStatus);
        cmd.Parameters.AddWithValue("@new", newStatus);
        cmd.Parameters.AddWithValue("@staff", staffId);
        cmd.Parameters.AddWithValue("@note", note);
        await cmd.ExecuteNonQueryAsync();
    }

    // Trim whitespace and store empty answers as NULL
    private static string? Clean(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static bool IsValidEmail(string email) =>
        MailAddress.TryCreate(email, out var parsed) && parsed.Address == email;
}

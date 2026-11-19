using System.Security.Claims;
using API.Data;
using API.Models;
using API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;

namespace API.Controllers;

// The signed-in customer's own account (sign in with POST /api/auth/login):
//   GET  /api/account/me             who the token belongs to
//   POST /api/account/logout         ends the session right away
//   GET  /api/account/applications   "My Applications": status, and why if rejected
[ApiController]
[Authorize(AuthenticationSchemes = CustomerTokenAuthHandler.SchemeName)]
[Route("api/account")]
public class AccountController : ControllerBase
{
    private readonly Database _db;

    public AccountController(Database db)
    {
        _db = db;
    }

    [HttpGet("me")]
    public async Task<IActionResult> Me()
    {
        await using var conn = await _db.OpenAsync();
        var cmd = new MySqlCommand(
            "SELECT account_id, first_name, last_name, email FROM customer_accounts WHERE account_id = @id", conn);
        cmd.Parameters.AddWithValue("@id", CustomerTokenAuthHandler.CurrentAccountId(User));
        await using var reader = await cmd.ExecuteReaderAsync();
        if (!await reader.ReadAsync()) return Unauthorized(new { error = "Please sign in again." });
        return Ok(new CustomerAccount
        {
            AccountId = reader.GetInt32("account_id"),
            FirstName = reader.GetString("first_name"),
            LastName = reader.GetString("last_name"),
            Email = reader.GetString("email")
        });
    }

    [HttpPost("logout")]
    public async Task<IActionResult> Logout()
    {
        await using var conn = await _db.OpenAsync();
        var cmd = new MySqlCommand("DELETE FROM customer_sessions WHERE token_hash = @hash", conn);
        cmd.Parameters.AddWithValue("@hash", User.FindFirstValue(CustomerTokenAuthHandler.TokenHashClaim));
        await cmd.ExecuteNonQueryAsync();
        return NoContent();
    }

    // Only what the customer should see: no agent notes, no assigned agent
    [HttpGet("applications")]
    public async Task<IActionResult> Applications()
    {
        await using var conn = await _db.OpenAsync();
        var cmd = new MySqlCommand(
            @"SELECT a.application_id, a.state_code, a.status, a.current_step, a.created_at, a.submitted_at,
                     a.updated_at, a.rejection_code, a.auto_decision, r.agent_label, r.customer_message,
                     (SELECT GROUP_CONCAT(l.line_code ORDER BY l.line_id SEPARATOR ',')
                      FROM application_lines al JOIN insurance_lines l ON l.line_id = al.line_id
                      WHERE al.application_id = a.application_id) AS line_codes
              FROM applications a
              LEFT JOIN rejection_reasons r ON r.code = a.rejection_code
              WHERE a.account_id = @account
              ORDER BY a.created_at DESC", conn);
        cmd.Parameters.AddWithValue("@account", CustomerTokenAuthHandler.CurrentAccountId(User));

        var results = new List<CustomerApplication>();
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            var status = reader.GetString("status");
            results.Add(new CustomerApplication
            {
                ApplicationId = reader.GetInt32("application_id"),
                LineCodes = reader.IsDBNull(reader.GetOrdinal("line_codes"))
                    ? new List<string>() : reader.GetString("line_codes").Split(',').ToList(),
                StateCode = reader.GetString("state_code"),
                Status = status,
                CurrentStep = reader.IsDBNull(reader.GetOrdinal("current_step")) ? null : reader.GetInt32("current_step"),
                CreatedAt = reader.GetDateTime("created_at"),
                SubmittedAt = reader.IsDBNull(reader.GetOrdinal("submitted_at")) ? null : reader.GetDateTime("submitted_at"),
                UpdatedAt = reader.GetDateTime("updated_at"),
                AutoDecision = reader.IsDBNull(reader.GetOrdinal("auto_decision")) ? null : reader.GetString("auto_decision"),
                RejectionCode = status == "rejected" && !reader.IsDBNull(reader.GetOrdinal("rejection_code"))
                    ? reader.GetString("rejection_code") : null,
                RejectionTitle = status == "rejected" && !reader.IsDBNull(reader.GetOrdinal("agent_label"))
                    ? reader.GetString("agent_label") : null,
                RejectionMessage = status == "rejected" && !reader.IsDBNull(reader.GetOrdinal("customer_message"))
                    ? reader.GetString("customer_message") : null
            });
        }
        return Ok(results);
    }
}

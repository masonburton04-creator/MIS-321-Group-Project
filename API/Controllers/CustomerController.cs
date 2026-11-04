using System.Net.Mail;
using System.Security.Claims;
using API.Data;
using API.Models;
using API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using MySqlConnector;

namespace API.Controllers;

// Optional customer accounts for the application form (mockup 1), so customers can
// save an application and finish it later. Guests can still apply without one.
//   POST /api/customer/register                    create an account (and sign in)
//   POST /api/customer/login                       email + password -> token
//   GET  /api/customer/me                          who the token belongs to
//   POST /api/customer/logout                      ends the session
//   GET  /api/customer/applications                the signed-in customer's applications
//   POST /api/customer/applications/{id}/claim     move a guest application into the account
// register and login can also claim a guest application in the same request.
[ApiController]
[Route("api/customer")]
public class CustomerController : ControllerBase
{
    private const string InvalidLogin = "Email or password is incorrect.";
    private const int MinPasswordLength = 8;

    private static readonly PasswordHasher<CustomerAccount> Hasher = new();
    private static readonly string DummyHash = Hasher.HashPassword(new CustomerAccount(), "not-a-real-password");

    private readonly Database _db;

    public CustomerController(Database db)
    {
        _db = db;
    }

    [HttpPost("register")]
    [EnableRateLimiting("customer-login")]
    public async Task<IActionResult> Register(CustomerRegisterRequest request)
    {
        var first = request.FirstName.Trim();
        var last = request.LastName.Trim();
        var email = request.Email.Trim().ToLowerInvariant();

        if (first.Length == 0 || last.Length == 0)
            return BadRequest(new { error = "Enter your first and last name." });
        if (first.Length > 100 || last.Length > 100)
            return BadRequest(new { error = "Names must be 100 characters or fewer." });
        if (email.Length > 255 || !MailAddress.TryCreate(email, out var parsed) || parsed.Address != email)
            return BadRequest(new { error = "Please enter a valid email address." });
        if (request.Password.Length < MinPasswordLength)
            return BadRequest(new { error = $"Use a password with at least {MinPasswordLength} characters." });

        await using var conn = await _db.OpenAsync();
        var account = new CustomerAccount { FirstName = first, LastName = last, Email = email };
        var cmd = new MySqlCommand(
            @"INSERT INTO customer_accounts (email, first_name, last_name, password_hash)
              VALUES (@email, @first, @last, @hash)", conn);
        cmd.Parameters.AddWithValue("@email", email);
        cmd.Parameters.AddWithValue("@first", first);
        cmd.Parameters.AddWithValue("@last", last);
        cmd.Parameters.AddWithValue("@hash", Hasher.HashPassword(account, request.Password));
        try
        {
            await cmd.ExecuteNonQueryAsync();
        }
        catch (MySqlException ex) when (ex.ErrorCode == MySqlErrorCode.DuplicateKeyEntry)
        {
            return Conflict(new { error = "There's already an account with that email. Sign in instead." });
        }
        catch (MySqlException ex) when (ex.ErrorCode == MySqlErrorCode.NoSuchTable)
        {
            return SetupMissing();
        }
        account.AccountId = (int)cmd.LastInsertedId;

        return Ok(await StartSessionAsync(conn, account, request.Claim));
    }

    [HttpPost("login")]
    [EnableRateLimiting("customer-login")]
    public async Task<IActionResult> Login(CustomerLoginRequest request)
    {
        var email = request.Email.Trim().ToLowerInvariant();
        if (email.Length == 0 || request.Password.Length == 0)
            return BadRequest(new { error = "Enter your email and password." });

        await using var conn = await _db.OpenAsync();
        var cmd = new MySqlCommand(
            "SELECT account_id, first_name, last_name, email, password_hash FROM customer_accounts WHERE email = @email", conn);
        cmd.Parameters.AddWithValue("@email", email);

        CustomerAccount? account = null;
        string? hash = null;
        try
        {
            await using var reader = await cmd.ExecuteReaderAsync();
            if (await reader.ReadAsync())
            {
                account = new CustomerAccount
                {
                    AccountId = reader.GetInt32("account_id"),
                    FirstName = reader.GetString("first_name"),
                    LastName = reader.GetString("last_name"),
                    Email = reader.GetString("email")
                };
                hash = reader.GetString("password_hash");
            }
        }
        catch (MySqlException ex) when (ex.ErrorCode == MySqlErrorCode.NoSuchTable)
        {
            return SetupMissing();
        }

        // Checked even when the email doesn't exist, so a wrong email takes as long as a wrong password
        var result = Hasher.VerifyHashedPassword(account ?? new CustomerAccount(), hash ?? DummyHash, request.Password);
        if (account == null || result == PasswordVerificationResult.Failed)
            return Unauthorized(new { error = InvalidLogin });

        if (result == PasswordVerificationResult.SuccessRehashNeeded)
        {
            var rehashCmd = new MySqlCommand("UPDATE customer_accounts SET password_hash = @hash WHERE account_id = @id", conn);
            rehashCmd.Parameters.AddWithValue("@hash", Hasher.HashPassword(account, request.Password));
            rehashCmd.Parameters.AddWithValue("@id", account.AccountId);
            await rehashCmd.ExecuteNonQueryAsync();
        }

        return Ok(await StartSessionAsync(conn, account, request.Claim));
    }

    [Authorize(AuthenticationSchemes = CustomerTokenAuthHandler.SchemeName)]
    [HttpGet("me")]
    public async Task<IActionResult> Me()
    {
        await using var conn = await _db.OpenAsync();
        var cmd = new MySqlCommand(
            "SELECT account_id, first_name, last_name, email FROM customer_accounts WHERE account_id = @id", conn);
        cmd.Parameters.AddWithValue("@id", CurrentAccountId(User));
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

    [Authorize(AuthenticationSchemes = CustomerTokenAuthHandler.SchemeName)]
    [HttpPost("logout")]
    public async Task<IActionResult> Logout()
    {
        await using var conn = await _db.OpenAsync();
        var cmd = new MySqlCommand("DELETE FROM customer_sessions WHERE token_hash = @hash", conn);
        cmd.Parameters.AddWithValue("@hash", User.FindFirstValue(CustomerTokenAuthHandler.TokenHashClaim));
        await cmd.ExecuteNonQueryAsync();
        return NoContent();
    }

    // Newest activity first, so the application they were just working on is at the top
    [Authorize(AuthenticationSchemes = CustomerTokenAuthHandler.SchemeName)]
    [HttpGet("applications")]
    public async Task<IActionResult> MyApplications()
    {
        await using var conn = await _db.OpenAsync();
        var cmd = new MySqlCommand(
            @"SELECT a.application_id, a.state_code, a.status, a.current_step, a.created_at, a.updated_at, a.submitted_at,
                     (SELECT GROUP_CONCAT(l.line_code ORDER BY l.line_id SEPARATOR ',')
                      FROM application_lines al JOIN insurance_lines l ON l.line_id = al.line_id
                      WHERE al.application_id = a.application_id) AS line_codes
              FROM applications a
              WHERE a.account_id = @account
              ORDER BY a.updated_at DESC", conn);
        cmd.Parameters.AddWithValue("@account", CurrentAccountId(User));

        var results = new List<ApplicationSummary>();
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            results.Add(new ApplicationSummary
            {
                ApplicationId = reader.GetInt32("application_id"),
                LineCodes = reader.IsDBNull(reader.GetOrdinal("line_codes"))
                    ? new List<string>() : reader.GetString("line_codes").Split(',').ToList(),
                StateCode = reader.GetString("state_code"),
                Status = reader.GetString("status"),
                CurrentStep = reader.IsDBNull(reader.GetOrdinal("current_step")) ? null : reader.GetInt32("current_step"),
                HasAccount = true,
                CreatedAt = reader.GetDateTime("created_at"),
                UpdatedAt = reader.GetDateTime("updated_at"),
                SubmittedAt = reader.IsDBNull(reader.GetOrdinal("submitted_at")) ? null : reader.GetDateTime("submitted_at")
            });
        }
        return Ok(results);
    }

    // A guest who already started an application signs in (or creates an account) to save it
    [Authorize(AuthenticationSchemes = CustomerTokenAuthHandler.SchemeName)]
    [HttpPost("applications/{id:int}/claim")]
    public async Task<IActionResult> Claim(int id, ClaimApplication request)
    {
        await using var conn = await _db.OpenAsync();
        request.ApplicationId = id;
        if (!await ClaimAsync(conn, CurrentAccountId(User), request))
            return Conflict(new { error = "That application can't be added to your account. It may already be submitted or saved to another account." });
        return Ok(new { applicationId = id });
    }

    // ---------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------

    private async Task<CustomerLoginResponse> StartSessionAsync(MySqlConnection conn, CustomerAccount account, ClaimApplication? claim)
    {
        var cleanupCmd = new MySqlCommand("DELETE FROM customer_sessions WHERE expires_at <= NOW()", conn);
        await cleanupCmd.ExecuteNonQueryAsync();

        var token = StaffTokens.NewToken();
        var sessionCmd = new MySqlCommand(
            @"INSERT INTO customer_sessions (token_hash, account_id, expires_at)
              VALUES (@hash, @account, NOW() + INTERVAL @days DAY)", conn);
        sessionCmd.Parameters.AddWithValue("@hash", StaffTokens.Hash(token));
        sessionCmd.Parameters.AddWithValue("@account", account.AccountId);
        sessionCmd.Parameters.AddWithValue("@days", (int)CustomerTokenAuthHandler.Lifetime.TotalDays);
        await sessionCmd.ExecuteNonQueryAsync();

        var response = new CustomerLoginResponse
        {
            Token = token,
            ExpiresAt = DateTime.Now.Add(CustomerTokenAuthHandler.Lifetime),
            Account = account
        };
        if (claim != null && await ClaimAsync(conn, account.AccountId, claim))
            response.ClaimedApplicationId = claim.ApplicationId;
        return response;
    }

    // Moves an in-progress guest application into the account. The guest key proves
    // this browser started it, so nobody can claim someone else's application by its number.
    private static async Task<bool> ClaimAsync(MySqlConnection conn, int accountId, ClaimApplication claim)
    {
        if (string.IsNullOrWhiteSpace(claim.GuestKey)) return false;
        var cmd = new MySqlCommand(
            @"UPDATE applications SET account_id = @account, guest_key_hash = NULL
              WHERE application_id = @id AND account_id IS NULL AND guest_key_hash = @hash AND status = 'in_progress'", conn);
        cmd.Parameters.AddWithValue("@account", accountId);
        cmd.Parameters.AddWithValue("@id", claim.ApplicationId);
        cmd.Parameters.AddWithValue("@hash", StaffTokens.Hash(claim.GuestKey.Trim()));
        return await cmd.ExecuteNonQueryAsync() == 1;
    }

    private ObjectResult SetupMissing() =>
        StatusCode(500, new { error = "Customer sign-in isn't set up. Run Database/10_sprint2_client_feedback.sql in MySQL Workbench." });

    private static int CurrentAccountId(ClaimsPrincipal user) =>
        int.Parse(user.FindFirstValue(ClaimTypes.NameIdentifier)!);
}

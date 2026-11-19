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

// One sign-in form for everyone:
//   POST /api/auth/login        email + password -> token. accountType 'staff' (go to the
//                               dashboard) or 'customer' (go to the website)
//   POST /api/auth/register     create a customer account (password strength + email domain checked)
//   POST /api/auth/check-email  the same email check, for feedback while the customer types
//   GET  /api/auth/me           staff: who the token belongs to (dashboard checks this on load)
//   POST /api/auth/logout       staff: ends the session right away
// Customers use /api/account/me and /api/account/logout (AccountController).
// Passwords are stored as salted PBKDF2 hashes (ASP.NET Core's PasswordHasher).
// To make a hash for a new staff account: dotnet run -- hash-password "the password"
[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private const string InvalidLogin = "Email or password is incorrect.";

    // The user object isn't used by the hasher, so one instance serves staff and customers
    private static readonly PasswordHasher<StaffMember> Hasher = new();

    // Checked when the email doesn't exist, so a wrong email takes as long as a wrong password
    private static readonly string DummyHash = Hasher.HashPassword(new StaffMember(), "not-a-real-password");

    private readonly Database _db;
    private readonly EmailChecker _emailChecker;

    public AuthController(Database db, EmailChecker emailChecker)
    {
        _db = db;
        _emailChecker = emailChecker;
    }

    [HttpPost("login")]
    [EnableRateLimiting("login")]
    public async Task<IActionResult> Login(LoginRequest request)
    {
        var email = request.Email.Trim().ToLowerInvariant();
        if (email.Length == 0 || request.Password.Length == 0)
            return BadRequest(new { error = "Enter your email and password." });

        await using var conn = await _db.OpenAsync();

        // Staff first: a staff member always lands on the dashboard
        var (staff, staffHash, staffActive) = await LoadStaffAsync(conn, email);
        if (staff != null && staffHash != null)
        {
            var result = Hasher.VerifyHashedPassword(staff, staffHash, request.Password);
            if (result != PasswordVerificationResult.Failed)
            {
                if (!staffActive)
                    return Unauthorized(new { error = "This account is inactive. Ask an admin to turn it back on." });
                if (result == PasswordVerificationResult.SuccessRehashNeeded)
                    await UpdateHashAsync(conn, "UPDATE staff_users SET password_hash = @hash WHERE staff_id = @id",
                        staff.StaffId, request.Password);
                return await StartStaffSessionAsync(conn, staff);
            }
        }

        var (customer, customerHash) = await LoadCustomerAsync(conn, email);
        if (customer != null)
        {
            var result = Hasher.VerifyHashedPassword(new StaffMember(), customerHash!, request.Password);
            if (result != PasswordVerificationResult.Failed)
            {
                if (result == PasswordVerificationResult.SuccessRehashNeeded)
                    await UpdateHashAsync(conn, "UPDATE customer_accounts SET password_hash = @hash WHERE account_id = @id",
                        customer.AccountId, request.Password);
                return await StartCustomerSessionAsync(conn, customer);
            }
        }
        else if (staff == null)
        {
            Hasher.VerifyHashedPassword(new StaffMember(), DummyHash, request.Password);
        }

        return Unauthorized(new { error = InvalidLogin });
    }

    [HttpPost("register")]
    [EnableRateLimiting("signup")]
    public async Task<IActionResult> Register(RegisterRequest request)
    {
        var first = request.FirstName.Trim();
        var last = request.LastName.Trim();
        var email = request.Email.Trim().ToLowerInvariant();

        if (first.Length == 0 || last.Length == 0)
            return BadRequest(new { error = "Enter your first and last name." });
        if (first.Length > 100 || last.Length > 100 || email.Length > 255)
            return BadRequest(new { error = "Name or email is too long." });

        var emailCheck = await _emailChecker.CheckAsync(email);
        if (!emailCheck.Ok)
            return BadRequest(new { error = emailCheck.Error, field = "email", suggestion = emailCheck.Suggestion });

        var problems = PasswordRules.Problems(request.Password, email, first, last);
        if (problems.Count > 0)
            return BadRequest(new { error = "Choose a stronger password. " + string.Join(" ", problems), field = "password", problems });

        await using var conn = await _db.OpenAsync();

        var existsCmd = new MySqlCommand(
            @"SELECT (SELECT COUNT(*) FROM customer_accounts WHERE email = @email) +
                     (SELECT COUNT(*) FROM staff_users WHERE email = @email)", conn);
        existsCmd.Parameters.AddWithValue("@email", email);
        try
        {
            if (Convert.ToInt32(await existsCmd.ExecuteScalarAsync()) > 0)
                return Conflict(new { error = "An account with this email already exists. Sign in instead.", field = "email" });
        }
        catch (MySqlException ex) when (ex.ErrorCode == MySqlErrorCode.NoSuchTable)
        {
            return StatusCode(500, new { error = "Customer accounts aren't set up. Run Database/08_client_feedback.sql in MySQL Workbench." });
        }

        var insertCmd = new MySqlCommand(
            @"INSERT INTO customer_accounts (email, first_name, last_name, password_hash)
              VALUES (@email, @first, @last, @hash)", conn);
        insertCmd.Parameters.AddWithValue("@email", email);
        insertCmd.Parameters.AddWithValue("@first", first);
        insertCmd.Parameters.AddWithValue("@last", last);
        insertCmd.Parameters.AddWithValue("@hash", Hasher.HashPassword(new StaffMember(), request.Password));
        try
        {
            await insertCmd.ExecuteNonQueryAsync();
        }
        catch (MySqlException ex) when (ex.ErrorCode == MySqlErrorCode.DuplicateKeyEntry)
        {
            return Conflict(new { error = "An account with this email already exists. Sign in instead.", field = "email" });
        }

        var customer = new CustomerAccount
        {
            AccountId = (int)insertCmd.LastInsertedId, FirstName = first, LastName = last, Email = email
        };
        return await StartCustomerSessionAsync(conn, customer);
    }

    // Live check while typing the email on the Create Account form
    [HttpPost("check-email")]
    [EnableRateLimiting("signup")]
    public async Task<IActionResult> CheckEmail(CheckEmailRequest request)
    {
        var result = await _emailChecker.CheckAsync(request.Email.Trim().ToLowerInvariant());
        return Ok(new { ok = result.Ok, error = result.Error, suggestion = result.Suggestion });
    }

    [Authorize] // staff
    [HttpGet("me")]
    public async Task<IActionResult> Me()
    {
        await using var conn = await _db.OpenAsync();
        var cmd = new MySqlCommand(
            "SELECT staff_id, first_name, last_name, email, role FROM staff_users WHERE staff_id = @id", conn);
        cmd.Parameters.AddWithValue("@id", CurrentStaffId(User));
        await using var reader = await cmd.ExecuteReaderAsync();
        if (!await reader.ReadAsync()) return Unauthorized(new { error = "Please sign in again." });
        return Ok(ReadStaff(reader));
    }

    [Authorize] // staff
    [HttpPost("logout")]
    public async Task<IActionResult> Logout()
    {
        await using var conn = await _db.OpenAsync();
        var cmd = new MySqlCommand("DELETE FROM staff_sessions WHERE token_hash = @hash", conn);
        cmd.Parameters.AddWithValue("@hash", User.FindFirstValue(StaffTokenAuthHandler.TokenHashClaim));
        await cmd.ExecuteNonQueryAsync();
        return NoContent();
    }

    // The signed-in staff member's id and role (only call from staff [Authorize] endpoints)
    public static int CurrentStaffId(ClaimsPrincipal user) =>
        int.Parse(user.FindFirstValue(ClaimTypes.NameIdentifier)!);

    public static string CurrentStaffRole(ClaimsPrincipal user) =>
        user.FindFirstValue(ClaimTypes.Role) ?? "employee";

    public static string HashPassword(string password) => Hasher.HashPassword(new StaffMember(), password);

    // ---------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------

    private static StaffMember ReadStaff(MySqlDataReader reader) => new()
    {
        StaffId = reader.GetInt32("staff_id"),
        FirstName = reader.GetString("first_name"),
        LastName = reader.GetString("last_name"),
        Email = reader.GetString("email"),
        Role = reader.GetString("role")
    };

    private static async Task<(StaffMember?, string?, bool)> LoadStaffAsync(MySqlConnection conn, string email)
    {
        var cmd = new MySqlCommand(
            @"SELECT staff_id, first_name, last_name, email, role, password_hash, is_active
              FROM staff_users WHERE email = @email", conn);
        cmd.Parameters.AddWithValue("@email", email);
        await using var reader = await cmd.ExecuteReaderAsync();
        if (!await reader.ReadAsync()) return (null, null, false);
        var hash = reader.IsDBNull(reader.GetOrdinal("password_hash")) ? null : reader.GetString("password_hash");
        return (ReadStaff(reader), hash, reader.GetBoolean("is_active"));
    }

    private static async Task<(CustomerAccount?, string?)> LoadCustomerAsync(MySqlConnection conn, string email)
    {
        var cmd = new MySqlCommand(
            "SELECT account_id, first_name, last_name, email, password_hash FROM customer_accounts WHERE email = @email", conn);
        cmd.Parameters.AddWithValue("@email", email);
        try
        {
            await using var reader = await cmd.ExecuteReaderAsync();
            if (!await reader.ReadAsync()) return (null, null);
            return (new CustomerAccount
            {
                AccountId = reader.GetInt32("account_id"),
                FirstName = reader.GetString("first_name"),
                LastName = reader.GetString("last_name"),
                Email = reader.GetString("email")
            }, reader.GetString("password_hash"));
        }
        catch (MySqlException ex) when (ex.ErrorCode == MySqlErrorCode.NoSuchTable)
        {
            return (null, null); // 08_client_feedback.sql not run yet: staff sign-in still works
        }
    }

    private static async Task UpdateHashAsync(MySqlConnection conn, string sql, int id, string password)
    {
        var cmd = new MySqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@hash", HashPassword(password));
        cmd.Parameters.AddWithValue("@id", id);
        await cmd.ExecuteNonQueryAsync();
    }

    private async Task<IActionResult> StartStaffSessionAsync(MySqlConnection conn, StaffMember staff)
    {
        var cleanupCmd = new MySqlCommand("DELETE FROM staff_sessions WHERE expires_at <= NOW()", conn);
        await cleanupCmd.ExecuteNonQueryAsync();

        var token = StaffTokens.NewToken();
        var sessionCmd = new MySqlCommand(
            @"INSERT INTO staff_sessions (token_hash, staff_id, expires_at)
              VALUES (@hash, @staff, NOW() + INTERVAL @hours HOUR)", conn);
        sessionCmd.Parameters.AddWithValue("@hash", StaffTokens.Hash(token));
        sessionCmd.Parameters.AddWithValue("@staff", staff.StaffId);
        sessionCmd.Parameters.AddWithValue("@hours", (int)StaffTokens.Lifetime.TotalHours);
        try
        {
            await sessionCmd.ExecuteNonQueryAsync();
        }
        catch (MySqlException ex) when (ex.ErrorCode == MySqlErrorCode.NoSuchTable)
        {
            return StatusCode(500, new { error = "Sign-in isn't set up. Run Database/07_staff_sessions.sql in MySQL Workbench." });
        }

        return Ok(new LoginResponse
        {
            AccountType = "staff",
            Token = token,
            ExpiresAt = DateTime.Now.Add(StaffTokens.Lifetime),
            Staff = staff
        });
    }

    private async Task<IActionResult> StartCustomerSessionAsync(MySqlConnection conn, CustomerAccount customer)
    {
        var cleanupCmd = new MySqlCommand("DELETE FROM customer_sessions WHERE expires_at <= NOW()", conn);
        await cleanupCmd.ExecuteNonQueryAsync();

        var token = StaffTokens.NewToken();
        var sessionCmd = new MySqlCommand(
            @"INSERT INTO customer_sessions (token_hash, account_id, expires_at)
              VALUES (@hash, @account, NOW() + INTERVAL @days DAY)", conn);
        sessionCmd.Parameters.AddWithValue("@hash", StaffTokens.Hash(token));
        sessionCmd.Parameters.AddWithValue("@account", customer.AccountId);
        sessionCmd.Parameters.AddWithValue("@days", (int)CustomerTokenAuthHandler.Lifetime.TotalDays);
        await sessionCmd.ExecuteNonQueryAsync();

        var loginCmd = new MySqlCommand("UPDATE customer_accounts SET last_login_at = NOW() WHERE account_id = @id", conn);
        loginCmd.Parameters.AddWithValue("@id", customer.AccountId);
        await loginCmd.ExecuteNonQueryAsync();

        return Ok(new LoginResponse
        {
            AccountType = "customer",
            Token = token,
            ExpiresAt = DateTime.Now.Add(CustomerTokenAuthHandler.Lifetime),
            Customer = customer
        });
    }
}

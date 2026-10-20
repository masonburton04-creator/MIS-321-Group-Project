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

// Staff sign-in for the agent dashboard (customers don't sign in):
//   POST /api/auth/login    email + password -> token (see StaffTokenAuthHandler)
//   GET  /api/auth/me       who the token belongs to (dashboard checks this on load)
//   POST /api/auth/logout   ends the session right away
// Passwords are stored as salted PBKDF2 hashes (ASP.NET Core's PasswordHasher).
// To make a hash for a new account: dotnet run -- hash-password "the password"
[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private const string InvalidLogin = "Email or password is incorrect.";

    private static readonly PasswordHasher<StaffMember> Hasher = new();

    // Checked when the email doesn't exist, so a wrong email takes as long as a wrong password
    private static readonly string DummyHash = Hasher.HashPassword(new StaffMember(), "not-a-real-password");

    private readonly Database _db;

    public AuthController(Database db)
    {
        _db = db;
    }

    [HttpPost("login")]
    [EnableRateLimiting("login")]
    public async Task<IActionResult> Login(LoginRequest request)
    {
        var email = request.Email.Trim().ToLowerInvariant();
        if (email.Length == 0 || request.Password.Length == 0)
            return BadRequest(new { error = "Enter your email and password." });

        await using var conn = await _db.OpenAsync();
        var cmd = new MySqlCommand(
            @"SELECT staff_id, first_name, last_name, email, role, password_hash, is_active
              FROM staff_users WHERE email = @email", conn);
        cmd.Parameters.AddWithValue("@email", email);

        StaffMember? staff = null;
        string? hash = null;
        var isActive = false;
        await using (var reader = await cmd.ExecuteReaderAsync())
        {
            if (await reader.ReadAsync())
            {
                staff = new StaffMember
                {
                    StaffId = reader.GetInt32("staff_id"),
                    FirstName = reader.GetString("first_name"),
                    LastName = reader.GetString("last_name"),
                    Email = reader.GetString("email"),
                    Role = reader.GetString("role")
                };
                hash = reader.IsDBNull(reader.GetOrdinal("password_hash")) ? null : reader.GetString("password_hash");
                isActive = reader.GetBoolean("is_active");
            }
        }

        var result = Hasher.VerifyHashedPassword(staff ?? new StaffMember(), hash ?? DummyHash, request.Password);
        if (staff == null || hash == null || result == PasswordVerificationResult.Failed)
            return Unauthorized(new { error = InvalidLogin });
        if (!isActive)
            return Unauthorized(new { error = "This account is inactive. Ask an admin to turn it back on." });

        // The hasher's settings got stronger since this hash was made; save an upgraded one
        if (result == PasswordVerificationResult.SuccessRehashNeeded)
        {
            var rehashCmd = new MySqlCommand("UPDATE staff_users SET password_hash = @hash WHERE staff_id = @id", conn);
            rehashCmd.Parameters.AddWithValue("@hash", Hasher.HashPassword(staff, request.Password));
            rehashCmd.Parameters.AddWithValue("@id", staff.StaffId);
            await rehashCmd.ExecuteNonQueryAsync();
        }

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
            Token = token,
            ExpiresAt = DateTime.Now.Add(StaffTokens.Lifetime),
            Staff = staff
        });
    }

    [Authorize]
    [HttpGet("me")]
    public async Task<IActionResult> Me()
    {
        await using var conn = await _db.OpenAsync();
        var cmd = new MySqlCommand(
            "SELECT staff_id, first_name, last_name, email, role FROM staff_users WHERE staff_id = @id", conn);
        cmd.Parameters.AddWithValue("@id", CurrentStaffId(User));
        await using var reader = await cmd.ExecuteReaderAsync();
        if (!await reader.ReadAsync()) return Unauthorized(new { error = "Please sign in again." });
        return Ok(new StaffMember
        {
            StaffId = reader.GetInt32("staff_id"),
            FirstName = reader.GetString("first_name"),
            LastName = reader.GetString("last_name"),
            Email = reader.GetString("email"),
            Role = reader.GetString("role")
        });
    }

    [Authorize]
    [HttpPost("logout")]
    public async Task<IActionResult> Logout()
    {
        await using var conn = await _db.OpenAsync();
        var cmd = new MySqlCommand("DELETE FROM staff_sessions WHERE token_hash = @hash", conn);
        cmd.Parameters.AddWithValue("@hash", User.FindFirstValue(StaffTokenAuthHandler.TokenHashClaim));
        await cmd.ExecuteNonQueryAsync();
        return NoContent();
    }

    // The signed-in staff member's id (only call from [Authorize] endpoints)
    public static int CurrentStaffId(ClaimsPrincipal user) =>
        int.Parse(user.FindFirstValue(ClaimTypes.NameIdentifier)!);

    public static string HashPassword(string password) => Hasher.HashPassword(new StaffMember(), password);
}

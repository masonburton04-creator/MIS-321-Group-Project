using System.Buffers.Text;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Encodings.Web;
using API.Data;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;
using MySqlConnector;

namespace API.Services;

// Dashboard sign-in. POST /api/auth/login returns a random token; the dashboard sends it
// back on every request as "Authorization: Bearer <token>". This handler looks the token
// up in staff_sessions, so [Authorize] endpoints only run for a signed-in, active staff member.
// Tokens (not cookies) because the dashboard is opened from a different origin than the API.
public class StaffTokenAuthHandler : AuthenticationHandler<AuthenticationSchemeOptions>
{
    public const string SchemeName = "StaffToken";
    public const string TokenHashClaim = "token_hash";

    private readonly Database _db;

    public StaffTokenAuthHandler(IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger,
        UrlEncoder encoder, Database db) : base(options, logger, encoder)
    {
        _db = db;
    }

    protected override async Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var header = Request.Headers.Authorization.ToString();
        if (!header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
            return AuthenticateResult.NoResult();
        var token = header["Bearer ".Length..].Trim();
        if (token.Length == 0) return AuthenticateResult.NoResult();

        var tokenHash = StaffTokens.Hash(token);
        await using var conn = await _db.OpenAsync();
        var cmd = new MySqlCommand(
            @"SELECT s.staff_id, s.first_name, s.last_name, s.role
              FROM staff_sessions ss JOIN staff_users s ON s.staff_id = ss.staff_id
              WHERE ss.token_hash = @hash AND ss.expires_at > NOW() AND s.is_active = TRUE", conn);
        cmd.Parameters.AddWithValue("@hash", tokenHash);
        await using var reader = await cmd.ExecuteReaderAsync();
        if (!await reader.ReadAsync())
            return AuthenticateResult.Fail("Session expired or signed out.");

        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, reader.GetInt32("staff_id").ToString()),
            new Claim(ClaimTypes.Name, reader.GetString("first_name") + " " + reader.GetString("last_name")),
            new Claim(ClaimTypes.Role, reader.GetString("role")),
            new Claim(TokenHashClaim, tokenHash)
        };
        var principal = new ClaimsPrincipal(new ClaimsIdentity(claims, SchemeName));
        return AuthenticateResult.Success(new AuthenticationTicket(principal, SchemeName));
    }

    // JSON error like every other endpoint, so the dashboard can show it and return to sign-in
    protected override async Task HandleChallengeAsync(AuthenticationProperties properties)
    {
        Response.StatusCode = StatusCodes.Status401Unauthorized;
        await Response.WriteAsJsonAsync(new { error = "Please sign in again." });
    }
}

public static class StaffTokens
{
    public static readonly TimeSpan Lifetime = TimeSpan.FromHours(8);

    // 32 random bytes = 256 bits, URL-safe so it can go in a header as-is
    public static string NewToken() => Base64Url.EncodeToString(RandomNumberGenerator.GetBytes(32));

    public static string Hash(string token) =>
        Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
}

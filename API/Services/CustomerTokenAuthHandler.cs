using System.Security.Claims;
using System.Text.Encodings.Web;
using API.Data;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;
using MySqlConnector;

namespace API.Services;

// Customer sign-in for the application form (mockup 1). Works like StaffTokenAuthHandler,
// but looks the token up in customer_sessions, so a customer token never opens staff
// endpoints and a staff token is never a customer. Use it with
// [Authorize(AuthenticationSchemes = CustomerTokenAuthHandler.SchemeName)], or call
// CurrentAccountIdAsync on endpoints that guests can also use.
public class CustomerTokenAuthHandler : AuthenticationHandler<AuthenticationSchemeOptions>
{
    public const string SchemeName = "CustomerToken";
    public const string TokenHashClaim = "token_hash";

    // Long enough to come back days later with the square footage
    public static readonly TimeSpan Lifetime = TimeSpan.FromDays(14);

    private readonly Database _db;

    public CustomerTokenAuthHandler(IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger,
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
            @"SELECT a.account_id, a.first_name, a.last_name
              FROM customer_sessions cs JOIN customer_accounts a ON a.account_id = cs.account_id
              WHERE cs.token_hash = @hash AND cs.expires_at > NOW()", conn);
        cmd.Parameters.AddWithValue("@hash", tokenHash);
        try
        {
            await using var reader = await cmd.ExecuteReaderAsync();
            if (!await reader.ReadAsync())
                return AuthenticateResult.Fail("Session expired or signed out.");

            var claims = new[]
            {
                new Claim(ClaimTypes.NameIdentifier, reader.GetInt32("account_id").ToString()),
                new Claim(ClaimTypes.Name, reader.GetString("first_name") + " " + reader.GetString("last_name")),
                new Claim(TokenHashClaim, tokenHash)
            };
            var principal = new ClaimsPrincipal(new ClaimsIdentity(claims, SchemeName));
            return AuthenticateResult.Success(new AuthenticationTicket(principal, SchemeName));
        }
        catch (MySqlException ex) when (ex.ErrorCode == MySqlErrorCode.NoSuchTable)
        {
            return AuthenticateResult.Fail("Customer sign-in isn't set up. Run Database/10_sprint2_client_feedback.sql.");
        }
    }

    protected override async Task HandleChallengeAsync(AuthenticationProperties properties)
    {
        Response.StatusCode = StatusCodes.Status401Unauthorized;
        await Response.WriteAsJsonAsync(new { error = "Please sign in again." });
    }

    // The signed-in customer's account id, or null for a guest (or an expired token)
    public static async Task<int?> CurrentAccountIdAsync(HttpContext context)
    {
        var result = await context.AuthenticateAsync(SchemeName);
        if (!result.Succeeded) return null;
        return int.Parse(result.Principal!.FindFirstValue(ClaimTypes.NameIdentifier)!);
    }
}

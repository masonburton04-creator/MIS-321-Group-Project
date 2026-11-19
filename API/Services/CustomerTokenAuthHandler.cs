using System.Security.Claims;
using System.Text.Encodings.Web;
using API.Data;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;
using MySqlConnector;

namespace API.Services;

// Customer sign-in. Works like StaffTokenAuthHandler, but looks the token up in
// customer_sessions. Customer endpoints opt in with
//   [Authorize(AuthenticationSchemes = CustomerTokenAuthHandler.SchemeName)]
// Plain [Authorize] still means staff only (StaffToken is the default scheme), so a
// customer token can never open the dashboard.
public class CustomerTokenAuthHandler : AuthenticationHandler<AuthenticationSchemeOptions>
{
    public const string SchemeName = "CustomerToken";
    public const string TokenHashClaim = "token_hash";

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
        await using var reader = await cmd.ExecuteReaderAsync();
        if (!await reader.ReadAsync())
            return AuthenticateResult.Fail("Session expired or signed out.");

        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, reader.GetInt32("account_id").ToString()),
            new Claim(ClaimTypes.Name, reader.GetString("first_name") + " " + reader.GetString("last_name")),
            new Claim(ClaimTypes.Role, "customer"),
            new Claim(TokenHashClaim, tokenHash)
        };
        var principal = new ClaimsPrincipal(new ClaimsIdentity(claims, SchemeName));
        return AuthenticateResult.Success(new AuthenticationTicket(principal, SchemeName));
    }

    protected override async Task HandleChallengeAsync(AuthenticationProperties properties)
    {
        Response.StatusCode = StatusCodes.Status401Unauthorized;
        await Response.WriteAsJsonAsync(new { error = "Please sign in to continue." });
    }

    // The signed-in customer's account id (only call from customer [Authorize] endpoints)
    public static int CurrentAccountId(ClaimsPrincipal user) =>
        int.Parse(user.FindFirstValue(ClaimTypes.NameIdentifier)!);

    // Customer sessions last longer than staff ones (a customer may fill the form over a few days)
    public static readonly TimeSpan Lifetime = TimeSpan.FromDays(7);
}

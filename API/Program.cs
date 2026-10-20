using System.Threading.RateLimiting;
using API.Controllers;
using API.Data;
using API.Services;
using Microsoft.AspNetCore.Authentication;

// Helper for creating staff accounts: dotnet run -- hash-password "the password"
// prints a hash to paste into staff_users.password_hash (see API/README.md).
if (args.Length == 2 && args[0] == "hash-password")
{
    Console.WriteLine(AuthController.HashPassword(args[1]));
    return;
}

var builder = WebApplication.CreateBuilder(args);

// The MySQL connection string comes from .NET user secrets (see API/README.md),
// so the database password is never committed to GitHub.
var connectionString = builder.Configuration.GetConnectionString("ValentDb")
    ?? throw new InvalidOperationException(
        "Missing connection string 'ValentDb'. Run: dotnet user-secrets set \"ConnectionStrings:ValentDb\" " +
        "\"Server=localhost;Port=3306;Database=valent_insurance;User=root;Password=YOUR_PASSWORD;\"");

builder.Services.AddSingleton(new Database(connectionString));
builder.Services.AddControllers();
builder.Services.AddOpenApi();

// Staff sign-in: [Authorize] endpoints need "Authorization: Bearer <token>" from POST /api/auth/login
builder.Services.AddAuthentication(StaffTokenAuthHandler.SchemeName)
    .AddScheme<AuthenticationSchemeOptions, StaffTokenAuthHandler>(StaffTokenAuthHandler.SchemeName, null);
builder.Services.AddAuthorization();

// Slow down password guessing: 5 sign-in attempts per minute from one address
builder.Services.AddRateLimiter(options =>
{
    options.AddPolicy("login", context => RateLimitPartition.GetFixedWindowLimiter(
        context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 5, Window = TimeSpan.FromMinutes(1) }));
    options.OnRejected = async (context, cancellationToken) =>
    {
        context.HttpContext.Response.StatusCode = StatusCodes.Status429TooManyRequests;
        await context.HttpContext.Response.WriteAsJsonAsync(
            new { error = "Too many sign-in attempts. Wait a minute and try again." }, cancellationToken);
    };
});

// The front end is opened straight from disk or from VS Code Live Server,
// so it runs on a different origin than the API. Allow it during development.
// (Sign-in uses a header token, not cookies, so no credentials setting is needed.)
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy => policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod());
});

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();
app.MapControllers();

app.Run();

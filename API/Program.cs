using System.Threading.RateLimiting;
using API.Controllers;
using API.Data;
using API.Services;
using DnsClient;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Diagnostics;
using MySqlConnector;

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

// Sign-in: endpoints need "Authorization: Bearer <token>" from POST /api/auth/login.
// Plain [Authorize] = staff (the default scheme). Customer endpoints name the CustomerToken scheme.
builder.Services.AddAuthentication(StaffTokenAuthHandler.SchemeName)
    .AddScheme<AuthenticationSchemeOptions, StaffTokenAuthHandler>(StaffTokenAuthHandler.SchemeName, null)
    .AddScheme<AuthenticationSchemeOptions, CustomerTokenAuthHandler>(CustomerTokenAuthHandler.SchemeName, null);
builder.Services.AddAuthorization();

// Email domain check for new customer accounts (MX records via the computer's DNS server)
builder.Services.AddSingleton<ILookupClient>(new LookupClient(new LookupClientOptions
{
    Timeout = TimeSpan.FromSeconds(3),
    Retries = 1,
    UseCache = true
}));
builder.Services.AddSingleton<EmailChecker>();

// AI chatbot: a local Ollama model (settings in appsettings.json "Ollama").
// One shared client, so it remembers when the model was last loaded.
var ollamaOptions = builder.Configuration.GetSection("Ollama").Get<OllamaOptions>() ?? new OllamaOptions();
builder.Services.AddSingleton(ollamaOptions);
builder.Services.AddSingleton(sp => new OllamaClient(new HttpClient(), ollamaOptions, sp.GetRequiredService<ILogger<OllamaClient>>()));
// Embedding search over the chatbot's context documents in API/Knowledge
builder.Services.AddSingleton<KnowledgeBase>();

// Slow down password guessing: 5 sign-in attempts per minute from one address
builder.Services.AddRateLimiter(options =>
{
    options.AddPolicy("login", context => RateLimitPartition.GetFixedWindowLimiter(
        context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 5, Window = TimeSpan.FromMinutes(1) }));
    // Account creation and the live email check: more generous, still stops scripted sign-ups
    options.AddPolicy("signup", context => RateLimitPartition.GetFixedWindowLimiter(
        context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 20, Window = TimeSpan.FromMinutes(1) }));
    // Chatbot: each message keeps the model busy for several seconds
    options.AddPolicy("chat", context => RateLimitPartition.GetFixedWindowLimiter(
        context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 20, Window = TimeSpan.FromMinutes(1) }));
    options.OnRejected = async (context, cancellationToken) =>
    {
        context.HttpContext.Response.StatusCode = StatusCodes.Status429TooManyRequests;
        await context.HttpContext.Response.WriteAsJsonAsync(
            new { error = "Too many attempts. Wait a minute and try again." }, cancellationToken);
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

// A database that's missing a newer SQL script fails with "unknown column" / "no such table".
// Say which script to run instead of a bare 500.
app.UseExceptionHandler(errorApp => errorApp.Run(async context =>
{
    var error = context.Features.Get<IExceptionHandlerFeature>()?.Error;
    context.Response.StatusCode = StatusCodes.Status500InternalServerError;
    var message = error is MySqlException { ErrorCode: MySqlErrorCode.BadFieldError or MySqlErrorCode.NoSuchTable }
        ? "The database is missing an update. Run Database/08_client_feedback.sql in MySQL Workbench, then try again."
        : error is MySqlException
            ? "The database returned an error. Open http://localhost:5250/api/health to see why (MySQL not running, or a wrong password in user secrets)."
            : "Something went wrong on the server.";
    await context.Response.WriteAsJsonAsync(new { error = message });
}));

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();
app.MapControllers();

// Load the chatbot model in the background now, so the first customer question isn't slow
app.Lifetime.ApplicationStarted.Register(() =>
{
    app.Services.GetRequiredService<OllamaClient>().WarmUpInBackground("API started");
    _ = app.Services.GetRequiredService<KnowledgeBase>().EnsureLoadedAsync();
});

app.Run();

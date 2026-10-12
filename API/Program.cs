using API.Data;

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

// The front end is opened straight from disk or from VS Code Live Server,
// so it runs on a different origin than the API. Allow it during development.
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
app.MapControllers();

app.Run();

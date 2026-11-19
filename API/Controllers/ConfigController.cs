using Microsoft.AspNetCore.Mvc;

namespace API.Controllers;

// GET /api/config/maps-key - the Google Maps browser key for address autocomplete.
// The key lives in .NET user secrets (Google:MapsBrowserKey), not in the repo.
// It's a browser key, so it's public by design once the page loads it; what protects it
// is the website + API restriction set on the key in Google Cloud.
// Returns { key: null } when no key is configured, and the form works without autocomplete.
[ApiController]
[Route("api/config")]
public class ConfigController : ControllerBase
{
    private readonly IConfiguration _config;

    public ConfigController(IConfiguration config)
    {
        _config = config;
    }

    [HttpGet("maps-key")]
    public IActionResult MapsKey()
    {
        var key = _config["Google:MapsBrowserKey"];
        return Ok(new { key = string.IsNullOrWhiteSpace(key) ? null : key });
    }
}

using Microsoft.AspNetCore.Mvc;

namespace API.Controllers;

// GET /api/config: settings the customer site needs at startup.
// The Google Maps key (address lookup) is kept in .NET user secrets like the database
// password, so it never gets committed:
//   dotnet user-secrets set "GoogleMaps:ApiKey" "YOUR_KEY"
// A Maps JavaScript key is visible to the browser by design, so restrict it in the Google
// Cloud console to your site's address (HTTP referrers) and to the Maps JavaScript and Places APIs.
[ApiController]
[Route("api/config")]
public class ConfigController : ControllerBase
{
    private readonly IConfiguration _config;

    public ConfigController(IConfiguration config)
    {
        _config = config;
    }

    [HttpGet]
    public IActionResult Get()
    {
        var key = _config["GoogleMaps:ApiKey"];
        return Ok(new { googleMapsApiKey = string.IsNullOrWhiteSpace(key) ? null : key });
    }
}

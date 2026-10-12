using API.Data;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;

namespace API.Controllers;

// GET /api/health - quick check that the API is running and can reach MySQL.
// Open http://localhost:5250/api/health in a browser to test.
[ApiController]
[Route("api/health")]
public class HealthController : ControllerBase
{
    private readonly Database _db;

    public HealthController(Database db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<IActionResult> Get()
    {
        try
        {
            await using var conn = await _db.OpenAsync();
            var cmd = new MySqlCommand("SELECT COUNT(*) FROM insurance_lines", conn);
            var lines = Convert.ToInt32(await cmd.ExecuteScalarAsync());
            return Ok(new { api = "ok", database = "ok", insuranceLines = lines });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { api = "ok", database = "error", message = ex.Message });
        }
    }
}

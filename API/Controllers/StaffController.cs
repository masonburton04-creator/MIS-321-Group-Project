using API.Data;
using API.Models;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;

namespace API.Controllers;

// GET /api/staff - active agents, for the agent dashboard's "Acting as" picker.
// There is no login yet, so the dashboard just sends the chosen staff_id.
[ApiController]
[Route("api/staff")]
public class StaffController : ControllerBase
{
    private readonly Database _db;

    public StaffController(Database db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<IActionResult> GetActive()
    {
        await using var conn = await _db.OpenAsync();

        var cmd = new MySqlCommand(
            @"SELECT staff_id, first_name, last_name, email, role FROM staff_users
              WHERE is_active = TRUE ORDER BY last_name, first_name", conn);

        var staff = new List<StaffMember>();
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            staff.Add(new StaffMember
            {
                StaffId = reader.GetInt32("staff_id"),
                FirstName = reader.GetString("first_name"),
                LastName = reader.GetString("last_name"),
                Email = reader.GetString("email"),
                Role = reader.GetString("role")
            });
        }
        return Ok(staff);
    }
}

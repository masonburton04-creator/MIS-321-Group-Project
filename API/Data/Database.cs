using MySqlConnector;

namespace API.Data;

// Hands out open MySQL connections. Controllers wrap each one in "await using"
// so it is closed (and returned to the connection pool) when they finish.
public class Database
{
    private readonly string _connectionString;

    public Database(string connectionString)
    {
        _connectionString = connectionString;
    }

    public async Task<MySqlConnection> OpenAsync()
    {
        var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();
        return connection;
    }
}

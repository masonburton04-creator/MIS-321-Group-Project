# Valent Partners API (C# / ASP.NET Core)

The back end for the customer application form (mockup 1). The browser sends
form answers here, and this API saves them to the `valent_insurance` MySQL database.

```
Browser (mockup_1)  --HTTP/JSON-->  API (this folder, port 5250)  --SQL-->  MySQL (valent_insurance)
```

## One-time setup

1. **Install the .NET 10 SDK** if `dotnet --list-sdks` doesn't show a 10.x version:
   https://dotnet.microsoft.com/download

2. **Create the database.** In MySQL Workbench, run `Database/01_schema.sql`,
   then `Database/02_seed.sql`. Re-run both any time the SQL files change.
   Note that re-running deletes all existing data.

   Optional: run `Database/03_mock_data.sql` to add fake agent accounts and ~30 fake
   applications (every status, bundles, vehicles, jewelry, analytics events) so the
   agent dashboard has something to show. It can be re-run at any time and only replaces
   its own mock rows. Your real test applications are left alone.

3. **Save your MySQL connection string** (once per computer). In a terminal in this `API` folder:

   ```
   dotnet user-secrets set "ConnectionStrings:ValentDb" "Server=localhost;Port=3306;Database=valent_insurance;User=root;Password=YOUR_PASSWORD;"
   ```

   Replace `YOUR_PASSWORD` with your MySQL root password. User secrets are stored
   in your Windows user profile, not in this folder, so the password never gets committed to GitHub.

## Running it

In a terminal in this `API` folder:

```
dotnet run
```

Leave that terminal open. To check it's working, open http://localhost:5250/api/health in a browser:

- `"database":"ok"`: everything is connected.
- `"database":"error"`: read the `message`. Usually a wrong password in step 3, or MySQL isn't running.

Then open `Sprint 1 Mockups/mockup_1/Client/Resources/index.html`, click **Start Application**,
and fill out the form. Submitted applications appear in the `applications`, `application_lines`,
`customers`, and `application_answers` tables in Workbench.

## Endpoints

| Method | URL | What it does |
|---|---|---|
| GET  | `/api/health` | Checks the API can reach MySQL |
| POST | `/api/applications` | Starts an application. Body: `{ "lineCodes": ["HOME", "AUTO"], "stateCode": "AL" }`. More than one line = a bundle |
| PUT  | `/api/applications/{id}/steps/{step}` | Saves one step's answers. Body: `{ "answers": { "zip": "35401" }, "items": { "vehicle": [ { "make": "Honda" } ] } }` |
| POST | `/api/applications/{id}/submit` | Submits for agent review (status becomes `submitted`) |
| GET  | `/api/applications` | Lists applications, newest first. Optional `?status=submitted` |
| GET  | `/api/applications/{id}` | One application with the customer's info, all answers, and status history |
| PUT  | `/api/applications/{id}/status` | Agent action. Body: `{ "status": "approved", "staffId": 2, "note": "..." }`. Status: `under_review`, `approved`, `rejected`, `escalated` (a note is required for the last two) |
| GET  | `/api/staff` | Active agents (for the dashboard's "Acting as" picker; no login yet) |
| GET  | `/api/dashboard` | KPIs, funnel, and friction metrics for the agent dashboard. Optional `?state=AL&line=HOME&range=last30` (`last7`, `last30`, `last90`, `ytd`, `all`) |

The agent dashboard is `Sprint 1 Mockups/mockup_2/Client/Resources/index.html`. It needs the API running.

Application steps: 1 Coverage, 2 Property/Item/Vehicle Details, 3 Applicant, 4 Quote, 5 Submit.
A bundle is one application with several rows in `application_lines`. The customer fills out
one form that shows the questions for every line they picked.
Step 3's `first_name`, `last_name`, `email`, and `phone` are saved to the `customers` table;
all other answers go to `application_answers` as one row per question.

Repeatable items (each `vehicle`, `driver`, and `jewelry` piece) are sent in `items` and saved to
`application_item_answers`, one row per field per item (e.g. vehicle 2's make). Sending a list
replaces everything saved for that type, so removed items disappear. A driver's `primary_vehicle`
is the number of the vehicle they drive most.

## Project layout

```
API/
├── Program.cs                          startup: connection string, CORS, controllers
├── Data/Database.cs                    opens MySQL connections
├── Models/ApplicationModels.cs         request/response shapes
└── Controllers/
    ├── ApplicationsController.cs       the application endpoints
    ├── DashboardController.cs          agent dashboard stats
    ├── StaffController.cs              agent list
    └── HealthController.cs             /api/health
```

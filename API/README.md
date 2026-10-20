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

   Then run `Database/04_demo_quote_rates.sql`. It creates the `demo_quote_factors` table the
   Quote step uses for its price range. The numbers are national averages plus placeholders,
   with sources in the table, and every estimate is labeled "DEMO ESTIMATE, not a real quote".
   Edit the numbers in Workbench any time; no API restart needed.

   Then run `Database/05_supported_states.sql`. It limits applications to the sprint's demo
   states (Alabama, Texas, New York). Re-run it after re-running `02_seed.sql`.

   If your database was created before current-policy uploads were added, also run
   `Database/06_application_documents.sql` once (not needed right after `01_schema.sql`).
   Same for dashboard sign-in: run `Database/07_staff_sessions.sql` once.

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

## Dashboard sign-in

The agent dashboard (mockup 2) asks staff to sign in. Customers never sign in.

- **Demo accounts:** every staff account created by `03_mock_data.sql` uses the password
  `ValentDemo2026!`, e.g. `casey.patel@valentpartners.example` (employee) or
  `morgan.ellis@valentpartners.example` (admin). `avery.kim@...` is inactive and can't sign in.
- **Real accounts:** never reuse the demo password. Make a hash for the new password in this
  `API` folder, then save it in Workbench:

  ```
  dotnet run -- hash-password "the new password"
  ```

  ```sql
  INSERT INTO staff_users (email, first_name, last_name, password_hash, role)
  VALUES ('name@valentpartners.com', 'First', 'Last', '<paste the hash>', 'employee');
  ```

- **How it works:** passwords are stored as salted PBKDF2 hashes (ASP.NET Core's
  `PasswordHasher`). Signing in returns a random token that the dashboard sends as
  `Authorization: Bearer <token>`; only its SHA-256 hash is saved in `staff_sessions`.
  Sessions last 8 hours, and Sign out ends them right away. Five sign-in attempts per
  minute per address, then a short wait.
- **Not decided yet:** employee vs. admin permissions (everyone who signs in can do
  everything), password resets, and multifactor sign-in (recommended in the research doc).

## Endpoints

Endpoints marked **staff** need a signed-in staff member (`401` otherwise). The customer form
only uses the others.


| Method | URL | What it does |
|---|---|---|
| GET  | `/api/health` | Checks the API can reach MySQL |
| POST | `/api/applications` | Starts an application. Body: `{ "lineCodes": ["HOME", "AUTO"], "stateCode": "AL" }`. More than one line = a bundle |
| PUT  | `/api/applications/{id}/steps/{step}` | Saves one step's answers. Body: `{ "answers": { "zip": "35401" }, "items": { "vehicle": [ { "make": "Honda" } ] } }` |
| POST | `/api/applications/{id}/submit` | Submits for agent review (status becomes `submitted`) |
| GET  | `/api/applications` | **Staff.** Lists applications, newest first. Optional `?status=submitted` |
| GET  | `/api/applications/{id}` | **Staff.** One application with the customer's info, all answers, and status history |
| POST | `/api/applications/{id}/quote` | Demo price range for each line, calculated from the saved answers and saved to `quotes` (the customer's Quote step) |
| GET  | `/api/applications/{id}/quote` | **Staff.** Same estimate without saving it (the agent dashboard) |
| PUT  | `/api/applications/{id}/status` | **Staff.** Agent action, saved as the signed-in staff member. Body: `{ "status": "approved", "note": "..." }`. Status: `under_review`, `approved`, `rejected`, `escalated` (a note is required for the last two) |
| POST | `/api/applications/{id}/documents/current-policy` | Upload the declarations page of the policy the customer is switching from (multipart field `file`; PDF/JPG/PNG, 5 MB max). Replaces any earlier upload |
| DELETE | `/api/applications/{id}/documents/current-policy` | Removes it (customer changed their answer to not switching) |
| GET  | `/api/applications/{id}/documents/{documentId}` | **Staff.** Downloads an uploaded file |
| GET  | `/api/staff` | **Staff.** Active agents |
| POST | `/api/auth/login` | Body: `{ "email": "...", "password": "..." }`. Returns `{ token, expiresAt, staff }` |
| GET  | `/api/auth/me` | **Staff.** The signed-in staff member |
| POST | `/api/auth/logout` | **Staff.** Ends the session |
| GET  | `/api/dashboard` | **Staff.** KPIs, funnel, friction metrics, estimated pricing (min / max / average demo estimate per line), and agent usage for the agent dashboard. Optional `?state=AL&line=HOME&range=last30` (`last7`, `last30`, `last90`, `ytd`, `all`) |

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
├── Program.cs                          startup: connection string, sign-in, CORS, controllers
├── Data/Database.cs                    opens MySQL connections
├── Services/DemoQuoteEngine.cs         turns answers into a demo price range (swap for real rating later)
├── Services/StaffTokenAuthHandler.cs   checks the dashboard sign-in token on [Authorize] endpoints
├── Models/ApplicationModels.cs         request/response shapes
└── Controllers/
    ├── ApplicationsController.cs       the application endpoints
    ├── AuthController.cs               staff sign-in / sign-out
    ├── DashboardController.cs          agent dashboard stats
    ├── StaffController.cs              agent list
    └── HealthController.cs             /api/health
```

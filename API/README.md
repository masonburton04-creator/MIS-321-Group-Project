# Valent Partners API (C# / ASP.NET Core)

The back end for the Valent Partners website in `Client/` (customer site + staff dashboard
in one page). The browser sends requests here, and this API reads and writes the
`valent_insurance` MySQL database.

```
Browser (Client/index.html)  --HTTP/JSON-->  API (this folder, port 5250)  --SQL-->  MySQL (valent_insurance)
```

## Setup and running

See the [main README](../README.md) for setup, how to run the site, and demo accounts.
This file is the reference for how the API works.

**Settings** (`appsettings.json`, secrets in .NET user secrets, never in the repo):

- `ConnectionStrings:ValentDb` (user secret): the MySQL connection string
- `Google:MapsBrowserKey` (user secret, optional): address search; restrict the key to `http://localhost:5500/*`
- `Ollama`: chatbot model (`llama3.2:3b`) and embedding model (`nomic-embed-text`). `llama3.1` (8B) writes
  better answers but needs about 5 GB of free memory and is several times slower.

## Sign-in

One Sign in screen for everyone. `POST /api/auth/login` checks staff accounts first, then customer
accounts, and returns `accountType`: `staff` (the site opens the dashboard) or `customer` (the site
returns to whatever needed sign-in, like Start Application).

**Customers** create their own account (`POST /api/auth/register`):

- Passwords: at least 10 characters, three of lowercase / capitals / numbers / symbols, not a common
  password, and not containing their name or email (`Services/AccountChecks.cs`). The form shows a
  live strength meter with the same rules.
- Email: the format is checked, then the domain's mail (MX) records, which catches typos like
  `gmial.com` and made-up domains. It can't prove the inbox exists; only a verification email can.
- Customer sessions last 7 days. A customer can only see and change their own applications.
- Demo customers from `08_client_feedback.sql`: `tyler.henderson@example.com` (rejected, with a
  reason), `priya.shah@example.com` (escalated), `samuel.okoro@example.com` (approved),
  `jordan.rivera@example.com` (waiting), all with the demo password `ValentDemo2026!`.

**Staff:**

- **Demo accounts:** every staff account created by `03_mock_data.sql` and `08_client_feedback.sql`
  uses the password `ValentDemo2026!`, e.g. `casey.patel@valentpartners.example` (employee),
  `taylor.nguyen@valentpartners.example` (specialist), or `morgan.ellis@valentpartners.example`
  (admin). `avery.kim@...` is inactive and can't sign in.
- **Roles:** `employee`, `specialist`, `admin`. Escalated applications go to the active specialist
  with the fewest open escalations, and only specialists and admins can approve or reject them.
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
- **Not decided yet:** final permissions beyond the escalation rule above, password resets,
  and multifactor sign-in (recommended in the research doc).

## Team page (admins)

Admins get a **Team** link next to Dashboard (`#/team`, `Client/Resources/scripts/team.js`,
`Controllers/TeamController.cs`):

- **Workload:** each staff member's open applications, open escalations, decisions in the last 30 days,
  and last activity.
- **Auto-assign switch** (specialists): automatic assignment still sends each escalation to the
  specialist with the fewest open escalations, but skips anyone switched off (vacation, training).
- **Manual assignment:** any open application (new, under review, escalated) can be given to a specific
  person or unassigned. Escalated applications can only go to a specialist or an admin. Every change is
  written to the application's status history ("Reassigned from X to Y by an admin"), and the person
  sees it under "Assigned to me" on the dashboard.

## Ask Val (AI chatbot)

The chat button on every customer page opens `Client/Resources/scripts/chat.js`, which talks to
`Controllers/ChatController.cs`.

- **Insurance only.** The rules and the website's facts are in `Services/ChatKnowledge.cs` (keep them in
  step with `customer.js` and the research doc). Anything else gets a fixed refusal, and obvious
  "ignore your instructions" messages never reach the model. Small models aren't perfect at this; test
  new wording before a demo.
- **Context documents (embedding search).** `API/Knowledge/` holds four documents: how estimates are
  calculated plus Homeowners / Flood / Jewelry basics, and one each for Alabama, Texas, and New York.
  `Services/KnowledgeBase.cs` splits them at every `## ` heading (38 sections), embeds each with
  `nomic-embed-text` at startup (vectors are cached in `Knowledge/.embeddings.json` next to the .dll, so
  only edited sections are re-embedded), and for each question hands the 2 closest sections to the model.
  A question naming a state only searches that state; otherwise the state picked on the site wins ties.
  Answers show "Based on: ..." under them, and `chat_messages.sources` records it. To add knowledge,
  edit or add a `.md` file (one self-contained topic per `## ` section) and restart the API. If the
  embedding model is missing, the chat still works from its built-in prompt.
- **Quotes use the application's formula.** Price questions don't go to the model at all.
  `Services/ChatQuoteBuilder.cs` reads the facts the customer typed ("$300k to rebuild", "2 cars, no
  accidents"), builds the same answers the form saves, and runs `ApplicationsController.BuildQuoteAsync`
  (`DemoQuoteEngine`). It answers instantly and can't invent a number. Missing facts are asked for, and
  the **Quick estimate** form in the chat does the same without typing.
- **Fast.** Replies stream word by word; the model is loaded when the API starts and kept in memory for
  60 minutes; only the last 8 messages are sent; replies are capped at 320 tokens.
- **Metrics.** Every reply is logged to `chat_sessions` / `chat_messages` (topic, outcome, response
  times, thumbs up/down, whether the customer clicked "Start an application"). The dashboard's
  **AI Assistant** section reads them, with the same state / line / date filters.

## Address checks

The property address on the Details step is checked twice:

1. **Always** (browser and API, `Services/AddressRules.cs` + `Valent.addressRules` in `common.js`): the
   street starts with a house number, no PO boxes, the city is letters, and every ZIP (property and each
   vehicle) belongs to the application's state.
2. **With the Google key:** on Next, the address is looked up with Places Text Search. A match is saved as
   `address_verified = verified`; a different city or ZIP shows "Did you mean...?"; no match shows an
   error the customer can override (`unverified`, flagged for the agent). If Google is unavailable it's
   saved as `not_checked` and nothing is blocked.

## Automatic decisions on submit

`Services/ApplicationRules.cs` (thresholds are placeholders for the client to confirm):

- **Homeowners over $1,000,000** dwelling coverage: escalated to a specialist (the form accepts up to
  $50,000,000), and the Quote step says a specialist will price it.
- **Auto and/or Jewelry only** (never Homeowners or Flood): auto-approved when every line has a demo
  estimate and Auto has no recent incidents, 1-4 personal-use vehicles, every driver licensed 3+ years;
  Jewelry is $25,000 or less in total with an appraisal for every item over $5,000.
- Everything else waits for an agent. Auto decisions are marked `applications.auto_decision`.

Rejections need a reason from `rejection_reasons`; the customer sees its `customer_message` on
My Applications, and the dashboard charts rejections by reason.

## Endpoints

Endpoints marked **staff** need a signed-in staff member, and **customer** a signed-in customer
(`401` otherwise). Customer endpoints only work on that customer's own applications (`404` otherwise).


| Method | URL | What it does |
|---|---|---|
| GET  | `/api/health` | Checks the API can reach MySQL |
| POST | `/api/applications` | **Customer.** Starts an application. Body: `{ "lineCodes": ["HOME", "AUTO"], "stateCode": "AL" }`. More than one line = a bundle |
| PUT  | `/api/applications/{id}/steps/{step}` | **Customer.** Saves one step's answers. Body: `{ "answers": { "zip": "35401" }, "items": { "vehicle": [ { "make": "Honda" } ] } }` |
| POST | `/api/applications/{id}/submit` | **Customer.** Submits. Returns `{ status, autoDecision, reasons }`: `approved` or `escalated` when a rule decided, otherwise `submitted` |
| GET  | `/api/applications` | **Staff.** Lists applications, newest first. Optional `?status=submitted` |
| GET  | `/api/applications/{id}` | **Staff.** One application with the customer's info, all answers, and status history |
| POST | `/api/applications/{id}/quote` | **Customer.** Demo price range for each line, calculated from the saved answers and saved to `quotes` (the customer's Quote step) |
| GET  | `/api/applications/{id}/quote` | **Staff.** Same estimate without saving it (the agent dashboard) |
| PUT  | `/api/applications/{id}/status` | **Staff.** Agent action, saved as the signed-in staff member. Body: `{ "status": "approved", "note": "..." }`. Status: `under_review`, `approved`, `rejected`, `escalated` (a note is required for the last two, and `rejectionCode` for `rejected`). Escalating assigns a specialist |
| GET  | `/api/applications/rejection-reasons` | **Staff.** Reasons an agent can pick when rejecting |
| POST | `/api/applications/{id}/documents/current-policy` | **Customer.** Upload the declarations page of the policy the customer is switching from (multipart field `file`; PDF/JPG/PNG, 5 MB max). Replaces any earlier upload |
| DELETE | `/api/applications/{id}/documents/current-policy` | **Customer.** Removes it (customer changed their answer to not switching) |
| GET  | `/api/applications/{id}/documents/{documentId}` | **Staff.** Downloads an uploaded file |
| GET  | `/api/staff` | **Staff.** Active agents |
| POST | `/api/auth/login` | Body: `{ "email": "...", "password": "..." }`. Returns `{ accountType, token, expiresAt, staff or customer }` |
| POST | `/api/auth/register` | New customer account. Body: `{ firstName, lastName, email, password }`. Returns the same as login |
| POST | `/api/auth/check-email` | `{ email }` -> `{ ok, error, suggestion }` (live check on the Create Account form) |
| GET  | `/api/account/me` | **Customer.** The signed-in customer |
| POST | `/api/account/logout` | **Customer.** Ends the session |
| GET  | `/api/account/applications` | **Customer.** My Applications: status, and the reason if rejected |
| GET  | `/api/config/maps-key` | The Google Maps browser key from user secrets, or `{ key: null }` |
| POST | `/api/chat` | Chatbot. Body: `{ conversationId, messages: [{ role, content }], stateCode }`. Streams NDJSON lines: `meta`, `token`..., optional `quote`, then `done` (or `error`) |
| POST | `/api/chat/quote` | Chat Quick estimate (no AI). Body: `{ lines: ["HOME"], dwellingCoverage: 300000, ... }` |
| POST | `/api/chat/feedback` | Thumbs up / down on a reply: `{ conversationId, messageId, helpful }` |
| POST | `/api/chat/event` | `{ conversationId, type: "apply_click" }` |
| GET  | `/api/chat/status` | `{ available, model, problem }`: is Ollama running with the model downloaded. Also loads the model |
| GET  | `/api/auth/me` | **Staff.** The signed-in staff member |
| POST | `/api/auth/logout` | **Staff.** Ends the session |
| GET  | `/api/team` | **Admin.** Staff workload and unassigned counts |
| PUT  | `/api/team/{staffId}/auto-assign` | **Admin.** `{ autoAssign: false }` takes a specialist out of automatic assignment |
| PUT  | `/api/team/assignments/{applicationId}` | **Admin.** `{ staffId, note }` assigns an open application (`staffId: null` unassigns; not allowed for escalated) |
| GET  | `/api/dashboard` | **Staff.** KPIs, funnel, friction metrics, estimated pricing (min / max / average demo estimate per line), agent usage, open escalations, rejections by reason, applications per ZIP with risk ratings, and chatbot usage. Optional `?state=AL&line=HOME&range=last30` (`last7`, `last30`, `last90`, `ytd`, `all`) |

The site is `Client/index.html` (customer pages and the staff dashboard). It needs the API running.

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
├── Services/StaffTokenAuthHandler.cs   checks the staff sign-in token on [Authorize] endpoints
├── Services/CustomerTokenAuthHandler.cs checks the customer sign-in token on customer endpoints
├── Services/AccountChecks.cs           password rules + email domain (MX) check
├── Services/ApplicationRules.cs        auto-approve / send-to-specialist rules on submit
├── Services/AddressRules.cs            street / city / ZIP-in-state checks
├── Services/OllamaClient.cs            talks to the local Ollama model (streaming)
├── Services/ChatKnowledge.cs           the chatbot's rules and insurance facts
├── Services/ChatQuoteBuilder.cs        chat price questions -> the application's quote formula
├── Services/KnowledgeBase.cs           embedding search over Knowledge/*.md
├── Knowledge/                          the chatbot's context documents (quotes + coverage, AL, TX, NY)
├── Models/ApplicationModels.cs         request/response shapes
├── Models/ChatModels.cs                chatbot request/response shapes
└── Controllers/
    ├── ApplicationsController.cs       the application endpoints
    ├── AuthController.cs               sign-in for everyone, customer sign-up, staff me / sign-out
    ├── AccountController.cs            customer me / sign-out / My Applications
    ├── ConfigController.cs             Google Maps key for the address search
    ├── ChatController.cs               Ask Val chatbot + its metrics
    ├── TeamController.cs               admin Team page: workload, auto-assign switch, manual assignment
    ├── DashboardController.cs          agent dashboard stats
    ├── StaffController.cs              agent list
    └── HealthController.cs             /api/health
```

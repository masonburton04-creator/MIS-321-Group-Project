# Valent Partners: Insurance Quote & Application Prototype

Team 6, MIS 321. Customers compare and apply for Homeowners, Flood, Jewelry, and Auto insurance;
staff review applications on a dashboard.

**Highlights**
- Coverage explorer with Alabama / Texas / New York comparisons
- Online application with state-adjusted demo price estimates and address verification
- Customer accounts and a My Applications status page
- "Ask Val" AI chatbot (local Llama via Ollama)
- Staff dashboard: funnel and friction metrics, escalations to specialists, admin Team page

## Quick setup

1. **Database:** in MySQL Workbench, run the `Database/` scripts in number order (skip `06` and `07`).
2. **Password:** in the `API` folder, run
   `dotnet user-secrets set "ConnectionStrings:ValentDb" "Server=localhost;Port=3306;Database=valent_insurance;User=root;Password=YOUR_PASSWORD;"`
3. **Run:** `dotnet run` in `API/`, then open `Client/index.html` with VS Code **Live Server** (port 5500).

Optional: chatbot needs [Ollama](https://ollama.com/download) + `ollama pull llama3.2:3b` and `ollama pull nomic-embed-text`.
Google address search needs the Maps key from a teammate.

**Demo login** (password `ValentDemo2026!`): customer `tyler.henderson@example.com`, admin `morgan.ellis@valentpartners.example`

Details: [API/README.md](API/README.md)

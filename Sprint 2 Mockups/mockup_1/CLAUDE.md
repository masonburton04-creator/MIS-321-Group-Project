VALENT PARTNERS
MIS Project Context & Mockup Brief
AI Insurance Quote & Application Assistant
Team 6 | JavaScript / Bootstrap / HTML-CSS | VS Code
Working context document for design, development, and future Claude prompting

PRIMARY PROJECT EMPHASIS
The product features and research effort should heavily focus on Homeowners (Home), Flood, and Jewelry Insurance. These three insurance lines are the core supported products and should remain explicit throughout mockups, workflows, quote logic, filtering, and testing.

Project Context Claude Must Preserve
•	Client: Valent Partners. This is an iterative MIS course project with a real-world client; early prototypes are meant to validate requirements before expensive implementation.
•	Core insurance scope: Homeowners, Flood, and Jewelry Insurance.
•	The final product is intended to be responsive and state-aware, with customizable coverage discovery, an online application flow, AI-assisted quote estimates, human escalation, a reviewer/analytics dashboard, and behavioral/funnel analytics.
•	State-by-state applicability is critical. Do not assume one national set of carrier, eligibility, pricing, or coverage rules.
•	Insurance calculations must eventually be grounded in extensive research and authoritative client/carrier business rules. Do not invent real premiums, eligibility, underwriting rules, or carrier pricing.
•	The client strongly wants analytics that help identify customer confusion: time spent on pages/steps, exits, quick exits, abandonment/drop-off, validation friction, and related behavioral signals so future UX can be improved.
•	UX direction: strong visuals, reduced click depth, clear explanations for insurance concepts, and an initial crimson/white visual direction while remaining open to alternatives.
•	Out of scope for the prototype: final underwriting, real carrier integrations, production authentication, production SQL workflows, real Claude API quote logic, and a full redesign of the client's global website.
Technical Baseline
Project/
├── API/
└── Client/
    ├── Resources/
    │   ├── styles/
    │   │   └── index.css
    │   └── scripts/
    │       └── index.js
    └── index.html
Use HTML, CSS, JavaScript, and the Bootstrap version/dependency setup expected by the course. Development is in VS Code. Keep prototype behavior front-end-only and easy to demo locally.
Primary Goal
Demonstrate how a customer could choose an insurance line and state, understand Homeowners coverage components, quickly access key details, select items of interest, compare information, and see logical next steps. The first deep path should focus on Homeowners Insurance; Flood and Jewelry should be visible as core product lines but do not need equally deep flows in this first prototype.
What We Need Client Feedback On
•	Is selecting insurance type and state this early in the journey intuitive?
•	Does the coverage information make insurance easier to understand rather than adding more confusion?
•	Are users able to reach useful comparison information with very few clicks?
•	Is the amount of detail on each card appropriate?
•	What should state selection actually change in the production experience: availability, required questions, product choices, disclosures, pricing inputs, or something else?
•	Does the proposed path toward application, AI assistance, or a human agent match the client's expectations?
Required Prototype Flow
Screen / State 1 - Insurance and State Selection
•	Headline that clearly communicates finding or exploring coverage.
•	Three prominent insurance choices: Homeowners, Flood, Jewelry.
•	State selector. Use Alabama as a convenient demonstration state, but make the control visually capable of representing all U.S. states.
•	Primary CTA such as 'Explore Coverage'.
•	Homeowners should be the functional demo path. Flood and Jewelry can be visible and may display a prototype/future-state message.
Screen / State 2 - Homeowners Coverage Explorer
Show educational cards for the standard Homeowners coverage components. Do not present these as competing policies; they are components of a homeowners policy.
•	Coverage A - Dwelling: structure of the home / rebuilding or repair after a covered loss.
•	Coverage B - Other Structures: detached structures such as sheds and fences.
•	Coverage C - Personal Property: belongings; explain that valuation may involve replacement cost or actual cash value depending on policy terms.
•	Coverage D - Loss of Use / Additional Living Expense: temporary living expenses after a covered loss when applicable.
•	Coverage E - Personal Liability: liability protection for covered claims involving injury/property damage to others.
•	Coverage F - Medical Payments to Others: limited medical payments for covered injuries to others.
•	Each card should expose quick-access key details through expand/collapse, modal, drawer, or another simple interaction.
•	Include a clear educational note that flood damage is generally not covered by standard homeowners insurance and may require separate flood coverage.
•	Include a careful note that valuable jewelry can have special limits under homeowners coverage and may require scheduled or separate coverage.
Screen / State 3 - Comparison
•	Allow the user to select several coverage components/interests and open a comparison view.
•	Compare plain-language fields such as 'What it protects', 'Why it matters', 'Key considerations', and 'Common limitations'.
•	Do not show fabricated real premiums or imply that selecting Coverage A versus Coverage C is choosing between policies.
•	Keep the comparison visually scannable and consistent with the client's reduced-click goal.
Screen / State 4 - Next Step
•	Provide obvious future-path CTAs such as Start Application, Ask Quote Assistant, or Talk to an Agent.
•	These may be non-functional or show a 'future prototype feature' state.
•	Use this screen to communicate how coverage education connects to the eventual application and AI/human-assistance workflow.
State-Aware Behavior for This Prototype
The prototype should demonstrate the concept of state awareness without pretending the team already has finalized 50-state carrier logic.
•	Changing state should visibly update the selected-state label and may change a small mock informational banner or mock availability message.
•	Any state-specific example must be labeled illustrative/mock unless it comes from validated research/client rules.
•	Do not hard-code unsupported statements such as a carrier being available/unavailable or a precise state-specific premium.
•	Design the data model so state-specific rules can be inserted later rather than embedding them throughout the UI.
Interaction Requirements
•	Buttons, dropdowns, coverage-card details, selection states, and comparison interaction should work locally in the browser.
•	No backend is required.
•	Use small JavaScript objects/arrays or a mock JSON-like structure for prototype content.
•	Provide visible hover/focus states because the final analytics vision may care about interaction behavior, but do not build real analytics instrumentation yet.
•	Make the page responsive enough for a normal laptop demo and reasonable mobile-width behavior.
Visual Direction
•	Professional insurance/financial-services feel without becoming visually dense.
•	Crimson/white can be the primary direction, with neutral grays and strong readability.
•	Use cards, whitespace, short explanations, tooltips/modals only when they reduce confusion.
•	Do not make the prototype look 'finished' enough to imply requirements are finalized; use subtle 'Prototype / Demonstration' labeling.
Explicit Non-Goals
•	No real quote calculation.
•	No real carrier API or product inventory.
•	No SQL/database.
•	No production authentication.
•	No final all-50-state rule implementation.
•	No automated underwriting.
•	No Claude API integration required for this mockup.
Suggested Claude Build Order
•	Create the folder structure and a single clean Bootstrap page shell.
•	Build the insurance/state selection state.
•	Build Homeowners coverage cards and detail interactions.
•	Add selection and comparison behavior.
•	Add the next-step CTA state.
•	Add lightweight state-awareness demonstration using clearly labeled mock data.
•	Polish responsiveness and accessibility basics.
•	Stop before implementing backend/quote logic and summarize assumptions that require client validation.
Definition of Done for Client Review
A presenter can open the prototype locally, choose Homeowners, select a state, explore Coverage A-F, open key details, select coverage interests, view a comparison, and reach a clear next-step area. The prototype should generate discussion about workflow and information needs, not prove that insurance pricing or eligibility has been solved.
Copy/Paste CLAUDE.md Block
# MOCKUP 1: CUSTOMER COVERAGE EXPLORER
Build a local, interactive, front-end-only prototype for Valent Partners.
 
## Objective
Validate the proposed customer journey: insurance type -> state -> Homeowners coverage education/exploration -> select/compare -> next step.
 
## Core scope
Homeowners, Flood, Jewelry. Make Homeowners the deep functional path for this prototype.
 
## Must demonstrate
- Insurance type selection.
- U.S. state selection.
- Homeowners Coverage A-F educational cards.
- Quick-access details for each coverage component.
- Selection and side-by-side comparison.
- Clear next steps: application, AI assistant, or human agent.
- Lightweight, clearly labeled mock state-aware behavior.
- Responsive Bootstrap UI with working front-end interactions.
 
## Critical insurance guardrails
Coverage A-F are components of homeowners coverage, not competing policies.
Do not invent real premiums, carrier availability, eligibility, underwriting, or state-specific pricing.
Flood is generally separate from standard homeowners coverage.
Jewelry may have special limits and may require scheduled/separate coverage.
Label illustrative data as MOCK / DEMONSTRATION DATA.
 
## Non-goals
No backend, SQL, carrier API, production auth, Claude API, real quote engine, automated underwriting, or full 50-state business-rule implementation.
 
## UX
Minimize clicks, reduce insurance confusion, use plain language, strong visual hierarchy, and an initial crimson/white direction.
At the end, list every assumption or unresolved requirement that should be validated with the client before production development.

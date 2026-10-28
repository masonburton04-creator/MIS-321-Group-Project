Mockup #2 - Customer Behavior & Reviewer Dashboard
Interactive analytics/dashboard prototype brief
Claude-ready prototype brief | Valent Partners MIS Project | Team 6

PROTOTYPE INTENT
The dashboard mockup should make the client's customer-confusion problem visible. Use realistic-looking but explicitly fake demonstration data to show how Valent Partners could identify where users hesitate, abandon, exit quickly, encounter validation friction, or otherwise struggle with insurance workflows.

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
Demonstrate a reviewer/analytics dashboard that helps Valent Partners answer: Where are customers getting confused? Where do they leave? How long do they spend on each step? Are certain states, insurance lines, or application stages producing unusual friction? The first prototype is about validating which metrics and views are useful before implementing real event tracking.

Why This Mockup Is a Priority
The client explicitly emphasized that insurance is confusing for many users/customers and wants extensive behavioral metrics so the company can identify friction and improve the experience over time. The dashboard therefore should not be a generic administrative screen. Customer-behavior and funnel analytics should be a centerpiece.

What We Need Client Feedback On
•	Which metrics actually help the client diagnose confusion versus simply look interesting?
•	What counts as a 'quick exit' or meaningful hesitation?
•	Does the client want metrics at page level, form-step level, question/field level, or all three?
•	Which filters matter most: state, insurance line, date range, device, traffic source, application status, or others?
•	Which applicant-level details should reviewers be able to open from aggregate analytics?
•	What actions should a reviewer take after identifying a problem?
•	Which metrics belong on the landing dashboard versus deeper drill-down pages?

Required Dashboard Layout
Section 1 - Global Filters
•	State: default All States, with the ability to choose a specific state.
•	Insurance line: All / Homeowners / Flood / Jewelry.
•	Date range: simple prototype selector.
•	Optional application step/status filter if it improves the demo.

Section 2 - KPI Overview
Use clearly labeled demonstration values. Suggested cards:
•	Applications / sessions started.
•	Completion rate.
•	Abandonment rate.
•	Average application/session time.
•	Optional quick-exit rate or average time to abandonment.

Section 3 - Application Funnel
•	Show major steps from entry through quote/application progression.
•	Display users reaching each step and continuation/drop-off percentage.
•	Visually flag the step with the highest friction.
•	Example stages can include Landing, State Selection, Coverage Selection, Property/Item Details, Applicant Details, Quote/Results, and Completion; these are prototype assumptions and should be easy to revise.

Section 4 - Confusion / Friction Metrics
This should be the signature area of the mockup. A table or drill-down view can include:
•	Page or application step.
•	Average dwell time / time spent.
•	Exit rate.
•	Quick-exit rate.
•	Drop-off count/rate.
•	Validation-error rate or count.
•	Repeat interactions / repeated attempts where appropriate.
•	Optional hesitation/interaction indicators only if they are privacy-appropriate and technically definable.
•	A visible 'Needs Attention' indicator for unusually high friction.

IMPORTANT METRIC CLARIFICATION
The client mentioned extensive behavior metrics, including how long users spend on pages and how often/how quickly they leave. Avoid promising literal 'hover time on a page' unless the team and client define exactly what should be tracked. Page dwell time, element hover duration, focus time, field hesitation, rage/repeated clicks, and exit timing are different events and require different instrumentation. The prototype can visualize these concepts, but the production metric definitions must be agreed before implementation.

Section 5 - State / Insurance Drill-Down
•	Changing State or Insurance Line should update the mock KPI/funnel/table values so the client can see the intended analytical interaction.
•	Use only demonstration data.
•	This view should reinforce that the final application is state-aware and that the client may want to compare friction or rejection patterns across states.
•	Do not imply causation. A higher exit rate in one state does not by itself prove that state rules caused the behavior.

Section 6 - Reviewer / Application Queue Preview
•	Include a lightweight preview of the manual review concept if space permits: application ID, insurance line, state, status, and reason for review/escalation.
•	A reviewer can click a row to open a simple mock detail panel.
•	Do not build real permissions/authentication yet.
•	Clearly mark employee/admin role definitions as an unresolved requirement.

Interaction Requirements
•	Filters should work locally and update mock dashboard values.
•	A funnel step or metric row should be clickable to show a small drill-down/detail panel if practical.
•	Charts may use simple Bootstrap/CSS or a lightweight chart library only if allowed by the course/team; do not create unnecessary dependencies for a first prototype.
•	Use mock JavaScript datasets for All States and a few example states to demonstrate interaction; the UI may list all states without inventing 50 sets of behavioral data.
•	All sample numbers must be labeled DEMONSTRATION DATA / NOT REAL CUSTOMER ANALYTICS.

Privacy & Measurement Guardrails
•	The prototype should focus on aggregate behavioral metrics and avoid unnecessary personal data.
•	Do not imply that every possible mouse movement, keystroke, or personal field will be captured.
•	Production analytics should define event names, purpose, retention, privacy/consent requirements, and access controls before implementation.
•	Do not store or display sensitive insurance/application data in mock datasets.
•	The dashboard should help diagnose friction; it should not claim to know why a user was confused unless there is supporting evidence.

Explicit Non-Goals
•	No real analytics event collection pipeline.
•	No production database.
•	No real customer data.
•	No production reviewer authentication or role enforcement.
•	No real state/carrier rejection logic.
•	No automated recommendations based on behavioral data.
•	No claim that prototype thresholds such as 'quick exit < 10 seconds' are final.

Suggested Claude Build Order
•	Create dashboard shell and global filters.
•	Add KPI cards with mock data.
•	Add an application funnel.
•	Add the detailed page/step friction table.
•	Wire filters to several mock datasets so the screen visibly changes.
•	Add a lightweight drill-down interaction.
•	Optionally add a reviewer queue preview.
•	Add clear demonstration-data labels and privacy/assumption notes.
•	Finish by outputting a list of metric definitions and open questions to take back to the client.

Definition of Done for Client Review
A presenter can open the dashboard locally, change state/insurance/date filters, show KPI changes, identify a high-drop-off funnel step, inspect page/step behavioral metrics, and explain how the eventual system could help Valent Partners discover customer friction. The meeting should produce clearer definitions for metrics, drill-down needs, dashboard fields, reviewer actions, and tracking priorities.

Questions to Put Directly in Front of the Client
•	When you say you want to know how long users 'hover' or stay on something, do you mean time on the page, time focused on a question/field, actual mouse-hover duration, or another behavior?
•	What should count as leaving 'quickly' - a fixed number of seconds, leaving before interacting, or something else?
•	Which application steps are most important to monitor?
•	Do you want to compare these metrics by state and insurance type?
•	What should happen operationally when the dashboard reveals a problem?
•	Who should have access to aggregate analytics versus individual application details?

Copy/Paste CLAUDE.md Block
# MOCKUP 2: CUSTOMER BEHAVIOR & REVIEWER DASHBOARD
Build a local, interactive, front-end-only dashboard prototype for Valent Partners.

## Objective
Help the client visualize how they could identify customer confusion and application friction. The dashboard should answer where users hesitate, abandon, exit quickly, or encounter problems so the client can improve the insurance experience.

## Global filters
- State
- Insurance line: All / Homeowners / Flood / Jewelry
- Date range
Use mock data and make filters visibly update the dashboard.

## Core dashboard
1. KPI cards: starts/sessions, completion, abandonment, average time, optional quick-exit metric.
2. Application funnel with continuation/drop-off by step.
3. Detailed friction table with page/step, dwell time, exit rate, quick exits, drop-off, validation errors, and an attention flag.
4. State/insurance drill-down behavior.
5. Optional lightweight reviewer/manual-review queue preview.

## Critical metric rule
Do not treat 'hover time', page dwell time, field focus time, hesitation, repeated clicks, and exit timing as the same metric. Visualize plausible concepts, but flag exact event definitions and thresholds as client decisions that must be finalized before production tracking.

## Data rule
Every number is DEMONSTRATION DATA / NOT REAL CUSTOMER ANALYTICS.
Do not use real PII or sensitive application data.
Do not infer why a user was confused from behavior alone.

## Non-goals
No real event pipeline, database, customer data, production auth/permissions, carrier logic, or automated behavioral recommendations.

## UX
Professional, scannable, crimson/white initial direction, strong visual hierarchy. Make customer-friction analytics the centerpiece rather than a generic admin dashboard.

## End-of-build output
After the prototype, list:
- Every metric used and its proposed definition.
- Every mock threshold.
- Every unresolved dashboard requirement.
- Questions the team should ask Valent Partners at the next client review.

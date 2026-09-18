VALENT PARTNERS
MIS Project Context & Mockup Brief
AI Insurance Quote & Application Assistant
Team 6 | JavaScript / Bootstrap / HTML-CSS | VS Code
Working context document for design, development, and future Claude prompting

PRIMARY PROJECT EMPHASIS
The product features and research effort should heavily focus on Homeowners (Home), Flood, and Jewelry Insurance. These three insurance lines are the core supported products and should remain explicit throughout mockups, workflows, quote logic, filtering, and testing.

Source basis: Team 6 Statement of Work; Client Kickoff Notes (Meeting 1, 9/9); class slides on project structure and Bootstrap.
 
1. Purpose of This Context Document
This document translates the formal Statement of Work, the first client kickoff discussion, and the class implementation guidance into a single development-oriented reference. It is intentionally structured with short sections, explicit requirements, constraints, open questions, and implementation notes so its text can later be pasted into a CLAUDE.md file or used as context when prompting an AI coding assistant.
The immediate objective is not to finalize production code. The near-term goal is to understand the client's problems, research the insurance domain, create credible mockups, and establish a practical structure for a JavaScript-based application in VS Code. The eventual product is a responsive, state-aware insurance application platform with customizable coverage options, streamlined application flows, an AI quote experience, human-agent escalation, and analytics that reveal where users struggle or abandon the process.
2. Project North Star
Problem Statement
Insurance shopping and application flows can become confusing, overly click-heavy, and difficult to tailor to a customer's state and coverage needs. The project should reduce friction while helping users understand and compare relevant coverage, progress through an application, obtain an estimate when appropriate, and reach a human employee when the situation is too complex for automated handling.

2.1 Desired Business Value
•	Help visitors find relevant insurance options based on state, desired coverage, and customer circumstances.
•	Offer extensive/customizable coverage choices rather than a one-size-fits-all experience.
•	Reduce click depth and confusion in browsing and application workflows.
•	Provide a conversational AI Quote Assistant for estimate-oriented interactions governed by defined business rules.
•	Escalate complex or uncertain situations to an employee instead of forcing the automated flow to make unsupported decisions.
•	Give the client measurable visibility into rejection patterns, abandonment/drop-off, confusion, and time spent on each page or application step.
•	Preserve the client's broader site aesthetics rather than performing an unrelated full-site redesign.
3. Non-Negotiable Insurance Scope
All core concepts, mockups, filters, application examples, AI quote scenarios, analytics examples, and QA test cases should be designed first around the following lines:
•	Homeowners / Home Insurance
•	Flood Insurance
•	Jewelry Insurance
CRITICAL DOMAIN-RESEARCH REQUIREMENT
Before implementing realistic quote calculations, eligibility rules, state filtering, coverage comparisons, or AI recommendations, the team must extensively research Homeowners, Flood, and Jewelry Insurance. Quote outputs must not be invented. The Statement of Work explicitly identifies exact quote formulas, rating factors, and eligibility criteria as a current knowledge gap. Carrier-specific pricing rules may not be fully available, so any mock or estimated logic must be clearly documented, traceable to researched assumptions, and replaced or validated when authoritative client/carrier rules are provided.

4. Functional Scope
4.1 Coverage Browsing & Filtering
•	Define filter criteria, coverage levels, and comparison layouts for the three supported insurance lines.
•	Create state-by-state filtering so users only see coverage that is applicable to their location and the applicable business/carrier rules.
•	Account for the client's concern that some states may be difficult or unprofitable to serve; this is a discovery/research question, not a rule the team should assume.
•	Connect front-end coverage components to carrier/product data when the required backend data is available.
•	Prioritize a short path from landing page to comparison; the SOW acceptance target is a coverage comparison view in three clicks or fewer.
•	Ultimately, QA should verify state/carrier eligibility behavior without mismatches once authoritative rules exist.
4.2 Online Application
•	Design a multi-step applicant flow rather than a single overwhelming form.
•	Validate required fields and prevent invalid submissions from advancing.
•	Instrument the flow so the team/client can measure where applicants drop off and how long they spend on each step.
•	Use mockups to identify confusing questions, unnecessary clicks, and opportunities for clearer explanations before implementation.
4.3 AI Quote Assistant
•	Provide a conversational interface capable of producing real-time quote estimates only when the required business rules are known and implemented.
•	Gather the information required for the relevant insurance line and state before attempting an estimate.
•	Do not treat the assistant as final underwriting or final policy approval.
•	When a case exceeds defined complexity thresholds, route the applicant to a human specialist/employee.
•	Design escalation as a positive part of the user journey: explain that a specialist is needed, preserve relevant context, and make the handoff easy.
•	Test quote estimates against finalized business rules once those rules are supplied.
4.4 Reviewer Dashboard
•	Provide a secure reviewer experience with role-based permissions.
•	Support a manual approval queue for applications.
•	Reflect application status changes in the reviewer workflow.
•	Employee vs. admin permissions remain an explicit knowledge gap and must be defined before the final authorization model is implemented.
•	The dashboard is not only an application-review tool. The client explicitly emphasized that it should provide extensive behavioral analytics so the team can understand where insurance customers become confused and what parts of the experience should be improved over time. Exact final dashboard fields can continue to evolve, but this behavioral-analytics capability is a key client requirement rather than an optional placeholder.
4.5 Behavioral & Funnel Analytics
•	Track application drop-off/abandonment by step.
•	Track time spent / dwell time on pages or steps.
•	Investigate form confusion through measurable signals agreed upon with the client.
•	Track rejection patterns, including state-level rejection rates where appropriate.
•	Use analytics to identify friction and improve conversion rather than collecting metrics without a decision-making purpose.
•	During presentations, show example metrics and explain the value each metric provides.
•	Client priority: The client made behavioral analytics a major dashboard expectation because insurance is frequently confusing to customers. The purpose is to reveal friction, uncertainty, and abandonment so future versions of the experience can be improved using evidence rather than guesses.
•	Track time spent on each page and each major application step, including unusually short visits that may indicate immediate abandonment and unusually long visits that may indicate confusion or difficulty.
•	Track page exits and abandonment: how often users leave from a specific page/step, which pages have the highest exit rates, and how quickly users leave after arriving.
•	Track progression behavior: how many users continue to the next step, return to a previous step, restart, or fail to complete the flow.
•	Where technically feasible and privacy-appropriate, capture finer interaction signals that help identify confusion, such as time spent focused on or hovering around important page areas, repeated interactions, hesitation around questions, validation errors, and repeated changes to answers. Exact hover instrumentation should be validated during implementation rather than assumed to be a perfect measure of confusion.
•	Break behavioral metrics down by relevant dimensions such as insurance type (Homeowners, Flood, Jewelry), application step, state, device/session context, and other client-approved dimensions so the dashboard can identify where specific experiences are underperforming.
•	The dashboard should turn raw telemetry into actionable views: page/step dwell time, exit rate, rapid-exit rate, completion/progression rate, drop-off funnel, validation/error frequency, and trends over time. Mockups should show how a reviewer can identify a problem area and drill into the associated metric.
•	Analytics should support future product improvement. The key question behind each metric is: "Where are customers getting confused or giving up, and what should Valent Partners investigate or improve?"
•	Implementation must define event names, timestamps, session/page identifiers, privacy boundaries, and metric formulas consistently so dashboard values are trustworthy. Avoid collecting sensitive form values merely for analytics unless they are explicitly required and appropriately handled.
5. User Experience & Visual Direction
•	Visuals should stand out and feel intentional.
•	Reduce the number of clicks required to reach important actions and information.
•	Crimson and white are a strong initial palette direction, but the client is open to alternate visual variations and is not locked to one exact color scheme.
•	Maintain the current site's general aesthetics outside the defined project components; a complete global front-end overhaul is out of scope.
•	Mockups should make the problem being solved obvious, not merely demonstrate attractive screens.
•	Every major feature should reinforce the value proposition: easier discovery, clearer application, useful estimates, or better human follow-up.
6. Technical Context & Project Structure
Class guidance establishes a simple separation between API/back-end concerns and client/front-end assets. For mockups and early implementation, keep the repository easy to navigate and avoid mixing CSS, JavaScript, and HTML into an unstructured root.
Project/
├── API/
└── Client/
    ├── Resources/
    │   ├── styles/
    │   │   └── index.css
    │   └── scripts/
    │       └── index.js
    └── index.html
The SOW identifies GitHub for source control/collaboration, Anthropic Claude API for AI/ML work, Bootstrap plus HTML/CSS/JavaScript for the front end, and SQL for the back end. Development is expected to occur in VS Code.
6.1 Bootstrap Guidance From Class
The class material discussed two ways to bring Bootstrap into the client: download it and run it locally, or link it from a CDN. The slide also notes jQuery as a dependency for several Bootstrap components in the version/context being taught. For this course project, follow the instructor's expected Bootstrap version and dependency setup rather than silently substituting a different version.
•	Local Bootstrap: project contains the required Bootstrap assets directly.
•	CDN Bootstrap: page references hosted assets; the class slide notes a potential caching/load-time benefit when a visitor already has the same CDN resource cached.
•	Keep custom project CSS in Client/Resources/styles/index.css and custom JavaScript in Client/Resources/scripts/index.js unless the team intentionally expands the structure.
7. Insurance Research Workstream
Insurance research is a prerequisite to credible design and development, not an optional polish step. The kickoff notes specifically call for researching coverage levels and state applicability, while acknowledging that each carrier can determine pricing differently. The SOW separately lists quote formulas, rating factors, and eligibility criteria as unresolved.
7.1 Research Questions for Each Insurance Line
•	What information is normally collected from a customer before a quote can be estimated?
•	What coverage types, limits, deductibles, endorsements/add-ons, and exclusions are commonly presented?
•	Which inputs materially affect pricing and eligibility?
•	Which rules vary by state, and which are federal, program-level, or carrier-specific?
•	What conditions commonly require referral to an agent, specialist, underwriter, or manual review?
•	What information can be safely displayed as an estimate versus what requires an authoritative carrier calculation?
•	What terminology requires plain-language explanation to reduce user confusion?
•	What data should be stored for reviewer follow-up and analytics?
7.2 Research Deliverable Recommendation
Create a research matrix for Homeowners, Flood, and Jewelry Insurance. For every rule used by the application, record: insurance line, state applicability, input field, coverage/rating factor, source or client confirmation, confidence level, whether the rule is mock-only or production-approved, and the UI/quote component that depends on it. This will help prevent a visually convincing mockup from becoming unsupported business logic.
8. Mockup Priorities
The first mockups should be designed to validate workflow and client expectations before deeper implementation.
•	Landing / insurance selection: clearly surface Homeowners, Flood, and Jewelry.
•	State-aware coverage discovery: state selection plus relevant filters and comparison cards.
•	Coverage comparison: concise, understandable differences in coverage level/options with a path forward.
•	Multi-step application: progress indicator, validation, explanations, and minimal cognitive load.
•	AI Quote Assistant: conversational collection of necessary details, estimate state, uncertainty handling, and human escalation.
•	Escalation state: show what happens when the assistant cannot responsibly continue.
•	Reviewer dashboard: combine application-review workflow with a prominent behavioral-analytics area. The mockup should visibly surface customer confusion/friction signals, not hide analytics as a secondary afterthought.
•	Analytics concept: show a funnel plus page/step dwell time, exit rate, rapid exits, completion/progression, rejection patterns, validation/error frequency, and other interaction signals that can help reveal confusion. Include filtering/drill-down by insurance line and other relevant dimensions.
9. Acceptance Criteria to Keep Visible During Design
Area	Target	Dependency / Caveat
Coverage filtering	Carrier/state eligibility behavior should match defined rules; comparison reachable in <= 3 clicks.	Requires authoritative eligibility/rule data.
Application	Required fields validate; invalid submissions cannot proceed.	Field requirements must be defined per workflow.
Analytics	Capture drop-off and dwell time per step in testing.	Metric definitions and instrumentation must be agreed.
AI quote	Estimate is consistent with defined business rules in test scenarios.	Final rate rules are currently a knowledge gap.
Escalation	Defined complexity cases correctly route to a human.	Complexity thresholds must be defined.
Reviewer dashboard	Roles enforce correct permissions; applications enter approval queue and status changes are reflected.	Role definitions and dashboard needs remain open.
10. Explicit Constraints / Out of Scope
•	Do not redesign the client's entire global website beyond the defined project components.
•	Do not implement final automated policy underwriting without required human reviewer approval.
•	Do not fabricate carrier pricing, state eligibility, or quote formulas to make a prototype appear complete.
•	Do not treat unresolved reviewer roles, dashboard fields, or complexity thresholds as finalized requirements.
•	Any functionality beyond the agreed scope should be treated as a change request and confirmed with Valent Partners before work begins.
11. Open Questions & Knowledge Gaps
•	Exact quote formulas, rating factors, and eligibility criteria.
•	Carrier-specific rules and what level of carrier data/API access the team will receive.
•	Final dashboard field definitions and measurement formulas (the need for extensive behavioral analytics is confirmed; exact metric definitions, event instrumentation, thresholds, and applicant details still need refinement).
•	Exact employee vs. admin permissions.
•	Which applicants are currently being rejected and why.
•	Where applicants currently abandon the process because of confusion.
•	How long users currently spend on pages/steps.
•	Whether specific states have limited/unprofitable coverage and how that should affect the user experience.
•	Exact conditions that should trigger AI-to-human escalation.
12. Sprint Context From the Statement of Work
Sprint 0 (8/24-9/8): Kickoff; finalize sprint plan; resolve open knowledge gaps.
Sprint 1 (9/9-9/18): Design and mockups for coverage browsing, application flow, and dashboard.
Sprint 2 (9/19-10/2): Build Coverage Browsing & Filtering; sprint review.
Sprint 3 (10/3-10/16): Build Online Application flow and funnel analytics; sprint review.
Sprint 4 (10/17-10/30): Build AI Quote Assistant and agent escalation logic; sprint review.
Sprint 5 (10/31-11/13): Build Reviewer Dashboard; integration testing and UAT; sprint review.
Sprint 6 (11/14-11/20): Bug fixes, final QA, and closeout.
13. Client Presentation & Feedback Practices
•	Begin presentations with an agenda/overview so the client knows what will be covered.
•	State the problem being solved and the value provided before walking through screens.
•	Restate and reinforce value throughout the presentation.
•	Include example metrics and suggestions rather than presenting analytics as abstract placeholders.
•	Include team headshots near the beginning of presentation materials.
•	Include a visual sprint/timeline slide.
14. Claude / AI Coding Assistant Context Block
The following condensed block is intentionally formatted for direct reuse in a CLAUDE.md file or as the beginning of a mockup-generation prompt.
# PROJECT: Valent Partners AI Insurance Quote & Application Assistant
 
## Goal
Build a responsive, state-aware insurance application experience that reduces friction, supports customizable coverage discovery, enables a governed AI quote-estimate conversation, escalates complex cases to human employees, and captures funnel analytics.
 
## Primary Insurance Scope
- Homeowners / Home Insurance
- Flood Insurance
- Jewelry Insurance
These three lines are the core scope. Design and development examples should prioritize them.
 
## Critical Rule
Do not invent insurance pricing, quote formulas, state eligibility, carrier rules, or underwriting logic. Extensively research each insurance line and document assumptions/sources. Final quote behavior must be based on authoritative business rules supplied or validated by the client/carrier. Treat mock-only logic as mock data and label it accordingly.
 
## Core Features
1. Coverage browsing and state-by-state filtering.
2. Coverage comparison with reduced click depth (target: comparison within 3 clicks from landing).
3. Multi-step online application with validation.
4. Extensive behavioral/funnel analytics: page and step dwell time, exits, rapid exits, abandonment/drop-off, progression/completion, validation/error frequency, rejection patterns, and privacy-appropriate interaction signals that can help identify customer confusion.
5. Conversational AI Quote Assistant for estimates based on defined rules.
6. Human-agent escalation for complex/unsupported scenarios.
7. Secure reviewer dashboard with manual approval queue, role-based permissions, AND prominent behavioral analytics designed to show where customers become confused, hesitate, exit, or abandon the experience.
 
- Define analytics events and metric formulas consistently; do not fabricate telemetry in production. Mockups may use clearly labeled sample data.
- Make metrics actionable: the dashboard should help identify WHICH page/step is causing friction, HOW severe the problem is, and WHERE the team should investigate.
- Consider finer-grained hover/focus/hesitation signals only where technically feasible, privacy-appropriate, and meaningfully defined.
- Capture and visualize page/step dwell time, exit frequency, how quickly users exit, abandonment/drop-off, progression/completion, errors, and other useful interaction signals.
- The client specifically wants to understand where insurance users become confused so the experience can be improved over time.
- Treat behavioral analytics as a first-class feature of the dashboard, not an optional enhancement.
## Dashboard Analytics - Key Client Requirement
## UX Direction
- Strong, clear visuals.
- Minimize clicks and confusion.
- Crimson/white is an initial palette direction, but alternatives are allowed.
- Preserve the broader client's existing aesthetics; do not redesign the entire site.
- Make the business problem and user value obvious in every mockup.
 
## Technical Context
- VS Code
- Front end: HTML/CSS/JavaScript + Bootstrap
- Source control: GitHub
- AI: Anthropic Claude API
- Back end: SQL
- Course folder baseline:
  Project/
    API/
    Client/
      Resources/
        styles/index.css
        scripts/index.js
      index.html
- Follow the Bootstrap version/dependency expectations taught in class.
 
## Open Requirements
- Exact quote/rating/eligibility rules.
- Carrier-specific/state-specific rule details.
- Exact formulas/definitions and visualization details for dashboard analytics; extensive confusion/friction tracking itself is a confirmed client priority.
- Employee vs admin permissions.
- AI escalation thresholds.
- Current rejection/drop-off patterns and state profitability/availability questions.
 
## Mockup Priorities
- Insurance selection landing page.
- State-aware coverage filter.
- Coverage comparison.
- Multi-step application.
- AI quote chat.
- Human escalation state.
- Reviewer dashboard.
- Analytics/dashboard concepts that prominently visualize dwell time, exits/rapid exits, drop-off funnels, completion/progression, errors, rejection patterns, and other privacy-appropriate confusion/friction signals.
 
## Guardrails
- No final automated underwriting without human approval.
- No unsupported quote calculations.
- No global site redesign outside project components.
- Clearly distinguish confirmed requirements from assumptions and placeholders.
15. Source Notes
This brief is derived from the Team 6 Statement of Work, the first Valent Partners kickoff notes dated 9/9, the two class slides supplied with the request, and additional client-meeting context supplied by the team after the initial draft. The written kickoff notes already identify drop-off, confusion, time-on-page, and example dashboard metrics as discovery priorities; the team additionally reports that the client strongly emphasized extensive behavioral analytics (including page exits, speed of exit, and detailed interaction/time signals) as a key dashboard expectation. Recommendations about research matrices, telemetry design, privacy boundaries, and labeling assumptions are implementation guidance added to operationalize those requirements.
Class slide 1 shows the Project/API/Client folder structure with Client/Resources/styles/index.css, Client/Resources/scripts/index.js, and Client/index.html. Class slide 2 describes local-vs-CDN Bootstrap inclusion and notes jQuery in the course's Bootstrap context.

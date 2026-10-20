# Team 6 - Insurance Quote and Application Research
Research cutoff: 2026-10-12
Use public facts as guidance and obtain carrier/client approval for executable rules.
MARKET RESEARCH + PRODUCT REQUIREMENTS
Insurance Quote & Application
Research Reference
Homeowners  •  Flood  •  Jewelry  •  Auto  •  Bundling
Prepared for Team 6 and implementation handoff to Claude
Research cutoff: October 12, 2026

## Purpose
This document turns Team 6’s earlier Statement of Work into a practical research and application-design reference. It identifies typical insurance questions, coverage selections, conditional steps, state-dependent logic, data objects, reviewer needs and test cases. It adds auto insurance and multipolicy bundling at the team’s request. It is a planning input, NOT an approved carrier rating manual, a 50-state legal opinion or a license to issue policies.

## Read this before building

| Label | Meaning |
| --- | --- |
| PUBLIC FACT | Supported by an authoritative source, with reference IDs in brackets. |
| DESIGN RECOMMENDATION | Suggested UX or software behavior; adjust after client review. |
| CLIENT/CARRIER RULE REQUIRED | Unknown until Valent Partners or an authorized insurance carrier provides its rules. |
| MOCK ONLY | Safe for a clearly labeled classroom/demo prototype; never portray invented premiums as real quotes. |


## Decision summary
- One application shell; shared applicant/address data are entered once and reused for selected products.
- Distinct quote pathways for five products. Auto and bundling are included per the team’s updated direction; the attached older SOW still lists home, flood and jewelry only. [SOW pp. 1–3]
- Coverage options and requirements depend on state, risk, carrier, product, policy form and effective date; do not hardcode a “national minimum” or an invented discount.
- The AI assistant explains and collects information; deterministic services evaluate actual eligibility and pricing. Do not permit AI to invent rates or make final underwriting decisions. [R9]
- Unqualified, unusual or incomplete risks go to licensed-agent or reviewer escalation, with an auditable reason.

## 1. Source scope, assumptions and known gaps
Earlier SOW: responsive state-aware coverage filtering, AI quote assistant, agent escalation, online applications, analytics and a secure reviewer dashboard. It seeks carrier-aware filtering for all 50 states, a coverage comparison within three clicks, form validation, funnel metrics and reviewer approvals. Its Section 6 leaves quote formulas, dashboard fields and exact employee/admin permissions unresolved. [SOW pp. 1–3]
Current working assumption: Auto and multipolicy bundling are part of the updated client scope, as reported by the team. The revised SOW itself has not been supplied; do not treat additions beyond these as client-approved. The original SOW excludes final automatic underwriting without human review. [SOW p. 1]

### Critical distinctions

| Statement | What the application should do |
| --- | --- |
| Available coverage | Show only products/carriers actually enabled for state + risk type; otherwise “check with an agent.” |
| Insurance estimate | Only compute from approved rating data. Otherwise display “estimate unavailable” or a prominently labeled mock figure. |
| Binding/issuing | Not supported unless explicitly approved, licensed and connected to proper carrier systems. |
| 50-state support | Architecture should support 50 states; real coverage/rates require 50-state source data and QA. Confirm DC/territories separately. |
| Privacy | Separate quote-stage essentials from sensitive bind-stage identifiers and data-provider permissions. |


## 2. Recommended end-to-end application flow
1. Start: choose “Get a quote” and select Home, Flood, Jewelry, Auto, or “Bundle and compare.”
2. Establish state and ZIP/address of the risk. Auto needs primary garaging address; property lines need insured property address. Ask whether the applicant lives at a different mailing address.
3. Collect shared applicant/contact data once, with transparent reason for requested information.
4. Run a state/product availability pre-check against versioned rules. If unsupported, explain the limitation and offer agent assistance.
5. Show conditional questions for each chosen line. Allow multiple drivers/vehicles, multiple jewelry items and separate covered properties.
6. Ask about coverage limits and deductibles using carrier-approved options; explain exclusions and coverage differences.
7. For bundling, evaluate individual lines first, then only eligible multi-policy combinations; show individual versus combined prices on a like-for-like coverage basis.
8. Validate data; obtain any necessary privacy/consumer-report authorization before accessing external records.
9. Call approved quote/rating connector; show a time-stamped result, estimate/quote label, coverages, limits, deductibles, fees/discounts and disclaimers.
10. Offer save/resume and review; route complex cases to a reviewer/agent instead of declaring automatic acceptance.
11. Reviewer views source data and reasons, requests documents/corrections, then records decision; applicant receives neutral status updates.

## 3. Shared applicant + household information
DESIGN RECOMMENDATION. Collect an applicant profile first, but do not assume every field is required for every carrier or quote phase.

| Field group | Candidate fields / validation |
| --- | --- |
| Applicant | First/last name; email; mobile; preferred contact method; date of birth if required; applicant type; consent timestamps. |
| Geography | Risk street, city, state, ZIP, unit; normalized address ID; mailing address if different; effective date requested. |
| Insurance context | New policy versus switching; existing lines/carriers; expiration dates; prior coverage lapse question when relevant. |
| Household | Named insureds/household members as applicable; relationship to applicant; separate driver list for auto. |
| Consent | Privacy notice; carrier and agent sharing; electronic contact; consumer report authorization where applicable; no prechecked consent. |
| Quote metadata | Quote/session ID; selected lines; rule-set/version; producer/agency; UTC creation timestamp; quote status; data-provenance flag. |

Validation: enforce actual US state codes, sensible calendar dates, positive currency limits, complete formatted addresses, email/phone format and relationship between answers. Never collect Social Security numbers, driver-license images or payment details just because a frontend demo can ask for them. Sensitive identifiers need a documented business necessity and secure handling. [R10, R11]

## 4. Homeowners insurance research
PUBLIC FACT. Standard homeowners coverage commonly includes dwelling, other structures, personal property, loss of use/additional living expense, personal liability and medical payments. Coverage depends on the policy; typical homeowners policies do not cover flooding or earthquakes. Rebuilding/replacement cost is distinct from a home’s market sale price. [R1, R2]

### Application questions and data fields

| Section | Candidate questions (ask conditionally) |
| --- | --- |
| Property identity | Property address; ownership; home/condo/rental classification; primary/secondary/seasonal occupancy; expected coverage start. |
| Building | Construction year; area/square footage; stories; construction/roof material; roof age; renovations and major electrical/plumbing/HVAC updates; foundation/basement; garage and other structures. |
| Use and risk | Rental or short-term-rental use; vacancy; home business; wood stove/fireplace; pool/trampoline; pets; protective alarms/sprinklers; wildfire/wind/hurricane exposure where relevant. |
| Insurance history | Prior carrier, prior cancellations/nonrenewals, claims history and years of continuous coverage only where permitted and required by carrier. |
| Coverage selections | Dwelling coverage A; other structures B; personal property C; additional living expenses D; liability E; medical payments F; deductible; carrier-approved endorsements. |
| Loan & documents | Mortgage/lender information at appropriate stage; prior declarations; roof details/photos/inspection if requested by carrier. |


### Important display rules
- Explain replacement cost vs actual cash value and why market value is not a substitute for replacement-cost estimates. [R1]
- Show potential water-backup, equipment-breakdown, wind/hail/hurricane, ordinance-or-law and personal valuables options only when the selected carrier actually offers them. [R1]
- If “flood” is selected or flood protection requested, branch to a distinct flood quote; never relabel homeowners coverage as flood protection. [R2, R3]
- Flag unusual occupancy, high-risk physical features, prior serious losses and unresolved building characteristics for underwriting rather than auto-rejecting.

## 5. Flood insurance research
PUBLIC FACT. NFIP coverage is available to eligible properties in participating communities; the property’s mapped flood zone helps describe flood hazard and some purchase requirements, but the NFIP pricing approach uses additional location/building factors. NFIP residential limits commonly reach $250,000 building and $100,000 contents; these are not ceilings for all private-flood products. Building and contents are separately selected with separate deductibles. [R3, R4, R5, R6]
PUBLIC FACT. The NFIP generally has a 30-day waiting period, with specified exceptions; do not simply promise same-day flood coverage. Flood coverage can be required for federally backed mortgages on certain properties in special flood hazard areas, and a lender can have separate requirements. [R3, R5, R7]

### Application fields / questions

| Group | Candidate information |
| --- | --- |
| Location | Property address, standardized parcel/geocode if available, FEMA flood zone/map reference, community participation and map-effective date; verify manually when mismatched. |
| Insured interest | Owner, renter or condo; occupancy; building versus contents; policy inception date; new purchase/refinance or other waiting-period exception. |
| Structure | Year built; living area; floors; foundation type; first-floor height; basement/enclosure/crawlspace; number of units; construction/use; flood openings; elevated machinery. |
| Coverage | Building coverage and its deductible; contents coverage and its deductible; NFIP versus private-flood options only if approved and available. |
| Lender & history | Mortgage/lender and loan context; prior flood losses/claims and prior coverage as required; elevation certificate and mitigation documents where available. |
| Review flags | Address/zone not resolved; unsupported building; flood in progress; waiting-period exception; valuation outside program limits; basement/condo complexity. |


### Flood-specific UX warnings
- Do not imply low- or moderate-risk map zones mean zero flood risk; FEMA notes flood losses also occur outside high-risk zones. [R5]
- Identify basement restrictions and other exclusions clearly. National Flood Insurance Program coverage is not the same as home loss-of-use insurance; NFIP typically does not cover additional living expenses. [R4, R8]
- Show NFIP and private flood as separate products with distinct limits, waiting periods, exclusions and underwriting; do not assume private-flood eligibility or lender acceptance.
- Use FEMA Map Service Center as an authoritative map lookup reference, not a made-up API; assess permissions, reliability and address matching before integrating. [R7, R12]
- Treat FloodSmart/FEMA current agent manual as controlling operations reference at build time; this report is not an NFIP rating algorithm. [R13]

## 6. Jewelry and valuables insurance research
PUBLIC FACT. Standard home policies can cover jewelry subject to special theft or other limits. Scheduling an item (a floater/personal-articles option) or buying specialty standalone insurance may offer greater protection, depending on form; an appraisal may be necessary. Never assume lost or misplaced items are covered by every product. [R14]

| Group | Candidate information |
| --- | --- |
| Ownership | Owner/named insured; insured mailing/property location; whether an existing homeowners policy is held; standalone vs added endorsement selection. |
| Items (repeatable) | Type (ring, watch, necklace, etc.); description; brand/model; metal/gem details where applicable; insured/replacement value; purchase and appraisal dates. |
| Documents | Appraisal value and date; purchase receipt; certificate/serial; photos; secure upload state, allowed types/size and retention. |
| Protection needs | Theft, accidental loss, mysterious disappearance, damage, worldwide coverage, deductible; only options actually offered by carrier. |
| Risk / routing | Items above value thresholds, missing valuation, business inventory, recent losses, antique/collectible uncertainty or unusual storage require review. |

DESIGN RECOMMENDATION. Show the home-policy jewelry sublimit as a carrier-configured field. A commonly cited illustrative $1,500 theft limit is NOT a universal rule and must not be used as the client’s default. [R14]

## 7. Personal auto insurance research
PUBLIC FACT. Main protections include bodily-injury/property-damage liability; optional or state-dependent uninsured/underinsured motorist, medical payments and personal injury protection (PIP); collision and comprehensive coverages; and selected endorsements. Requirements vary by state. Lenders/lessors often require vehicle physical-damage coverage. The phrase “full coverage” is not a precise standard policy name. [R15, R16]

### Drivers and vehicles

| Group | Candidate information |
| --- | --- |
| Applicant / garaging | Policy state, primary garaging street/ZIP, mailing address, requested start, vehicle ownership and carrier of existing policy. |
| Each vehicle | VIN (decode only with a reliable service), year/make/model/trim, purchase date, ownership/loan/lease, personal/commute/business/rideshare use, annual mileage, safety/anti-theft features. |
| Each driver | Name, birth date, driver status/permit, relationship, years licensed, license state (license number only at appropriate step), assigned primary vehicle. |
| Household and exclusions | Other driving-age household members, additional drivers, non-drivers/excluded drivers where legally allowed and explicitly supported by carrier. |
| History | Accidents, citations/convictions, violations, prior claims and coverage gaps in carrier-defined permissible lookback windows; do not invent fixed 3/5-year windows. |
| Limits / add-ons | BI per-person/per-accident; property damage; UM/UIM; PIP/MedPay as relevant; comprehensive/collision deductibles; rental reimbursement/towing/roadside where offered. |


### State filtering rules
- Minimum required liability amounts and PIP/UM/UIM offer/selection/rejection rules must be stored per state, versioned and verified directly against the applicable state regulator and carrier.
- Never use an undated “all 50 states minimum limits” table as executable law. Show required choices and lawful opt-outs only where the state/carrier supports them. [R16, R17]
- Use the vehicle’s primary garaging/registration circumstances and carrier rules to resolve rating jurisdiction; do not rely only on the user’s current browser location.
- Trigger licensed-agent review for business/rideshare, unfamiliar driver statuses, serious violation records or other underwriting exceptions rather than guessing acceptance.

## 8. Bundling / multipolicy insurance research
PUBLIC FACT. Insurance companies may provide discounts for purchasing qualifying lines together (notably home and auto). But policies bought separately may offer better coverage, pricing or flexibility. Bundling is generally multiple coordinated policies, not one universal combined policy; combined deductibles are only available from some carriers. [R18]

### Exact behavior to give Claude
1. Let applicants select one or more supported lines (Home, Flood, Jewelry, Auto). Reuse their information without merging separate insured risks.
2. Obtain or calculate a valid eligible individual quote for EACH selected policy using its own approved carrier rate/coverage rules.
3. Look up the bundle combination in a carrier-specific discount eligibility matrix. Validate household, state, named insured, dates, carrier group and product qualifications.
4. Apply only supplied discounts to the allowed premium component(s), in the supplied order, observing stacking, caps, minimum premiums and effective dates.
5. Display “Separate total” and “Eligible bundle total” only when all component quotes exist and are comparable. Display per-line itemized costs, insurance fees/taxes as appropriate and final total.
6. If no discount is eligible, communicate “Multiple policies selected; no confirmed multipolicy discount” rather than manufacturing savings.
7. Offer meaningful non-price comparisons such as limits, deductibles and exclusions; do not label a bundle the “best” on price alone.

### Carrier rules required for bundle computation

| Rule key | Example of data needed (NOT actual client rule) |
| --- | --- |
| eligible_pairs | HOME+AUTO eligible? HOME+JEWELRY eligible? FLOOD+HOME eligible? Do not assume any. |
| carrier_scope | Must each line share same underwriting company, same brand/group or partner? |
| matching_identity | Named insured, property/garaging location or household match criteria. |
| discount_value | Fixed amount or percentage, line(s) affected, caps, sequencing, minimum premium. |
| timing | Same start date? Existing-policy credit? Midterm addition? Renewal rules? |
| fees_and_disclosure | Whether discount applies to base premium only; display requirements; linked deductibles if truly offered. |

IMPORTANT FLOOD NOTE: NFIP coverage is a distinct program. Do not assume it qualifies for a homeowners/auto discount simply because the applicant buys flood insurance too. Get explicit insurer confirmation. [R18]

## 9. Conditional application logic
DESIGN RECOMMENDATION. These are UX branching examples, not claims about coverage eligibility. Keep each switch in a documented rules catalog.

| Condition | Application behavior |
| --- | --- |
| Selected products = Auto only | Skip all property/jewelry questions; ask driver and vehicle arrays. |
| Selected products = Home + Flood | Ask the insured property address once; allow distinct insured interests, limits and deductibles. |
| Selected products = Auto + Home | Ask home address and vehicle garaging address; prefill but allow them to differ. |
| Selected products = Home + Jewelry | Offer scheduling valuables; allow jewelry standalone if enabled by partner. |
| Flood selected, property is rental/condo | Branch to appropriate NFIP/private path; do not auto-treat as one-family homeowner. |
| Flood zone unavailable | No inferred map-zone eligibility: ask for confirmation or escalate. |
| Flood start date < expected wait | Explain likely NFIP waiting period; ask about verified exception; refer if ambiguous. |
| Auto has additional vehicle/driver | Repeat fields per instance; prevent index mismatch in quote payload. |
| Vehicle leased or financed | Explain likely lender physical-damage requirements; show carrier-approved options. |
| Jewelry value or docs missing | Save incomplete item; request evidence or agent review according to carrier requirement. |
| House has seasonal/vacant use | Show relevant questions; request eligibility review if unknown. |
| Bundled quote has no matching offer | Show separate valid quotes only; no phantom discount. |
| State has required auto selections | Default to state/carrier-compliant options; use explicit rejection forms only where lawful. |
| No approved rate data | Suppress numeric “real quote”; show no-rate/agent handoff or clearly labeled mock. |


## 10. Pricing, state rules and quote status
Implementation principle: a language model should not perform actuarial pricing by improvising a formula. The SOW says quote rules remain to be finalized, so the rating engine must be a swappable dependency. [SOW p. 3]

### Three quote levels

| Status | Meaning / allowed display |
| --- | --- |
| INCOMPLETE | Form is saved; some required answers not yet provided. |
| ESTIMATE_UNAVAILABLE | No approved rating rule/carrier quote exists; no premium is displayed. |
| DEMO_ESTIMATE | Synthetic example, unmistakably labeled nonbinding and not market-accurate. |
| CARRIER_INDICATION | Preliminary carrier-produced response, with limitations and timestamp. |
| CARRIER_QUOTE | Carrier-returned quote with validity/assumptions; still not policy issuance. |
| REFERRED | Agent/reviewer action required; do not promise approval. |
| DECLINED_BY_CARRIER | Only if an actual carrier decision is provided with approved disclosure text. |


### Versioned state / carrier rules model
Suggested fields: carrierId, underwritingCompanyId, productCode, jurisdictionState, policyForm, channel, effectiveFrom, effectiveTo, eligibilityRules, requiredFields, allowedCoverages, minMaxLimits, deductibles, stateDisclosures, quoteProvider, bundleDiscountRules, approvals, sourceURL, lastVerifiedAt, reviewedBy, version and status (draft/approved/retired).
RATING CONTROL: a live premium must be sourced from approved filed/authorized carrier rules or approved quote API, not a simple universal “rate × amount insured” calculation. Treat unavailable fees/taxes, discounts and policy terms as unknown—not zero.

## 11. AI assistant and escalation safeguards
PUBLIC FACT. NAIC emphasizes oversight, accuracy, fairness and compliance for insurer AI systems; insurers remain accountable for AI-supported decisions. NIST publishes AI risk-management guidance. [R9, R19]
- Allow AI to explain field meanings, suggest next questions, summarize answers and route to a human. Fetch factual product data from approved structured sources.
- Use deterministic validation, state rules and carrier output for eligible products, limits, fees and rates; block the AI from overriding rules.
- Never claim “you are covered,” “approved,” “bound,” or a guaranteed saving unless an authorized system confirms the exact status.
- Route to an agent when eligibility is unknown, source data conflict, policy rules need interpretation, applicant requests expert advice, or quote is not available.
- Limit data sent to the Claude API: mask or avoid DOB, licenses, SSNs, payment info, raw supporting documents and unnecessary sensitive chat text. Review provider policies and retention before production.
- Log rule inputs and output IDs but not unfiltered chatbot transcripts or sensitive fields. Include human corrections and auditability.

## 12. Reviewer dashboard and data design
Earlier SOW requires a secure reviewer/admin dashboard and manual approval queue; exact role definitions remain a project blocker. [SOW pp. 2–3]

### Recommended roles

| Role | Suggested permissions (client to approve) |
| --- | --- |
| Applicant | Own saved applications, permitted edits, upload own documents, view status. |
| Licensed agent/reviewer | Assigned applications, see minimum necessary personal data, request updates, send approved replies, record decision. |
| Admin | Manage users/assignments and approved rule publication; review audit logs; not an automatic right to all PII. |
| Analyst | Aggregate funnel analytics without direct sensitive applicant details. |


### Suggested primary data entities

| Entity | Why it exists |
| --- | --- |
| Applicant, Address, HouseholdMember | Shared identity/contact and risk-location data with clear access rules. |
| Application, ApplicationLine | One submission may contain multiple Home/Flood/Jewelry/Auto product requests. |
| Property, BuildingRisk, FloodRisk | Structure details, occupancy, NFIP/private context, independent coverage choices. |
| Vehicle, Driver, DriverVehicle | Repeatable cars/drivers and their relationships. |
| ValuableItem, SecureDocument | Each appraised item and access-controlled valuation evidence. |
| CoverageSelection, Quote, QuoteLine | Chosen limits/deductibles, source response, fees, status, timestamp, validity. |
| BundleEvaluation, DiscountApplication | Eligibility result, source rule ID, discount amount, included policy-line IDs. |
| CarrierProductRule, StateRuleVersion | Versioned product availability, required fields, disclosures and sources. |
| AgentReferral, ReviewDecision, AuditEvent | Human escalation, assignment, decision and tamper-evident activity record. |
| FunnelEvent | Privacy-safe step analytics: step ID, elapsed time, validation codes, anonymized session ID. |

SECURITY RECOMMENDATION. Apply server-side input validation, role-based access control, encryption in transit and at rest, secure document storage, least privilege, audit logs, retention/deletion requirements, rate limiting and appropriate reviewer multifactor authentication. Consult NAIC insurance data-privacy requirements and modern NIST authentication guidance before deployment. [R10, R11]

## 13. Analytics, usability and accessibility
SOW requires behavioral and funnel metrics; track completion percentage by insurance line, abandon step, validation frequency, time-per-step, referrals, state/product unavailability and bundle eligibility. Avoid retaining raw address/DOB/driver history in telemetry. [SOW pp. 1–2]
- Show progress (“Step 2 of 5”), easy Back/Edit, autosave with consent, clear inline validation and a summary before submit.
- Present “estimated” versus “issued” statuses differently; allow comparison only with matched limits and deductibles.
- Make the landing-page product selection and first comparison fast, following the SOW 3-click goal for coverage comparison.
- Support mobile layout, keyboard navigation, descriptive error text, label associations and accessible contrast.
- Record events as stepEntered, fieldValidationError, stepCompleted, quoteRequested, quoteReturned, bundleEvaluated, referralRequested and applicationSubmitted.

## 14. QA tests Claude should implement
1. Home quote: flood request produces separate flood line; no misleading home flood coverage.
2. Flood: NFIP $250k/$100k residential maximum choices are respected in appropriate NFIP dwelling context; private flood is not constrained to those arbitrary values.
3. Flood: building and contents carry separate limits/deductibles; missing contents are never silently assumed included.
4. Flood: routine 30-day waiting-period presentation; documented exception triggers agent verification.
5. Flood: missing flood zone or community result causes request for verification, not a fabricated value.
6. Jewelry: multiple separate appraisals/items persist and show correct values; item upload permissions work.
7. Auto: two vehicles / three drivers map correctly without assigning the wrong driver to vehicle.
8. Auto: chosen state rules are applied server-side; illegal coverage combinations cannot submit.
9. Auto: financed vehicle flow shows compliant eligible physical damage options as configured.
10. Home: occupancy, roof and protection questions branch only when relevant.
11. Bundling: eligible home+auto receives only the explicitly configured discount.
12. Bundling: flood or jewelry does not get a fictitious discount when not eligible.
13. Bundling: combined display reconciles line premiums, carrier-provided discounts and taxes/fees.
14. Quote engine: missing rates never produce a fabricated “real” premium.
15. AI: asked for guaranteed coverage, assistant refuses guarantee and refers to actual quote/policy.
16. AI: applicant submits out-of-scope/unusual risk; agent escalation contains reason and required next steps.
17. Reviewer: restricted user cannot see another applicant’s personal data or edit approved rules.
18. Analytics: funnel counters work and exclude raw personally identifying data.
19. Rule refresh: updated state rule takes effect only when published, with a recorded effective date.
20. Save/resume: all selections and consent snapshots are preserved without duplicate applications.

## 15. Questions to resolve with Valent Partners (priority order)
1. Which actual carriers, underwriting companies, distribution partners and product lines are supported in each state? Does “all 50 states” include DC?
2. What does “quote” mean for launch: educational estimate, live carrier indication, rate-locked quote or just lead capture?
3. Where are approved rates/eligibility rules/APIs or representative test datasets? Who signs off on accuracy and updates?
4. Is auto personal passenger auto only? What vehicle types and driving situations are excluded?
5. Which bundles actually qualify, and what are the exact carrier-provided discounts, caps and stacking rules?
6. Does flood include only NFIP, private flood or both? Who is the authorized NFIP quoting/servicing partner?
7. Is jewelry a standalone policy, homeowners endorsement or both? Required valuations and upload thresholds?
8. Which types of homeowners/condo/renters/landlord risks are in scope? Are earthquake, wind and water-backup endorsements included?
9. Which applicant questions are mandatory at initial quote, after quote, and before binding? What consumer-report consent wording is required?
10. Which states/legal disclosures, producer licensing and record-retention rules govern the platform?
11. What are reviewer, licensed agent and admin permissions, handoff SLAs and permitted decision/status codes?
12. What customer information can be sent to the Anthropic API, under which enterprise terms and data controls?
13. What must be visible in the reviewer dashboard? What funnel KPIs are valuable without exposing sensitive data?
14. What is the test environment? Is the launch a classroom demo or a public customer-facing system?

### Practical build order for the current sprint
1. Implement shared applicant and risk-address components, product selection, input validation and save/resume.
2. Create configuration-driven question definitions for each line and states; wire mock approved demo datasets while rates are unavailable.
3. Implement Home, Flood, Jewelry and Auto forms with conditional sections and repeatable items/drivers/vehicles.
4. Build a bundle eligibility interface with discount = unknown until legitimate carrier rules are supplied.
5. Add quote status service and reviewer referral queue; never hardcode pretend premiums.
6. Implement accessible comparison screens and privacy-safe funnel analytics; test the scenarios above.

## 15a. Sprint demo states: Alabama, Texas, New York (researched Oct 2026)
The sprint limits the prototype to AL, TX and NY. These rules feed the explorer's "Compare Across States" table (STATE_COMPARISON in mockup_1 index.js). Rules only, no prices. "Verify" = only secondary or dated sources found; confirm with the regulator/Valent Partners before relying on it.

| Topic | Alabama | Texas | New York |
|---|---|---|---|
| Auto minimum liability | 25/50/25 [S1] | 30/60/25 [S3] | 25/50/10 [S5] |
| Auto PIP | Not required [S1] | Included unless rejected in writing [S3] | Required, $50,000 no-fault [S6] |
| Auto UM | Must be offered, rejectable in writing (Verify) | Must be offered, rejectable in writing [S3] | Required at 25/50 [S6] |
| Home: wind/hurricane deductible | Separate % named-storm deductible common on coast (Verify) | % wind/hail deductibles common (Verify) | Hurricane deductibles allowed, typically 1-5% of dwelling [S7] |
| Home: insurer of last resort | AIUA "Beach Pool", coastal Baldwin/Mobile (Verify) | TWIA (wind/hail, 14 first-tier coastal counties + part of Harris); Texas FAIR Plan statewide [S4] | NYPIUA FAIR Plan; current eligibility unconfirmed (Verify) |
| Home: mitigation discounts | Mandatory wind discounts for IBHS FORTIFIED homes [S2, 2014 handout: Verify current %] | None found (Verify) | None found (Verify) |
| Flood | NFIP rules are federal; same in all three. TWIA/TFPA policies exclude flood [S4] | | |
| Jewelry | No state-specific rules found (Verify) | | |

[S1] https://www.revenue.alabama.gov/tax-types/mandatory-liability-insurance/
[S2] https://www.aldoi.gov/PDF/Legal/HandoutWindstormDamageMitigation.pdf
[S3] https://www.tdi.texas.gov/pubs/consumer/cb020.html
[S4] https://www.tdi.texas.gov/tips/insurers-of-last-resort.html
[S5] https://www.dfs.ny.gov/faqs/consumer-auto/how-much-auto-insurance-must-i-carry
[S6] https://www.dfs.ny.gov/faqs/consumer-auto/what-auto-coverages-do-i-need
[S7] https://www.dfs.ny.gov/help_for_homeowners/insurance/basic_coverage/awindded/

## 16. Sources and verification links
References were checked for this research on October 12, 2026. The public references below are general industry/regulator guidance. Exact carrier forms, filed rating factors, legal disclosures and availability require partner approval. The attached SOW remains the only source for Team 6 project acceptance criteria.
[SOW] Team 6, AI Insurance Quote & Application Assistant, Statement of Work (uploaded; 3 pages).
Local uploaded project document
[R1] NAIC: Homeowners Insurance (topic, updated Oct 2025)
https://content.naic.org/insurance-topics/homeowners-insurance
[R2] NAIC: Consumer Homeowners Insurance
https://content.naic.org/consumer/homeowners-insurance.htm
[R3] NFIP/FloodSmart: Buy a Flood Insurance Policy
https://www.floodsmart.gov/policy-terms
[R4] NFIP for Agents: Types of Flood Insurance Coverage
https://agents.floodsmart.gov/topics/selling-flood-insurance/coverage
[R5] NFIP/FloodSmart: What Is My Flood Zone?
https://www.floodsmart.gov/flood-zones-and-maps/what-is-my-flood-zone
[R6] NFIP/FloodSmart: Premium Costs
https://www.floodsmart.gov/premiumcosts
[R7] NFIP/FloodSmart: Eligibility
https://www.floodsmart.gov/get-insured/eligibility
[R8] NFIP/FloodSmart: Basement Coverage Limitations
https://www.floodsmart.gov/recover/how-to-write-your-appeal/basement-coverage-limitations-decision-upheld
[R9] NAIC: Artificial Intelligence (updated April 2026)
https://content.naic.org/insurance-topics/artificial-intelligence
[R10] NAIC: Data Privacy and Insurance
https://content.naic.org/insurance-topics/data-privacy-and-insurance
[R11] NIST SP 800-63B-4: Authentication and Authenticator Management
https://csrc.nist.gov/pubs/sp/800/63/B/4/final
[R12] FEMA Map Service Center (official flood map lookup)
https://msc.fema.gov/
[R13] NFIP for Agents: Current Manuals (verify latest effective edition)
https://agents.floodsmart.gov/manuals
[R14] Insurance Information Institute: Special Jewelry/Valuables Coverage
https://www.iii.org/article/do-i-need-special-coverage-for-jewelry-and-other-valuables
[R15] NAIC: Auto Insurance overview
https://content.naic.org/insurance-topics/auto-insurance
[R16] NAIC: What Does Auto Insurance Cover? (June 2026)
https://content.naic.org/article/what-you-should-know-about-auto-insurance-coverage
[R17] NAIC: Directory of State Insurance Departments
https://content.naic.org/state-insurance-departments
[R18] NAIC: Bundling
https://content.naic.org/cipr-topics/bundling?id=005PW00000OmSvSYAV&t=y
[R19] NIST: AI Risk Management Framework
https://www.nist.gov/itl/ai-risk-management-framework
This is a research and software-planning guide. It is not legal, actuarial, underwriting or insurance-producer advice.
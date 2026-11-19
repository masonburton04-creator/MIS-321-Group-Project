# Texas: State Insurance Rules for Valent Partners Customers

<!--
Context document for the Ask Val chatbot (searched with embeddings). Each "## " section is one chunk.
Source: Team_6_Insurance_Research_for_Claude.md section 15a (researched October 2026) and the site's
"Compare Across States" table (STATE_COMPARISON in Client/Resources/scripts/customer.js).
"Needs verification" = only secondary or dated sources were found; confirm with the Texas Department
of Insurance or Valent Partners before relying on it. The "estimate adjustments" section has the cited state multipliers from Database/04_demo_quote_rates.sql.
-->

## Texas: Valent Partners coverage offered

Valent Partners' prototype offers Homeowners, Flood, Jewelry, and Auto insurance in Texas, alone or bundled in one application. Texas is one of the three sprint demo states, with Alabama and New York; carrier availability has not been verified yet. Estimates on the website are demo ranges adjusted for Texas (see "Texas estimate adjustments" below). Texas ZIP codes start with 750 through 799, or 885. The state insurance regulator is the Texas Department of Insurance (tdi.texas.gov).

## Texas estimate adjustments: how Texas prices compare to the national average

Valent Partners estimates for Texas are national averages times Texas multipliers, each the Texas average premium divided by the national average from the same source. Homeowners 1.65 (NAIC 2023 average HO-3 premium $2,864, from Texas Department of Insurance data, vs. US $1,737), the highest of the three demo states. Flood 1.00 (average NFIP premium $958 vs. US $955, OpenFEMA, 12 months to August 2026). Auto liability only 1.08 (NAIC 2023 liability average premium $797.86 vs. US $736.65). Auto full coverage 1.20 (NAIC 2023 combined average premium $1,726.91 vs. US $1,438.60). Jewelry 1.00 (no state data). Example Texas estimates: homeowners with a $300,000 rebuild cost about $2,390 to $6,400 per year; full-coverage auto for one vehicle with a clean record about $1,640 to $4,860 per year.

## Texas auto insurance: minimum liability required

Texas requires minimum auto liability coverage of 30/60/25: $30,000 for bodily injury to one person, $60,000 for bodily injury per accident, and $25,000 for property damage. These are legal minimums; many drivers choose higher limits. Source: Texas Department of Insurance auto insurance guide (tdi.texas.gov/pubs/consumer/cb020.html).

## Texas auto insurance: PIP and uninsured motorist coverage

In Texas, personal injury protection (PIP) is included in every auto policy unless the driver turns it down in writing. Uninsured/underinsured motorist (UM) coverage must be offered, and the driver can also turn it down in writing. Source: Texas Department of Insurance auto insurance guide. Collision and comprehensive are optional under state law, but lenders usually require them on financed or leased vehicles.

## Texas homeowners insurance: wind and hail deductibles

The main weather risk for Texas homes is wind and hail. Texas wind and hail deductibles are often a percentage of the dwelling (Coverage A) amount instead of a flat dollar amount (needs verification). A percentage deductible means a 2% deductible on a $300,000 dwelling is $6,000. On the coast, wind and hail coverage has its own system (TWIA).

## Texas homeowners insurance: TWIA and the Texas FAIR Plan (insurers of last resort)

The Texas Windstorm Insurance Association (TWIA) covers wind and hail damage in the 14 first-tier coastal counties and part of Harris County, for people who can't get wind coverage from a private insurer. The Texas FAIR Plan Association (TFPA) is the statewide last resort for other home coverage when private insurers won't cover a home. TWIA and Texas FAIR Plan policies do not cover flood. Source: Texas Department of Insurance, Other ways to get home and wind insurance (tdi.texas.gov/tips/insurers-of-last-resort.html).

## Texas homeowners insurance: discounts for storm-resistant homes

Valent Partners' research found no state-required discount program for storm-resistant (wind-mitigated) homes in Texas (needs verification). Individual insurance companies may still offer their own discounts.

## Texas flood insurance

Flood insurance rules in Texas are the federal NFIP rules, the same as in every state: building coverage commonly up to $250,000, contents up to $100,000, separate deductibles, and usually a 30-day waiting period. Standard homeowners policies, TWIA, and Texas FAIR Plan policies do not cover flood, so coastal Texas homes need a separate flood policy. Source: Texas Department of Insurance.

## Texas jewelry insurance

No Texas-specific rules for jewelry insurance were found in Valent Partners' research (needs verification). Jewelry coverage limits, scheduling, and deductibles come from the insurance company's policy, not the state.

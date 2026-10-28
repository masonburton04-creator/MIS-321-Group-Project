/* Valent Partners - Mockup 1: Customer Coverage Explorer
   Front-end-only prototype. All insurance content below is MOCK / DEMONSTRATION DATA
   and is not sourced from finalized Valent Partners or carrier business rules. */

(function () {
    'use strict';

    // Where the C# API is running (see API/README.md). Start it with "dotnet run" in the API folder.
    var API_BASE_URL = 'http://localhost:5250/api';

    // ---------------------------------------------------------------
    // MOCK DATA MODEL (replace with authoritative/researched data later)
    // ---------------------------------------------------------------

    // The sprint's demo states. Must match Database/05_supported_states.sql, or the API
    // will reject applications for a state listed here.
    var US_STATES = [
        ['AL', 'Alabama'], ['TX', 'Texas'], ['NY', 'New York']
    ];
    var DEFAULT_STATE = 'AL';

    // ---------------------------------------------------------------
    // STATE COMPARISON (explorer screen, "Compare Across States")
    // Rules only, no prices. Researched October 2026 from the sources below;
    // add each fact to Team_6_Insurance_Research_for_Claude.md and confirm with
    // Valent Partners before relying on it.
    //   Each row has a cell per state ({ text, src, verify }) or one `all` cell
    //   for rules that are the same in every state.
    //   src:    key in STATE_SOURCES
    //   verify: true = only secondary sources found, or the source is dated.
    //           Shown with a "Needs verification" badge.
    // ---------------------------------------------------------------

    var STATE_SOURCES = {
        alRevenue: ['Alabama Dept. of Revenue: Mandatory Liability Insurance', 'https://www.revenue.alabama.gov/tax-types/mandatory-liability-insurance/'],
        alWind: ['Alabama Dept. of Insurance: Windstorm Mitigation Discounts (2014)', 'https://www.aldoi.gov/PDF/Legal/HandoutWindstormDamageMitigation.pdf'],
        txAuto: ['Texas Dept. of Insurance: Auto Insurance Guide', 'https://www.tdi.texas.gov/pubs/consumer/cb020.html'],
        txLastResort: ['Texas Dept. of Insurance: Other Ways to Get Home and Wind Insurance', 'https://www.tdi.texas.gov/tips/insurers-of-last-resort.html'],
        nyAutoMin: ['NY DFS: How Much Auto Insurance Must I Carry?', 'https://www.dfs.ny.gov/faqs/consumer-auto/how-much-auto-insurance-must-i-carry'],
        nyAutoCov: ['NY DFS: What Auto Coverages Do I Need?', 'https://www.dfs.ny.gov/faqs/consumer-auto/what-auto-coverages-do-i-need'],
        nyHurricane: ['NY DFS: Windstorm and Hurricane Deductibles', 'https://www.dfs.ny.gov/help_for_homeowners/insurance/basic_coverage/awindded/'],
        floodPolicy: ['FloodSmart: Buy a Flood Insurance Policy', 'https://www.floodsmart.gov/policy-terms']
    };

    var STATE_COMPARISON = {
        homeowners: {
            intro: 'Coverage A–F works the same way in every state. The biggest differences are how wind and hurricane damage are handled near the coast.',
            rows: [
                {
                    topic: 'Main weather risk',
                    AL: { text: 'Hurricanes and named storms, especially in coastal Baldwin and Mobile counties.', src: 'alWind' },
                    TX: { text: 'Wind and hail. On the coast, wind and hail have their own coverage system (see below).', src: 'txLastResort' },
                    NY: { text: 'Hurricanes and coastal storms, mainly on Long Island and the New York City coast.', src: 'nyHurricane' }
                },
                {
                    topic: 'Hurricane / wind deductible',
                    AL: { text: 'Coastal policies often have a separate deductible for hurricanes or named storms, set as a percentage of the dwelling amount.', verify: true },
                    TX: { text: 'Wind and hail deductibles are often a percentage of the dwelling amount instead of a flat dollar amount.', verify: true },
                    NY: { text: 'Hurricane deductibles are allowed, usually 1%–5% of the dwelling amount, and only apply when a hurricane triggers them.', src: 'nyHurricane' }
                },
                {
                    topic: 'If private insurers won’t cover you',
                    AL: { text: 'The Alabama Insurance Underwriting Association (the FAIR Plan, or “Beach Pool”) covers eligible homes in coastal Baldwin and Mobile counties.', verify: true },
                    TX: { text: 'TWIA covers wind and hail in the 14 first-tier coastal counties and part of Harris County. The Texas FAIR Plan is the statewide last resort for other home coverage.', src: 'txLastResort' },
                    NY: { text: 'New York has a FAIR Plan (the NY Property Insurance Underwriting Association). Current eligibility rules still need to be confirmed.', verify: true }
                },
                {
                    topic: 'Discounts for storm-resistant homes',
                    AL: { text: 'Insurers must give wind-premium discounts for homes built or retrofitted to the IBHS FORTIFIED standard.', src: 'alWind', verify: true },
                    TX: { text: 'No state-required program found in our research yet.', verify: true },
                    NY: { text: 'No state-required program found in our research yet.', verify: true }
                }
            ]
        },
        flood: {
            intro: 'Most flood insurance comes from the NFIP, a federal program, so its main rules are the same in all three states.',
            rows: [
                {
                    topic: 'Where flood coverage comes from',
                    all: { text: 'The National Flood Insurance Program (NFIP), plus private flood insurers where available. Standard homeowners policies don’t cover flood.', src: 'floodPolicy' }
                },
                {
                    topic: 'Waiting period',
                    all: { text: 'NFIP policies usually take effect 30 days after purchase, with a few exceptions (for example, when a lender requires it at closing).', src: 'floodPolicy' }
                },
                {
                    topic: 'Coastal homes',
                    AL: { text: 'Hurricane wind and hurricane flooding (storm surge) are covered by different policies, so coastal homes usually need both.', verify: true },
                    TX: { text: 'TWIA and Texas FAIR Plan policies don’t cover flood, so coastal homes need a separate flood policy.', src: 'txLastResort' },
                    NY: { text: 'Hurricane wind and hurricane flooding (storm surge) are covered by different policies, so coastal homes usually need both.', verify: true }
                }
            ]
        },
        jewelry: {
            intro: 'Jewelry coverage depends mostly on the insurance company’s policy, not the state.',
            rows: [
                {
                    topic: 'State-specific rules',
                    all: { text: 'None found in our research. Coverage limits, scheduling, and deductibles come from the insurance company’s policy.', verify: true }
                }
            ]
        },
        auto: {
            intro: 'Each state sets its own required auto coverages. These are the legal minimums; many drivers choose higher limits.',
            rows: [
                {
                    topic: 'Minimum liability (injury per person / per accident / property damage)',
                    AL: { text: '$25,000 / $50,000 / $25,000', src: 'alRevenue' },
                    TX: { text: '$30,000 / $60,000 / $25,000', src: 'txAuto' },
                    NY: { text: '$25,000 / $50,000 / $10,000', src: 'nyAutoMin' }
                },
                {
                    topic: 'Personal injury protection (PIP)',
                    AL: { text: 'Not required by state law.', src: 'alRevenue' },
                    TX: { text: 'Included in every policy unless you turn it down in writing.', src: 'txAuto' },
                    NY: { text: 'Required: $50,000 of no-fault coverage, which pays your own medical bills and lost wages no matter who caused the crash.', src: 'nyAutoCov' }
                },
                {
                    topic: 'Uninsured motorist (UM)',
                    AL: { text: 'Must be offered. You can turn it down in writing.', verify: true },
                    TX: { text: 'Must be offered. You can turn it down in writing.', src: 'txAuto' },
                    NY: { text: 'Required, at the same minimums as injury liability ($25,000 / $50,000).', src: 'nyAutoCov' }
                }
            ]
        }
    };

    // Coverage explorer content for each insurance line. Based on Team_6_Insurance_Research_for_Claude.md
    // (sections 4-7) and the NAIC / FloodSmart / III pages it cites. General education only:
    // no carrier-specific limits, prices, or eligibility rules.
    //   order:      card order (homeowners codes A-F are also saved by the application form)
    //   cardTitle:  'letter' shows "Coverage A" with the name underneath; 'name' shows the name with its tag
    var LINE_COVERAGES = {
        homeowners: {
            title: 'Homeowners Coverage Components',
            intro: 'These are parts of a single homeowners policy, not competing plans — explore each one below.',
            cardTitle: 'letter',
            order: ['A', 'B', 'C', 'D', 'E', 'F'],
            items: {
                A: {
                    code: 'A',
                    badge: 'A',
                    name: 'Dwelling',
                    shortDesc: 'Covers the physical structure of your home if it’s damaged by a covered loss.',
                    whatItProtects: 'The structure of your home — walls, roof, foundation, and attached structures — against covered losses (e.g., fire, wind, certain other perils).',
                    whyItMatters: 'Rebuilding or repairing a home is typically the largest potential cost a homeowner faces, so this is usually the foundation of a homeowners policy.',
                    keyConsiderations: 'Coverage amount is generally meant to reflect the cost to rebuild the home, not its market/sale value.',
                    commonLimitations: 'Flood and earth movement are typically excluded and may require separate coverage. Maintenance-related damage is usually not covered.'
                },
                B: {
                    code: 'B',
                    badge: 'B',
                    name: 'Other Structures',
                    shortDesc: 'Covers detached structures on your property, like sheds, fences, or a detached garage.',
                    whatItProtects: 'Structures on the property not attached to the home — e.g., sheds, detached garages, and fences.',
                    whyItMatters: 'These structures can be costly to replace and are not automatically covered by Dwelling (Coverage A).',
                    keyConsiderations: 'Often set as a percentage of the Dwelling coverage amount rather than chosen independently.',
                    commonLimitations: 'Structures used for business purposes may have reduced or excluded coverage.'
                },
                C: {
                    code: 'C',
                    badge: 'C',
                    name: 'Personal Property',
                    shortDesc: 'Covers your belongings — furniture, electronics, clothing — against covered losses.',
                    whatItProtects: 'Personal belongings inside (and sometimes temporarily outside) the home against covered losses.',
                    whyItMatters: 'Replacing everyday belongings after a loss can be expensive; this coverage helps offset that cost.',
                    keyConsiderations: 'Valuation may be based on Replacement Cost Value (cost to replace new) or Actual Cash Value (replacement cost minus depreciation), depending on the policy.',
                    commonLimitations: 'High-value items like jewelry, art, and collectibles often have special sub-limits and may need scheduled/separate coverage.'
                },
                D: {
                    code: 'D',
                    badge: 'D',
                    name: 'Loss of Use / Additional Living Expense',
                    shortDesc: 'Helps cover temporary living costs if you can’t stay in your home after a covered loss.',
                    whatItProtects: 'Additional costs of temporary housing and related living expenses when a covered loss makes the home temporarily uninhabitable.',
                    whyItMatters: 'Displacement after a major loss can be financially and emotionally stressful; this coverage helps bridge that gap.',
                    keyConsiderations: 'Usually subject to policy limits and/or a maximum time period.',
                    commonLimitations: 'Generally only applies when the triggering loss is itself a covered peril under the policy.'
                },
                E: {
                    code: 'E',
                    badge: 'E',
                    name: 'Personal Liability',
                    shortDesc: 'Helps protect you financially if you’re responsible for injury or property damage to others.',
                    whatItProtects: 'Liability protection if you (or covered household members) are found responsible for bodily injury or property damage to others, subject to policy terms.',
                    whyItMatters: 'Liability claims and legal costs can be significant; this coverage helps manage that financial exposure.',
                    keyConsiderations: 'Coverage limits can typically be increased; some households consider an additional umbrella policy for extra protection.',
                    commonLimitations: 'Intentional acts and certain business-related activities are typically excluded.'
                },
                F: {
                    code: 'F',
                    badge: 'F',
                    name: 'Medical Payments to Others',
                    shortDesc: 'Covers limited medical costs if someone else is accidentally injured on your property.',
                    whatItProtects: 'Limited medical expenses for guests accidentally injured on the property, generally regardless of fault.',
                    whyItMatters: 'Provides a fast, lower-friction way to handle minor injury claims without a liability dispute.',
                    keyConsiderations: 'Limits are usually much lower than Personal Liability (Coverage E) limits.',
                    commonLimitations: 'Typically does not apply to residents of the household — mainly intended for guests/visitors.'
                }
            },
            goodToKnow: [
                '<strong>Flood isn’t included:</strong> Flood damage is generally <u>not</u> covered by a standard homeowners policy. Separate flood coverage is typically required.',
                '<strong>Jewelry has limits:</strong> Valuable jewelry often has special coverage limits under homeowners policies and may need scheduled or separate coverage.'
            ],
            sources: [
                ['NAIC: Homeowners Insurance', 'https://content.naic.org/insurance-topics/homeowners-insurance'],
                ['NAIC: Consumer Guide to Homeowners Insurance', 'https://content.naic.org/consumer/homeowners-insurance.htm']
            ]
        },

        flood: {
            title: 'Flood Coverage Options',
            intro: 'Flood insurance is a separate policy from homeowners insurance. These are its main parts and the choices you’ll make.',
            cardTitle: 'name',
            order: ['FLOOD_BUILDING', 'FLOOD_CONTENTS', 'FLOOD_DEDUCTIBLES', 'FLOOD_PROGRAM'],
            items: {
                FLOOD_BUILDING: {
                    code: 'FLOOD_BUILDING',
                    badge: '1',
                    name: 'Building Property',
                    tag: 'Core coverage',
                    shortDesc: 'Covers the structure of your home when it’s damaged by a flood.',
                    whatItProtects: 'The building itself — its structure and built-in parts — against direct physical damage from flooding.',
                    whyItMatters: 'Standard homeowners policies typically don’t cover flooding, so without flood coverage, flood repairs to the home are usually paid out of pocket.',
                    keyConsiderations: 'NFIP residential building coverage commonly goes up to $250,000. Private flood products may offer different limits. Building coverage has its own deductible.',
                    commonLimitations: 'Coverage for basements and other enclosed areas below the lowest floor is limited. Flood policies generally don’t pay temporary living expenses the way homeowners Coverage D does.'
                },
                FLOOD_CONTENTS: {
                    code: 'FLOOD_CONTENTS',
                    badge: '2',
                    name: 'Contents (Personal Property)',
                    tag: 'Chosen separately',
                    shortDesc: 'Covers your belongings inside the building when they’re damaged by a flood.',
                    whatItProtects: 'Personal belongings such as furniture, clothing, and electronics when damaged by flooding.',
                    whyItMatters: 'Building coverage does not include your belongings. Contents coverage is a separate choice, and renters can insure their belongings even though they don’t own the building.',
                    keyConsiderations: 'NFIP residential contents coverage commonly goes up to $100,000, with its own deductible separate from the building deductible.',
                    commonLimitations: 'Belongings kept in a basement have limited coverage. Contents coverage is never automatically included with building coverage — it has to be selected.'
                },
                FLOOD_DEDUCTIBLES: {
                    code: 'FLOOD_DEDUCTIBLES',
                    badge: '3',
                    name: 'Deductibles',
                    tag: 'Your choice',
                    shortDesc: 'Building and contents each have their own deductible — the amount you pay before coverage starts paying.',
                    whatItProtects: 'Not a coverage on its own. It sets how much of each flood claim you pay first, separately for the building and for your belongings.',
                    whyItMatters: 'A higher deductible generally lowers the premium but raises what you pay out of pocket after a flood.',
                    keyConsiderations: 'Because building and contents are selected separately, one flood claim can involve two deductibles.',
                    commonLimitations: 'The deductible amounts you can choose depend on the program and insurance company.'
                },
                FLOOD_PROGRAM: {
                    code: 'FLOOD_PROGRAM',
                    badge: '4',
                    name: 'NFIP vs. Private Flood',
                    tag: 'Program choice',
                    shortDesc: 'Flood insurance can come from the National Flood Insurance Program (NFIP) or a private insurer — they’re different products.',
                    whatItProtects: 'Both cover flood damage, but limits, waiting periods, exclusions, and underwriting differ between NFIP and private flood policies.',
                    whyItMatters: 'Private flood may offer limits above the NFIP amounts, but it isn’t available for every property, and a lender may or may not accept it.',
                    keyConsiderations: 'NFIP coverage is available to eligible properties in communities that participate in the program. Your specialist will confirm which options exist for your property.',
                    commonLimitations: 'Not every property qualifies for every program. Private flood eligibility and lender acceptance have to be confirmed, not assumed.'
                }
            },
            goodToKnow: [
                '<strong>There’s usually a 30-day wait:</strong> NFIP policies generally take effect 30 days after purchase, with some exceptions (for example, when buying a home). Don’t wait for a storm forecast to buy.',
                '<strong>Low risk isn’t no risk:</strong> FEMA notes that floods also cause losses outside high-risk zones. Your flood zone helps describe risk but isn’t the whole picture.',
                '<strong>Your lender may require it:</strong> Flood coverage can be required for federally backed mortgages on certain homes in high-risk flood areas.'
            ],
            sources: [
                ['FloodSmart: Buy a Flood Insurance Policy', 'https://www.floodsmart.gov/policy-terms'],
                ['NFIP: Types of Flood Insurance Coverage', 'https://agents.floodsmart.gov/topics/selling-flood-insurance/coverage'],
                ['FloodSmart: What Is My Flood Zone?', 'https://www.floodsmart.gov/flood-zones-and-maps/what-is-my-flood-zone'],
                ['FloodSmart: Basement Coverage Limitations', 'https://www.floodsmart.gov/recover/how-to-write-your-appeal/basement-coverage-limitations-decision-upheld']
            ]
        },

        jewelry: {
            title: 'Jewelry Coverage Options',
            intro: 'There’s more than one way to insure jewelry. These are the main options and the protections worth comparing.',
            cardTitle: 'name',
            order: ['JEWELRY_HOME', 'JEWELRY_SCHEDULED', 'JEWELRY_STANDALONE', 'JEWELRY_EVENTS', 'JEWELRY_VALUE'],
            items: {
                JEWELRY_HOME: {
                    code: 'JEWELRY_HOME',
                    badge: '1',
                    name: 'Under Your Homeowners Policy',
                    tag: 'Basic protection',
                    shortDesc: 'Jewelry is usually covered as personal property under a home policy, but with special limits.',
                    whatItProtects: 'Jewelry as part of your personal property (homeowners Coverage C), for the kinds of losses the policy covers.',
                    whyItMatters: 'You may already have some protection, but the limit for jewelry — especially for theft — is often far below what valuable pieces are worth.',
                    keyConsiderations: 'The jewelry limit depends on your insurance company and policy. Check your own policy instead of relying on a “typical” number.',
                    commonLimitations: 'Special theft and other sub-limits apply. Losing or misplacing an item may not be covered.'
                },
                JEWELRY_SCHEDULED: {
                    code: 'JEWELRY_SCHEDULED',
                    badge: '2',
                    name: 'Scheduled Coverage (Floater)',
                    tag: 'Added to a home policy',
                    shortDesc: 'Lists each piece and its value on your policy for more complete protection.',
                    whatItProtects: 'Each individually listed (“scheduled”) item, through a floater or personal-articles option added to your policy.',
                    whyItMatters: 'Scheduling can offer greater protection than the basic homeowners limit, depending on the policy form.',
                    keyConsiderations: 'You’ll usually describe each item and give its value. An appraisal may be required.',
                    commonLimitations: 'Covered events, deductibles, and documentation requirements vary by insurance company.'
                },
                JEWELRY_STANDALONE: {
                    code: 'JEWELRY_STANDALONE',
                    badge: '3',
                    name: 'Standalone Jewelry Policy',
                    tag: 'Separate policy',
                    shortDesc: 'A specialty policy just for jewelry, separate from homeowners insurance.',
                    whatItProtects: 'The jewelry items listed on the policy, under the specialty insurer’s terms.',
                    whyItMatters: 'A specialty policy may offer greater protection than a home policy, depending on its form.',
                    keyConsiderations: 'Expect to list each item with its value and documents such as an appraisal, receipt, or photos.',
                    commonLimitations: 'Terms vary widely between specialty insurers — compare covered events and deductibles before choosing.'
                },
                JEWELRY_EVENTS: {
                    code: 'JEWELRY_EVENTS',
                    badge: '4',
                    name: 'Covered Events',
                    tag: 'What to compare',
                    shortDesc: 'Theft, accidental loss, mysterious disappearance, damage, and worldwide coverage are the protections to look for.',
                    whatItProtects: 'Depending on the policy: theft, accidental loss, mysterious disappearance (the item is gone and you don’t know how), damage, and coverage while traveling.',
                    whyItMatters: 'Two policies with the same limit can protect very different situations.',
                    keyConsiderations: 'Only the protections a specific insurance company offers apply, and a deductible may apply.',
                    commonLimitations: 'Never assume lost or misplaced items are covered by every product — confirm it before you buy.'
                },
                JEWELRY_VALUE: {
                    code: 'JEWELRY_VALUE',
                    badge: '5',
                    name: 'Valuation & Appraisals',
                    tag: 'Documentation',
                    shortDesc: 'How each item’s insured value is set, and the documents that support it.',
                    whatItProtects: 'Not a coverage on its own. It sets the insured value of each item.',
                    whyItMatters: 'The value on record affects both what you pay and what you can recover after a loss.',
                    keyConsiderations: 'Helpful documents include an appraisal (with its value and date), the purchase receipt, a certificate or serial number, and photos.',
                    commonLimitations: 'High-value items, items without a valuation, or pieces whose antique/collectible status is uncertain may need specialist review.'
                }
            },
            goodToKnow: [
                '<strong>Check your home policy first:</strong> It may already cover some jewelry, but likely with a special limit for theft. Your specialist can tell you what that limit is.',
                '<strong>Keep your paperwork handy:</strong> An appraisal, receipt, and photos make it easier to schedule an item, and an appraisal may be required.'
            ],
            sources: [
                ['Insurance Information Institute: Special Coverage for Jewelry and Valuables', 'https://www.iii.org/article/do-i-need-special-coverage-for-jewelry-and-other-valuables']
            ]
        },

        auto: {
            title: 'Auto Coverage Components',
            intro: 'An auto policy is built from several coverages. Some are required by your state; others are optional.',
            cardTitle: 'name',
            order: ['AUTO_LIABILITY', 'AUTO_COLLISION', 'AUTO_COMPREHENSIVE', 'AUTO_UMUIM', 'AUTO_MEDICAL', 'AUTO_ADDONS'],
            items: {
                AUTO_LIABILITY: {
                    code: 'AUTO_LIABILITY',
                    badge: '1',
                    name: 'Liability (Bodily Injury & Property Damage)',
                    tag: 'State minimums apply',
                    shortDesc: 'Pays for injuries and property damage you cause to others in an accident.',
                    whatItProtects: 'Other people — their medical costs (bodily injury) and their vehicle or property (property damage) — when you’re responsible for an accident.',
                    whyItMatters: 'Accident costs can be large, and liability keeps you from paying them yourself. States set minimum amounts drivers must carry.',
                    keyConsiderations: 'Injury limits are shown per person and per accident, plus a separate property damage limit. You can choose limits above your state’s minimum.',
                    commonLimitations: 'Doesn’t pay to repair your own vehicle or for your own injuries.'
                },
                AUTO_COLLISION: {
                    code: 'AUTO_COLLISION',
                    badge: '2',
                    name: 'Collision',
                    tag: 'Often required by lenders',
                    shortDesc: 'Pays to repair or replace your own vehicle after a collision.',
                    whatItProtects: 'Your own vehicle when it’s damaged in a collision with another vehicle or an object.',
                    whyItMatters: 'Without it, repairing your own car after an accident you caused is usually your cost.',
                    keyConsiderations: 'Has a deductible you choose. If your vehicle is financed or leased, the lender or leasing company often requires it.',
                    commonLimitations: 'Doesn’t cover damage from things other than collisions — that’s comprehensive coverage.'
                },
                AUTO_COMPREHENSIVE: {
                    code: 'AUTO_COMPREHENSIVE',
                    badge: '3',
                    name: 'Comprehensive',
                    tag: 'Often required by lenders',
                    shortDesc: 'Covers damage to your vehicle from events other than collisions, such as theft, fire, or weather.',
                    whatItProtects: 'Your own vehicle against non-collision losses such as theft, fire, falling objects, storms, or hitting an animal.',
                    whyItMatters: 'Protects against losses that careful driving can’t prevent.',
                    keyConsiderations: 'Has its own deductible. Usually bought together with collision, and lenders often require both.',
                    commonLimitations: 'Doesn’t cover collision damage or normal wear and tear.'
                },
                AUTO_UMUIM: {
                    code: 'AUTO_UMUIM',
                    badge: '4',
                    name: 'Uninsured / Underinsured Motorist',
                    tag: 'Optional or state-required',
                    shortDesc: 'Protects you if you’re hit by a driver who has no insurance or not enough insurance.',
                    whatItProtects: 'You and your passengers when the at-fault driver can’t fully pay for the harm they caused.',
                    whyItMatters: 'Not every driver carries enough insurance to cover a serious accident.',
                    keyConsiderations: 'Some states require it, or require it to be offered. The rules for choosing or declining it vary by state.',
                    commonLimitations: 'Exactly what it covers, and its limits, depend on your state and policy.'
                },
                AUTO_MEDICAL: {
                    code: 'AUTO_MEDICAL',
                    badge: '5',
                    name: 'Medical Payments / Personal Injury Protection (PIP)',
                    tag: 'Depends on your state',
                    shortDesc: 'Helps pay medical costs for you and your passengers after an accident.',
                    whatItProtects: 'Medical expenses for you and your passengers, often regardless of who was at fault. Depending on the state, PIP can also cover other costs such as lost wages.',
                    whyItMatters: 'Helps pay medical bills quickly without waiting to settle who caused the accident.',
                    keyConsiderations: 'Some states require PIP; in others, medical payments or PIP coverage is optional.',
                    commonLimitations: 'Which of these is available, and its limits, depend on your state.'
                },
                AUTO_ADDONS: {
                    code: 'AUTO_ADDONS',
                    badge: '6',
                    name: 'Rental, Towing & Roadside',
                    tag: 'Optional add-ons',
                    shortDesc: 'Extras such as rental car reimbursement, towing, and roadside assistance.',
                    whatItProtects: 'Help when your vehicle can’t be driven: a rental car while yours is repaired after a covered claim, or towing and roadside help.',
                    whyItMatters: 'Being without a car after an accident can be costly and disruptive.',
                    keyConsiderations: 'Only available where the insurance company offers them.',
                    commonLimitations: 'Rental reimbursement usually has daily and total limits and only applies after a covered loss.'
                }
            },
            goodToKnow: [
                '<strong>“Full coverage” isn’t a policy name:</strong> People often use it to mean liability plus collision and comprehensive, but there’s no standard definition — compare the actual coverages.',
                '<strong>Rules vary by state:</strong> Each state sets its own minimum liability amounts and PIP / uninsured-motorist rules. Your specialist will confirm what’s required where your vehicle is kept.'
            ],
            sources: [
                ['NAIC: Auto Insurance', 'https://content.naic.org/insurance-topics/auto-insurance'],
                ['NAIC: What Does Auto Insurance Cover?', 'https://content.naic.org/article/what-you-should-know-about-auto-insurance-coverage']
            ]
        }
    };

    // The application form's homeowners checkboxes (Coverage A-F) use the homeowners list
    var COVERAGE_ORDER = LINE_COVERAGES.homeowners.order;
    var COVERAGE_DATA = LINE_COVERAGES.homeowners.items;

    var COMPARE_FIELDS = [
        ['whatItProtects', 'What It Protects'],
        ['whyItMatters', 'Why It Matters'],
        ['keyConsiderations', 'Key Considerations'],
        ['commonLimitations', 'Common Limitations']
    ];

    var FUTURE_FEATURE_COPY = {
        'AI Quote Assistant': 'In the full product, this would open a conversational assistant that gathers the details needed for your state and coverage, and escalates to a human specialist when the situation is too complex. Not implemented in this prototype.',
        'Talk to an Agent': 'In the full product, this would connect you with a Valent Partners specialist, carrying over the context you’ve already provided. Not implemented in this prototype.'
    };

    // ---------------------------------------------------------------
    // APPLICATION STATE
    // ---------------------------------------------------------------

    var state = {
        path: null,              // 'apply' or 'explore', chosen on the landing screen
        selectedTypes: [],       // e.g. ['homeowners', 'auto']; more than one = a bundle (apply path only)
        selectedState: DEFAULT_STATE,
        exploreLine: 'homeowners', // which LINE_COVERAGES entry the explorer is showing
        selectedCoverages: [],     // codes from that line picked for comparison
        modalCoverageCode: null
    };

    // Front-end insurance type keys -> insurance_lines.line_code in the database.
    // Also the display order for bundles.
    var LINE_CODES = { homeowners: 'HOME', flood: 'FLOOD', jewelry: 'JEWELRY', auto: 'AUTO' };
    var TYPE_ORDER = Object.keys(LINE_CODES);
    var APP_TOTAL_STEPS = 5;

    // Repeatable items on the Details step: card title prefix and the most a customer can add
    var ITEM_TYPES = {
        vehicle: { label: 'Vehicle', max: 10 },
        driver: { label: 'Driver', max: 10 },
        jewelry: { label: 'Item', max: 20 }
    };
    var nextItemUid = 1; // unique id per card, so a driver's vehicle choice survives renumbering

    // The application in progress. applicationId is null until step 1 is saved.
    var app = {
        applicationId: null,
        lines: [],               // insurance types on this application
        stateCode: null,
        step: 1,
        busy: false,
        uploadedPolicyName: null // current-policy file saved on the server, if any
    };

    // ---------------------------------------------------------------
    // DOM REFERENCES (populated on DOMContentLoaded)
    // ---------------------------------------------------------------
    var el = {};

    document.addEventListener('DOMContentLoaded', function () {
        cacheDom();
        populateStateSelect();
        bindEvents();
        renderExplorer();
        updateInsuranceCardSelection();
        updateExploreButtonState();
    });

    function cacheDom() {
        el.stateSelect = document.getElementById('stateSelect');
        el.exploreCoverageBtn = document.getElementById('exploreCoverageBtn');
        el.selectHint = document.getElementById('selectHint');
        el.insuranceTypeCards = document.querySelectorAll('.insurance-type-card');

        el.startApplicationBtn = document.getElementById('startApplicationBtn');
        el.startExploreBtn = document.getElementById('startExploreBtn');
        el.selectBackBtn = document.getElementById('selectBackBtn');
        el.selectSubtitle = document.getElementById('selectSubtitle');
        el.bundleNote = document.getElementById('bundleNote');

        el.screenStart = document.getElementById('screen-start');
        el.screenSelect = document.getElementById('screen-select');
        el.screenExplorer = document.getElementById('screen-explorer');
        el.screenCompare = document.getElementById('screen-compare');

        el.explorerTitle = document.getElementById('explorerTitle');
        el.explorerIntro = document.getElementById('explorerIntro');
        el.explorerNotes = document.getElementById('explorerNotes');
        el.explorerSources = document.getElementById('explorerSources');

        el.explorerBackBtn = document.getElementById('explorerBackBtn');
        el.stateMockBanner = document.getElementById('stateMockBanner');
        el.stateCompareToggle = document.getElementById('stateCompareToggle');
        el.stateComparePanel = document.getElementById('stateComparePanel');
        el.stateCompareIntro = document.getElementById('stateCompareIntro');
        el.stateCompareTable = document.getElementById('stateCompareTable');
        el.stateCompareSources = document.getElementById('stateCompareSources');
        el.coverageCardGrid = document.getElementById('coverageCardGrid');
        el.compareCount = document.getElementById('compareCount');
        el.goToCompareBtn = document.getElementById('goToCompareBtn');

        el.compareBackBtn = document.getElementById('compareBackBtn');
        el.compareTable = document.getElementById('compareTable');
        el.compareApplyBtn = document.getElementById('compareApplyBtn');

        el.startOverBtn = document.getElementById('startOverBtn');
        el.brandHome = document.getElementById('brandHome');

        el.coverageDetailModalLabel = document.getElementById('coverageDetailModalLabel');
        el.coverageDetailModalBody = document.getElementById('coverageDetailModalBody');
        el.modalAddToCompareBtn = document.getElementById('modalAddToCompareBtn');
        el.coverageDetailModalEl = document.getElementById('coverageDetailModal');

        el.futureFeatureModalBody = document.getElementById('futureFeatureModalBody');
        el.futureFeatureModalEl = document.getElementById('futureFeatureModal');

        el.stepIndicatorWrap = document.getElementById('stepIndicatorWrap');
        el.stepIndicator = document.getElementById('stepIndicator');

        el.screenApply = document.getElementById('screen-apply');
        el.appStepItems = document.querySelectorAll('#appStepIndicator .step-item');
        el.appTitle = document.getElementById('appTitle');
        el.appSubtitle = document.getElementById('appSubtitle');
        el.appIdBadge = document.getElementById('appIdBadge');
        el.appError = document.getElementById('appError');
        el.appSteps = document.querySelectorAll('.app-step');
        el.appLineFieldsets = el.screenApply.querySelectorAll('fieldset[data-lines]');
        el.startDate = document.getElementById('startDate');
        el.switchingRadios = document.querySelectorAll('input[name="switching_carrier"]');
        el.currentPolicyFields = document.getElementById('currentPolicyFields');
        el.currentPolicyEnd = document.getElementById('currentPolicyEnd');
        el.currentPolicyFile = document.getElementById('currentPolicyFile');
        el.currentPolicyFileError = document.getElementById('currentPolicyFileError');
        el.currentPolicyFileStatus = document.getElementById('currentPolicyFileStatus');
        el.yearBuilt = document.getElementById('yearBuilt');
        el.zip = document.getElementById('zip');
        el.jewelryTotal = document.getElementById('jewelryTotal');
        el.floodWaitNote = document.getElementById('floodWaitNote');
        el.appStepIndicator = document.getElementById('appStepIndicator');
        el.appBundleNote = document.getElementById('appBundleNote');
        el.appBundleLines = document.getElementById('appBundleLines');
        el.appReview = document.getElementById('appReview');
        el.quoteResult = document.getElementById('quoteResult');
        el.appNav = document.getElementById('appNav');
        el.appBackBtn = document.getElementById('appBackBtn');
        el.appNextBtn = document.getElementById('appNextBtn');
        el.appDone = document.getElementById('appDone');
        el.appDoneId = document.getElementById('appDoneId');
        el.appDoneEmail = document.getElementById('appDoneEmail');
        el.appDoneHomeBtn = document.getElementById('appDoneHomeBtn');
    }

    // ---------------------------------------------------------------
    // SETUP
    // ---------------------------------------------------------------

    function populateStateSelect() {
        US_STATES.forEach(function (pair) {
            var opt = document.createElement('option');
            opt.value = pair[0];
            opt.textContent = pair[1];
            if (pair[0] === DEFAULT_STATE) opt.selected = true;
            el.stateSelect.appendChild(opt);
        });
    }

    function bindEvents() {
        el.startApplicationBtn.addEventListener('click', function () { choosePath('apply'); });
        el.startExploreBtn.addEventListener('click', function () { choosePath('explore'); });
        el.selectBackBtn.addEventListener('click', function () { goToScreen('start'); });

        el.appBackBtn.addEventListener('click', onAppBack);
        el.appNextBtn.addEventListener('click', onAppNext);
        el.appDoneHomeBtn.addEventListener('click', resetPrototype);

        // Clicking a finished step number jumps back to it
        onStepClick(el.stepIndicatorWrap, function (step) { goToScreen(PATH_STEPS[state.path][step - 1].screen); });
        onStepClick(el.appStepIndicator, function (step) {
            if (app.busy) return;
            hideAppError();
            if (step === 0) goToScreen('select');
            else showAppStep(step);
        });

        // Bundles with Auto: default each vehicle's ZIP to the property ZIP (still editable)
        el.zip.addEventListener('input', function () {
            el.screenApply.querySelectorAll('.garaging-zip').forEach(prefillGaragingZip);
        });

        bindRepeatableItems();
        bindCurrentPolicy();

        el.insuranceTypeCards.forEach(function (card) {
            card.addEventListener('click', function () {
                toggleType(card.getAttribute('data-type'));
            });
        });

        el.stateSelect.addEventListener('change', function () {
            state.selectedState = el.stateSelect.value;
            renderStateMockBanner();
        });

        el.exploreCoverageBtn.addEventListener('click', onContinueClick);

        el.explorerBackBtn.addEventListener('click', function () { goToScreen('select'); });
        el.stateCompareToggle.addEventListener('click', function () {
            setStateCompareOpen(el.stateComparePanel.classList.contains('d-none'));
        });
        el.goToCompareBtn.addEventListener('click', function () {
            if (state.selectedCoverages.length === 0) return;
            renderCompareTable();
            goToScreen('compare');
        });

        el.compareBackBtn.addEventListener('click', function () { goToScreen('explorer'); });
        el.compareApplyBtn.addEventListener('click', startApplication);

        el.startOverBtn.addEventListener('click', resetPrototype);
        el.brandHome.addEventListener('click', function (e) {
            e.preventDefault();
            resetPrototype();
        });

        el.modalAddToCompareBtn.addEventListener('click', function () {
            if (state.modalCoverageCode) {
                toggleCoverageSelection(state.modalCoverageCode, true);
            }
        });

        document.querySelectorAll('.future-cta').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var feature = btn.getAttribute('data-feature');
                el.futureFeatureModalBody.innerHTML =
                    '<span class="badge mock-badge mb-2 d-inline-block">FUTURE PROTOTYPE FEATURE</span>' +
                    '<p class="mb-0">' + FUTURE_FEATURE_COPY[feature] + '</p>';
                var modal = bootstrap.Modal.getOrCreateInstance(el.futureFeatureModalEl);
                modal.show();
            });
        });
    }

    // ---------------------------------------------------------------
    // SCREEN 1: GET STARTED (landing)
    // ---------------------------------------------------------------

    function choosePath(path) {
        state.path = path;
        el.exploreCoverageBtn.textContent = path === 'apply' ? 'Start Application' : 'Explore Coverage';
        el.selectSubtitle.textContent = path === 'apply'
            ? 'Pick one or more insurance types and your state. Choosing several bundles them into one application.'
            : 'Select an insurance line and your state to continue.';
        // Exploring is one line at a time, so drop any extra lines picked for a bundle
        if (path === 'explore') state.selectedTypes = state.selectedTypes.slice(0, 1);
        updateInsuranceCardSelection();
        updateExploreButtonState();
        goToScreen('select');
    }

    // Opens the application form for the selected insurance type and state.
    // Re-entering with the same type/state continues the same application.
    function startApplication() {
        var sameApplication = app.applicationId &&
            app.lines.join() === state.selectedTypes.join() && app.stateCode === state.selectedState;

        if (!sameApplication) {
            app.applicationId = null;
            app.lines = state.selectedTypes.slice();
            app.stateCode = state.selectedState;
            app.step = 1;
            el.appSteps.forEach(function (form) {
                form.reset();
                form.classList.remove('was-validated');
            });
            resetRepeatableItems();
            app.uploadedPolicyName = null;
            updateCurrentPolicyFields();
            showUploadedPolicy();
        }

        var isBundle = app.lines.length > 1;
        el.appTitle.textContent = typesLabel(app.lines) + (isBundle ? ' Bundle Application' : ' Insurance Application');
        el.appSubtitle.textContent = 'Coverage in ' + stateName(app.stateCode) + '. Your progress is saved after each step.';
        el.appBundleNote.classList.toggle('d-none', !isBundle);
        el.appBundleLines.textContent = typesLabel(app.lines);
        el.startDate.min = todayIso();
        el.yearBuilt.max = new Date().getFullYear();
        el.floodWaitNote.classList.toggle('d-none', !hasLine('flood'));

        // Show only the questions for the selected insurance lines (shared questions,
        // like the property address for Homeowners + Flood, appear once).
        // data-hide-with hides a question when another line in the bundle makes it
        // unnecessary. Disabled fields are skipped by validation and not sent to the API.
        el.appLineFieldsets.forEach(function (fieldset) {
            var hideWith = (fieldset.getAttribute('data-hide-with') || '').split(' ');
            var applies = fieldset.getAttribute('data-lines').split(' ').some(hasLine) &&
                !hideWith.some(hasLine);
            fieldset.disabled = !applies;
            fieldset.classList.toggle('d-none', !applies);
        });

        el.appDone.classList.add('d-none');
        el.appNav.classList.remove('d-none');
        hideAppError();
        showAppStep(app.step);
        goToScreen('apply');
    }

    // ---------------------------------------------------------------
    // SCREEN 2: SELECTION
    // ---------------------------------------------------------------

    // Applying: cards toggle on/off so several can be bundled.
    // Exploring: one card at a time.
    function toggleType(type) {
        if (state.path !== 'apply') {
            state.selectedTypes = [type];
        } else if (state.selectedTypes.indexOf(type) === -1) {
            state.selectedTypes = TYPE_ORDER.filter(function (t) {
                return t === type || state.selectedTypes.indexOf(t) !== -1;
            });
        } else {
            state.selectedTypes = state.selectedTypes.filter(function (t) { return t !== type; });
        }
        updateInsuranceCardSelection();
        updateExploreButtonState();
    }

    function updateInsuranceCardSelection() {
        el.insuranceTypeCards.forEach(function (card) {
            var selected = state.selectedTypes.indexOf(card.getAttribute('data-type')) !== -1;
            card.classList.toggle('selected', selected);
            card.setAttribute('aria-pressed', selected);
        });
    }

    function updateExploreButtonState() {
        var ready = state.selectedTypes.length > 0;
        var isBundle = state.selectedTypes.length > 1;
        el.exploreCoverageBtn.disabled = !ready;
        var action = state.path === 'apply' ? 'apply for ' : 'explore ';
        el.selectHint.textContent = ready
            ? 'Ready to ' + action + typesLabel(state.selectedTypes) + ' coverage in ' + stateName(state.selectedState) + '.'
            : 'Select an insurance type above to continue.';

        el.bundleNote.classList.toggle('d-none', !isBundle);
        var floodNote = state.selectedTypes.indexOf('flood') !== -1
            ? ' Flood policies through the NFIP don&rsquo;t automatically count toward multi-policy discounts.'
            : '';
        el.bundleNote.innerHTML = isBundle
            ? '<strong>Bundle: ' + typesLabel(state.selectedTypes) + '.</strong> One application covers all of them, ' +
              'and bundling may qualify you for a multi-policy discount &mdash; your specialist will confirm.' + floodNote
            : '';
    }

    function onContinueClick() {
        if (state.selectedTypes.length === 0) return;
        var type = state.selectedTypes[0];

        if (state.path === 'apply') {
            startApplication();
            return;
        }

        // Switching lines clears the comparison, since codes from different lines can't be compared
        if (state.exploreLine !== type) {
            state.exploreLine = type;
            state.selectedCoverages = [];
        }
        renderExplorer();
        goToScreen('explorer');
    }

    // ---------------------------------------------------------------
    // SCREEN 3: EXPLORER
    // ---------------------------------------------------------------

    function renderStateMockBanner() {
        el.stateMockBanner.innerHTML =
            '<strong>' + stateName(state.selectedState) + ':</strong> requirements for this coverage differ by state. ' +
            'See how ' + stateName(state.selectedState) + ' compares with the other states we cover.';
    }

    function setStateCompareOpen(open) {
        el.stateComparePanel.classList.toggle('d-none', !open);
        el.stateCompareToggle.setAttribute('aria-expanded', String(open));
        el.stateCompareToggle.textContent = open ? 'Hide State Comparison' : 'Compare Across States';
    }

    // Side-by-side table for the line being explored. The customer's state is the first
    // column; cells cite sources by number, listed under the table.
    function renderStateComparison() {
        var data = STATE_COMPARISON[state.exploreLine];
        var codes = [state.selectedState].concat(US_STATES.map(function (pair) { return pair[0]; })
            .filter(function (code) { return code !== state.selectedState; }));
        var sourceKeys = [];

        function cellHtml(cell) {
            var html = cell.text;
            if (cell.src) {
                if (sourceKeys.indexOf(cell.src) === -1) sourceKeys.push(cell.src);
                html += ' <sup><a href="#stateCompareSources" class="text-decoration-none">[' +
                    (sourceKeys.indexOf(cell.src) + 1) + ']</a></sup>';
            }
            if (cell.verify) html += '<div><span class="badge verify-badge mt-1">Needs verification</span></div>';
            return html;
        }

        el.stateCompareIntro.textContent = data.intro;
        el.stateCompareTable.querySelector('thead').innerHTML = '<tr><th style="width:22%">Topic</th>' +
            codes.map(function (code) {
                return '<th>' + stateName(code) +
                    (code === state.selectedState ? '<div class="small fw-normal">Your state</div>' : '') + '</th>';
            }).join('') + '</tr>';
        el.stateCompareTable.querySelector('tbody').innerHTML = data.rows.map(function (row) {
            var cells = row.all
                ? '<td colspan="' + codes.length + '" class="text-center">' + cellHtml(row.all) + '</td>'
                : codes.map(function (code) {
                    return '<td' + (code === state.selectedState ? ' class="your-state"' : '') + '>' + cellHtml(row[code]) + '</td>';
                }).join('');
            return '<tr><td class="field-label">' + row.topic + '</td>' + cells + '</tr>';
        }).join('');

        el.stateCompareSources.innerHTML =
            '<span class="badge mock-badge me-1">RESEARCH</span> General information, not legal advice or a quote. ' +
            'Rules change, so Valent Partners will confirm what applies to you.' +
            (sourceKeys.length === 0 ? '' : '<br>Sources: ' + sourceKeys.map(function (key, i) {
                var src = STATE_SOURCES[key];
                return '[' + (i + 1) + '] <a href="' + src[1] + '" target="_blank" rel="noopener">' + src[0] + '</a>';
            }).join(' · '));
    }

    // The coverage list for the line being explored, and one of its items
    function currentLine() {
        return LINE_COVERAGES[state.exploreLine];
    }

    function coverageItem(code) {
        return currentLine().items[code];
    }

    // Homeowners: "Coverage A" / "Dwelling". Other lines: the coverage name / its tag.
    function coverageHeading(c) {
        return currentLine().cardTitle === 'letter'
            ? { title: 'Coverage ' + c.code, sub: c.name }
            : { title: c.name, sub: c.tag };
    }

    function renderExplorer() {
        var line = currentLine();
        el.explorerTitle.textContent = line.title;
        el.explorerIntro.textContent = line.intro;
        el.explorerNotes.innerHTML = line.goodToKnow.map(function (note) {
            return '<div class="col-12 col-md-6"><div class="alert alert-warning mb-0 h-100">' + note + '</div></div>';
        }).join('');
        el.explorerSources.innerHTML = 'Sources: ' + line.sources.map(function (src) {
            return '<a href="' + src[1] + '" target="_blank" rel="noopener">' + src[0] + '</a>';
        }).join(' · ');
        renderStateMockBanner();
        renderStateComparison();
        renderCoverageCards();
        refreshCompareUI();
    }

    function renderCoverageCards() {
        var line = currentLine();
        var html = line.order.map(function (code) {
            var c = line.items[code];
            var heading = coverageHeading(c);
            return (
                '<div class="col-12 col-sm-6 col-lg-4">' +
                    '<div class="card coverage-card p-3" data-code="' + c.code + '">' +
                        '<div class="d-flex align-items-start gap-2 mb-2">' +
                            '<span class="coverage-letter">' + c.badge + '</span>' +
                            '<div>' +
                                '<h3 class="h6 mb-0">' + heading.title + '</h3>' +
                                '<div class="text-muted small">' + heading.sub + '</div>' +
                            '</div>' +
                        '</div>' +
                        '<p class="small mb-3">' + c.shortDesc + '</p>' +
                        '<div class="mt-auto d-flex gap-2">' +
                            '<button type="button" class="btn btn-sm valent-btn-outline flex-fill view-details-btn" data-code="' + c.code + '">Explain to Me</button>' +
                            '<button type="button" class="btn btn-sm valent-btn-primary flex-fill toggle-compare-btn" data-code="' + c.code + '">Add to Compare</button>' +
                        '</div>' +
                    '</div>' +
                '</div>'
            );
        }).join('');
        el.coverageCardGrid.innerHTML = html;

        el.coverageCardGrid.querySelectorAll('.view-details-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                openCoverageDetail(btn.getAttribute('data-code'));
            });
        });
        el.coverageCardGrid.querySelectorAll('.toggle-compare-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                toggleCoverageSelection(btn.getAttribute('data-code'));
            });
        });
    }

    function openCoverageDetail(code) {
        var c = coverageItem(code);
        var heading = coverageHeading(c);
        state.modalCoverageCode = code;
        el.coverageDetailModalLabel.textContent = heading.title + ' — ' + heading.sub;

        var alreadySelected = state.selectedCoverages.indexOf(code) !== -1;
        el.modalAddToCompareBtn.textContent = alreadySelected ? 'Added to Comparison ✓' : 'Add to Comparison';
        el.modalAddToCompareBtn.disabled = alreadySelected;

        el.coverageDetailModalBody.innerHTML = COMPARE_FIELDS.map(function (pair) {
            return '<h4 class="h6">' + pair[1] + '</h4><p class="mb-3">' + c[pair[0]] + '</p>';
        }).join('');

        var modal = bootstrap.Modal.getOrCreateInstance(el.coverageDetailModalEl);
        modal.show();
    }

    function toggleCoverageSelection(code, forceAdd) {
        var idx = state.selectedCoverages.indexOf(code);
        if (forceAdd && idx !== -1) {
            // already selected; nothing to do
        } else if (idx === -1) {
            state.selectedCoverages.push(code);
        } else if (!forceAdd) {
            state.selectedCoverages.splice(idx, 1);
        }
        refreshCompareUI();

        if (state.modalCoverageCode === code) {
            var stillSelected = state.selectedCoverages.indexOf(code) !== -1;
            el.modalAddToCompareBtn.textContent = stillSelected ? 'Added to Comparison ✓' : 'Add to Comparison';
            el.modalAddToCompareBtn.disabled = stillSelected;
        }
    }

    function refreshCompareUI() {
        var count = state.selectedCoverages.length;
        el.compareCount.textContent = count + ' coverage component' + (count === 1 ? '' : 's') + ' selected';
        el.goToCompareBtn.disabled = count === 0;

        el.coverageCardGrid.querySelectorAll('.coverage-card').forEach(function (card) {
            var code = card.getAttribute('data-code');
            var selected = state.selectedCoverages.indexOf(code) !== -1;
            card.classList.toggle('selected-for-compare', selected);
            var btn = card.querySelector('.toggle-compare-btn');
            btn.textContent = selected ? 'Remove from Compare' : 'Add to Compare';
            btn.classList.toggle('valent-btn-primary', !selected);
            btn.classList.toggle('valent-btn-outline', selected);
        });
    }

    // ---------------------------------------------------------------
    // SCREEN 4: COMPARE
    // ---------------------------------------------------------------

    function renderCompareTable() {
        // Same order as the cards on the explorer
        var codes = currentLine().order.filter(function (code) {
            return state.selectedCoverages.indexOf(code) !== -1;
        });
        var thead = el.compareTable.querySelector('thead');
        var tbody = el.compareTable.querySelector('tbody');

        thead.innerHTML = '<tr><th style="width:16%">Field</th>' + codes.map(function (code) {
            var heading = coverageHeading(coverageItem(code));
            return '<th>' + heading.title + '<div class="small fw-normal">' + heading.sub + '</div></th>';
        }).join('') + '</tr>';

        tbody.innerHTML = COMPARE_FIELDS.map(function (pair) {
            var row = '<tr><td class="field-label">' + pair[1] + '</td>';
            row += codes.map(function (code) {
                return '<td>' + coverageItem(code)[pair[0]] + '</td>';
            }).join('');
            row += '</tr>';
            return row;
        }).join('');
    }

    // ---------------------------------------------------------------
    // APPLICATION FORM (saved to the API after each step)
    // ---------------------------------------------------------------

    // ---------------------------------------------------------------
    // REPEATABLE ITEMS (vehicles, drivers, jewelry)
    // Each list (.repeat-list[data-item-type]) holds cards copied from
    // <template id="tpl-TYPE">. Card fields use data-field instead of name,
    // so collectAnswers() skips them and collectItems() sends them as lists.
    // ---------------------------------------------------------------

    function bindRepeatableItems() {
        el.screenApply.querySelectorAll('.repeat-add').forEach(function (btn) {
            btn.addEventListener('click', function () {
                addItem(btn.getAttribute('data-item-type'));
            });
        });

        // One listener per list handles every card's Remove button and field changes
        el.screenApply.querySelectorAll('.repeat-list').forEach(function (list) {
            list.addEventListener('click', function (event) {
                var removeBtn = event.target.closest('.repeat-remove');
                if (!removeBtn) return;
                removeBtn.closest('.repeat-item').remove();
                refreshItemList(list.getAttribute('data-item-type'));
            });
            list.addEventListener('input', function (event) {
                var type = list.getAttribute('data-item-type');
                if (type === 'vehicle') refreshDriverVehicleChoices();
                if (type === 'jewelry') updateJewelryTotal();
                if (event.target.classList.contains('garaging-zip')) {
                    event.target.dataset.prefilled = ''; // customer typed their own ZIP
                }
                if (event.target.getAttribute('data-field') === 'ownership') {
                    var lenderNote = event.target.closest('.repeat-item').querySelector('.lender-note');
                    lenderNote.classList.toggle('d-none', event.target.value !== 'financed' && event.target.value !== 'leased');
                }
            });
        });
    }

    function itemList(type) {
        return el.screenApply.querySelector('.repeat-list[data-item-type="' + type + '"]');
    }

    // Empties every list and starts each with one blank card
    function resetRepeatableItems() {
        Object.keys(ITEM_TYPES).forEach(function (type) {
            itemList(type).innerHTML = '';
            addItem(type);
        });
    }

    function addItem(type) {
        var list = itemList(type);
        if (list.children.length >= ITEM_TYPES[type].max) return;

        var card = document.getElementById('tpl-' + type).content.firstElementChild.cloneNode(true);
        var uid = nextItemUid++;
        card.setAttribute('data-uid', uid);

        // Give each field a unique id and connect its <label> to it
        card.querySelectorAll('[data-field]').forEach(function (field) {
            field.id = type + '-' + uid + '-' + field.getAttribute('data-field');
            var label = card.querySelector('label[data-for="' + field.getAttribute('data-field') + '"]');
            if (label) label.htmlFor = field.id;
        });

        var yearField = card.querySelector('[data-field="year"]');
        if (yearField) yearField.max = new Date().getFullYear() + 1;
        var appraisalDate = card.querySelector('.appraisal-date');
        if (appraisalDate) appraisalDate.max = todayIso();
        var relationship = card.querySelector('[data-field="relationship"]');
        if (relationship && list.children.length === 0) relationship.value = 'self';
        var zip = card.querySelector('.garaging-zip');
        if (zip) prefillGaragingZip(zip);

        list.appendChild(card);
        refreshItemList(type);
        if (list.children.length > 1) {
            var first = card.querySelector('[data-field]');
            if (first) first.focus();
        }
    }

    // Renumbers card titles, shows/hides Remove and Add buttons, and updates
    // anything that depends on the list (driver vehicle choices, jewelry total)
    function refreshItemList(type) {
        var list = itemList(type);
        var cards = list.querySelectorAll('.repeat-item');
        cards.forEach(function (card, i) {
            card.querySelector('.repeat-item-title').textContent = ITEM_TYPES[type].label + ' ' + (i + 1);
            card.querySelector('.repeat-remove').classList.toggle('d-none', cards.length === 1);
        });
        var addBtn = el.screenApply.querySelector('.repeat-add[data-item-type="' + type + '"]');
        addBtn.classList.toggle('d-none', cards.length >= ITEM_TYPES[type].max);

        if (type === 'vehicle' || type === 'driver') refreshDriverVehicleChoices();
        if (type === 'jewelry') updateJewelryTotal();
    }

    // Fills each driver's "Vehicle they drive most" list from the current vehicles.
    // Options use the vehicle card's uid, so removing Vehicle 1 never silently
    // reassigns a driver to the car that becomes the new Vehicle 1.
    function refreshDriverVehicleChoices() {
        var vehicles = Array.prototype.map.call(itemList('vehicle').querySelectorAll('.repeat-item'), function (card, i) {
            return { uid: card.getAttribute('data-uid'), text: 'Vehicle ' + (i + 1) + vehicleName(card) };
        });
        itemList('driver').querySelectorAll('.driver-vehicle').forEach(function (select) {
            var current = select.value;
            select.innerHTML = '<option value="">Choose...</option>';
            vehicles.forEach(function (v) {
                var opt = document.createElement('option');
                opt.value = v.uid;
                opt.textContent = v.text;
                select.appendChild(opt);
            });
            var stillExists = vehicles.some(function (v) { return v.uid === current; });
            // With only one vehicle there's nothing to choose
            select.value = stillExists ? current : (vehicles.length === 1 ? vehicles[0].uid : '');
        });
    }

    function vehicleName(card) {
        var parts = ['year', 'make', 'model'].map(function (f) {
            return card.querySelector('[data-field="' + f + '"]').value.trim();
        }).filter(Boolean);
        return parts.length ? ' (' + parts.join(' ') + ')' : '';
    }

    function updateJewelryTotal() {
        var total = 0;
        itemList('jewelry').querySelectorAll('.jewelry-value').forEach(function (input) {
            total += parseFloat(input.value) || 0;
        });
        el.jewelryTotal.textContent = total > 0 ? 'Total estimated value: ' + formatMoney(total) : '';
    }

    // Copies the property ZIP into a vehicle's ZIP unless the customer typed their own
    function prefillGaragingZip(input) {
        if (!input.value || input.value === input.dataset.prefilled) {
            input.value = el.zip.value;
            input.dataset.prefilled = el.zip.value;
        }
    }

    // Reads every enabled list in a step into { vehicle: [ {year, make, ...}, ... ], ... }.
    // A driver's primary_vehicle is sent as the vehicle's number (1, 2, ...).
    function collectItems(form) {
        var items = {};
        form.querySelectorAll('.repeat-list').forEach(function (list) {
            if (list.closest('fieldset:disabled')) return; // line not selected
            var type = list.getAttribute('data-item-type');
            var vehicleUids = Array.prototype.map.call(
                itemList('vehicle').querySelectorAll('.repeat-item'),
                function (card) { return card.getAttribute('data-uid'); });

            items[type] = Array.prototype.map.call(list.querySelectorAll('.repeat-item'), function (card) {
                var item = {};
                card.querySelectorAll('[data-field]').forEach(function (field) {
                    var key = field.getAttribute('data-field');
                    item[key] = key === 'primary_vehicle'
                        ? String(vehicleUids.indexOf(field.value) + 1)
                        : field.value.trim();
                });
                return item;
            });
        });
        return items;
    }

    // One-line summary of an item for the review list
    function describeItem(type, item) {
        // Display text for a dropdown value, e.g. 'financed' -> 'Financed (car loan)'
        function optionText(key) {
            var select = document.getElementById('tpl-' + type).content.querySelector('[data-field="' + key + '"]');
            var opt = Array.prototype.filter.call(select.options, function (o) { return o.value === item[key]; })[0];
            return opt ? opt.text : item[key];
        }
        if (type === 'vehicle') {
            return item.year + ' ' + item.make + ' ' + item.model + ' — ' + optionText('use') + ', ' +
                Number(item.annual_mileage).toLocaleString() + ' mi/yr, parked in ' + item.garaging_zip + ', ' + optionText('ownership');
        }
        if (type === 'driver') {
            return item.first_name + ' ' + item.last_name + ' (' + optionText('relationship') + '), licensed ' +
                item.years_licensed + (item.years_licensed === '1' ? ' year' : ' years') +
                ', mainly drives Vehicle ' + item.primary_vehicle;
        }
        return optionText('item_type') + ': ' + item.description + ' — ' + formatMoney(parseFloat(item.value)) +
            (item.appraised === 'yes' ? ', appraised' + (item.appraisal_date ? ' ' + item.appraisal_date : '') : ', not appraised');
    }

    function formatMoney(amount) {
        return '$' + amount.toLocaleString(undefined, { maximumFractionDigits: 2 });
    }

    function showAppStep(step) {
        app.step = step;
        el.appSteps.forEach(function (form) {
            form.classList.toggle('d-none', parseInt(form.getAttribute('data-step'), 10) !== step);
        });
        el.appStepItems.forEach(function (item) {
            var n = parseInt(item.getAttribute('data-step'), 10);
            item.classList.toggle('active', n === step);
            item.classList.toggle('completed', n < step);
            setStepClickable(item, n < step);
        });
        el.appIdBadge.textContent = app.applicationId ? 'APPLICATION #' + app.applicationId : '';
        el.appIdBadge.classList.toggle('d-none', !app.applicationId);
        el.appBackBtn.textContent = step === 1 ? '← Change Selection' : '← Back';
        updateNextButtonText();
        if (step === 4) {
            renderReview();
            loadQuote();
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function currentStepForm() {
        return el.screenApply.querySelector('.app-step[data-step="' + app.step + '"]');
    }

    function onAppBack() {
        hideAppError();
        if (app.step === 1) {
            goToScreen('select');
        } else {
            showAppStep(app.step - 1);
        }
    }

    function onAppNext() {
        if (app.busy) return;
        hideAppError();

        var form = currentStepForm();
        form.classList.add('was-validated');
        if (!form.checkValidity()) return;

        setAppBusy(true);
        var request;
        if (app.step === APP_TOTAL_STEPS) {
            request = submitApplication();
        } else {
            request = ensureApplicationCreated().then(function () {
                return apiRequest('PUT', '/applications/' + app.applicationId + '/steps/' + app.step,
                    { answers: collectAnswers(form), items: collectItems(form) });
            }).then(function () {
                // The file needs the application id, so it's sent after step 1 is saved
                if (app.step === 1) return syncCurrentPolicyFile();
            }).then(function () {
                showAppStep(app.step + 1);
            });
        }

        request.catch(showAppError).then(function () { setAppBusy(false); });
    }

    // The application row is created in the database when step 1 is first saved
    function ensureApplicationCreated() {
        if (app.applicationId) return Promise.resolve();
        return apiRequest('POST', '/applications', {
            lineCodes: app.lines.map(function (type) { return LINE_CODES[type]; }),
            stateCode: app.stateCode
        }).then(function (result) {
            app.applicationId = result.applicationId;
        });
    }

    function submitApplication() {
        return apiRequest('POST', '/applications/' + app.applicationId + '/submit').then(function () {
            el.appSteps.forEach(function (form) { form.classList.add('d-none'); });
            el.appStepItems.forEach(function (item) {
                item.classList.remove('active');
                item.classList.add('completed');
                setStepClickable(item, false); // submitted applications can't be edited
            });
            el.appNav.classList.add('d-none');
            el.appDoneId.textContent = '#' + app.applicationId;
            el.appDoneEmail.textContent = document.getElementById('email').value;
            el.appDone.classList.remove('d-none');
            app.applicationId = null; // the next application starts fresh
            app.lines = [];
        });
    }

    // ---------------------------------------------------------------
    // CURRENT POLICY (step 1: "Are you switching from another insurance company?")
    // The declarations page is optional and checked again by the API
    // (type by its first bytes, 5 MB limit).
    // ---------------------------------------------------------------

    var POLICY_FILE_MAX_BYTES = 5 * 1024 * 1024;
    var POLICY_FILE_TYPES = /\.(pdf|jpe?g|png)$/i;

    function bindCurrentPolicy() {
        el.switchingRadios.forEach(function (radio) {
            radio.addEventListener('change', updateCurrentPolicyFields);
        });

        // Start the new coverage when the old one ends, unless the customer picked their own date
        el.currentPolicyEnd.addEventListener('change', function () {
            var end = el.currentPolicyEnd.value;
            if (end && end >= todayIso() && (!el.startDate.value || el.startDate.dataset.autofilled)) {
                el.startDate.value = end;
                el.startDate.dataset.autofilled = 'true';
            }
        });
        el.startDate.addEventListener('input', function () {
            delete el.startDate.dataset.autofilled;
        });

        el.currentPolicyFile.addEventListener('change', function () {
            var file = el.currentPolicyFile.files[0];
            var problem = '';
            if (file && !POLICY_FILE_TYPES.test(file.name)) problem = 'Choose a PDF, JPG, or PNG file.';
            else if (file && file.size > POLICY_FILE_MAX_BYTES) problem = 'That file is larger than 5 MB.';
            el.currentPolicyFile.setCustomValidity(problem);
            el.currentPolicyFileError.textContent = problem;
        });
    }

    function isSwitching() {
        var checked = document.querySelector('input[name="switching_carrier"]:checked');
        return checked !== null && checked.value === 'yes';
    }

    function updateCurrentPolicyFields() {
        var show = isSwitching();
        el.currentPolicyFields.disabled = !show;
        el.currentPolicyFields.classList.toggle('d-none', !show);
    }

    function showUploadedPolicy() {
        el.currentPolicyFileStatus.classList.toggle('d-none', !app.uploadedPolicyName);
        el.currentPolicyFileStatus.textContent = app.uploadedPolicyName
            ? 'Uploaded: ' + app.uploadedPolicyName + ' ✓ — choose another file to replace it.'
            : '';
    }

    // After step 1 is saved: upload a newly chosen file, or remove the saved one if the
    // customer changed their answer to "not switching"
    function syncCurrentPolicyFile() {
        var path = '/applications/' + app.applicationId + '/documents/current-policy';
        var file = el.currentPolicyFile.files[0];

        if (isSwitching() && file) {
            var data = new FormData();
            data.append('file', file);
            return apiRequest('POST', path, data).then(function (result) {
                app.uploadedPolicyName = result.fileName;
                el.currentPolicyFile.value = '';
                showUploadedPolicy();
            });
        }
        if (!isSwitching() && app.uploadedPolicyName) {
            return apiRequest('DELETE', path).then(function () {
                app.uploadedPolicyName = null;
                showUploadedPolicy();
            });
        }
        return Promise.resolve();
    }

    // Reads every enabled field in a step into { name: value }.
    // Checkbox groups become a comma-separated list, e.g. "A,C,E".
    function collectAnswers(form) {
        var answers = {};
        form.querySelectorAll('input[name], select[name], textarea[name]').forEach(function (input) {
            if (input.matches(':disabled')) return; // also true inside a disabled <fieldset>
            if (input.type === 'checkbox') {
                var list = answers[input.name] ? answers[input.name].split(',') : [];
                if (input.checked) list.push(input.value);
                answers[input.name] = list.join(',');
            } else if (input.type === 'radio') {
                if (input.checked) answers[input.name] = input.value;
            } else {
                answers[input.name] = input.value.trim();
            }
        });
        return answers;
    }

    // Builds the "Review your answers" list on the Quote step from steps 1-3
    function renderReview() {
        el.appReview.innerHTML = '';
        addReviewRow('Insurance', typesLabel(app.lines) + ' in ' + stateName(app.stateCode));

        [1, 2, 3].forEach(function (step) {
            var form = el.screenApply.querySelector('.app-step[data-step="' + step + '"]');
            var answers = collectAnswers(form);
            Object.keys(answers).forEach(function (name) {
                var value = answers[name];
                var field = form.querySelector('[name="' + name + '"]');
                if (field.tagName === 'SELECT') {
                    value = field.options[field.selectedIndex].text;
                } else if (field.type === 'radio') {
                    var choice = form.querySelector('[name="' + name + '"]:checked');
                    var choiceLabel = choice && form.querySelector('label[for="' + choice.id + '"]');
                    // "Liability only — pays for..." -> "Liability only"
                    value = choiceLabel ? choiceLabel.textContent.split('—')[0].trim() : capitalize(value);
                } else if (/_coverage$/.test(name) && value !== '') {
                    value = formatMoney(parseFloat(value));
                }
                addReviewRow(fieldLabel(form, field), value || '—');
            });

            var items = collectItems(form);
            Object.keys(items).forEach(function (type) {
                items[type].forEach(function (item, i) {
                    addReviewRow(ITEM_TYPES[type].label + ' ' + (i + 1), describeItem(type, item));
                });
            });
        });

        if (isSwitching()) addReviewRow('Declarations page', app.uploadedPolicyName || 'Not uploaded');
    }

    // ---------------------------------------------------------------
    // QUOTE STEP: demo price estimate from the API
    // ---------------------------------------------------------------

    var QUOTE_LINE_NAMES = { HOME: 'Homeowners', FLOOD: 'Flood', JEWELRY: 'Jewelry', AUTO: 'Auto' };

    // Steps 1-3 are already saved when the customer reaches step 4, so the API
    // can estimate from what's in the database (and saves the estimate for the agent)
    function loadQuote() {
        var id = app.applicationId;
        el.quoteResult.innerHTML = '<p class="text-muted small">Calculating your estimate…</p>';
        apiRequest('POST', '/applications/' + id + '/quote').then(function (quote) {
            if (app.applicationId === id && app.step === 4) renderQuote(quote);
        }).catch(function (err) {
            el.quoteResult.innerHTML = '';
            el.quoteResult.appendChild(makeEl('div', 'alert alert-warning small',
                'We couldn\'t calculate an estimate right now (' + err.message + ') You can still submit; ' +
                'your specialist will follow up with a quote.'));
        });
    }

    // Built with textContent (makeEl) so nothing from the server is treated as HTML
    function renderQuote(quote) {
        var card = makeEl('div', 'quote-card mb-4');
        card.appendChild(makeEl('span', 'badge mock-badge mb-2', 'DEMO ESTIMATE — NOT A REAL QUOTE'));

        var headline = makeEl('div', 'quote-headline');
        if (quote.status === 'DEMO_ESTIMATE') {
            headline.appendChild(makeEl('div', 'quote-label', 'Estimated yearly price'));
            headline.appendChild(makeEl('div', 'quote-total', moneyRange(quote.totalLow, quote.totalHigh)));
            headline.appendChild(makeEl('div', 'quote-sub', 'About ' + moneyRange(quote.totalLow / 12, quote.totalHigh / 12) + ' per month'));
        } else if (quote.status === 'INCOMPLETE') {
            headline.appendChild(makeEl('div', 'quote-label', 'We need a little more information'));
            headline.appendChild(makeEl('div', 'quote-sub', 'Add the details below to see your estimate.'));
        } else if (quote.lines.every(function (line) { return line.status === 'REFERRED'; })) {
            headline.appendChild(makeEl('div', 'quote-label', 'A specialist will price this application'));
            headline.appendChild(makeEl('div', 'quote-sub', 'We can\'t show an online estimate for this one. The reason is below.'));
        } else {
            headline.appendChild(makeEl('div', 'quote-label', 'A specialist will price part of this application'));
            headline.appendChild(makeEl('div', 'quote-sub', 'We can\'t show a total yet. Estimates for the other lines are below.'));
        }
        card.appendChild(headline);

        quote.lines.forEach(function (line) {
            card.appendChild(renderQuoteLine(line));
        });

        var notes = makeEl('ul', 'small text-muted mb-2 ps-3');
        quote.notes.forEach(function (note) { notes.appendChild(makeEl('li', '', note)); });
        card.appendChild(notes);

        card.appendChild(makeEl('p', 'small mb-0 quote-disclaimer',
            'This is a rough range based on national averages, not an offer of insurance, and it doesn\'t ' +
            'include your state, discounts, fees, or taxes. After you submit, a licensed specialist will review ' +
            'your application and send your actual quote. Calculated ' + new Date(quote.createdAt).toLocaleString() + '.'));

        el.quoteResult.innerHTML = '';
        el.quoteResult.appendChild(card);
    }

    function renderQuoteLine(line) {
        var row = makeEl('div', 'quote-line');
        var top = makeEl('div', 'd-flex flex-wrap justify-content-between gap-2');
        top.appendChild(makeEl('strong', '', QUOTE_LINE_NAMES[line.lineCode] || line.lineCode));

        if (line.status === 'DEMO_ESTIMATE') {
            top.appendChild(makeEl('span', 'fw-semibold', moneyRange(line.low, line.high) + ' / year'));
        } else if (line.status === 'REFERRED') {
            top.appendChild(makeEl('span', 'badge quote-badge-referred', 'Specialist will price this'));
        } else {
            top.appendChild(makeEl('span', 'badge quote-badge-incomplete', 'Needs more information'));
        }
        row.appendChild(top);

        if (line.basis.length > 0) {
            row.appendChild(makeEl('div', 'small text-muted', 'Based on: ' + line.basis.join(' · ')));
        }
        line.notes.forEach(function (note) {
            row.appendChild(makeEl('div', 'small', note));
        });

        // "Please ask for it": each missing answer gets a button back to the step that asks it
        line.missing.forEach(function (missing) {
            var ask = makeEl('div', 'd-flex flex-wrap align-items-center gap-2 mt-1 small');
            ask.appendChild(makeEl('span', '', 'Missing: ' + missing.label));
            var btn = makeEl('button', 'btn btn-sm valent-btn-outline', 'Add it (step ' + missing.step + ')');
            btn.type = 'button';
            btn.addEventListener('click', function () { showAppStep(missing.step); });
            ask.appendChild(btn);
            row.appendChild(ask);
        });
        return row;
    }

    function moneyRange(low, high) {
        return formatMoney(Math.round(low)) + ' – ' + formatMoney(Math.round(high));
    }

    function makeEl(tag, className, text) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function addReviewRow(label, value) {
        var dt = document.createElement('dt');
        dt.className = 'col-5 text-muted fw-normal';
        dt.textContent = label;
        var dd = document.createElement('dd');
        dd.className = 'col-7';
        dd.textContent = value; // textContent, so customer-typed text is never treated as HTML
        el.appReview.appendChild(dt);
        el.appReview.appendChild(dd);
    }

    // The visible question for a field: its <label>, or for radio/checkbox
    // groups, the group's <legend> or question text
    function fieldLabel(form, field) {
        var text;
        if (field.type === 'radio' || field.type === 'checkbox') {
            var heading = field.closest('fieldset, .col-12, .mb-3').querySelector('legend, span.form-label');
            text = heading ? heading.textContent : field.name;
        } else {
            var label = form.querySelector('label[for="' + field.id + '"]');
            text = label ? label.textContent : field.name;
        }
        return text.replace('(optional)', '').trim();
    }

    function setAppBusy(busy) {
        app.busy = busy;
        el.appNextBtn.disabled = busy;
        el.appBackBtn.disabled = busy;
        if (busy) el.appNextBtn.textContent = 'Saving...';
        else updateNextButtonText();
    }

    // Says where the button goes, instead of a generic "Next"
    var NEXT_BUTTON_TEXT = {
        1: 'Continue to Details →',
        2: 'Continue to Your Info →',
        3: 'See My Estimate →',
        4: 'Review & Submit →',
        5: 'Submit Application'
    };

    function updateNextButtonText() {
        el.appNextBtn.textContent = NEXT_BUTTON_TEXT[app.step];
    }

    function showAppError(err) {
        el.appError.textContent = err.message;
        el.appError.classList.remove('d-none');
    }

    function hideAppError() {
        el.appError.classList.add('d-none');
    }

    // Sends JSON to the API. Resolves with the parsed response body (or null),
    // rejects with an Error whose message is safe to show the customer.
    // body: a plain object (sent as JSON) or FormData (file uploads; the browser sets the header)
    function apiRequest(method, path, body) {
        var isForm = body instanceof FormData;
        return fetch(API_BASE_URL + path, {
            method: method,
            headers: body && !isForm ? { 'Content-Type': 'application/json' } : {},
            body: isForm ? body : body ? JSON.stringify(body) : undefined
        }).catch(function () {
            throw new Error('We couldn\'t reach the server. Please try again in a moment. ' +
                '(Developers: is the API running? Start it with "dotnet run" in the API folder.)');
        }).then(function (response) {
            return response.text().then(function (text) {
                var data = text ? JSON.parse(text) : null;
                if (!response.ok) {
                    throw new Error((data && (data.error || data.title)) || 'Something went wrong (HTTP ' + response.status + ').');
                }
                return data;
            });
        });
    }

    // ---------------------------------------------------------------
    // SCREEN NAVIGATION
    // ---------------------------------------------------------------

    // Top step bar for each landing-page path. The landing page has no bar, and the
    // application form shows its own (whose steps match the apply list after Type & State).
    // screen: where clicking a finished step returns to
    var PATH_STEPS = {
        explore: [
            { label: 'Type & State', screen: 'select' },
            { label: 'Explore', screen: 'explorer' },
            { label: 'Compare', screen: 'compare' }
        ],
        apply: [
            { label: 'Type & State', screen: 'select' },
            { label: 'Coverage' },
            { label: 'Details' },
            { label: 'Applicant' },
            { label: 'Quote' },
            { label: 'Submit' }
        ]
    };
    var SCREENS = {
        start: 'screenStart',
        select: 'screenSelect',
        explorer: 'screenExplorer',
        compare: 'screenCompare',
        apply: 'screenApply'
    };

    function goToScreen(name) {
        Object.keys(SCREENS).forEach(function (key) {
            el[SCREENS[key]].classList.toggle('d-none', key !== name);
        });
        var steps = PATH_STEPS[state.path] || [];
        var activeIndex = steps.map(function (s) { return s.screen; }).indexOf(name);
        el.stepIndicatorWrap.classList.toggle('d-none', activeIndex === -1 || name === 'apply');
        if (activeIndex !== -1) renderStepIndicator(steps, activeIndex + 1);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function renderStepIndicator(steps, activeStep) {
        el.stepIndicator.innerHTML = '';
        steps.forEach(function (s, i) {
            var step = i + 1;
            var item = document.createElement('li');
            item.className = 'step-item';
            item.setAttribute('data-step', step);
            item.innerHTML = '<span class="step-num">' + step + '</span><span class="step-label"></span>';
            item.querySelector('.step-label').textContent = s.label;
            item.classList.toggle('active', step === activeStep);
            item.classList.toggle('completed', step < activeStep);
            setStepClickable(item, step < activeStep);
            el.stepIndicator.appendChild(item);
        });
    }

    // Finished steps become keyboard-accessible buttons; others are plain labels
    function setStepClickable(item, clickable) {
        item.classList.toggle('clickable', clickable);
        if (clickable) {
            item.setAttribute('role', 'button');
            item.setAttribute('tabindex', '0');
            item.setAttribute('title', 'Go back to ' + item.querySelector('.step-label').textContent);
        } else {
            item.removeAttribute('role');
            item.removeAttribute('tabindex');
            item.removeAttribute('title');
        }
    }

    // Calls handler(stepNumber) when a clickable step in the indicator is clicked or activated by keyboard
    function onStepClick(indicator, handler) {
        function activate(event) {
            var item = event.target.closest('.step-item.clickable');
            if (!item || !indicator.contains(item)) return;
            event.preventDefault();
            handler(parseInt(item.getAttribute('data-step'), 10));
        }
        indicator.addEventListener('click', activate);
        indicator.addEventListener('keydown', function (event) {
            if (event.key === 'Enter' || event.key === ' ') activate(event);
        });
    }

    function resetPrototype() {
        app.applicationId = null;
        app.lines = [];
        state.path = null;
        state.selectedTypes = [];
        state.selectedState = DEFAULT_STATE;
        state.selectedCoverages = [];
        state.modalCoverageCode = null;
        el.stateSelect.value = DEFAULT_STATE;
        updateInsuranceCardSelection();
        updateExploreButtonState();
        refreshCompareUI();
        goToScreen('start');
    }

    // ---------------------------------------------------------------
    // HELPERS
    // ---------------------------------------------------------------

    function capitalize(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    // ['homeowners', 'auto'] -> 'Homeowners + Auto'
    function typesLabel(types) {
        return types.map(capitalize).join(' + ');
    }

    function hasLine(type) {
        return app.lines.indexOf(type) !== -1;
    }

    function stateName(abbr) {
        var found = US_STATES.filter(function (pair) { return pair[0] === abbr; })[0];
        return found ? found[1] : abbr;
    }

    // Today's date as YYYY-MM-DD in the customer's time zone (for <input type="date" min>)
    function todayIso() {
        var d = new Date();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }

})();

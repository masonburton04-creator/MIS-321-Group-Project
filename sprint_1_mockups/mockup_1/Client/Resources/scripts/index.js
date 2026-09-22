/* Valent Partners - Mockup 1: Customer Coverage Explorer
   Front-end-only prototype. All insurance content below is MOCK / DEMONSTRATION DATA
   and is not sourced from finalized Valent Partners or carrier business rules. */

(function () {
    'use strict';

    // ---------------------------------------------------------------
    // MOCK DATA MODEL (replace with authoritative/researched data later)
    // ---------------------------------------------------------------

    var US_STATES = [
        ['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'],
        ['CA', 'California'], ['CO', 'Colorado'], ['CT', 'Connecticut'], ['DE', 'Delaware'],
        ['FL', 'Florida'], ['GA', 'Georgia'], ['HI', 'Hawaii'], ['ID', 'Idaho'],
        ['IL', 'Illinois'], ['IN', 'Indiana'], ['IA', 'Iowa'], ['KS', 'Kansas'],
        ['KY', 'Kentucky'], ['LA', 'Louisiana'], ['ME', 'Maine'], ['MD', 'Maryland'],
        ['MA', 'Massachusetts'], ['MI', 'Michigan'], ['MN', 'Minnesota'], ['MS', 'Mississippi'],
        ['MO', 'Missouri'], ['MT', 'Montana'], ['NE', 'Nebraska'], ['NV', 'Nevada'],
        ['NH', 'New Hampshire'], ['NJ', 'New Jersey'], ['NM', 'New Mexico'], ['NY', 'New York'],
        ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['OH', 'Ohio'], ['OK', 'Oklahoma'],
        ['OR', 'Oregon'], ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'], ['SC', 'South Carolina'],
        ['SD', 'South Dakota'], ['TN', 'Tennessee'], ['TX', 'Texas'], ['UT', 'Utah'],
        ['VT', 'Vermont'], ['VA', 'Virginia'], ['WA', 'Washington'], ['WV', 'West Virginia'],
        ['WI', 'Wisconsin'], ['WY', 'Wyoming'], ['DC', 'District of Columbia']
    ];
    var DEFAULT_STATE = 'AL';

    // Illustrative-only mock banners for a few demo states; all other states fall back
    // to a generic mock message. None of this reflects real carrier availability or rules.
    var STATE_MOCK_INFO = {
        AL: 'Demonstration state. In production, Alabama-specific questions, disclosures, or availability would appear here once validated with Valent Partners.',
        FL: 'Demonstration only: coastal/wind and flood-adjacent questions are common in Florida but are not implemented here — illustrative placeholder text only.',
        CA: 'Demonstration only: wildfire-related questions are common in California but are not implemented here — illustrative placeholder text only.',
        TX: 'Demonstration only: hail and severe-weather questions are common in Texas but are not implemented here — illustrative placeholder text only.'
    };
    var STATE_MOCK_FALLBACK = 'No demonstration content has been configured for this state yet. This banner shows where real state-specific availability, questions, or disclosures would appear once validated with Valent Partners.';

    var COMPARE_FIELDS = [
        ['whatItProtects', 'What It Protects'],
        ['whyItMatters', 'Why It Matters'],
        ['keyConsiderations', 'Key Considerations'],
        ['commonLimitations', 'Common Limitations']
    ];

    // Coverage/feature sets, one per insurance line, each explorable and comparable
    // at the same interaction depth. Homeowners uses the standard ISO-style Coverage
    // A-F lettering; Flood and Jewelry use plain feature names since they do not have
    // an equivalent standardized lettering in this prototype.
    var COVERAGE_SETS = {
        homeowners: {
            label: 'Homeowners',
            screenTitle: 'Homeowners Coverage Components',
            screenSubtitle: 'These are parts of a single homeowners policy, not competing plans — explore each one below.',
            useLetterPrefix: true,
            order: ['A', 'B', 'C', 'D', 'E', 'F'],
            notes: [
                'Flood damage is generally <u>not</u> covered by a standard homeowners policy. Separate flood coverage is typically required.',
                'Valuable jewelry often has special coverage limits under homeowners policies and may need scheduled or separate coverage.'
            ],
            data: {
                A: {
                    code: 'A',
                    name: 'Dwelling',
                    shortDesc: 'Covers the physical structure of your home if it’s damaged by a covered loss.',
                    whatItProtects: 'The structure of your home — walls, roof, foundation, and attached structures — against covered losses (e.g., fire, wind, certain other perils).',
                    whyItMatters: 'Rebuilding or repairing a home is typically the largest potential cost a homeowner faces, so this is usually the foundation of a homeowners policy.',
                    keyConsiderations: 'Coverage amount is generally meant to reflect the cost to rebuild the home, not its market/sale value.',
                    commonLimitations: 'Flood and earth movement are typically excluded and may require separate coverage. Maintenance-related damage is usually not covered.'
                },
                B: {
                    code: 'B',
                    name: 'Other Structures',
                    shortDesc: 'Covers detached structures on your property, like sheds, fences, or a detached garage.',
                    whatItProtects: 'Structures on the property not attached to the home — e.g., sheds, detached garages, and fences.',
                    whyItMatters: 'These structures can be costly to replace and are not automatically covered by Dwelling (Coverage A).',
                    keyConsiderations: 'Often set as a percentage of the Dwelling coverage amount rather than chosen independently.',
                    commonLimitations: 'Structures used for business purposes may have reduced or excluded coverage.'
                },
                C: {
                    code: 'C',
                    name: 'Personal Property',
                    shortDesc: 'Covers your belongings — furniture, electronics, clothing — against covered losses.',
                    whatItProtects: 'Personal belongings inside (and sometimes temporarily outside) the home against covered losses.',
                    whyItMatters: 'Replacing everyday belongings after a loss can be expensive; this coverage helps offset that cost.',
                    keyConsiderations: 'Valuation may be based on Replacement Cost Value (cost to replace new) or Actual Cash Value (replacement cost minus depreciation), depending on the policy.',
                    commonLimitations: 'High-value items like jewelry, art, and collectibles often have special sub-limits and may need scheduled/separate coverage.'
                },
                D: {
                    code: 'D',
                    name: 'Loss of Use / Additional Living Expense',
                    shortDesc: 'Helps cover temporary living costs if you can’t stay in your home after a covered loss.',
                    whatItProtects: 'Additional costs of temporary housing and related living expenses when a covered loss makes the home temporarily uninhabitable.',
                    whyItMatters: 'Displacement after a major loss can be financially and emotionally stressful; this coverage helps bridge that gap.',
                    keyConsiderations: 'Usually subject to policy limits and/or a maximum time period.',
                    commonLimitations: 'Generally only applies when the triggering loss is itself a covered peril under the policy.'
                },
                E: {
                    code: 'E',
                    name: 'Personal Liability',
                    shortDesc: 'Helps protect you financially if you’re responsible for injury or property damage to others.',
                    whatItProtects: 'Liability protection if you (or covered household members) are found responsible for bodily injury or property damage to others, subject to policy terms.',
                    whyItMatters: 'Liability claims and legal costs can be significant; this coverage helps manage that financial exposure.',
                    keyConsiderations: 'Coverage limits can typically be increased; some households consider an additional umbrella policy for extra protection.',
                    commonLimitations: 'Intentional acts and certain business-related activities are typically excluded.'
                },
                F: {
                    code: 'F',
                    name: 'Medical Payments to Others',
                    shortDesc: 'Covers limited medical costs if someone else is accidentally injured on your property.',
                    whatItProtects: 'Limited medical expenses for guests accidentally injured on the property, generally regardless of fault.',
                    whyItMatters: 'Provides a fast, lower-friction way to handle minor injury claims without a liability dispute.',
                    keyConsiderations: 'Limits are usually much lower than Personal Liability (Coverage E) limits.',
                    commonLimitations: 'Typically does not apply to residents of the household — mainly intended for guests/visitors.'
                }
            }
        },
        flood: {
            label: 'Flood',
            screenTitle: 'Flood Coverage Components',
            screenSubtitle: 'Flood insurance is typically its own policy, separate from homeowners coverage — explore its core components below.',
            useLetterPrefix: false,
            order: ['1', '2', '3'],
            notes: [
                'Flood coverage is generally a <strong>separate policy</strong> from standard homeowners insurance, and is not automatically included with it.'
            ],
            data: {
                '1': {
                    code: '1',
                    name: 'Building Property Coverage',
                    shortDesc: 'Covers the physical structure of your home if it’s damaged by a flood.',
                    whatItProtects: 'The structure itself — foundation, walls, electrical and plumbing systems, and built-in appliances — against direct physical loss caused by flooding.',
                    whyItMatters: 'Flood damage to a home’s structure can be extensive and expensive to repair, and is generally excluded from standard homeowners policies.',
                    keyConsiderations: 'Typically carries its own coverage limit and deductible, separate from any homeowners policy on the same property.',
                    commonLimitations: 'Improvements below the lowest elevated floor, and certain outdoor property, are commonly limited or excluded.'
                },
                '2': {
                    code: '2',
                    name: 'Personal Property (Contents) Coverage',
                    shortDesc: 'Covers belongings inside the home against flood damage, usually chosen separately from building coverage.',
                    whatItProtects: 'Personal belongings — furniture, electronics, clothing — against direct physical loss caused by flooding.',
                    whyItMatters: 'Contents damaged by floodwater are usually a total loss; this coverage helps offset replacement costs.',
                    keyConsiderations: 'Often optional and priced separately from building coverage, with its own limit and deductible.',
                    commonLimitations: 'High-value items, and property stored below the lowest elevated floor, commonly have reduced coverage or exclusions.'
                },
                '3': {
                    code: '3',
                    name: 'Basement & Below-Grade Property',
                    shortDesc: 'Explains the special, more limited treatment flood policies typically apply to basements.',
                    whatItProtects: 'A narrower set of items in basements/below-grade areas — typically structural elements and essential equipment like furnaces or water heaters.',
                    whyItMatters: 'Basements are especially flood-prone, so understanding the reduced coverage here helps set realistic expectations.',
                    keyConsiderations: 'Coverage here is usually much narrower than for above-grade living space.',
                    commonLimitations: 'Finished walls/flooring, furniture, and most personal belongings kept in a basement are commonly excluded.'
                }
            }
        },
        jewelry: {
            label: 'Jewelry',
            screenTitle: 'Jewelry Coverage Components',
            screenSubtitle: 'Valuable jewelry often needs its own policy or endorsement beyond standard homeowners limits — explore common features below.',
            useLetterPrefix: false,
            order: ['1', '2', '3', '4'],
            notes: [
                'Valuable jewelry often exceeds the small sub-limits included in a standard homeowners policy, and may need <strong>scheduled or separate</strong> coverage.'
            ],
            data: {
                '1': {
                    code: '1',
                    name: 'Scheduled Item Coverage',
                    shortDesc: 'Lists specific pieces individually, each with its own agreed or appraised value.',
                    whatItProtects: 'Individually listed jewelry items, each valued on its own — often based on a recent appraisal, receipt, or photos.',
                    whyItMatters: 'Standard homeowners policies usually cap jewelry coverage well below the value of fine pieces; scheduling raises that limit.',
                    keyConsiderations: 'Usually requires documentation such as an appraisal, receipt, or photos when the item is added.',
                    commonLimitations: 'Coverage generally applies only to the specific item(s) listed, not to jewelry acquired later unless it is added.'
                },
                '2': {
                    code: '2',
                    name: 'Blanket (Unscheduled) Coverage',
                    shortDesc: 'Offers a modest amount of extra jewelry coverage without listing individual items.',
                    whatItProtects: 'A broader category of jewelry up to a set overall limit, without needing to itemize each piece.',
                    whyItMatters: 'Provides a lower-effort way to raise jewelry coverage slightly above standard homeowners sub-limits.',
                    keyConsiderations: 'Simpler to set up than scheduling, but usually caps any single item at a modest amount.',
                    commonLimitations: 'Typically has much lower overall and per-item limits than scheduled coverage.'
                },
                '3': {
                    code: '3',
                    name: 'Worldwide Coverage',
                    shortDesc: 'Protects scheduled items no matter where in the world a covered loss happens.',
                    whatItProtects: 'Loss, theft, or damage to covered jewelry while traveling or anywhere outside the home.',
                    whyItMatters: 'Jewelry is frequently worn away from home, so coverage that stops at the front door leaves a gap.',
                    keyConsiderations: 'A common feature of dedicated jewelry policies/floaters, less consistently included under homeowners alone.',
                    commonLimitations: 'May still exclude certain high-risk circumstances noted in the policy, such as leaving items unattended in some settings.'
                },
                '4': {
                    code: '4',
                    name: 'Mysterious Disappearance Coverage',
                    shortDesc: 'Covers unexplained loss of an item, not just theft or accidental damage.',
                    whatItProtects: 'Situations where an item is simply lost with no clear explanation — a common way jewelry actually goes missing.',
                    whyItMatters: 'Standard property coverage often requires proof of a specific covered peril; jewelry is frequently just lost.',
                    keyConsiderations: 'A key differentiator between basic homeowners coverage and dedicated jewelry coverage.',
                    commonLimitations: 'Intentional acts, and patterns of repeated loss, may still be reviewed case by case.'
                }
            }
        }
    };

    var FUTURE_FEATURE_COPY = {
        'AI Quote Assistant': 'In the full product, this would open a conversational assistant that gathers the details needed for your state and coverage, and escalates to a human specialist when the situation is too complex. Not implemented in this prototype.',
        'Talk to an Agent': 'In the full product, this would connect you with a Valent Partners specialist, carrying over the context you’ve already provided. Not implemented in this prototype.'
    };

    // ---------------------------------------------------------------
    // APPLICATION STATE
    // ---------------------------------------------------------------

    var state = {
        selectedType: null,
        selectedState: DEFAULT_STATE,
        selectedCoverages: [],
        modalCoverageCode: null
    };

    // ---------------------------------------------------------------
    // DOM REFERENCES (populated on DOMContentLoaded)
    // ---------------------------------------------------------------
    var el = {};

    document.addEventListener('DOMContentLoaded', function () {
        cacheDom();
        populateStateSelect(el.stateSelect);
        populateStateSelect(el.applicantState);
        bindEvents();
        updateInsuranceCardSelection();
        updateExploreButtonState();
    });

    function cacheDom() {
        el.stateSelect = document.getElementById('stateSelect');
        el.exploreCoverageBtn = document.getElementById('exploreCoverageBtn');
        el.selectHint = document.getElementById('selectHint');
        el.insuranceTypeCards = document.querySelectorAll('.insurance-type-card');

        el.screenSelect = document.getElementById('screen-select');
        el.screenExplorer = document.getElementById('screen-explorer');
        el.screenCompare = document.getElementById('screen-compare');
        el.screenNext = document.getElementById('screen-next');
        el.screenApply = document.getElementById('screen-apply');

        el.explorerTitle = document.getElementById('explorerTitle');
        el.explorerSubtitle = document.getElementById('explorerSubtitle');
        el.explorerBackBtn = document.getElementById('explorerBackBtn');
        el.stateMockBanner = document.getElementById('stateMockBanner');
        el.coverageCardGrid = document.getElementById('coverageCardGrid');
        el.explorerNotesRow = document.getElementById('explorerNotesRow');
        el.compareCount = document.getElementById('compareCount');
        el.goToCompareBtn = document.getElementById('goToCompareBtn');

        el.compareBackBtn = document.getElementById('compareBackBtn');
        el.compareTable = document.getElementById('compareTable');
        el.goToNextStepBtn = document.getElementById('goToNextStepBtn');

        el.startOverBtn = document.getElementById('startOverBtn');
        el.brandHome = document.getElementById('brandHome');

        el.startApplicationBtn = document.getElementById('startApplicationBtn');
        el.applyBackBtn = document.getElementById('applyBackBtn');
        el.applyContextLine = document.getElementById('applyContextLine');
        el.applyFormWrap = document.getElementById('applyFormWrap');
        el.applicationForm = document.getElementById('applicationForm');
        el.applicantState = document.getElementById('applicantState');
        el.applyConfirmation = document.getElementById('applyConfirmation');
        el.applyConfirmSummary = document.getElementById('applyConfirmSummary');
        el.mockReferenceNumber = document.getElementById('mockReferenceNumber');
        el.applyStartOverBtn = document.getElementById('applyStartOverBtn');
        el.applyBackToNextBtn = document.getElementById('applyBackToNextBtn');

        el.coverageDetailModalLabel = document.getElementById('coverageDetailModalLabel');
        el.coverageDetailModalBody = document.getElementById('coverageDetailModalBody');
        el.modalAddToCompareBtn = document.getElementById('modalAddToCompareBtn');
        el.coverageDetailModalEl = document.getElementById('coverageDetailModal');

        el.futureFeatureModalBody = document.getElementById('futureFeatureModalBody');
        el.futureFeatureModalEl = document.getElementById('futureFeatureModal');

        el.stepItems = document.querySelectorAll('.step-item');
    }

    // ---------------------------------------------------------------
    // SETUP
    // ---------------------------------------------------------------

    function populateStateSelect(selectEl) {
        US_STATES.forEach(function (pair) {
            var opt = document.createElement('option');
            opt.value = pair[0];
            opt.textContent = pair[1];
            if (pair[0] === DEFAULT_STATE) opt.selected = true;
            selectEl.appendChild(opt);
        });
    }

    function bindEvents() {
        el.insuranceTypeCards.forEach(function (card) {
            card.addEventListener('click', function () {
                state.selectedType = card.getAttribute('data-type');
                updateInsuranceCardSelection();
                updateExploreButtonState();
            });
        });

        el.stateSelect.addEventListener('change', function () {
            state.selectedState = el.stateSelect.value;
            renderStateMockBanner();
        });

        el.exploreCoverageBtn.addEventListener('click', onExploreClick);

        el.explorerBackBtn.addEventListener('click', function () { goToScreen('select'); });
        el.goToCompareBtn.addEventListener('click', function () {
            if (state.selectedCoverages.length === 0) return;
            renderCompareTable();
            goToScreen('compare');
        });

        el.compareBackBtn.addEventListener('click', function () { goToScreen('explorer'); });
        el.goToNextStepBtn.addEventListener('click', function () { goToScreen('next'); });

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

        el.startApplicationBtn.addEventListener('click', function () {
            openApplyScreen();
        });
        el.applyBackBtn.addEventListener('click', function () { goToScreen('next'); });
        el.applyBackToNextBtn.addEventListener('click', function () { goToScreen('next'); });
        el.applyStartOverBtn.addEventListener('click', resetPrototype);
        el.applicationForm.addEventListener('submit', onApplicationSubmit);
    }

    // ---------------------------------------------------------------
    // SCREEN 1: SELECTION
    // ---------------------------------------------------------------

    function updateInsuranceCardSelection() {
        el.insuranceTypeCards.forEach(function (card) {
            card.classList.toggle('selected', card.getAttribute('data-type') === state.selectedType);
        });
    }

    function updateExploreButtonState() {
        var ready = !!state.selectedType;
        el.exploreCoverageBtn.disabled = !ready;
        el.selectHint.textContent = ready
            ? 'Ready to explore ' + capitalize(state.selectedType) + ' coverage for ' + stateName(state.selectedState) + '.'
            : 'Select an insurance type above to continue.';
    }

    function onExploreClick() {
        if (!state.selectedType) return;
        state.selectedCoverages = [];
        renderStateMockBanner();
        renderExplorerScreen(state.selectedType);
        goToScreen('explorer');
    }

    // ---------------------------------------------------------------
    // SCREEN 2: EXPLORER
    // ---------------------------------------------------------------

    function renderStateMockBanner() {
        var msg = STATE_MOCK_INFO[state.selectedState] || STATE_MOCK_FALLBACK;
        el.stateMockBanner.innerHTML =
            '<span class="badge mock-badge me-2">MOCK DATA</span>' +
            '<strong>' + stateName(state.selectedState) + ':</strong> ' + msg;
    }

    function renderExplorerScreen(type) {
        var set = COVERAGE_SETS[type];
        el.explorerTitle.textContent = set.screenTitle;
        el.explorerSubtitle.textContent = set.screenSubtitle;

        el.explorerNotesRow.innerHTML = set.notes.map(function (note) {
            var colClass = set.notes.length > 1 ? 'col-12 col-md-6' : 'col-12';
            return '<div class="' + colClass + '"><div class="alert alert-warning mb-0"><strong>Good to know:</strong> ' + note + '</div></div>';
        }).join('');

        renderCoverageCards(type);
        refreshCompareUI();
    }

    function renderCoverageCards(type) {
        var set = COVERAGE_SETS[type];
        var html = set.order.map(function (code) {
            var c = set.data[code];
            var heading = set.useLetterPrefix
                ? '<h3 class="h6 mb-0">Coverage ' + c.code + '</h3><div class="text-muted small">' + c.name + '</div>'
                : '<h3 class="h6 mb-0">' + c.name + '</h3>';
            return (
                '<div class="col-12 col-sm-6 col-lg-4">' +
                    '<div class="card coverage-card p-3" data-code="' + c.code + '">' +
                        '<div class="d-flex align-items-start gap-2 mb-2">' +
                            '<span class="coverage-letter">' + c.code + '</span>' +
                            '<div>' + heading + '</div>' +
                        '</div>' +
                        '<p class="small mb-3">' + c.shortDesc + '</p>' +
                        '<div class="mt-auto d-flex gap-2">' +
                            '<button type="button" class="btn btn-sm valent-btn-outline flex-fill view-details-btn" data-code="' + c.code + '">View Details</button>' +
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
        var set = COVERAGE_SETS[state.selectedType];
        var c = set.data[code];
        state.modalCoverageCode = code;
        el.coverageDetailModalLabel.textContent = set.useLetterPrefix
            ? 'Coverage ' + c.code + ' — ' + c.name
            : c.name;

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
    // SCREEN 3: COMPARE
    // ---------------------------------------------------------------

    function renderCompareTable() {
        var set = COVERAGE_SETS[state.selectedType];
        var codes = state.selectedCoverages.slice().sort();
        var thead = el.compareTable.querySelector('thead');
        var tbody = el.compareTable.querySelector('tbody');

        thead.innerHTML = '<tr><th style="width:16%">Field</th>' + codes.map(function (code) {
            var c = set.data[code];
            return set.useLetterPrefix
                ? '<th>Coverage ' + c.code + '<div class="small fw-normal">' + c.name + '</div></th>'
                : '<th>' + c.name + '</th>';
        }).join('') + '</tr>';

        tbody.innerHTML = COMPARE_FIELDS.map(function (pair) {
            var row = '<tr><td class="field-label">' + pair[1] + '</td>';
            row += codes.map(function (code) {
                return '<td>' + set.data[code][pair[0]] + '</td>';
            }).join('');
            row += '</tr>';
            return row;
        }).join('');
    }

    // ---------------------------------------------------------------
    // SCREEN 5: APPLICATION (baseline functional, front-end only)
    // ---------------------------------------------------------------

    function openApplyScreen() {
        var set = COVERAGE_SETS[state.selectedType];
        var names = state.selectedCoverages.slice().sort().map(function (code) {
            return set.data[code].name;
        });
        var coverageSummary = names.length
            ? names.join(', ')
            : 'no specific coverage components selected';

        el.applyContextLine.textContent = 'Applying for: ' + set.label + ' coverage in ' + stateName(state.selectedState) +
            ' — focused on ' + coverageSummary + '.';

        el.applicationForm.classList.remove('was-validated');
        el.applicationForm.reset();
        el.applicantState.value = state.selectedState;
        el.applyFormWrap.classList.remove('d-none');
        el.applyConfirmation.classList.add('d-none');

        goToScreen('apply');
    }

    function onApplicationSubmit(e) {
        e.preventDefault();
        var form = el.applicationForm;

        if (!form.checkValidity()) {
            form.classList.add('was-validated');
            return;
        }

        var set = COVERAGE_SETS[state.selectedType];
        var names = state.selectedCoverages.slice().sort().map(function (code) {
            return set.data[code].name;
        });
        var coverageSummary = names.length
            ? names.join(', ')
            : 'no specific coverage components selected';

        el.applyConfirmSummary.textContent = 'a ' + set.label.toLowerCase() + ' application for ' +
            stateName(state.selectedState) + ' covering ' + coverageSummary + '.';
        el.mockReferenceNumber.textContent = generateMockReferenceNumber();

        el.applyFormWrap.classList.add('d-none');
        el.applyConfirmation.classList.remove('d-none');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function generateMockReferenceNumber() {
        var random = Math.floor(100000 + Math.random() * 900000);
        return 'MOCK-' + (state.selectedType || 'APP').toUpperCase().slice(0, 3) + '-' + random;
    }

    // ---------------------------------------------------------------
    // SCREEN NAVIGATION
    // ---------------------------------------------------------------

    var SCREEN_STEP = { select: 1, explorer: 2, compare: 3, next: 4, apply: 5 };
    var SCREENS = {
        select: 'screenSelect',
        explorer: 'screenExplorer',
        compare: 'screenCompare',
        next: 'screenNext',
        apply: 'screenApply'
    };

    function goToScreen(name) {
        Object.keys(SCREENS).forEach(function (key) {
            el[SCREENS[key]].classList.toggle('d-none', key !== name);
        });
        updateStepIndicator(SCREEN_STEP[name]);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function updateStepIndicator(activeStep) {
        el.stepItems.forEach(function (item) {
            var step = parseInt(item.getAttribute('data-step'), 10);
            item.classList.toggle('active', step === activeStep);
            item.classList.toggle('completed', step < activeStep);
        });
    }

    function resetPrototype() {
        state.selectedType = null;
        state.selectedState = DEFAULT_STATE;
        state.selectedCoverages = [];
        state.modalCoverageCode = null;
        el.stateSelect.value = DEFAULT_STATE;
        updateInsuranceCardSelection();
        updateExploreButtonState();
        goToScreen('select');
    }

    // ---------------------------------------------------------------
    // HELPERS
    // ---------------------------------------------------------------

    function capitalize(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    function stateName(abbr) {
        var found = US_STATES.filter(function (pair) { return pair[0] === abbr; })[0];
        return found ? found[1] : abbr;
    }

})();

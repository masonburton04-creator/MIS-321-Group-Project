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

    var COVERAGE_ORDER = ['A', 'B', 'C', 'D', 'E', 'F'];

    var COVERAGE_DATA = {
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
    };

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
        selectedCoverages: [],
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
        busy: false
    };

    // ---------------------------------------------------------------
    // DOM REFERENCES (populated on DOMContentLoaded)
    // ---------------------------------------------------------------
    var el = {};

    document.addEventListener('DOMContentLoaded', function () {
        cacheDom();
        populateStateSelect();
        bindEvents();
        renderCoverageCards();
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
        el.screenFuture = document.getElementById('screen-future');
        el.screenExplorer = document.getElementById('screen-explorer');
        el.screenCompare = document.getElementById('screen-compare');

        el.futureIcon = document.getElementById('futureIcon');
        el.futureTitle = document.getElementById('futureTitle');
        el.futureBody = document.getElementById('futureBody');
        el.futureBackBtn = document.getElementById('futureBackBtn');
        el.futureTryHomeownersBtn = document.getElementById('futureTryHomeownersBtn');

        el.explorerBackBtn = document.getElementById('explorerBackBtn');
        el.stateMockBanner = document.getElementById('stateMockBanner');
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
        el.stepItems = document.querySelectorAll('#stepIndicator .step-item');

        el.screenApply = document.getElementById('screen-apply');
        el.appStepItems = document.querySelectorAll('#appStepIndicator .step-item');
        el.appTitle = document.getElementById('appTitle');
        el.appSubtitle = document.getElementById('appSubtitle');
        el.appIdBadge = document.getElementById('appIdBadge');
        el.appError = document.getElementById('appError');
        el.appSteps = document.querySelectorAll('.app-step');
        el.appLineFieldsets = el.screenApply.querySelectorAll('fieldset[data-lines]');
        el.coverageCheckboxes = document.getElementById('coverageCheckboxes');
        el.startDate = document.getElementById('startDate');
        el.yearBuilt = document.getElementById('yearBuilt');
        el.zip = document.getElementById('zip');
        el.jewelryTotal = document.getElementById('jewelryTotal');
        el.floodWaitNote = document.getElementById('floodWaitNote');
        el.appStepIndicator = document.getElementById('appStepIndicator');
        el.appBundleNote = document.getElementById('appBundleNote');
        el.appBundleLines = document.getElementById('appBundleLines');
        el.appReview = document.getElementById('appReview');
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
        onStepClick(el.stepIndicatorWrap, function (step) { goToScreen(STEP_SCREENS[step]); });
        onStepClick(el.appStepIndicator, function (step) {
            if (app.busy) return;
            hideAppError();
            showAppStep(step);
        });

        // Bundles with Auto: default each vehicle's ZIP to the property ZIP (still editable)
        el.zip.addEventListener('input', function () {
            el.screenApply.querySelectorAll('.garaging-zip').forEach(prefillGaragingZip);
        });

        bindRepeatableItems();

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

        el.futureBackBtn.addEventListener('click', function () { goToScreen('select'); });
        el.futureTryHomeownersBtn.addEventListener('click', function () {
            state.selectedTypes = ['homeowners'];
            updateInsuranceCardSelection();
            updateExploreButtonState();
            goToScreen('explorer');
        });

        el.explorerBackBtn.addEventListener('click', function () { goToScreen('select'); });
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
            renderCoverageCheckboxes();
            resetRepeatableItems();
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
        } else if (type === 'homeowners') {
            renderStateMockBanner();
            goToScreen('explorer');
        } else {
            renderFutureScreen(type);
            goToScreen('future');
        }
    }

    function renderFutureScreen(type) {
        var icons = { flood: '🌊', jewelry: '💎', auto: '🚗' };
        el.futureIcon.textContent = icons[type] || '🔒';
        el.futureTitle.textContent = capitalize(type) + ' Coverage Explorer — Coming Soon';
        el.futureBody.textContent = capitalize(type) + ' is a core Valent Partners product line, but its deep interactive exploration flow is not yet built in this first prototype (Mockup 1 focuses on validating the Homeowners journey). ' +
            'A future mockup would give ' + type + ' the same coverage-education, comparison, and next-step experience shown here for Homeowners.';
    }

    // ---------------------------------------------------------------
    // SCREEN 3: EXPLORER
    // ---------------------------------------------------------------

    function renderStateMockBanner() {
        var msg = STATE_MOCK_INFO[state.selectedState] || STATE_MOCK_FALLBACK;
        el.stateMockBanner.innerHTML =
            '<span class="badge mock-badge me-2">MOCK DATA</span>' +
            '<strong>' + stateName(state.selectedState) + ':</strong> ' + msg;
    }

    function renderCoverageCards() {
        var html = COVERAGE_ORDER.map(function (code) {
            var c = COVERAGE_DATA[code];
            return (
                '<div class="col-12 col-sm-6 col-lg-4">' +
                    '<div class="card coverage-card p-3" data-code="' + c.code + '">' +
                        '<div class="d-flex align-items-start gap-2 mb-2">' +
                            '<span class="coverage-letter">' + c.code + '</span>' +
                            '<div>' +
                                '<h3 class="h6 mb-0">Coverage ' + c.code + '</h3>' +
                                '<div class="text-muted small">' + c.name + '</div>' +
                            '</div>' +
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
        var c = COVERAGE_DATA[code];
        state.modalCoverageCode = code;
        el.coverageDetailModalLabel.textContent = 'Coverage ' + c.code + ' — ' + c.name;

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
        var codes = state.selectedCoverages.slice().sort();
        var thead = el.compareTable.querySelector('thead');
        var tbody = el.compareTable.querySelector('tbody');

        thead.innerHTML = '<tr><th style="width:16%">Field</th>' + codes.map(function (code) {
            var c = COVERAGE_DATA[code];
            return '<th>Coverage ' + c.code + '<div class="small fw-normal">' + c.name + '</div></th>';
        }).join('') + '</tr>';

        tbody.innerHTML = COMPARE_FIELDS.map(function (pair) {
            var row = '<tr><td class="field-label">' + pair[1] + '</td>';
            row += codes.map(function (code) {
                return '<td>' + COVERAGE_DATA[code][pair[0]] + '</td>';
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

    function renderCoverageCheckboxes() {
        el.coverageCheckboxes.innerHTML = COVERAGE_ORDER.map(function (code) {
            var c = COVERAGE_DATA[code];
            var checked = state.selectedCoverages.indexOf(code) !== -1 ? ' checked' : '';
            return (
                '<div class="col"><div class="form-check">' +
                    '<input class="form-check-input" type="checkbox" name="coverage_components" id="cov' + code + '" value="' + code + '"' + checked + '>' +
                    '<label class="form-check-label" for="cov' + code + '">' + code + ' &mdash; ' + c.name + '</label>' +
                '</div></div>'
            );
        }).join('');
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
        if (step === 4) renderReview();
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
                if (name === 'coverage_components') {
                    value = value ? value.split(',').map(function (code) { return COVERAGE_DATA[code].name; }).join(', ') : 'None selected';
                } else if (field.tagName === 'SELECT') {
                    value = field.options[field.selectedIndex].text;
                } else if (field.type === 'radio') {
                    value = capitalize(value);
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

    function updateNextButtonText() {
        el.appNextBtn.textContent = app.step === APP_TOTAL_STEPS ? 'Submit Application' : 'Next →';
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
    function apiRequest(method, path, body) {
        return fetch(API_BASE_URL + path, {
            method: method,
            headers: body ? { 'Content-Type': 'application/json' } : {},
            body: body ? JSON.stringify(body) : undefined
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

    // apply has no entry: the application form shows its own step indicator
    var SCREEN_STEP = { start: 1, select: 2, future: 2, explorer: 3, compare: 4 };
    var SCREENS = {
        start: 'screenStart',
        select: 'screenSelect',
        future: 'screenFuture',
        explorer: 'screenExplorer',
        compare: 'screenCompare',
        apply: 'screenApply'
    };

    function goToScreen(name) {
        Object.keys(SCREENS).forEach(function (key) {
            el[SCREENS[key]].classList.toggle('d-none', key !== name);
        });
        el.stepIndicatorWrap.classList.toggle('d-none', !SCREEN_STEP[name]);
        if (SCREEN_STEP[name]) updateStepIndicator(SCREEN_STEP[name]);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // Top step bar number -> the screen it returns to
    var STEP_SCREENS = { 1: 'start', 2: 'select', 3: 'explorer', 4: 'compare' };

    function updateStepIndicator(activeStep) {
        el.stepItems.forEach(function (item) {
            var step = parseInt(item.getAttribute('data-step'), 10);
            item.classList.toggle('active', step === activeStep);
            item.classList.toggle('completed', step < activeStep);
            setStepClickable(item, step < activeStep);
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

/* Valent Partners - Mockup 2: Agent Dashboard
   Loads everything from the C# API (which reads the valent_insurance MySQL database):
     GET /api/dashboard           KPIs, funnel, friction, and visit-time metrics for the current filters
     GET /api/dashboard/rules     preliminary eligibility rules (for the client to review)
     GET /api/applications        the review queue
     GET /api/applications/{id}   one application's answers and history
     PUT /api/applications/{id}/status   start review / approve / reject / escalate
     GET /api/applications/{id}/documents/{documentId}   download an uploaded file
     POST /api/auth/login, GET /api/auth/me, POST /api/auth/logout   staff sign-in
   Everything except login needs the signed-in staff member's token (Authorization header). */

(function () {
    'use strict';

    var API_BASE_URL = 'http://localhost:5250/api';

    // ---------------------------------------------------------------
    // REFERENCE DATA (labels only, no metrics)
    // ---------------------------------------------------------------

    // The sprint's demo states (see Database/05_supported_states.sql). Older
    // applications from other states still show, by their state code.
    var US_STATES = [
        ['AL', 'Alabama'], ['TX', 'Texas'], ['NY', 'New York']
    ];

    var LINE_LABELS = { HOME: 'Homeowners', FLOOD: 'Flood', JEWELRY: 'Jewelry', AUTO: 'Auto' };

    var RANGE_LABELS = {
        last7: 'Last 7 days', last30: 'Last 30 days', last90: 'Last 90 days', ytd: 'Year to date', all: 'All time'
    };

    // Funnel stages = the 5 steps of the customer form, then "submitted".
    // Index i here matches funnel[i] from the API and step number i + 1.
    var FUNNEL_STAGES = [
        { label: 'Coverage', sub: 'Step 1 · entry point' },
        { label: 'Property / Item / Vehicle Details', sub: 'Step 2' },
        { label: 'Applicant Details', sub: 'Step 3' },
        { label: 'Quote', sub: 'Step 4' },
        { label: 'Submit', sub: 'Step 5' },
        { label: 'Submitted', sub: 'Sent for agent review' }
    ];

    var STATUS_META = {
        in_progress: { label: 'In progress', cls: 'queue-status-denied' },
        abandoned: { label: 'Abandoned', cls: 'queue-status-denied' },
        submitted: { label: 'New', cls: 'queue-status-new' },
        under_review: { label: 'Under review', cls: 'queue-status-pending' },
        escalated: { label: 'Escalated', cls: 'queue-status-escalated' },
        approved: { label: 'Approved', cls: 'queue-status-approved' },
        rejected: { label: 'Rejected', cls: 'queue-status-denied' }
    };

    // Statuses an agent can still act on (must match ReviewableStatuses in the API)
    var OPEN_STATUSES = ['submitted', 'under_review', 'escalated'];

    // Friendly names for the form answers saved by mockup 1
    var FIELD_LABELS = {
        start_date: 'Coverage start date',
        coverage_components: 'Coverage components',
        has_homeowners_policy: 'Has a homeowners policy',
        currently_insured_auto: 'Currently has auto insurance', // older applications, before switching_carrier
        switching_carrier: 'Switching from another company',
        street: 'Street address',
        city: 'City',
        zip: 'ZIP code',
        home_type: 'Home type',
        year_built: 'Year built',
        square_feet: 'Square feet',
        flood_zone: 'Flood zone',
        has_basement: 'Basement',
        recent_incidents: 'Recent accidents, claims, or violations',
        // Sprint 2: address lookup, more property questions, mailing address
        unit: 'Unit / apt',
        county: 'County',
        address_verified: 'Address',
        stories: 'Stories',
        roof_year: 'Roof installed / replaced',
        last_updated_year: 'Last major update (electrical, plumbing, HVAC)',
        occupancy: 'How the home is used',
        construction_type: 'Exterior walls',
        roof_material: 'Roof material',
        roof_certification: 'Storm-resistant roof',
        foundation_type: 'Foundation',
        prior_claims: 'Home claims, last 5 years',
        has_pool: 'Pool',
        has_trampoline: 'Trampoline',
        has_dog: 'Dog',
        protective_devices: 'Safety features',
        mailing_po_military: 'P.O. Box / military mailing address',
        mailing_type: 'Mailing address type',
        mailing_line1: 'Mailing box / unit',
        mailing_city: 'Mailing city',
        mailing_state: 'Mailing state',
        mailing_zip: 'Mailing ZIP'
    };

    var VALUE_LABELS = {
        home_type: { single_family: 'Single-family house', townhouse: 'Townhouse', condo: 'Condo', duplex: 'Duplex / 2–4 units', mobile: 'Mobile / manufactured' },
        address_verified: { google: 'Verified with Google address lookup', manual: 'Typed in (not verified)' },
        stories: { '4+': '4 or more' },
        occupancy: { primary: 'Main home', secondary: 'Second / vacation home', rental: 'Rented out', vacant: 'Vacant' },
        construction_type: { frame: 'Wood frame / siding', masonry: 'Brick, block, or stone', masonry_veneer: 'Brick or stone veneer', stucco: 'Stucco', other: 'Other / not sure' },
        roof_material: { asphalt: 'Asphalt shingle', metal: 'Metal', tile: 'Clay or concrete tile', slate: 'Slate', wood: 'Wood shake', flat: 'Flat / built-up', other: 'Other / not sure' },
        roof_certification: { fortified: 'FORTIFIED certificate', class4: 'Class 4 impact-resistant', none: 'No', unknown: 'Not sure' },
        foundation_type: { slab: 'Slab', crawlspace: 'Crawl space', basement: 'Basement', piers: 'Piers / pilings', other: 'Other / not sure' },
        prior_claims: { '0': 'None', '3plus': '3 or more' },
        protective_devices: { monitored_smoke: 'Monitored smoke alarm', burglar_alarm: 'Burglar alarm', sprinklers: 'Sprinklers', deadbolts: 'Deadbolts' },
        mailing_type: { po_box: 'P.O. Box', APO: 'APO', FPO: 'FPO', DPO: 'DPO' },
        flood_zone: { unknown: 'Not known', A: 'Zone A / AE (high risk)', V: 'Zone V / VE (coastal high risk)', X: 'Zone X (moderate/low risk)' },
        use: { commute: 'Commuting', pleasure: 'Personal / errands', business: 'Business', rideshare: 'Rideshare / delivery' },
        ownership: { owned: 'Owned outright', financed: 'Financed', leased: 'Leased' },
        relationship: { self: 'Applicant', spouse: 'Spouse / partner', child: 'Child', other_relative: 'Other relative', other: 'Other household member' },
        item_type: { ring: 'Ring', necklace: 'Necklace', bracelet: 'Bracelet', earrings: 'Earrings', watch: 'Watch', other: 'Other' }
    };

    // ---------------------------------------------------------------
    // STATE
    // ---------------------------------------------------------------

    // Where a visitor was when they left (page names sent by mockup 1's tracking)
    var EXIT_PAGE_LABELS = {
        site: 'Arrived', sign_in: 'Sign in / guest', landing: 'Home page', select: 'Type & State',
        explorer: 'Coverage Explorer', compare: 'Compare', confirmation: 'After submitting'
    };

    // Review flag severities (from StateRules in the API), most serious first
    var FLAG_META = {
        refer: { label: 'Specialist', cls: 'status-critical' },
        review: { label: 'Check', cls: 'status-warning' },
        info: { label: 'Note', cls: 'status-info' }
    };

    var DEFAULT_FILTERS = { state: '', line: '', range: 'all' };
    var filters = Object.assign({}, DEFAULT_FILTERS);
    var dashboard = null;       // last GET /api/dashboard response
    var applications = [];      // last GET /api/applications response
    var openAppId = null;       // application shown in the detail modal
    var openApp = null;
    var rules = null;           // GET /api/dashboard/rules, loaded once
    var requestCounter = 0;     // ignores slow responses from older filter changes
    var el = {};

    // Signed-in staff member: { token, staff }. Kept in sessionStorage, so closing the
    // tab signs out; the server also ends sessions after 8 hours.
    var SESSION_KEY = 'valentStaffSession';
    var session = null;

    document.addEventListener('DOMContentLoaded', function () {
        cacheDom();
        populateStateFilter();
        bindEvents();
        restoreSession();
    });

    function cacheDom() {
        el.apiError = document.getElementById('apiError');
        el.loginScreen = document.getElementById('loginScreen');
        el.loginForm = document.getElementById('loginForm');
        el.loginEmail = document.getElementById('loginEmail');
        el.loginPassword = document.getElementById('loginPassword');
        el.loginBtn = document.getElementById('loginBtn');
        el.loginError = document.getElementById('loginError');
        el.dashboardContent = document.getElementById('dashboardContent');
        el.signedInBox = document.getElementById('signedInBox');
        el.signedInName = document.getElementById('signedInName');
        el.signOutBtn = document.getElementById('signOutBtn');

        el.filterState = document.getElementById('filterState');
        el.filterLine = document.getElementById('filterLine');
        el.filterRange = document.getElementById('filterRange');
        el.resetFiltersBtn = document.getElementById('resetFiltersBtn');
        el.refreshBtn = document.getElementById('refreshBtn');
        el.filterSummary = document.getElementById('filterSummary');

        el.kpiRow = document.getElementById('kpiRow');
        el.funnelContainer = document.getElementById('funnelContainer');
        el.frictionTableBody = document.getElementById('frictionTableBody');
        el.quickExitSteps = document.getElementById('quickExitSteps');
        el.visitKpiRow = document.getElementById('visitKpiRow');
        el.exitPagesBody = document.getElementById('exitPagesBody');
        el.rulesTableBody = document.getElementById('rulesTableBody');
        el.pricingIntro = document.getElementById('pricingIntro');
        el.pricingTableBody = document.getElementById('pricingTableBody');
        el.pricingFootnote = document.getElementById('pricingFootnote');
        el.agentKpiRow = document.getElementById('agentKpiRow');
        el.agentTableBody = document.getElementById('agentTableBody');

        el.queueStatus = document.getElementById('queueStatus');
        el.queueTableBody = document.getElementById('queueTableBody');
        el.queueEmptyMsg = document.getElementById('queueEmptyMsg');

        el.stepDetailModalEl = document.getElementById('stepDetailModal');
        el.stepDetailModalLabel = document.getElementById('stepDetailModalLabel');
        el.stepDetailModalBody = document.getElementById('stepDetailModalBody');

        el.appDetailModalEl = document.getElementById('appDetailModal');
        el.appDetailModalLabel = document.getElementById('appDetailModalLabel');
        el.appDetailModalBody = document.getElementById('appDetailModalBody');
        el.appActionError = document.getElementById('appActionError');
        el.appActionNote = document.getElementById('appActionNote');
        el.appActionHint = document.getElementById('appActionHint');
        el.appActionButtons = document.querySelectorAll('#appActions [data-action]');
    }

    function populateStateFilter() {
        el.filterState.appendChild(new Option('All States', ''));
        US_STATES.forEach(function (pair) {
            el.filterState.appendChild(new Option(pair[1], pair[0]));
        });
    }

    function bindEvents() {
        el.filterState.addEventListener('change', function () {
            filters.state = el.filterState.value;
            refresh();
        });
        el.filterLine.addEventListener('change', function () {
            filters.line = el.filterLine.value;
            refresh();
        });
        el.filterRange.addEventListener('change', function () {
            filters.range = el.filterRange.value;
            refresh();
        });
        el.resetFiltersBtn.addEventListener('click', function () {
            filters = Object.assign({}, DEFAULT_FILTERS);
            el.filterState.value = filters.state;
            el.filterLine.value = filters.line;
            el.filterRange.value = filters.range;
            refresh();
        });
        el.refreshBtn.addEventListener('click', refresh);
        el.queueStatus.addEventListener('change', renderQueue);

        el.loginForm.addEventListener('submit', function (e) {
            e.preventDefault();
            signIn();
        });
        el.signOutBtn.addEventListener('click', signOut);

        // Uploaded files need the sign-in token, so they're fetched here instead of by a plain link
        el.appDetailModalBody.addEventListener('click', function (e) {
            var link = e.target.closest('a[data-download]');
            if (!link) return;
            e.preventDefault();
            downloadFile(link.getAttribute('data-download'), link.textContent);
        });

        el.appActionButtons.forEach(function (btn) {
            btn.addEventListener('click', function () {
                changeStatus(btn.getAttribute('data-action'));
            });
        });
    }

    // ---------------------------------------------------------------
    // API
    // ---------------------------------------------------------------

    // Resolves with the parsed JSON body; rejects with an Error whose message can be shown on screen
    function apiRequest(method, path, body) {
        return authorizedFetch(method, path, body).then(function (response) {
            return response.text().then(function (text) {
                var data = text ? JSON.parse(text) : null;
                if (!response.ok) {
                    throw new Error((data && (data.error || data.title)) || 'Something went wrong (HTTP ' + response.status + ').');
                }
                return data;
            });
        });
    }

    // fetch() with the JSON body and sign-in token. A 401 means the session ended (expired,
    // signed out elsewhere, or account turned off), so it goes back to the sign-in screen.
    function authorizedFetch(method, path, body) {
        var headers = body ? { 'Content-Type': 'application/json' } : {};
        if (session) headers.Authorization = 'Bearer ' + session.token;
        return fetch(API_BASE_URL + path, {
            method: method,
            headers: headers,
            body: body ? JSON.stringify(body) : undefined
        }).catch(function () {
            throw new Error('Can\'t reach the API at ' + API_BASE_URL + '. Start it with "dotnet run" in the API folder, then click Refresh.');
        }).then(function (response) {
            if (response.status === 401 && session) {
                endSession('Your session ended. Please sign in again.');
                throw new Error('Please sign in again.');
            }
            return response;
        });
    }

    // ---------------------------------------------------------------
    // SIGN IN / OUT
    // ---------------------------------------------------------------

    function restoreSession() {
        try { session = JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch (e) { session = null; }
        if (!session) {
            showLogin();
            return;
        }
        // Make sure the saved token still works before showing any data
        apiRequest('GET', '/auth/me').then(function (staff) {
            session.staff = staff;
            showDashboard();
        }).catch(function (err) {
            if (session) showLogin(err.message); // API unreachable; a 401 already showed the sign-in screen
        });
    }

    function signIn() {
        el.loginError.classList.add('d-none');
        if (!el.loginForm.checkValidity()) {
            el.loginForm.classList.add('was-validated');
            return;
        }
        el.loginBtn.disabled = true;
        el.loginBtn.textContent = 'Signing in…';
        apiRequest('POST', '/auth/login', {
            email: el.loginEmail.value,
            password: el.loginPassword.value
        }).then(function (result) {
            session = { token: result.token, staff: result.staff };
            try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch (e) { /* storage unavailable: signed in for this page only */ }
            el.loginPassword.value = '';
            el.loginForm.classList.remove('was-validated');
            showDashboard();
        }).catch(function (err) {
            showLogin(err.message);
        }).then(function () {
            el.loginBtn.disabled = false;
            el.loginBtn.textContent = 'Sign in';
        });
    }

    function signOut() {
        var current = session;
        endSession();
        if (current) {
            // Tell the server too, so the token stops working right away
            fetch(API_BASE_URL + '/auth/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + current.token } })
                .catch(function () { /* already signed out locally */ });
        }
    }

    // Forget the token and hide all data
    function endSession(message) {
        session = null;
        try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* storage unavailable */ }
        var modal = bootstrap.Modal.getInstance(el.appDetailModalEl);
        if (modal) modal.hide();
        dashboard = null;
        applications = [];
        showLogin(message);
    }

    function showLogin(message) {
        el.dashboardContent.classList.add('d-none');
        el.signedInBox.classList.add('d-none');
        el.loginScreen.classList.remove('d-none');
        el.loginError.textContent = message || '';
        el.loginError.classList.toggle('d-none', !message);
        el.loginEmail.focus();
    }

    function showDashboard() {
        el.loginScreen.classList.add('d-none');
        el.dashboardContent.classList.remove('d-none');
        el.signedInBox.classList.remove('d-none');
        el.signedInName.textContent = session.staff.firstName + ' ' + session.staff.lastName +
            (session.staff.role === 'admin' ? ' (admin)' : '');
        refresh();
    }

    function downloadFile(path, fileName) {
        authorizedFetch('GET', path).then(function (response) {
            if (!response.ok) throw new Error('Couldn\'t download the file (HTTP ' + response.status + ').');
            return response.blob();
        }).then(function (blob) {
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        }).catch(function (err) {
            el.appActionError.textContent = err.message;
            el.appActionError.classList.remove('d-none');
        });
    }

    function refresh() {
        var token = ++requestCounter;
        var query = '?range=' + encodeURIComponent(filters.range) +
            (filters.state ? '&state=' + encodeURIComponent(filters.state) : '') +
            (filters.line ? '&line=' + encodeURIComponent(filters.line) : '');

        Promise.all([
            apiRequest('GET', '/dashboard' + query),
            apiRequest('GET', '/applications'),
            rules ? Promise.resolve(rules) : apiRequest('GET', '/dashboard/rules')
        ]).then(function (results) {
            if (token !== requestCounter) return;
            dashboard = results[0];
            applications = results[1];
            rules = results[2];
            el.apiError.classList.add('d-none');
            renderAll();
        }).catch(function (err) {
            if (token !== requestCounter) return;
            el.apiError.textContent = err.message;
            el.apiError.classList.remove('d-none');
        });
    }

    // ---------------------------------------------------------------
    // RENDER: KPIs, funnel, friction
    // ---------------------------------------------------------------

    function renderAll() {
        renderFilterSummary();
        renderKpis();
        renderFunnel();
        renderFrictionTable();
        renderPricing();
        renderAgentUsage();
        renderQueue();
        renderVisits();
        renderRules();
        el.quickExitSteps.textContent = dashboard.quickExitSteps.join(', ');
    }

    function renderFilterSummary() {
        var stateLabel = filters.state ? stateName(filters.state) : 'All States';
        var lineLabel = filters.line ? LINE_LABELS[filters.line] : 'All Lines';
        el.filterSummary.textContent = 'Showing ' + lineLabel + ' · ' + stateLabel + ' · started ' +
            RANGE_LABELS[filters.range].toLowerCase() + '. Last refreshed ' + new Date().toLocaleTimeString() + '.';
    }

    function renderKpis() {
        var d = dashboard;
        var completion = percent(d.submitted, d.started);
        var tiles = [
            { label: 'Applications Started', value: d.started, caption: 'In the selected date range' },
            { label: 'Completion Rate', value: completion === null ? '—' : completion + '%', caption: d.submitted + ' submitted' },
            { label: 'Not Submitted', value: completion === null ? '—' : (100 - completion) + '%', caption: 'Abandoned or still in progress' },
            { label: 'Awaiting Review', value: d.awaitingReview, caption: 'New, under review, or escalated' },
            { label: 'Quick Exits', value: d.started > 0 ? percent(d.quickExits, d.started) + '%' : '—', caption: d.quickExits + ' left on step ' + d.quickExitSteps.join(' or ') },
            { label: 'Avg. Time to Submit', value: d.avgMinutesToSubmit === null ? '—' : formatMinutes(d.avgMinutesToSubmit), caption: 'Start of application to submit' }
        ];

        el.kpiRow.innerHTML = kpiTilesHtml(tiles);
    }

    function kpiTilesHtml(tiles) {
        return tiles.map(function (t) {
            return (
                '<div class="col-6 col-md-4 col-lg">' +
                    '<div class="kpi-tile">' +
                        '<div class="kpi-label">' + t.label + '</div>' +
                        '<div class="kpi-value">' + t.value + '</div>' +
                        '<div class="kpi-caption">' + t.caption + '</div>' +
                    '</div>' +
                '</div>'
            );
        }).join('');
    }

    // Min / max / average demo estimate per line (pricing in GET /api/dashboard)
    function renderPricing() {
        var p = dashboard.pricing;
        el.pricingIntro.textContent = 'Yearly price ranges customers were shown on the Quote step, for the ' +
            p.quotedApplications + ' application' + (p.quotedApplications === 1 ? '' : 's') +
            ' matching the filters that reached it. Recalculated with the current demo rates.';

        if (p.error) {
            el.pricingTableBody.innerHTML = '<tr><td colspan="5" class="text-danger small">' + escapeHtml(p.error) + '</td></tr>';
            el.pricingFootnote.textContent = '';
            return;
        }

        var rows = Object.keys(LINE_LABELS).map(function (code) {
            return p.lines.filter(function (l) { return l.lineCode === code; })[0];
        }).filter(Boolean);
        el.pricingTableBody.innerHTML = rows.length === 0
            ? '<tr><td colspan="5" class="text-muted small">No estimates yet for these filters.</td></tr>'
            : rows.map(function (l) {
                return '<tr>' +
                    '<td class="fw-semibold">' + LINE_LABELS[l.lineCode] + '</td>' +
                    '<td>' + l.estimates + '</td>' +
                    '<td>' + formatMoney(l.min) + '</td>' +
                    '<td>' + formatMoney(l.max) + '</td>' +
                    '<td>' + moneyRange(l.avgLow, l.avgHigh) + '</td>' +
                '</tr>';
            }).join('');

        var notPriced = [];
        if (p.referredLines > 0) notPriced.push(p.referredLines + ' needed a specialist to price');
        if (p.incompleteLines > 0) notPriced.push(p.incompleteLines + ' were missing answers');
        el.pricingFootnote.textContent =
            'National-average ballpark' + (p.ruleVersion ? ' (' + p.ruleVersion + ')' : '') +
            ', not adjusted for state and not real quotes. Lowest = smallest low end; highest = largest high end. ' +
            'Bundles count once per line.' + (notPriced.length ? ' Not included: ' + notPriced.join(', ') + '.' : '');
    }

    // How often agents are needed, and each agent's activity (agents in GET /api/dashboard)
    function renderAgentUsage() {
        var a = dashboard.agents;
        var handled = percent(a.handledByAgent, a.submitted);
        var escalated = percent(a.escalated, a.submitted);
        var referred = dashboard.pricing.referredLines;
        el.agentKpiRow.innerHTML = kpiTilesHtml([
            { label: 'Handled by an Agent', value: handled === null ? '—' : handled + '%', caption: a.handledByAgent + ' of ' + a.submitted + ' submitted applications' },
            { label: 'Escalated', value: escalated === null ? '—' : escalated + '%', caption: a.escalated + ' sent to a specialist or supervisor' },
            { label: 'Needed Specialist Pricing', value: referred, caption: 'Quote lines the demo couldn’t price' },
            { label: 'Active Agents', value: a.staff.length, caption: 'Made at least one status change' }
        ]);

        el.agentTableBody.innerHTML = a.staff.length === 0
            ? '<tr><td colspan="7" class="text-muted small">No agent activity for these filters.</td></tr>'
            : a.staff.map(function (s) {
                return '<tr>' +
                    '<td class="fw-semibold">' + escapeHtml(s.name) +
                        (s.role === 'admin' ? ' <span class="badge text-bg-secondary ms-1">Admin</span>' : '') + '</td>' +
                    '<td>' + s.actions + '</td>' +
                    '<td>' + s.applications + '</td>' +
                    '<td>' + s.approved + '</td>' +
                    '<td>' + s.rejected + '</td>' +
                    '<td>' + s.escalated + '</td>' +
                    '<td>' + timeAgo(s.lastActive) + '</td>' +
                '</tr>';
            }).join('');
    }

    // One entry per funnel stage with counts and drop-off from the previous stage
    function funnelStages() {
        var counts = dashboard.funnel;
        return FUNNEL_STAGES.map(function (stage, i) {
            var prev = i === 0 ? null : counts[i - 1];
            return {
                index: i,
                label: stage.label,
                sub: stage.sub,
                count: counts[i],
                continuePct: prev === null ? null : percent(counts[i], prev),
                dropoffCount: prev === null ? 0 : prev - counts[i]
            };
        });
    }

    function renderFunnel() {
        var stages = funnelStages();
        var max = stages[0].count;

        if (max === 0) {
            el.funnelContainer.innerHTML = '<p class="text-muted small mb-0">No applications match these filters.</p>';
            return;
        }

        // Flag the stage with the biggest % drop-off from the one before it
        var worst = null;
        stages.forEach(function (s) {
            if (s.continuePct !== null && s.dropoffCount > 0 && (!worst || s.continuePct < worst.continuePct)) worst = s;
        });

        el.funnelContainer.innerHTML = stages.map(function (s) {
            var widthPct = Math.max(4, Math.round((s.count / max) * 100));
            var isWorst = worst && s.index === worst.index;
            var continueLine = s.index === 0 ? 'Entry point'
                : s.continuePct === null ? '—'
                : s.continuePct + '% continued · ' + (100 - s.continuePct) + '% dropped off';

            return (
                '<button type="button" class="funnel-row" data-index="' + s.index + '">' +
                    '<span class="funnel-label-col">' + s.label +
                        (isWorst ? ' <span class="funnel-attention-badge">⚠ Biggest Drop-off</span>' : '') +
                        '<span class="funnel-sub">' + s.sub + '</span>' +
                    '</span>' +
                    '<span class="funnel-track"><span class="funnel-fill' + (isWorst ? ' attention' : '') + '" style="width:' + widthPct + '%"></span></span>' +
                    '<span class="funnel-value-col">' +
                        '<span class="funnel-users">' + s.count + '</span>' +
                        '<span class="funnel-continue">' + continueLine + '</span>' +
                    '</span>' +
                '</button>'
            );
        }).join('');

        el.funnelContainer.querySelectorAll('.funnel-row').forEach(function (row) {
            row.addEventListener('click', function () {
                openStepDetail(parseInt(row.getAttribute('data-index'), 10));
            });
        });
    }

    // Friction metrics for step number 1-5, as rates. Returns null if the step has no tracked visits.
    function stepFriction(stepNumber) {
        var row = dashboard.friction.filter(function (f) { return f.stepNumber === stepNumber; })[0];
        if (!row || row.visits === 0) return null;

        var isQuickExitStep = dashboard.quickExitSteps.indexOf(stepNumber) !== -1;
        var exitPct = percent(row.exits, row.visits);
        var quickExitPct = isQuickExitStep ? percent(row.quickExits, row.visits) : null;
        var errorPct = percent(row.errorSessions, row.visits);
        // Placeholder formula, see "Placeholder Thresholds". Exits count extra on quick-exit steps.
        var score = exitPct * (isQuickExitStep ? 1.5 : 1) + errorPct * 1.2;

        return {
            visits: row.visits,
            dwellSec: row.avgDwellSeconds === null ? null : Math.round(row.avgDwellSeconds),
            exitPct: exitPct,
            quickExitPct: quickExitPct,
            errorPct: errorPct,
            backClicks: row.backClicks,
            tier: score >= 45 ? 'critical' : (score >= 25 ? 'warning' : 'good')
        };
    }

    // Applications that reached this step but not the next one
    function stepDropoff(stepNumber) {
        var reached = dashboard.funnel[stepNumber - 1];
        var left = reached - dashboard.funnel[stepNumber];
        return { count: left, pct: percent(left, reached) };
    }

    function renderFrictionTable() {
        if (dashboard.friction.length === 0) {
            el.frictionTableBody.innerHTML =
                '<tr><td colspan="9" class="text-muted small text-center py-3">No tracking events recorded for these filters.</td></tr>';
            return;
        }

        var rows = [];
        for (var step = 1; step <= 5; step++) {
            var f = stepFriction(step);
            var drop = stepDropoff(step);
            rows.push(
                '<tr data-index="' + (step - 1) + '">' +
                    '<td><strong>' + FUNNEL_STAGES[step - 1].label + '</strong></td>' +
                    '<td>' + (f ? f.visits : 0) + '</td>' +
                    '<td>' + (f && f.dwellSec !== null ? formatDuration(f.dwellSec) : '—') + '</td>' +
                    '<td>' + (f ? f.exitPct + '%' : '—') + '</td>' +
                    '<td>' + (f && f.quickExitPct !== null ? f.quickExitPct + '%' : '<span class="text-muted" title="Not a quick-exit step">—</span>') + '</td>' +
                    '<td>' + drop.count + (drop.pct === null ? '' : ' (' + drop.pct + '%)') + '</td>' +
                    '<td>' + (f ? f.errorPct + '%' : '—') + '</td>' +
                    '<td>' + (f ? f.backClicks : '—') + '</td>' +
                    '<td>' + (f ? statusPillHtml(f.tier) : '<span class="text-muted small">No data</span>') + '</td>' +
                '</tr>'
            );
        }
        el.frictionTableBody.innerHTML = rows.join('');

        el.frictionTableBody.querySelectorAll('tr[data-index]').forEach(function (row) {
            row.addEventListener('click', function () {
                openStepDetail(parseInt(row.getAttribute('data-index'), 10));
            });
        });
    }

    function statusPillHtml(tier) {
        if (tier === 'critical') return '<span class="status-pill status-critical">⚠ Needs Attention</span>';
        if (tier === 'warning') return '<span class="status-pill status-warning">▲ Watch</span>';
        return '<span class="status-pill status-good">✓ OK</span>';
    }

    // Whole visits (open to close) and the pages people left from
    function renderVisits() {
        var v = dashboard.visits;
        var startedPct = percent(v.startedApplication, v.sessions);
        el.visitKpiRow.innerHTML = kpiTilesHtml([
            { label: 'Visits', value: v.sessions, caption: 'Started in the date range' },
            { label: 'Avg. Visit Length', value: v.avgVisitSeconds === null ? '—' : formatDuration(Math.round(v.avgVisitSeconds)), caption: 'Opening the site to leaving it' },
            { label: 'Started an Application', value: startedPct === null ? '—' : startedPct + '%', caption: v.startedApplication + ' of ' + v.sessions + ' visits' }
        ]);

        var totalExits = v.exitPages.reduce(function (sum, page) { return sum + page.exits; }, 0);
        el.exitPagesBody.innerHTML = v.exitPages.length === 0
            ? '<tr><td colspan="5" class="text-muted small">No visits tracked for these filters yet.</td></tr>'
            : v.exitPages.map(function (page) {
                var isQuick = page.page === 'apply' && dashboard.quickExitSteps.indexOf(page.stepNumber) !== -1;
                return '<tr>' +
                    '<td class="fw-semibold">' + escapeHtml(exitPageLabel(page)) +
                        (isQuick ? ' <span class="status-pill status-warning ms-1">Quick exit</span>' : '') + '</td>' +
                    '<td>' + page.exits + '</td>' +
                    '<td>' + percent(page.exits, totalExits) + '%</td>' +
                    '<td>' + (page.avgSecondsOnPage === null ? '—' : formatDuration(Math.round(page.avgSecondsOnPage))) + '</td>' +
                    '<td>' + (page.avgVisitSeconds === null ? '—' : formatDuration(Math.round(page.avgVisitSeconds))) + '</td>' +
                '</tr>';
            }).join('');
    }

    function exitPageLabel(page) {
        if (page.page === 'apply') {
            return page.stepNumber ? 'Application step ' + page.stepNumber + ': ' + FUNNEL_STAGES[page.stepNumber - 1].label : 'Application';
        }
        return EXIT_PAGE_LABELS[page.page] || humanize(page.page);
    }

    // Preliminary eligibility rules; with a state filter, that state's rules plus the ones for every state
    function renderRules() {
        var shown = rules.filter(function (r) { return !filters.state || r.state === 'ALL' || r.state === filters.state; })
            .filter(function (r) { return !filters.line || r.lineCode === filters.line; });
        el.rulesTableBody.innerHTML = shown.length === 0
            ? '<tr><td colspan="4" class="text-muted small">No rules for these filters.</td></tr>'
            : shown.map(function (r) {
                return '<tr>' +
                    '<td class="text-nowrap">' + (r.state === 'ALL' ? 'All states' : escapeHtml(stateName(r.state))) + '</td>' +
                    '<td>' + escapeHtml(LINE_LABELS[r.lineCode] || r.lineCode) + '</td>' +
                    '<td>' + escapeHtml(r.when) + '</td>' +
                    '<td>' + escapeHtml(r.effect) +
                        (r.source ? '<div class="small text-muted">Source: ' + escapeHtml(r.source) + '</div>' : '') +
                        (r.needsVerification ? '<div><span class="badge verify-badge mt-1">Needs verification</span></div>' : '') +
                    '</td>' +
                '</tr>';
            }).join('');
    }

    function openStepDetail(index) {
        var stage = funnelStages()[index];
        var stepNumber = index + 1;
        var isFormStep = stepNumber <= 5;
        var f = isFormStep ? stepFriction(stepNumber) : null;
        var drop = isFormStep ? stepDropoff(stepNumber) : null;

        var html =
            '<dl class="row small mb-0">' +
                detailRow('Applications reaching this stage', stage.count) +
                detailRow('Continued from previous stage', stage.continuePct === null ? '— (entry point)' : stage.continuePct + '%') +
                (drop ? detailRow('Stopped at this step', drop.count + (drop.pct === null ? '' : ' (' + drop.pct + '%)')) : '');

        if (f) {
            html +=
                detailRow('Tracked visits', f.visits) +
                detailRow('Avg. dwell time', f.dwellSec === null ? '—' : formatDuration(f.dwellSec)) +
                detailRow('Exit rate', f.exitPct + '%') +
                (f.quickExitPct !== null ? detailRow('Quick-exit rate (left on this step)', f.quickExitPct + '%') : '') +
                detailRow('Validation-error rate', f.errorPct + '%') +
                detailRow('Back clicks', f.backClicks) +
                detailRow('Status', statusPillHtml(f.tier));
        }
        html += '</dl>';

        if (isFormStep && !f) {
            html += '<p class="small text-muted mt-3 mb-0">No behavior events have been tracked for this step with the current filters.</p>';
        } else if (f) {
            html += '<p class="small text-muted mt-3 mb-0">Dwell time here means time on the step. Hover and field-focus time are different signals and aren\'t tracked.</p>';
        }

        el.stepDetailModalLabel.textContent = stage.label + ' — Step Detail';
        el.stepDetailModalBody.innerHTML = html;
        bootstrap.Modal.getOrCreateInstance(el.stepDetailModalEl).show();
    }

    // ---------------------------------------------------------------
    // RENDER: review queue
    // ---------------------------------------------------------------

    // Same filters the API applies to the dashboard, applied here to the application list
    function matchesFilters(app) {
        if (filters.state && app.stateCode !== filters.state) return false;
        if (filters.line && app.lineCodes.indexOf(filters.line) === -1) return false;
        var from = rangeStart(filters.range);
        return !from || parseDate(app.createdAt) >= from;
    }

    function matchesQueueStatus(app) {
        var show = el.queueStatus.value;
        if (app.status === 'in_progress' || app.status === 'abandoned') return false;
        if (show === 'all') return true;
        if (show === 'open') return OPEN_STATUSES.indexOf(app.status) !== -1;
        return app.status === show;
    }

    function renderQueue() {
        var rows = applications.filter(function (app) {
            return matchesFilters(app) && matchesQueueStatus(app);
        });

        // Oldest first for work that still needs action, newest first otherwise
        var oldestFirst = el.queueStatus.value === 'open';
        rows.sort(function (a, b) {
            var diff = parseDate(a.submittedAt) - parseDate(b.submittedAt);
            return oldestFirst ? diff : -diff;
        });

        if (rows.length === 0) {
            el.queueTableBody.innerHTML = '';
            el.queueEmptyMsg.textContent = 'No applications match the current filters.';
            return;
        }
        el.queueEmptyMsg.textContent = rows.length + ' application' + (rows.length === 1 ? '' : 's') + '.';

        el.queueTableBody.innerHTML = rows.map(function (app) {
            return (
                '<tr data-id="' + app.applicationId + '">' +
                    '<td><strong>#' + app.applicationId + '</strong></td>' +
                    '<td>' + escapeHtml(app.customerName || '—') + '</td>' +
                    '<td>' + linesHtml(app.lineCodes) + '</td>' +
                    '<td>' + app.stateCode + '</td>' +
                    '<td>' + statusBadgeHtml(app.status) + '</td>' +
                    '<td class="small">' + escapeHtml(app.assignedTo || 'Unassigned') + '</td>' +
                    '<td class="small">' + escapeHtml(app.latestNote || '') + '</td>' +
                    '<td class="text-muted small text-nowrap" title="' + formatDateTime(app.submittedAt) + '">' + timeAgo(app.submittedAt) + '</td>' +
                '</tr>'
            );
        }).join('');

        el.queueTableBody.querySelectorAll('tr').forEach(function (row) {
            row.addEventListener('click', function () {
                openAppDetail(parseInt(row.getAttribute('data-id'), 10));
            });
        });
    }

    // ---------------------------------------------------------------
    // APPLICATION DETAIL + AGENT ACTIONS
    // ---------------------------------------------------------------

    function openAppDetail(id) {
        openAppId = id;
        openApp = null;
        el.appActionNote.value = '';
        hideActionError();
        el.appDetailModalLabel.textContent = 'Application #' + id;
        el.appDetailModalBody.innerHTML = '<p class="text-muted small mb-0">Loading…</p>';
        updateActionButtons();
        bootstrap.Modal.getOrCreateInstance(el.appDetailModalEl).show();
        loadAppDetail(id);
    }

    function loadAppDetail(id) {
        apiRequest('GET', '/applications/' + id).then(function (app) {
            if (openAppId !== id) return;
            openApp = app;
            renderAppDetail(app);
            updateActionButtons();
            return apiRequest('GET', '/applications/' + id + '/quote').then(function (quote) {
                if (openAppId === id) renderQuoteSummary(quote);
            }, function (err) {
                if (openAppId !== id) return;
                document.getElementById('appQuote').textContent = err.message;
                document.getElementById('appFlags').textContent = '';
            });
        }).catch(function (err) {
            if (openAppId !== id) return;
            el.appDetailModalBody.innerHTML = '<div class="alert alert-danger small mb-0">' + escapeHtml(err.message) + '</div>';
        });
    }

    function renderAppDetail(app) {
        var html =
            '<h6 class="detail-heading">Summary</h6>' +
            '<dl class="row small mb-3">' +
                detailRow('Applicant', escapeHtml(app.customerName || '—')) +
                detailRow('Email', escapeHtml(app.email || '—')) +
                detailRow('Phone', escapeHtml(app.phone || '—')) +
                detailRow(app.isBundle ? 'Insurance lines (bundle)' : 'Insurance line', linesHtml(app.lineCodes)) +
                detailRow('State', escapeHtml(stateName(app.stateCode))) +
                detailRow('Status', statusBadgeHtml(app.status)) +
                detailRow('Assigned to', escapeHtml(app.assignedTo || 'Unassigned')) +
                detailRow('Applied as', app.hasAccount ? 'Signed-in customer (can save and come back)' : 'Guest') +
                detailRow('Started', formatDateTime(app.createdAt)) +
                detailRow('Submitted', app.submittedAt ? formatDateTime(app.submittedAt) : '—') +
                (app.rejectionReason ? detailRow('Rejection reason', escapeHtml(app.rejectionReason)) : '') +
            '</dl>';

        html += '<h6 class="detail-heading">Review Flags <span class="badge mock-badge ms-1">PRELIMINARY RULES</span></h6>' +
            '<div class="small mb-3" id="appFlags"><span class="text-muted">Checking…</span></div>';

        html += '<h6 class="detail-heading">Demo Estimate <span class="badge mock-badge ms-1">NOT A REAL QUOTE</span></h6>' +
            '<div class="small mb-3" id="appQuote"><span class="text-muted">Calculating…</span></div>';

        html += currentPolicyHtml(app);

        // The current-policy answers are shown in their own section above
        var answerKeys = Object.keys(app.answers).filter(function (key) {
            return CURRENT_POLICY_FIELDS.indexOf(key) === -1;
        });
        if (answerKeys.length > 0) {
            html += '<h6 class="detail-heading">Answers</h6><dl class="row small mb-3">' +
                answerKeys.map(function (key) {
                    return detailRow(escapeHtml(FIELD_LABELS[key] || humanize(key)), escapeHtml(formatAnswer(key, app.answers[key])));
                }).join('') +
                '</dl>';
        }

        html += itemsHtml('Vehicles', app.items.vehicle, describeVehicle);
        html += itemsHtml('Drivers', app.items.driver, describeDriver);
        html += itemsHtml('Jewelry', app.items.jewelry, describeJewelry);
        if (app.items.jewelry && app.items.jewelry.length > 1) {
            var total = app.items.jewelry.reduce(function (sum, item) { return sum + (parseFloat(item.value) || 0); }, 0);
            html += '<p class="small mb-3"><strong>Total jewelry value:</strong> ' + formatMoney(total) + '</p>';
        }

        html += '<h6 class="detail-heading">History</h6><ul class="list-unstyled small history-list mb-0">' +
            app.history.map(function (h) {
                return (
                    '<li>' +
                        '<span class="text-muted">' + formatDateTime(h.changedAt) + '</span> · ' +
                        statusBadgeHtml(h.newStatus) + ' ' +
                        escapeHtml(h.note || '') +
                        (h.changedBy ? ' <span class="text-muted">— ' + escapeHtml(h.changedBy) + '</span>' : '') +
                    '</li>'
                );
            }).join('') +
            '</ul>';

        el.appDetailModalBody.innerHTML = html;
    }

    var CURRENT_POLICY_FIELDS = ['current_insurer', 'current_policy_end'];

    // Who the customer is switching from, when that policy ends, and the uploaded
    // declarations page. Empty unless they answered "yes" to switching.
    function currentPolicyHtml(app) {
        if (app.answers.switching_carrier !== 'yes') return '';
        var doc = app.documents.filter(function (d) { return d.docType === 'current_policy'; })[0];
        var fileHtml = doc
            ? '<a href="#" data-download="/applications/' + app.applicationId + '/documents/' + doc.documentId + '">' +
                  escapeHtml(doc.fileName) + '</a> <span class="text-muted">(' + formatFileSize(doc.sizeBytes) +
                  ', uploaded ' + formatDateTime(doc.uploadedAt) + ')</span>'
            : '<span class="text-muted">Not uploaded &mdash; ask the customer for it if needed</span>';
        return '<h6 class="detail-heading">Current Policy (switching)</h6>' +
            '<dl class="row small mb-3">' +
                detailRow('Current insurer', escapeHtml(app.answers.current_insurer || '—')) +
                detailRow('Current policy ends', escapeHtml(app.answers.current_policy_end || '—')) +
                detailRow('Declarations page', fileHtml) +
            '</dl>';
    }

    function formatFileSize(bytes) {
        return bytes >= 1024 * 1024 ? (bytes / (1024 * 1024)).toFixed(1) + ' MB' : Math.max(1, Math.round(bytes / 1024)) + ' KB';
    }

    // Same demo estimate the customer sees on the Quote step (GET /api/applications/{id}/quote)
    function renderQuoteSummary(quote) {
        var QUOTE_STATUS = { DEMO_ESTIMATE: 'Estimate', INCOMPLETE: 'Needs more info', REFERRED: 'Specialist to price' };
        var html = quote.totalLow !== null
            ? '<p class="mb-1"><strong>Total: ' + moneyRange(quote.totalLow, quote.totalHigh) + ' / year</strong></p>'
            : '';
        html += '<ul class="list-unstyled mb-1">' + quote.lines.map(function (line) {
            var value = line.low !== null ? moneyRange(line.low, line.high) + ' / year' : QUOTE_STATUS[line.status] || line.status;
            var extra = line.missing.length > 0
                ? 'Missing: ' + line.missing.map(function (m) { return m.label; }).join(', ')
                : line.basis.concat(line.notes).join(' · ');
            return '<li><strong>' + (LINE_LABELS[line.lineCode] || escapeHtml(line.lineCode)) + ':</strong> ' + escapeHtml(value) +
                (extra ? '<div class="text-muted">' + escapeHtml(extra) + '</div>' : '') + '</li>';
        }).join('') + '</ul>';
        html += '<div class="text-muted">National-average ballpark (' + escapeHtml(quote.ruleVersion) + ') with preliminary state adjustments.</div>';
        document.getElementById('appQuote').innerHTML = html;
        renderFlags(quote.flags || []);
    }

    // What the preliminary rules found, and the status they point to (see "What does each status mean?")
    function renderFlags(flags) {
        var order = ['refer', 'review', 'info'];
        flags = flags.slice().sort(function (a, b) { return order.indexOf(a.severity) - order.indexOf(b.severity); });
        var suggestion = flags.some(function (f) { return f.severity === 'refer'; })
            ? '<strong>Suggested: Escalate.</strong> A specialist rule applies.'
            : flags.some(function (f) { return f.severity === 'review'; })
                ? '<strong>Suggested: Start review</strong> and check the flagged items before approving.'
                : '<strong>No flags.</strong> Can be approved after a standard review.';

        var html = '<p class="mb-2">' + suggestion + '</p>';
        if (flags.length > 0) {
            html += '<ul class="list-unstyled flag-list mb-0">' + flags.map(function (f) {
                var meta = FLAG_META[f.severity] || FLAG_META.info;
                return '<li><span class="status-pill ' + meta.cls + ' me-1">' + meta.label + '</span>' +
                    '<strong>' + escapeHtml(LINE_LABELS[f.lineCode] || f.lineCode) + ':</strong> ' + escapeHtml(f.message) + '</li>';
            }).join('') + '</ul>';
        }
        document.getElementById('appFlags').innerHTML = html;
    }

    function moneyRange(low, high) {
        return formatMoney(low) + ' – ' + formatMoney(high);
    }

    function itemsHtml(title, items, describe) {
        if (!items || items.length === 0) return '';
        return '<h6 class="detail-heading">' + title + '</h6><ol class="small mb-3 ps-3">' +
            items.map(function (item) { return '<li>' + escapeHtml(describe(item)) + '</li>'; }).join('') +
            '</ol>';
    }

    function describeVehicle(v) {
        return [v.year, v.make, v.model].join(' ') + ' — ' + optionLabel('use', v.use) + ', ' +
            formatNumber(v.annual_mileage) + ' mi/yr, parked in ' + v.garaging_zip + ', ' + optionLabel('ownership', v.ownership);
    }

    function describeDriver(d) {
        return d.first_name + ' ' + d.last_name + ' (' + optionLabel('relationship', d.relationship) + '), licensed ' +
            d.years_licensed + (d.years_licensed === '1' ? ' year' : ' years') + ', mainly drives vehicle ' + d.primary_vehicle;
    }

    function describeJewelry(j) {
        return optionLabel('item_type', j.item_type) + ': ' + j.description + ' — ' + formatMoney(parseFloat(j.value)) +
            (j.appraised === 'yes' ? ', appraised' + (j.appraisal_date ? ' ' + j.appraisal_date : '') : ', not appraised');
    }

    function updateActionButtons() {
        var agentChosen = !!session;
        var canAct = openApp && OPEN_STATUSES.indexOf(openApp.status) !== -1;

        el.appActionButtons.forEach(function (btn) {
            btn.disabled = !agentChosen || !canAct || btn.getAttribute('data-action') === openApp.status;
        });
        el.appActionNote.disabled = !agentChosen || !canAct;

        if (!openApp) {
            el.appActionHint.textContent = '';
        } else if (!canAct) {
            el.appActionHint.textContent = 'This application is ' + STATUS_META[openApp.status].label.toLowerCase() + ' — no further actions.';
        } else if (agentChosen) {
            el.appActionHint.textContent = 'Changes are saved as ' + session.staff.firstName + ' ' + session.staff.lastName + '.';
        }
    }

    function changeStatus(newStatus) {
        var id = openAppId;
        hideActionError();
        el.appActionButtons.forEach(function (btn) { btn.disabled = true; });

        apiRequest('PUT', '/applications/' + id + '/status', {
            status: newStatus,
            note: el.appActionNote.value
        }).then(function () {
            el.appActionNote.value = '';
            loadAppDetail(id);
            refresh();
        }).catch(function (err) {
            el.appActionError.textContent = err.message;
            el.appActionError.classList.remove('d-none');
            updateActionButtons();
        });
    }

    function hideActionError() {
        el.appActionError.classList.add('d-none');
    }

    // ---------------------------------------------------------------
    // HELPERS
    // ---------------------------------------------------------------

    // Everything typed by a customer or agent goes through this before innerHTML
    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function detailRow(label, valueHtml) {
        return '<dt class="col-5 text-muted fw-normal">' + label + '</dt><dd class="col-7">' + valueHtml + '</dd>';
    }

    // ['HOME', 'AUTO'] -> 'Homeowners + Auto' with a BUNDLE tag
    function linesHtml(lineCodes) {
        var text = lineCodes.map(function (code) { return LINE_LABELS[code] || code; }).join(' + ');
        return lineCodes.length > 1 ? text + ' <span class="badge bundle-badge">BUNDLE</span>' : text;
    }

    function statusBadgeHtml(status) {
        var meta = STATUS_META[status] || { label: status, cls: 'queue-status-denied' };
        return '<span class="queue-status-pill ' + meta.cls + '">' + meta.label + '</span>';
    }

    function formatAnswer(key, value) {
        if (value === null || value === '') return '—';
        if (value === 'yes') return 'Yes';
        if (value === 'no') return 'No';
        if (key === 'coverage_components') return value.split(',').join(', ');
        if (key === 'protective_devices') return value.split(',').map(function (v) { return optionLabel(key, v); }).join(', ');
        if (key === 'square_feet') return formatNumber(value);
        return optionLabel(key, value);
    }

    function optionLabel(field, value) {
        return (VALUE_LABELS[field] && VALUE_LABELS[field][value]) || value;
    }

    function humanize(key) {
        var text = key.replace(/_/g, ' ');
        return text.charAt(0).toUpperCase() + text.slice(1);
    }

    function stateName(code) {
        var found = US_STATES.filter(function (pair) { return pair[0] === code; })[0];
        return found ? found[1] : code;
    }

    // Whole-number percent, or null when there's nothing to divide by
    function percent(part, whole) {
        return whole > 0 ? Math.round((part / whole) * 100) : null;
    }

    // Matches the date math in DashboardController
    function rangeStart(range) {
        var today = new Date();
        today.setHours(0, 0, 0, 0);
        if (range === 'last7') return addDays(today, -7);
        if (range === 'last30') return addDays(today, -30);
        if (range === 'last90') return addDays(today, -90);
        if (range === 'ytd') return new Date(today.getFullYear(), 0, 1);
        return null;
    }

    function addDays(date, days) {
        var copy = new Date(date);
        copy.setDate(copy.getDate() + days);
        return copy;
    }

    // The API sends MySQL local times without a time zone, which JS reads as local time
    function parseDate(value) {
        return value ? new Date(value) : new Date(0);
    }

    function formatDateTime(value) {
        if (!value) return '';
        return parseDate(value).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
    }

    function timeAgo(value) {
        if (!value) return '—';
        var minutes = Math.round((Date.now() - parseDate(value).getTime()) / 60000);
        if (minutes < 1) return 'just now';
        if (minutes < 60) return minutes + ' min ago';
        var hours = Math.round(minutes / 60);
        if (hours < 24) return hours + (hours === 1 ? ' hour ago' : ' hours ago');
        var days = Math.round(hours / 24);
        return days + (days === 1 ? ' day ago' : ' days ago');
    }

    function formatNumber(value) {
        var num = parseFloat(value);
        return isNaN(num) ? String(value) : num.toLocaleString();
    }

    function formatMoney(amount) {
        return '$' + amount.toLocaleString(undefined, { maximumFractionDigits: 2 });
    }

    function formatDuration(totalSeconds) {
        var m = Math.floor(totalSeconds / 60);
        var s = totalSeconds % 60;
        if (m === 0) return s + 's';
        return m + 'm ' + s + 's';
    }

    function formatMinutes(minutes) {
        var total = Math.round(minutes);
        if (total < 60) return total + 'm';
        var h = Math.floor(total / 60);
        if (h < 48) return h + 'h ' + (total % 60) + 'm';
        return Math.round(h / 24) + ' days';
    }

})();

/* Valent Partners - staff dashboard (the #/dashboard view; staff sign in on the shared
   sign-in screen, see auth.js). Loads everything from the C# API:
     GET /api/dashboard           KPIs, funnel, friction, rejection reasons, ZIP risk, escalation counts
     GET /api/applications        the review queue
     GET /api/applications/{id}   one application's answers, history, and ZIP risk
     PUT /api/applications/{id}/status   start review / approve / reject (with a reason) / escalate
     GET /api/applications/rejection-reasons   reasons an agent can pick when rejecting
     GET /api/applications/{id}/documents/{documentId}   download an uploaded file
   Every call carries the signed-in staff member's token (added by Valent.api in common.js).
   While the dashboard is open it refreshes every minute and pops up a notice for each
   newly escalated application. */

(function () {
    'use strict';

    // ---------------------------------------------------------------
    // REFERENCE DATA (labels only, no metrics)
    // ---------------------------------------------------------------

    // The sprint's demo states (common.js). Older applications from other states
    // still show, by their state code.
    var US_STATES = Valent.US_STATES;

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

    // How often the dashboard refreshes itself while it's open (new escalations pop up)
    var POLL_MS = 60 * 1000;

    var RISK_LABELS = ['', 'Very low', 'Low', 'Moderate', 'High', 'Very high'];

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
        address_verified: 'Address check',
        home_type: 'Home type',
        year_built: 'Year built',
        square_feet: 'Square feet',
        flood_zone: 'Flood zone',
        has_basement: 'Basement',
        recent_incidents: 'Recent accidents, claims, or violations',
        dwelling_coverage: 'Home rebuild cost (dwelling coverage)',
        auto_coverage: 'Auto coverage',
        flood_building_coverage: 'Flood coverage: building',
        flood_contents_coverage: 'Flood coverage: belongings'
    };

    var VALUE_LABELS = {
        address_verified: {
            verified: 'Verified with Google',
            unverified: 'NOT confirmed by Google (customer kept it)',
            not_checked: 'Not checked (Google unavailable)'
        },
        home_type: { single_family: 'Single-family house', townhouse: 'Townhouse', condo: 'Condo', mobile: 'Mobile / manufactured' },
        flood_zone: { unknown: 'Not known', A: 'Zone A / AE (high risk)', V: 'Zone V / VE (coastal high risk)', X: 'Zone X (moderate/low risk)' },
        use: { commute: 'Commuting', pleasure: 'Personal / errands', business: 'Business', rideshare: 'Rideshare / delivery' },
        ownership: { owned: 'Owned outright', financed: 'Financed', leased: 'Leased' },
        relationship: { self: 'Applicant', spouse: 'Spouse / partner', child: 'Child', other_relative: 'Other relative', other: 'Other household member' },
        item_type: { ring: 'Ring', necklace: 'Necklace', bracelet: 'Bracelet', earrings: 'Earrings', watch: 'Watch', other: 'Other' }
    };

    // ---------------------------------------------------------------
    // STATE
    // ---------------------------------------------------------------

    var DEFAULT_FILTERS = { state: '', line: '', range: 'all' };
    var filters = Object.assign({}, DEFAULT_FILTERS);
    var dashboard = null;       // last GET /api/dashboard response
    var applications = [];      // last GET /api/applications response
    var openAppId = null;       // application shown in the detail modal
    var openApp = null;
    var requestCounter = 0;     // ignores slow responses from older filter changes
    var rejectionReasons = [];  // GET /api/applications/rejection-reasons
    var knownEscalations = null; // escalated application ids seen so far (null = first load)
    var pollTimer = null;
    var el = {};

    document.addEventListener('DOMContentLoaded', function () {
        cacheDom();
        populateStateFilter();
        bindEvents();

        Valent.on('view', function (event) {
            if (event.view === 'dashboard') startDashboard();
            else stopPolling();
        });
        Valent.on('session', function (session) {
            if (!session || session.type !== 'staff') clearDashboard();
        });
    });

    // The signed-in staff member ({ staffId, firstName, lastName, role })
    function me() {
        var session = Valent.session();
        return session && session.type === 'staff' ? session.user : null;
    }

    function startDashboard() {
        if (!me()) return;
        if (rejectionReasons.length === 0) loadRejectionReasons();
        refresh();
        stopPolling();
        pollTimer = setInterval(function () {
            if (!document.hidden) refresh(true);
        }, POLL_MS);
    }

    function stopPolling() {
        clearInterval(pollTimer);
        pollTimer = null;
    }

    // Signed out: forget everything this staff member could see
    function clearDashboard() {
        stopPolling();
        var modal = bootstrap.Modal.getInstance(el.appDetailModalEl);
        if (modal) modal.hide();
        dashboard = null;
        applications = [];
        knownEscalations = null;
        el.queueTableBody.innerHTML = '';
        el.kpiRow.innerHTML = '';
        Valent.setEscalationBadge(0);
    }

    function cacheDom() {
        el.apiError = document.getElementById('apiError');
        el.dashboardContent = document.getElementById('dashboardContent');
        el.filtersBar = document.getElementById('filtersBar');

        el.escalationAlert = document.getElementById('escalationAlert');
        el.escalationCount = document.getElementById('escalationCount');
        el.escalationTitle = document.getElementById('escalationTitle');
        el.escalationDetail = document.getElementById('escalationDetail');
        el.escalationShowBtn = document.getElementById('escalationShowBtn');
        el.queueSection = document.getElementById('queueSection');
        el.toastArea = document.getElementById('toastArea');
        el.rejectionBars = document.getElementById('rejectionBars');
        el.zipTableBody = document.getElementById('zipTableBody');
        el.chatKpiRow = document.getElementById('chatKpiRow');
        el.chatTopicBars = document.getElementById('chatTopicBars');
        el.chatOutcomeBars = document.getElementById('chatOutcomeBars');
        el.chatUsageError = document.getElementById('chatUsageError');
        el.appRejectCode = document.getElementById('appRejectCode');

        el.filterState = document.getElementById('filterState');
        el.filterLine = document.getElementById('filterLine');
        el.filterRange = document.getElementById('filterRange');
        el.resetFiltersBtn = document.getElementById('resetFiltersBtn');
        el.refreshBtn = document.getElementById('refreshBtn');
        el.filterSummary = document.getElementById('filterSummary');

        el.kpiRow = document.getElementById('kpiRow');
        el.funnelContainer = document.getElementById('funnelContainer');
        el.frictionTableBody = document.getElementById('frictionTableBody');
        el.quickExitSeconds = document.getElementById('quickExitSeconds');
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

        el.escalationShowBtn.addEventListener('click', showEscalatedInQueue);

        // Floating filters: add a stronger shadow once the bar is stuck to the top
        window.addEventListener('scroll', function () {
            if (Valent.currentView() !== 'dashboard') return;
            el.filtersBar.classList.toggle('is-stuck', el.filtersBar.getBoundingClientRect().top <= 9);
        }, { passive: true });

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
    // API (Valent.api in common.js adds the token; a 401 returns to the sign-in screen)
    // ---------------------------------------------------------------

    var apiRequest = Valent.api;

    function loadRejectionReasons() {
        apiRequest('GET', '/applications/rejection-reasons').then(function (reasons) {
            rejectionReasons = reasons;
            el.appRejectCode.innerHTML = '';
            el.appRejectCode.appendChild(new Option('Choose a reason…', ''));
            reasons.forEach(function (r) { el.appRejectCode.appendChild(new Option(r.agentLabel, r.code)); });
        }).catch(function () { /* shown when the agent tries to reject */ });
    }

    function rejectionLabel(code) {
        var found = rejectionReasons.filter(function (r) { return r.code === code; })[0];
        return found ? found.agentLabel : code;
    }

    function downloadFile(path, fileName) {
        Valent.rawFetch(path).then(function (response) {
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

    // quiet: a background refresh (polling), which doesn't replace a visible error with nothing
    function refresh(quiet) {
        if (!me()) return;
        var token = ++requestCounter;
        var query = '?range=' + encodeURIComponent(filters.range) +
            (filters.state ? '&state=' + encodeURIComponent(filters.state) : '') +
            (filters.line ? '&line=' + encodeURIComponent(filters.line) : '');

        Promise.all([
            apiRequest('GET', '/dashboard' + query),
            apiRequest('GET', '/applications')
        ]).then(function (results) {
            if (token !== requestCounter) return;
            dashboard = results[0];
            applications = results[1];
            el.apiError.classList.add('d-none');
            renderAll();
        }).catch(function (err) {
            if (token !== requestCounter || (quiet && err.status === 401)) return;
            el.apiError.textContent = err.message;
            el.apiError.classList.remove('d-none');
        });
    }

    // ---------------------------------------------------------------
    // RENDER: KPIs, funnel, friction
    // ---------------------------------------------------------------

    function renderAll() {
        renderEscalationAlert();
        renderFilterSummary();
        renderKpis();
        renderFunnel();
        renderFrictionTable();
        renderRejections();
        renderZips();
        renderChatUsage();
        renderPricing();
        renderAgentUsage();
        renderQueue();
        el.quickExitSeconds.textContent = dashboard.quickExitSeconds;
    }

    // ---------------------------------------------------------------
    // RENDER: escalation alert (how staff know an application was escalated)
    //   * a red banner at the top of the dashboard, with a button to the queue
    //   * a count on the Dashboard link in the navbar
    //   * a pop-up for each new escalation while the dashboard is open (checked every minute)
    // Specialists see the ones assigned to them; everyone else sees every open escalation.
    // ---------------------------------------------------------------

    function renderEscalationAlert() {
        var a = dashboard.agents;
        var isSpecialist = me().role === 'specialist';
        var count = isSpecialist ? a.openEscalationsForMe : a.openEscalations;

        Valent.setEscalationBadge(count);
        el.escalationAlert.classList.toggle('d-none', count === 0);
        if (count > 0) {
            el.escalationCount.textContent = count;
            el.escalationTitle.textContent = isSpecialist
                ? (count === 1 ? 'Escalated application assigned to you' : 'Escalated applications assigned to you')
                : (count === 1 ? 'Application is escalated' : 'Applications are escalated');
            el.escalationDetail.textContent = isSpecialist
                ? 'These need a specialist decision. ' + (a.openEscalations - a.openEscalationsForMe) + ' more are with other specialists.'
                : (me().role === 'admin'
                    ? 'Waiting on a specialist. Admins can step in and decide them.'
                    : 'Waiting on a specialist. Only specialists and admins can approve or reject them.');
        }
        notifyNewEscalations();
    }

    // Pop-up for applications that became escalated since the last refresh
    function notifyNewEscalations() {
        var isSpecialist = me().role === 'specialist';
        var escalated = applications.filter(function (app) {
            return app.status === 'escalated' && (!isSpecialist || isMine(app));
        });
        var ids = escalated.map(function (app) { return app.applicationId; });
        if (knownEscalations !== null) {
            escalated.filter(function (app) { return knownEscalations.indexOf(app.applicationId) === -1; })
                .forEach(showEscalationToast);
        }
        knownEscalations = ids;
    }

    function showEscalationToast(app) {
        var toast = document.createElement('div');
        toast.className = 'toast';
        toast.setAttribute('role', 'alert');
        toast.setAttribute('aria-live', 'assertive');
        toast.innerHTML =
            '<div class="toast-header">' +
                '<strong class="me-auto text-danger">New escalation</strong>' +
                '<button type="button" class="btn-close" data-bs-dismiss="toast" aria-label="Close"></button>' +
            '</div>' +
            '<div class="toast-body small">' +
                '<strong>#' + app.applicationId + '</strong> ' + escapeHtml(app.customerName || '') + ' &middot; ' +
                linesHtml(app.lineCodes) + '<br>' + escapeHtml(app.latestNote || '') +
                '<div class="mt-2"><button type="button" class="btn btn-sm valent-btn-primary">Open</button></div>' +
            '</div>';
        toast.querySelector('.toast-body .btn').addEventListener('click', function () {
            bootstrap.Toast.getOrCreateInstance(toast).hide();
            openAppDetail(app.applicationId);
        });
        toast.addEventListener('hidden.bs.toast', function () { toast.remove(); });
        el.toastArea.appendChild(toast);
        bootstrap.Toast.getOrCreateInstance(toast, { delay: 15000 }).show();
    }

    function showEscalatedInQueue() {
        el.queueStatus.value = me().role === 'specialist' ? 'mine' : 'escalated';
        renderQueue();
        el.queueSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // ---------------------------------------------------------------
    // RENDER: rejection reasons and ZIP risk
    // ---------------------------------------------------------------

    function renderRejections() {
        var rows = dashboard.rejections;
        var total = rows.reduce(function (sum, r) { return sum + r.count; }, 0);
        if (total === 0) {
            el.rejectionBars.innerHTML = '<p class="text-muted small mb-0">No rejected applications for these filters.</p>';
            return;
        }
        var max = rows[0].count;
        el.rejectionBars.innerHTML = rows.map(function (r) {
            return '<div class="bar-row">' +
                '<span class="bar-label">' + escapeHtml(r.label) + '</span>' +
                '<span class="bar-track"><span class="bar-fill d-block" style="width:' + Math.max(3, Math.round(r.count / max * 100)) + '%"></span></span>' +
                '<span class="bar-value">' + r.count + ' (' + percent(r.count, total) + '%)</span>' +
            '</div>';
        }).join('');
    }

    // AI chatbot usage (chat in GET /api/dashboard)
    var CHAT_TOPIC_LABELS = { HOME: 'Homeowners', FLOOD: 'Flood', JEWELRY: 'Jewelry', AUTO: 'Auto', GENERAL: 'General / website' };

    function barsHtml(rows) {
        var max = Math.max.apply(null, rows.map(function (r) { return r.count; }).concat([1]));
        var total = rows.reduce(function (sum, r) { return sum + r.count; }, 0);
        return rows.map(function (r) {
            return '<div class="bar-row">' +
                '<span class="bar-label">' + escapeHtml(r.label) + '</span>' +
                '<span class="bar-track"><span class="bar-fill d-block" style="width:' + (r.count ? Math.max(3, Math.round(r.count / max * 100)) : 0) + '%"></span></span>' +
                '<span class="bar-value">' + r.count + (total ? ' (' + percent(r.count, total) + '%)' : '') + '</span>' +
            '</div>';
        }).join('');
    }

    function formatMs(ms) {
        if (ms === null || ms === undefined) return '—';
        return ms < 1000 ? ms + ' ms' : (ms / 1000).toFixed(1) + ' s';
    }

    function renderChatUsage() {
        var c = dashboard.chat || {};
        el.chatUsageError.textContent = c.error || '';
        el.chatUsageError.classList.toggle('d-none', !c.error);

        var rated = (c.ratedHelpful || 0) + (c.ratedNotHelpful || 0);
        var quoteAsks = (c.quotes || 0) + (c.quotesNeedMoreInfo || 0) + (c.quotesReferred || 0);
        el.chatKpiRow.innerHTML = kpiTilesHtml([
            { label: 'Conversations', value: c.conversations || 0,
              caption: (c.avgQuestionsPerConversation || 0) + ' questions each on average' },
            { label: 'Estimates Given', value: c.quotes || 0,
              caption: (c.quotesFromForm || 0) + ' from the Quick estimate form' },
            { label: 'Clicked to Apply', value: c.conversations ? percent(c.applyClicks, c.conversations) + '%' : '—',
              caption: (c.applyClicks || 0) + ' conversations started an application' },
            { label: 'Rated Helpful', value: rated ? percent(c.ratedHelpful, rated) + '%' : '—',
              caption: rated + ' replies rated' },
            { label: 'First Word Appears', value: formatMs(c.avgFirstWordMs),
              caption: 'Average wait; full reply ' + formatMs(c.avgReplyMs) }
        ]);

        var topics = (c.topics || []).map(function (t) {
            return { label: CHAT_TOPIC_LABELS[t.topic] || t.topic, count: t.questions };
        });
        el.chatTopicBars.innerHTML = topics.length
            ? barsHtml(topics)
            : '<p class="text-muted small mb-0">No chatbot questions for these filters.</p>';

        var answered = (c.questions || 0) - quoteAsks - (c.offTopic || 0) - (c.errors || 0);
        el.chatOutcomeBars.innerHTML = c.questions
            ? barsHtml([
                { label: 'Answered a coverage question', count: Math.max(0, answered) },
                { label: 'Gave a price estimate', count: c.quotes || 0 },
                { label: 'Asked for more details to estimate', count: c.quotesNeedMoreInfo || 0 },
                { label: 'Sent to a specialist to price', count: c.quotesReferred || 0 },
                { label: 'Turned away (not about insurance)', count: c.offTopic || 0 },
                { label: 'Chatbot error', count: c.errors || 0 }
            ])
            : '<p class="text-muted small mb-0">No chatbot questions for these filters.</p>';

        document.getElementById('chatDemoBadge').classList.toggle('d-none', !(c.demoConversations > 0));
    }

    function riskPillHtml(level) {
        return '<span class="risk-pill risk-' + level + '" title="' + RISK_LABELS[level] + ' risk">' + level + '</span>';
    }

    function renderZips() {
        var rows = dashboard.zips;
        if (rows.length === 0) {
            el.zipTableBody.innerHTML = '<tr><td colspan="10" class="text-muted small">No ZIP codes recorded for these filters yet.</td></tr>';
            return;
        }
        el.zipTableBody.innerHTML = rows.map(function (z) {
            var risk = z.risk;
            var cells = risk
                ? riskPillHtml(risk.flood) + '</td><td>' + riskPillHtml(risk.wind) + '</td><td>' +
                  riskPillHtml(risk.hail) + '</td><td>' + riskPillHtml(risk.wildfire)
                : '<span class="text-muted small">Not rated</span></td><td></td><td></td><td>';
            return '<tr>' +
                '<td class="fw-semibold">' + escapeHtml(z.zip) + '</td>' +
                '<td>' + (risk ? escapeHtml(risk.placeName) + ', ' + escapeHtml(risk.stateCode) : escapeHtml(z.stateCode || '')) + '</td>' +
                '<td>' + z.applications + '</td>' +
                '<td>' + z.approved + '</td>' +
                '<td>' + z.rejected + '</td>' +
                '<td>' + z.escalated + '</td>' +
                '<td>' + cells + '</td>' +
            '</tr>';
        }).join('');
    }

    // ZIP risk block in the application detail modal
    function zipRiskHtml(app) {
        if (!app.zip) return '';
        var r = app.zipRisk;
        var body = r
            ? detailRow('Place', escapeHtml(r.placeName + ', ' + r.stateCode)) +
              detailRow('Flood', riskPillHtml(r.flood) + ' ' + RISK_LABELS[r.flood]) +
              detailRow('Hurricane / wind', riskPillHtml(r.wind) + ' ' + RISK_LABELS[r.wind]) +
              detailRow('Hail', riskPillHtml(r.hail) + ' ' + RISK_LABELS[r.hail]) +
              detailRow('Wildfire', riskPillHtml(r.wildfire) + ' ' + RISK_LABELS[r.wildfire])
            : detailRow('Ratings', '<span class="text-muted">This ZIP isn\'t in the risk table yet.</span>');
        return '<h6 class="detail-heading">ZIP ' + escapeHtml(app.zip) + ' Risk Factors' +
            (r && r.isMock ? ' <span class="badge mock-badge ms-1">DEMO RATINGS</span>' : '') + '</h6>' +
            '<dl class="row small mb-3">' + body + '</dl>';
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
            ', adjusted by each application\'s state; not real quotes. Lowest = smallest low end; highest = largest high end. ' +
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
            { label: 'Escalated', value: escalated === null ? '—' : escalated + '%', caption: a.escalated + ' sent to a specialist (' + a.autoEscalated + ' automatically)' },
            { label: 'Auto-Approved', value: a.autoApproved, caption: 'Auto / Jewelry that met the rules' },
            { label: 'Needed Specialist Pricing', value: referred, caption: 'Quote lines the demo couldn’t price' },
            { label: 'Active Agents', value: a.staff.length, caption: 'Made at least one status change' }
        ]);

        el.agentTableBody.innerHTML = a.staff.length === 0
            ? '<tr><td colspan="7" class="text-muted small">No agent activity for these filters.</td></tr>'
            : a.staff.map(function (s) {
                return '<tr>' +
                    '<td class="fw-semibold">' + escapeHtml(s.name) +
                        (s.role === 'admin' ? ' <span class="badge text-bg-secondary ms-1">Admin</span>' : '') +
                        (s.role === 'specialist' ? ' <span class="badge bundle-badge ms-1">Specialist</span>' : '') + '</td>' +
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

        var exitPct = percent(row.exits, row.visits);
        var quickExitPct = percent(row.quickExits, row.visits);
        var errorPct = percent(row.errorSessions, row.visits);
        var score = exitPct + quickExitPct * 1.5 + errorPct * 1.2;   // placeholder formula, see "Placeholder Thresholds"

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
                    '<td>' + (f ? f.quickExitPct + '%' : '—') + '</td>' +
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
                detailRow('Quick-exit rate (&lt; ' + dashboard.quickExitSeconds + 's)', f.quickExitPct + '%') +
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
        if (show === 'mine') return OPEN_STATUSES.indexOf(app.status) !== -1 && isMine(app);
        return app.status === show;
    }

    function isMine(app) {
        return !!me() && app.assignedStaffId === me().staffId;
    }

    function renderQueue() {
        var rows = applications.filter(function (app) {
            return matchesFilters(app) && matchesQueueStatus(app);
        });

        // Oldest first for work that still needs action, newest first otherwise
        var oldestFirst = el.queueStatus.value === 'open' || el.queueStatus.value === 'mine';
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
            var classes = [];
            if (app.status === 'escalated') classes.push('row-escalated');
            if (isMine(app) && OPEN_STATUSES.indexOf(app.status) !== -1) classes.push('row-mine');
            var note = app.status === 'rejected' && app.rejectionCode
                ? rejectionLabel(app.rejectionCode) + (app.latestNote ? ' — ' + app.latestNote : '')
                : app.latestNote || '';
            return (
                '<tr data-id="' + app.applicationId + '" class="' + classes.join(' ') + '">' +
                    '<td><strong>#' + app.applicationId + '</strong></td>' +
                    '<td>' + escapeHtml(app.customerName || '—') + '</td>' +
                    '<td>' + linesHtml(app.lineCodes) + '</td>' +
                    '<td>' + app.stateCode + '</td>' +
                    '<td>' + statusBadgeHtml(app.status) + autoBadgeHtml(app.autoDecision) + '</td>' +
                    '<td class="small">' + escapeHtml(app.assignedTo || 'Unassigned') + '</td>' +
                    '<td class="small">' + escapeHtml(app.zip || '—') + '</td>' +
                    '<td class="small">' + escapeHtml(note) + '</td>' +
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
                if (openAppId === id) document.getElementById('appQuote').textContent = err.message;
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
                detailRow('Status', statusBadgeHtml(app.status) + autoBadgeHtml(app.autoDecision)) +
                detailRow('Assigned to', escapeHtml(app.assignedTo || 'Unassigned')) +
                detailRow('Started', formatDateTime(app.createdAt)) +
                detailRow('Submitted', app.submittedAt ? formatDateTime(app.submittedAt) : '—') +
                (app.rejectionCode ? detailRow('Rejection reason', escapeHtml(rejectionLabel(app.rejectionCode))) : '') +
                (app.rejectionReason ? detailRow('Agent note', escapeHtml(app.rejectionReason)) : '') +
            '</dl>';

        html += zipRiskHtml(app);

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
        html += '<div class="text-muted">National-average ballpark (' + escapeHtml(quote.ruleVersion) + '), adjusted for ' + escapeHtml(quote.stateCode) + '.</div>';
        document.getElementById('appQuote').innerHTML = html;
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

    // Escalated applications can only be decided by a specialist or an admin
    function canDecide(app) {
        return !(app.status === 'escalated' && me().role === 'employee');
    }

    function updateActionButtons() {
        var signedIn = !!me();
        var canAct = openApp && OPEN_STATUSES.indexOf(openApp.status) !== -1;
        var allowed = canAct && canDecide(openApp);

        el.appActionButtons.forEach(function (btn) {
            btn.disabled = !signedIn || !allowed || btn.getAttribute('data-action') === openApp.status;
        });
        el.appActionNote.disabled = !signedIn || !allowed;
        el.appRejectCode.disabled = !signedIn || !allowed;
        el.appRejectCode.value = '';

        if (!openApp) {
            el.appActionHint.textContent = '';
        } else if (!canAct) {
            el.appActionHint.textContent = 'This application is ' + STATUS_META[openApp.status].label.toLowerCase() + ' — no further actions.';
        } else if (!allowed) {
            el.appActionHint.textContent = 'Escalated to ' + (openApp.assignedTo || 'a specialist') +
                '. Only specialists and admins can decide escalated applications.';
        } else if (signedIn) {
            el.appActionHint.textContent = 'Changes are saved as ' + me().firstName + ' ' + me().lastName + '.' +
                (openApp.status !== 'escalated' ? ' Escalating sends it to a specialist.' : '');
        }
    }

    function changeStatus(newStatus) {
        var id = openAppId;
        hideActionError();

        // A rejection needs a reason the customer can see
        if (newStatus === 'rejected' && !el.appRejectCode.value) {
            el.appActionError.textContent = rejectionReasons.length
                ? 'Choose a rejection reason first. The customer sees it on their My Applications page.'
                : 'Rejection reasons aren\'t loaded. Run Database/08_client_feedback.sql, then refresh.';
            el.appActionError.classList.remove('d-none');
            el.appRejectCode.focus();
            return;
        }
        el.appActionButtons.forEach(function (btn) { btn.disabled = true; });

        apiRequest('PUT', '/applications/' + id + '/status', {
            status: newStatus,
            note: el.appActionNote.value,
            rejectionCode: newStatus === 'rejected' ? el.appRejectCode.value : null
        }).then(function (result) {
            el.appActionNote.value = '';
            if (newStatus === 'escalated' && result && result.assignedTo) {
                el.appActionHint.textContent = 'Sent to specialist ' + result.assignedTo + '.';
            }
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
    var escapeHtml = Valent.escapeHtml;

    // "AUTO" tag for decisions made by a rule instead of a person
    function autoBadgeHtml(autoDecision) {
        if (!autoDecision) return '';
        var title = autoDecision === 'approved' ? 'Approved automatically by the demo rules' : 'Sent to a specialist automatically';
        return ' <span class="badge auto-badge ms-1" title="' + title + '">AUTO</span>';
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
        return Valent.stateName(code);
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

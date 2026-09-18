/* Valent Partners - Mockup 2: Customer Behavior & Reviewer Dashboard
   Front-end-only prototype. Every metric below is DEMONSTRATION DATA / NOT REAL
   CUSTOMER ANALYTICS, generated from a small set of illustrative multipliers so
   filters visibly change the screen. None of this reflects real Valent Partners
   or carrier telemetry, thresholds, or business rules. */

(function () {
    'use strict';

    // ---------------------------------------------------------------
    // MOCK DATA MODEL
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

    // Only these states have a distinct illustrative multiplier profile; every
    // other state falls back to a generic baseline profile (see GENERIC_STATE_PROFILE).
    var STATE_PROFILES = {
        ALL: { volume: 1.00, friction: 1.00, configured: true },
        AL: { volume: 0.11, friction: 0.95, configured: true },
        FL: { volume: 0.19, friction: 1.22, configured: true },
        CA: { volume: 0.24, friction: 1.32, configured: true },
        TX: { volume: 0.21, friction: 1.12, configured: true },
        NY: { volume: 0.16, friction: 1.08, configured: true }
    };
    var GENERIC_STATE_PROFILE = { volume: 0.02, friction: 1.00, configured: false };

    var LINE_PROFILES = {
        all: { volume: 1.00, friction: 1.00, label: 'All Lines' },
        homeowners: { volume: 0.60, friction: 0.92, label: 'Homeowners' },
        flood: { volume: 0.24, friction: 1.28, label: 'Flood' },
        jewelry: { volume: 0.16, friction: 1.38, label: 'Jewelry' }
    };

    var RANGE_PROFILES = {
        last7: { volume: 0.23, label: 'Last 7 days' },
        last30: { volume: 1.00, label: 'Last 30 days' },
        last90: { volume: 2.90, label: 'Last 90 days' },
        ytd: { volume: 6.50, label: 'Year to date' }
    };

    var SESSIONS_BASE = 1000; // ALL states / ALL lines / last 30 days

    var STEP_DEFS = [
        { key: 'landing', label: 'Landing', sub: 'Homepage / entry', dwellSec: 18, exitPct: 8, quickExitPct: 6, validationErrorPct: 0, repeat: 0, continuePct: 82 },
        { key: 'state', label: 'State Selection', sub: 'Choose state', dwellSec: 11, exitPct: 5, quickExitPct: 3, validationErrorPct: 1, repeat: 1, continuePct: 90 },
        { key: 'coverage', label: 'Coverage Selection', sub: 'Choose coverage', dwellSec: 44, exitPct: 13, quickExitPct: 4, validationErrorPct: 3, repeat: 2, continuePct: 80 },
        { key: 'property', label: 'Property / Item Details', sub: 'Home or item info', dwellSec: 92, exitPct: 20, quickExitPct: 5, validationErrorPct: 11, repeat: 5, continuePct: 71 },
        { key: 'applicant', label: 'Applicant Details', sub: 'Personal info', dwellSec: 105, exitPct: 22, quickExitPct: 5, validationErrorPct: 9, repeat: 4, continuePct: 75 },
        { key: 'quote', label: 'Quote / Results', sub: 'Estimate shown', dwellSec: 58, exitPct: 15, quickExitPct: 6, validationErrorPct: 2, repeat: 2, continuePct: 82 },
        { key: 'completion', label: 'Completion', sub: 'Application submitted', dwellSec: 16, exitPct: 2, quickExitPct: 1, validationErrorPct: 0, repeat: 0, continuePct: 100 }
    ];

    // Reviewer queue preview. Names are invented placeholders, not real applicants.
    var QUEUE_DATA = [
        { id: 'APP-10432', applicant: 'J. Rivera', state: 'FL', line: 'flood', status: 'pending', reason: 'Flood zone requires manual verification', submitted: '2 days ago' },
        { id: 'APP-10418', applicant: 'M. Chen', state: 'CA', line: 'jewelry', status: 'escalated', reason: 'High-value item exceeds standard scheduling limit', submitted: '4 hours ago' },
        { id: 'APP-10405', applicant: 'A. Whitfield', state: 'AL', line: 'homeowners', status: 'pending', reason: 'Address validation mismatch', submitted: '1 day ago' },
        { id: 'APP-10390', applicant: 'T. Nguyen', state: 'TX', line: 'homeowners', status: 'approved', reason: 'N/A — approved after manual review (mock)', submitted: '5 days ago' },
        { id: 'APP-10377', applicant: 'S. Okafor', state: 'FL', line: 'homeowners', status: 'denied', reason: 'Outside current mock underwriting guidelines', submitted: '6 days ago' },
        { id: 'APP-10365', applicant: 'D. Park', state: 'NY', line: 'jewelry', status: 'pending', reason: 'Appraisal documentation incomplete', submitted: '3 days ago' },
        { id: 'APP-10352', applicant: 'R. Alvarez', state: 'CA', line: 'flood', status: 'escalated', reason: 'Property in high-risk flood zone requires specialist', submitted: '8 hours ago' },
        { id: 'APP-10341', applicant: 'K. Bennett', state: 'AL', line: 'jewelry', status: 'pending', reason: 'Item value requires supervisor sign-off', submitted: '2 days ago' }
    ];

    var STATUS_META = {
        pending: { label: 'Pending Review', cls: 'queue-status-pending' },
        escalated: { label: 'Escalated', cls: 'queue-status-escalated' },
        approved: { label: 'Approved (mock)', cls: 'queue-status-approved' },
        denied: { label: 'Denied (mock)', cls: 'queue-status-denied' }
    };

    // ---------------------------------------------------------------
    // STATE
    // ---------------------------------------------------------------

    var filters = { state: 'ALL', line: 'all', range: 'last30' };
    var currentDataset = null;
    var el = {};

    document.addEventListener('DOMContentLoaded', function () {
        cacheDom();
        populateStateFilter();
        bindEvents();
        renderAll();
    });

    function cacheDom() {
        el.filterState = document.getElementById('filterState');
        el.filterLine = document.getElementById('filterLine');
        el.filterRange = document.getElementById('filterRange');
        el.resetFiltersBtn = document.getElementById('resetFiltersBtn');
        el.filterSummary = document.getElementById('filterSummary');

        el.kpiRow = document.getElementById('kpiRow');
        el.funnelContainer = document.getElementById('funnelContainer');
        el.frictionTableBody = document.getElementById('frictionTableBody');
        el.queueTableBody = document.getElementById('queueTableBody');
        el.queueEmptyMsg = document.getElementById('queueEmptyMsg');

        el.stepDetailModalEl = document.getElementById('stepDetailModal');
        el.stepDetailModalLabel = document.getElementById('stepDetailModalLabel');
        el.stepDetailModalBody = document.getElementById('stepDetailModalBody');

        el.appDetailModalEl = document.getElementById('appDetailModal');
        el.appDetailModalLabel = document.getElementById('appDetailModalLabel');
        el.appDetailModalBody = document.getElementById('appDetailModalBody');
    }

    function populateStateFilter() {
        var allOpt = document.createElement('option');
        allOpt.value = 'ALL';
        allOpt.textContent = 'All States';
        el.filterState.appendChild(allOpt);

        US_STATES.forEach(function (pair) {
            var opt = document.createElement('option');
            opt.value = pair[0];
            opt.textContent = pair[1];
            el.filterState.appendChild(opt);
        });
    }

    function bindEvents() {
        el.filterState.addEventListener('change', function () {
            filters.state = el.filterState.value;
            renderAll();
        });
        el.filterLine.addEventListener('change', function () {
            filters.line = el.filterLine.value;
            renderAll();
        });
        el.filterRange.addEventListener('change', function () {
            filters.range = el.filterRange.value;
            renderAll();
        });
        el.resetFiltersBtn.addEventListener('click', function () {
            filters = { state: 'ALL', line: 'all', range: 'last30' };
            el.filterState.value = 'ALL';
            el.filterLine.value = 'all';
            el.filterRange.value = 'last30';
            renderAll();
        });
    }

    // ---------------------------------------------------------------
    // DATASET COMPUTATION (deterministic mock formula, not real telemetry)
    // ---------------------------------------------------------------

    function getStateProfile(code) {
        return STATE_PROFILES[code] || GENERIC_STATE_PROFILE;
    }

    function computeDataset(stateCode, lineCode, rangeKey) {
        var stateProfile = getStateProfile(stateCode);
        var lineProfile = LINE_PROFILES[lineCode];
        var rangeProfile = RANGE_PROFILES[rangeKey];

        var volumeMult = stateProfile.volume * lineProfile.volume * rangeProfile.volume;
        var frictionMult = stateProfile.friction * lineProfile.friction;

        var steps = [];
        var prevUsers = null;

        STEP_DEFS.forEach(function (def, i) {
            var users;
            var continuePctAdj;
            if (i === 0) {
                users = Math.max(1, Math.round(SESSIONS_BASE * volumeMult));
                continuePctAdj = null;
            } else {
                continuePctAdj = clamp(def.continuePct - (frictionMult - 1) * 45, 28, 99);
                users = Math.round(prevUsers * (continuePctAdj / 100));
            }

            var dwellSec = Math.round(def.dwellSec * frictionMult);
            var exitPct = clamp(Math.round(def.exitPct * frictionMult), 0, 100);
            var quickExitPct = clamp(Math.round(def.quickExitPct * frictionMult), 0, 100);
            var validationErrorPct = clamp(Math.round(def.validationErrorPct * frictionMult), 0, 100);
            var repeat = Math.round(def.repeat * frictionMult);
            var dropoffCount = i === 0 ? 0 : Math.max(0, prevUsers - users);
            var dropoffPct = i === 0 ? 0 : Math.round(100 - continuePctAdj);

            var frictionScore = exitPct + quickExitPct * 1.5 + validationErrorPct * 1.2;
            var tier = frictionScore >= 45 ? 'critical' : (frictionScore >= 25 ? 'warning' : 'good');

            steps.push({
                key: def.key,
                label: def.label,
                sub: def.sub,
                users: users,
                continuePct: i === 0 ? null : Math.round(continuePctAdj),
                dropoffCount: dropoffCount,
                dropoffPct: dropoffPct,
                dwellSec: dwellSec,
                exitPct: exitPct,
                quickExitPct: quickExitPct,
                validationErrorPct: validationErrorPct,
                repeat: repeat,
                frictionScore: frictionScore,
                tier: tier
            });

            prevUsers = users;
        });

        var sessionsStarted = steps[0].users;
        var completed = steps[steps.length - 1].users;
        var completionRate = sessionsStarted > 0 ? Math.round((completed / sessionsStarted) * 100) : 0;
        var abandonmentRate = 100 - completionRate;
        var avgSessionTimeSec = steps.reduce(function (sum, s) { return sum + s.dwellSec; }, 0);
        var quickExitRate = Math.round(
            steps.reduce(function (sum, s) { return sum + s.quickExitPct; }, 0) / steps.length
        );

        var worstStep = steps.reduce(function (worst, s) {
            return (!worst || s.frictionScore > worst.frictionScore) ? s : worst;
        }, null);

        return {
            stateCode: stateCode,
            lineCode: lineCode,
            rangeKey: rangeKey,
            configured: stateProfile.configured,
            steps: steps,
            kpis: {
                sessionsStarted: sessionsStarted,
                completionRate: completionRate,
                abandonmentRate: abandonmentRate,
                avgSessionTimeSec: avgSessionTimeSec,
                quickExitRate: quickExitRate
            },
            worstStepKey: worstStep ? worstStep.key : null
        };
    }

    // ---------------------------------------------------------------
    // RENDER
    // ---------------------------------------------------------------

    function renderAll() {
        currentDataset = computeDataset(filters.state, filters.line, filters.range);
        renderFilterSummary();
        renderKpis(currentDataset);
        renderFunnel(currentDataset);
        renderFrictionTable(currentDataset);
        renderQueue();
    }

    function renderFilterSummary() {
        var stateLabel = filters.state === 'ALL' ? 'All States' : stateName(filters.state);
        var lineLabel = LINE_PROFILES[filters.line].label;
        var rangeLabel = RANGE_PROFILES[filters.range].label;
        var txt = 'Showing ' + lineLabel + ' · ' + stateLabel + ' · ' + rangeLabel + '.';
        if (!currentConfiguredFlag()) {
            txt += ' No demonstration dataset is configured specifically for this state — showing a generic baseline profile so the interaction can still be demonstrated.';
        }
        el.filterSummary.textContent = txt;
    }

    function currentConfiguredFlag() {
        return !!getStateProfile(filters.state).configured;
    }

    function renderKpis(dataset) {
        var k = dataset.kpis;
        var tiles = [
            { label: 'Sessions Started', value: formatCompact(k.sessionsStarted), caption: 'Mock count entering the funnel' },
            { label: 'Completion Rate', value: k.completionRate + '%', caption: 'Reached Completion' },
            { label: 'Abandonment Rate', value: k.abandonmentRate + '%', caption: 'Did not complete' },
            { label: 'Avg. Session Time', value: formatDuration(k.avgSessionTimeSec), caption: 'Sum of mock step dwell time' },
            { label: 'Quick-Exit Rate', value: k.quickExitRate + '%', caption: 'Illustrative avg. across steps' }
        ];

        el.kpiRow.innerHTML = tiles.map(function (t) {
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

    function renderFunnel(dataset) {
        var maxUsers = dataset.steps[0].users;

        el.funnelContainer.innerHTML = dataset.steps.map(function (s) {
            var widthPct = maxUsers > 0 ? Math.max(4, Math.round((s.users / maxUsers) * 100)) : 4;
            var isWorst = s.key === dataset.worstStepKey;
            var continueLine = s.continuePct === null
                ? 'Entry point'
                : s.continuePct + '% continued · ' + s.dropoffPct + '% dropped off';

            return (
                '<button type="button" class="funnel-row" data-step="' + s.key + '">' +
                    '<span class="funnel-label-col">' + s.label +
                        (isWorst ? ' <span class="funnel-attention-badge">⚠ Needs Attention</span>' : '') +
                        '<span class="funnel-sub">' + s.sub + '</span>' +
                    '</span>' +
                    '<span class="funnel-track"><span class="funnel-fill' + (isWorst ? ' attention' : '') + '" style="width:' + widthPct + '%"></span></span>' +
                    '<span class="funnel-value-col">' +
                        '<span class="funnel-users">' + formatCompact(s.users) + '</span>' +
                        '<span class="funnel-continue">' + continueLine + '</span>' +
                    '</span>' +
                '</button>'
            );
        }).join('');

        el.funnelContainer.querySelectorAll('.funnel-row').forEach(function (row) {
            row.addEventListener('click', function () {
                openStepDetail(row.getAttribute('data-step'));
            });
        });
    }

    function renderFrictionTable(dataset) {
        el.frictionTableBody.innerHTML = dataset.steps.map(function (s) {
            return (
                '<tr data-step="' + s.key + '">' +
                    '<td><strong>' + s.label + '</strong></td>' +
                    '<td>' + formatDuration(s.dwellSec) + '</td>' +
                    '<td>' + s.exitPct + '%</td>' +
                    '<td>' + s.quickExitPct + '%</td>' +
                    '<td>' + formatCompact(s.dropoffCount) + (s.continuePct === null ? '' : ' (' + s.dropoffPct + '%)') + '</td>' +
                    '<td>' + s.validationErrorPct + '%</td>' +
                    '<td>' + formatCompact(s.repeat) + '</td>' +
                    '<td>' + statusPillHtml(s.tier) + '</td>' +
                '</tr>'
            );
        }).join('');

        el.frictionTableBody.querySelectorAll('tr').forEach(function (row) {
            row.addEventListener('click', function () {
                openStepDetail(row.getAttribute('data-step'));
            });
        });
    }

    function statusPillHtml(tier) {
        if (tier === 'critical') return '<span class="status-pill status-critical">⚠ Needs Attention</span>';
        if (tier === 'warning') return '<span class="status-pill status-warning">▲ Watch</span>';
        return '<span class="status-pill status-good">✓ OK</span>';
    }

    function openStepDetail(stepKey) {
        var step = currentDataset.steps.filter(function (s) { return s.key === stepKey; })[0];
        if (!step) return;

        el.stepDetailModalLabel.textContent = step.label + ' — Step Detail';
        el.stepDetailModalBody.innerHTML =
            '<span class="badge mock-badge mb-2 d-inline-block">DEMONSTRATION DATA</span>' +
            '<dl class="row small mb-0">' +
                detailRow('Users reaching this step', formatCompact(step.users)) +
                detailRow('Continued to next step', step.continuePct === null ? '— (entry point)' : step.continuePct + '%') +
                detailRow('Drop-off', step.continuePct === null ? '—' : formatCompact(step.dropoffCount) + ' users (' + step.dropoffPct + '%)') +
                detailRow('Avg. dwell time', formatDuration(step.dwellSec)) +
                detailRow('Exit rate', step.exitPct + '%') +
                detailRow('Quick-exit rate', step.quickExitPct + '%') +
                detailRow('Validation-error rate', step.validationErrorPct + '%') +
                detailRow('Repeat interactions', formatCompact(step.repeat)) +
                detailRow('Status', statusPillHtml(step.tier)) +
            '</dl>' +
            '<p class="small text-muted mt-3 mb-0">Reminder: dwell time, hover time, and focus time are different signals. This panel only visualizes a general "time on step" concept until production event definitions are agreed with the client.</p>';

        var modal = bootstrap.Modal.getOrCreateInstance(el.stepDetailModalEl);
        modal.show();
    }

    function detailRow(label, value) {
        return '<dt class="col-6 text-muted fw-normal">' + label + '</dt><dd class="col-6 text-end">' + value + '</dd>';
    }

    function renderQueue() {
        var filtered = QUEUE_DATA.filter(function (app) {
            var stateMatch = filters.state === 'ALL' || app.state === filters.state;
            var lineMatch = filters.line === 'all' || app.line === filters.line;
            return stateMatch && lineMatch;
        });

        if (filtered.length === 0) {
            el.queueTableBody.innerHTML = '';
            el.queueEmptyMsg.textContent = 'No mock applications match the current filters.';
            return;
        }
        el.queueEmptyMsg.textContent = '';

        el.queueTableBody.innerHTML = filtered.map(function (app) {
            var statusMeta = STATUS_META[app.status];
            return (
                '<tr data-id="' + app.id + '">' +
                    '<td><strong>' + app.id + '</strong></td>' +
                    '<td>' + capitalize(app.line) + '</td>' +
                    '<td>' + app.state + '</td>' +
                    '<td><span class="queue-status-pill ' + statusMeta.cls + '">' + statusMeta.label + '</span></td>' +
                    '<td class="small">' + app.reason + '</td>' +
                    '<td class="text-muted small">' + app.submitted + '</td>' +
                '</tr>'
            );
        }).join('');

        el.queueTableBody.querySelectorAll('tr').forEach(function (row) {
            row.addEventListener('click', function () {
                openAppDetail(row.getAttribute('data-id'));
            });
        });
    }

    function openAppDetail(appId) {
        var app = QUEUE_DATA.filter(function (a) { return a.id === appId; })[0];
        if (!app) return;
        var statusMeta = STATUS_META[app.status];

        el.appDetailModalLabel.textContent = app.id;
        el.appDetailModalBody.innerHTML =
            '<span class="badge mock-badge mb-2 d-inline-block">DEMONSTRATION DATA — NOT A REAL APPLICANT</span>' +
            '<dl class="row small mb-0">' +
                detailRow('Applicant (mock)', app.applicant) +
                detailRow('Insurance line', capitalize(app.line)) +
                detailRow('State', stateName(app.state)) +
                detailRow('Status', '<span class="queue-status-pill ' + statusMeta.cls + '">' + statusMeta.label + '</span>') +
                detailRow('Reason for review', app.reason) +
                detailRow('Submitted', app.submitted) +
            '</dl>' +
            '<p class="small text-muted mt-3 mb-0">Reviewer permissions, roles, and real approval workflows are unresolved requirements and are not implemented in this prototype.</p>';

        var modal = bootstrap.Modal.getOrCreateInstance(el.appDetailModalEl);
        modal.show();
    }

    // ---------------------------------------------------------------
    // HELPERS
    // ---------------------------------------------------------------

    function clamp(val, min, max) {
        return Math.min(max, Math.max(min, val));
    }

    function capitalize(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    function stateName(abbr) {
        if (abbr === 'ALL') return 'All States';
        var found = US_STATES.filter(function (pair) { return pair[0] === abbr; })[0];
        return found ? found[1] : abbr;
    }

    function formatCompact(num) {
        if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
        return String(num);
    }

    function formatDuration(totalSeconds) {
        var m = Math.floor(totalSeconds / 60);
        var s = totalSeconds % 60;
        if (m === 0) return s + 's';
        return m + 'm ' + s + 's';
    }

})();

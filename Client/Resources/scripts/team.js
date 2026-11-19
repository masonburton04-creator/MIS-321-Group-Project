/* Team page (admins only, #/team): each person's workload, the Auto-assign switch, and
   manual assignment of open applications. Uses GET /api/team, GET /api/applications,
   PUT /api/team/{staffId}/auto-assign and PUT /api/team/assignments/{applicationId}.
   Automatic assignment keeps running in the API; this page only overrides it. */
(function () {
    'use strict';

    var OPEN = ['submitted', 'under_review', 'escalated'];
    var STATUS = {
        submitted: { label: 'New', cls: 'queue-status-new' },
        under_review: { label: 'Under review', cls: 'queue-status-pending' },
        escalated: { label: 'Escalated', cls: 'queue-status-escalated' }
    };
    var ROLE_LABELS = { admin: 'Admin', specialist: 'Specialist', employee: 'Agent' };

    var el = {};
    var team = null;          // GET /api/team
    var apps = [];            // open applications from GET /api/applications
    var esc = function (v) { return Valent.escapeHtml(v == null ? '' : v); };

    function isAdmin() {
        var s = Valent.session();
        return !!(s && s.type === 'staff' && s.user && s.user.role === 'admin');
    }

    function load() {
        if (!isAdmin()) return;
        showError('');
        Promise.all([Valent.api('GET', '/team'), Valent.api('GET', '/applications')]).then(function (results) {
            team = results[0];
            apps = (results[1] || []).filter(function (a) { return OPEN.indexOf(a.status) !== -1; });
            render();
        }).catch(function (err) { showError(err.message); });
    }

    function showError(message) {
        el.error.textContent = message;
        el.error.classList.toggle('d-none', !message);
    }

    function activeStaff() {
        return team.staff.filter(function (s) { return s.isActive; });
    }

    function fullName(s) { return s.firstName + ' ' + s.lastName; }

    // ---------------------------------------------------------------
    // Rendering
    // ---------------------------------------------------------------
    function render() {
        renderKpis();
        renderStaff();
        renderOwnerFilter();
        renderApps();
    }

    function renderKpis() {
        var specialists = activeStaff().filter(function (s) { return s.role === 'specialist'; });
        var available = specialists.filter(function (s) { return s.autoAssign; });
        var tiles = [
            { label: 'Open applications', value: apps.length, caption: 'New, under review, or escalated' },
            { label: 'Unassigned', value: team.openUnassigned + team.escalatedUnassigned,
              caption: team.escalatedUnassigned ? team.escalatedUnassigned + ' escalated with no specialist' : 'Waiting for someone to pick them up',
              warn: team.escalatedUnassigned > 0 },
            { label: 'Specialists taking escalations', value: available.length + ' of ' + specialists.length,
              caption: available.length ? 'Auto-assign is on for them' : 'None: escalations will be unassigned', warn: available.length === 0 }
        ];
        el.kpis.innerHTML = tiles.map(function (t) {
            return '<div class="col-12 col-md-4"><div class="kpi-tile' + (t.warn ? ' kpi-tile-warn' : '') + '">' +
                '<div class="kpi-label">' + t.label + '</div>' +
                '<div class="kpi-value">' + t.value + '</div>' +
                '<div class="kpi-caption">' + esc(t.caption) + '</div></div></div>';
        }).join('');
    }

    function renderStaff() {
        var maxOpen = Math.max.apply(null, team.staff.map(function (s) { return s.openAssigned; }).concat([1]));
        el.staffBody.innerHTML = team.staff.map(function (s) {
            var bar = '<span class="team-load"><span style="width:' + Math.round(s.openAssigned / maxOpen * 100) + '%"></span></span>';
            var toggle = s.isActive
                ? '<div class="form-check form-switch mb-0">' +
                  '<input class="form-check-input" type="checkbox" role="switch" id="aa' + s.staffId + '" data-auto-assign="' + s.staffId + '"' + (s.autoAssign ? ' checked' : '') + '>' +
                  '<label class="form-check-label small" for="aa' + s.staffId + '">' + (s.autoAssign ? 'On' : 'Off') + '</label></div>'
                : '<span class="text-muted small">Inactive</span>';
            return '<tr class="' + (s.isActive ? '' : 'text-muted') + '">' +
                '<td><div class="fw-semibold">' + esc(fullName(s)) + '</div><div class="small text-muted">' + esc(s.email) + '</div></td>' +
                '<td><span class="team-role team-role-' + esc(s.role) + '">' + esc(ROLE_LABELS[s.role] || s.role) + '</span></td>' +
                '<td><span class="me-2">' + s.openAssigned + '</span>' + bar + '</td>' +
                '<td>' + s.openEscalations + '</td>' +
                '<td>' + s.decided30Days + '</td>' +
                '<td class="small">' + (s.lastActive ? esc(Valent.formatDateTime(s.lastActive)) : '—') + '</td>' +
                '<td>' + (s.role === 'specialist' || !s.isActive ? toggle : '<span class="text-muted small" title="Automatic assignment only sends escalations to specialists">Manual only</span>') + '</td>' +
                '</tr>';
        }).join('');
    }

    function renderOwnerFilter() {
        var current = el.ownerFilter.value;
        el.ownerFilter.innerHTML = '<option value="">Anyone</option><option value="none">Nobody (unassigned)</option>' +
            activeStaff().map(function (s) {
                return '<option value="' + s.staffId + '">' + esc(fullName(s)) + '</option>';
            }).join('');
        el.ownerFilter.value = current;
    }

    // Escalated work can only go to specialists and admins (the API enforces this too)
    function assigneeSelect(app) {
        var eligible = activeStaff().filter(function (s) { return app.status !== 'escalated' || s.role !== 'employee'; });
        var options = (app.status === 'escalated' && app.assignedStaffId ? '' : '<option value="">— Unassigned —</option>') +
            eligible.map(function (s) {
                var load = s.openAssigned + ' open' + (s.role === 'specialist' && !s.autoAssign ? ', auto-assign off' : '');
                return '<option value="' + s.staffId + '"' + (s.staffId === app.assignedStaffId ? ' selected' : '') + '>' +
                    esc(fullName(s)) + ' (' + esc(ROLE_LABELS[s.role] || s.role) + ', ' + load + ')</option>';
            }).join('');
        return '<select class="form-select form-select-sm" data-assign="' + app.applicationId + '" aria-label="Assign application ' + app.applicationId + '">' +
            options + '</select><div class="small mt-1 team-assign-msg" data-msg="' + app.applicationId + '"></div>';
    }

    function renderApps() {
        var status = el.statusFilter.value;
        var owner = el.ownerFilter.value;
        var rows = apps.filter(function (a) {
            if (status === 'unassigned' && a.assignedStaffId) return false;
            if (status !== 'open' && status !== 'unassigned' && a.status !== status) return false;
            if (owner === 'none' && a.assignedStaffId) return false;
            if (owner && owner !== 'none' && String(a.assignedStaffId) !== owner) return false;
            return true;
        });
        // Most urgent first: unassigned escalations, other escalations, unassigned, then oldest
        rows.sort(function (a, b) {
            function rank(x) { return (x.status === 'escalated' ? 0 : 2) + (x.assignedStaffId ? 1 : 0); }
            return rank(a) - rank(b) || Valent.parseDate(a.submittedAt || a.createdAt) - Valent.parseDate(b.submittedAt || b.createdAt);
        });
        if (rows.length === 0) {
            el.appsBody.innerHTML = '<tr><td colspan="7" class="text-muted small">No open applications match.</td></tr>';
            return;
        }
        el.appsBody.innerHTML = rows.map(function (a) {
            var meta = STATUS[a.status];
            var urgent = !a.assignedStaffId ? (a.status === 'escalated' ? ' team-row-urgent' : ' team-row-unassigned') : '';
            return '<tr class="' + urgent + '">' +
                '<td class="fw-semibold">' + a.applicationId + '</td>' +
                '<td>' + esc(a.customerName || '—') + '</td>' +
                '<td>' + esc(Valent.linesLabel(a.lineCodes)) + '</td>' +
                '<td>' + esc(a.stateCode) + '</td>' +
                '<td><span class="queue-status-pill ' + meta.cls + '">' + meta.label + '</span></td>' +
                '<td class="small">' + esc(Valent.formatDate(a.submittedAt || a.createdAt)) + '</td>' +
                '<td>' + assigneeSelect(a) + '</td>' +
                '</tr>';
        }).join('');
    }

    // ---------------------------------------------------------------
    // Actions
    // ---------------------------------------------------------------
    function assign(select) {
        var id = parseInt(select.getAttribute('data-assign'), 10);
        var app = apps.filter(function (a) { return a.applicationId === id; })[0];
        var msg = el.appsBody.querySelector('[data-msg="' + id + '"]');
        var staffId = select.value ? parseInt(select.value, 10) : null;
        select.disabled = true;
        msg.className = 'small mt-1 team-assign-msg text-muted';
        msg.textContent = 'Saving…';
        Valent.api('PUT', '/team/assignments/' + id, { staffId: staffId }).then(function (result) {
            app.assignedStaffId = result.assignedStaffId;
            app.assignedTo = result.assignedTo;
            msg.className = 'small mt-1 team-assign-msg text-success';
            msg.textContent = result.assignedTo ? 'Assigned to ' + result.assignedTo + '.' : 'Unassigned.';
            // Workload numbers changed; refresh them without redrawing the row being edited
            return Valent.api('GET', '/team').then(function (fresh) {
                team = fresh;
                renderKpis();
                renderStaff();
            });
        }).catch(function (err) {
            select.value = app.assignedStaffId ? String(app.assignedStaffId) : '';
            msg.className = 'small mt-1 team-assign-msg text-danger';
            msg.textContent = err.message;
        }).then(function () { select.disabled = false; });
    }

    function setAutoAssign(input) {
        var staffId = parseInt(input.getAttribute('data-auto-assign'), 10);
        input.disabled = true;
        Valent.api('PUT', '/team/' + staffId + '/auto-assign', { autoAssign: input.checked }).then(function () {
            team.staff.forEach(function (s) { if (s.staffId === staffId) s.autoAssign = input.checked; });
            renderKpis();
            renderStaff();
            renderApps();
        }).catch(function (err) {
            input.checked = !input.checked;
            input.disabled = false;
            showError(err.message);
        });
    }

    document.addEventListener('DOMContentLoaded', function () {
        el.error = document.getElementById('teamError');
        el.kpis = document.getElementById('teamKpis');
        el.staffBody = document.getElementById('teamStaffBody');
        el.appsBody = document.getElementById('teamAppsBody');
        el.statusFilter = document.getElementById('teamStatusFilter');
        el.ownerFilter = document.getElementById('teamOwnerFilter');

        document.getElementById('teamRefreshBtn').addEventListener('click', load);
        el.statusFilter.addEventListener('change', renderApps);
        el.ownerFilter.addEventListener('change', renderApps);
        el.appsBody.addEventListener('change', function (event) {
            if (event.target.matches('[data-assign]')) assign(event.target);
        });
        el.staffBody.addEventListener('change', function (event) {
            if (event.target.matches('[data-auto-assign]')) setAutoAssign(event.target);
        });

        Valent.on('view', function (event) { if (event.view === 'team') load(); });
        Valent.on('session', function (session) {
            if (!session || session.type !== 'staff') {
                team = null; apps = [];
                el.staffBody.innerHTML = el.appsBody.innerHTML = el.kpis.innerHTML = '';
            }
        });
    });
})();

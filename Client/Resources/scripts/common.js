/* Valent Partners - shared code for the whole site (loaded first).
   Defines window.Valent, used by auth.js, customer.js, and dashboard.js:
     Valent.api(method, path, body)   call the C# API with the signed-in user's token
     Valent.session()                 who is signed in: null, { type: 'customer', ... } or { type: 'staff', ... }
     Valent.go(view)                  switch views: 'site', 'signin', 'myapps', 'dashboard'
     Valent.on(event, handler)        'session' (sign in/out) and 'view' (view shown) events
   Views are picked from the URL hash (#/, #/signin, #/my-applications, #/dashboard),
   so refreshing the page keeps you where you were. */

(function () {
    'use strict';

    // Where the C# API is running (see API/README.md). Start it with "dotnet run" in the API folder.
    var API_BASE_URL = 'http://localhost:5250/api';

    // The sprint's demo states. Must match Database/05_supported_states.sql, or the API
    // will reject applications for a state listed here.
    var US_STATES = [
        ['AL', 'Alabama'], ['TX', 'Texas'], ['NY', 'New York']
    ];

    var LINE_LABELS = { HOME: 'Homeowners', FLOOD: 'Flood', JEWELRY: 'Jewelry', AUTO: 'Auto' };

    // ---------------------------------------------------------------
    // SESSION
    // Staff tokens live in sessionStorage (closing the tab signs out, like before).
    // Customer tokens live in localStorage, so a customer stays signed in while they
    // fill out an application over a few visits (the server ends them after 7 days).
    // ---------------------------------------------------------------

    var STAFF_KEY = 'valentStaffSession';
    var CUSTOMER_KEY = 'valentCustomerSession';
    var current = null;   // { type, token, user }

    function readStored() {
        try {
            var staff = JSON.parse(sessionStorage.getItem(STAFF_KEY));
            if (staff && staff.token) return staff;
        } catch (e) { /* storage unavailable */ }
        try {
            var customer = JSON.parse(localStorage.getItem(CUSTOMER_KEY));
            if (customer && customer.token) return customer;
        } catch (e) { /* storage unavailable */ }
        return null;
    }

    function setSession(session) {
        clearStored();
        current = session;
        try {
            if (session.type === 'staff') sessionStorage.setItem(STAFF_KEY, JSON.stringify(session));
            else localStorage.setItem(CUSTOMER_KEY, JSON.stringify(session));
        } catch (e) { /* storage unavailable: signed in for this page only */ }
        renderNav();
        emit('session', session);
    }

    function clearStored() {
        try { sessionStorage.removeItem(STAFF_KEY); } catch (e) { /* storage unavailable */ }
        try { localStorage.removeItem(CUSTOMER_KEY); } catch (e) { /* storage unavailable */ }
    }

    // Forget the token locally. message: shown on the sign-in screen (e.g. "session ended")
    function endSession(message) {
        var wasSignedIn = current !== null;
        current = null;
        clearStored();
        renderNav();
        if (wasSignedIn) emit('session', null);
        if (message) Valent.signInMessage = message;
    }

    // Tells the server too, so the token stops working right away
    function signOut() {
        var old = current;
        endSession();
        if (old) {
            var path = old.type === 'staff' ? '/auth/logout' : '/account/logout';
            fetch(API_BASE_URL + path, { method: 'POST', headers: { Authorization: 'Bearer ' + old.token } })
                .catch(function () { /* already signed out locally */ });
        }
        go('site');
    }

    // On page load: make sure a saved token still works before trusting it
    function restoreSession() {
        var saved = readStored();
        if (!saved) return Promise.resolve(null);
        current = saved;
        var path = saved.type === 'staff' ? '/auth/me' : '/account/me';
        return fetch(API_BASE_URL + path, { headers: { Authorization: 'Bearer ' + saved.token } }).then(function (response) {
            if (response.status === 401) {
                endSession('Your session ended. Please sign in again.');
                return null;
            }
            if (!response.ok) return current; // server trouble: keep the session, pages show the error
            return response.json().then(function (user) {
                current.user = user;
                setSession(current);
                return current;
            });
        }).catch(function () {
            renderNav();
            return current; // API not running: keep the session, pages show the error
        });
    }

    // ---------------------------------------------------------------
    // API
    // ---------------------------------------------------------------

    // Resolves with the parsed JSON body (or null); rejects with an Error whose message can be
    // shown on screen (err.status and err.data carry the details).
    // body: a plain object (sent as JSON) or FormData (file uploads; the browser sets the header)
    function api(method, path, body) {
        var isForm = body instanceof FormData;
        var headers = body && !isForm ? { 'Content-Type': 'application/json' } : {};
        if (current) headers.Authorization = 'Bearer ' + current.token;

        return fetch(API_BASE_URL + path, {
            method: method,
            headers: headers,
            body: isForm ? body : body ? JSON.stringify(body) : undefined
        }).catch(function () {
            throw new Error('We couldn\'t reach the server. Please try again in a moment. ' +
                '(Developers: is the API running? Start it with "dotnet run" in the API folder.)');
        }).then(function (response) {
            return response.text().then(function (text) {
                var data = null;
                try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
                if (response.status === 401 && current) {
                    // Expired, signed out elsewhere, or account turned off
                    var wasStaff = current.type === 'staff';
                    endSession('Your session ended. Please sign in again.');
                    go('signin', { reason: wasStaff ? null : 'Please sign in again to continue.' });
                }
                if (!response.ok) {
                    var err = new Error((data && (data.error || data.title)) || 'Something went wrong (HTTP ' + response.status + ').');
                    err.status = response.status;
                    err.data = data;
                    throw err;
                }
                return data;
            });
        });
    }

    // fetch() with the token, for downloads (returns the raw Response)
    function rawFetch(path) {
        var headers = current ? { Authorization: 'Bearer ' + current.token } : {};
        return fetch(API_BASE_URL + path, { headers: headers });
    }

    // ---------------------------------------------------------------
    // VIEWS + ROUTING
    // ---------------------------------------------------------------

    var VIEWS = { site: '#/', signin: '#/signin', myapps: '#/my-applications', dashboard: '#/dashboard', team: '#/team' };
    var currentView = null;
    var pendingOptions = null;

    function viewFromHash() {
        var hash = location.hash || '#/';
        var name = Object.keys(VIEWS).filter(function (key) { return VIEWS[key] === hash; })[0];
        return name || 'site';
    }

    // options: { reason } shown on the sign-in screen
    function go(view, options) {
        pendingOptions = options || null;
        if (location.hash === VIEWS[view] || (view === 'site' && !location.hash)) showView(view);
        else location.hash = VIEWS[view]; // fires hashchange -> showView
    }

    function showView(requested) {
        var view = requested;
        // Guards: the dashboard is staff-only, My Applications is customer-only
        if (view === 'dashboard' && !(current && current.type === 'staff')) {
            pendingOptions = { reason: 'Sign in with your Valent Partners staff account to open the dashboard.' };
            view = 'signin';
        } else if (view === 'team' && !(current && current.type === 'staff')) {
            pendingOptions = { reason: 'Sign in with your Valent Partners admin account to manage the team.' };
            view = 'signin';
        } else if (view === 'team' && !(current.user && current.user.role === 'admin')) {
            view = 'dashboard'; // only admins manage the team
        } else if (view === 'myapps' && !(current && current.type === 'customer')) {
            pendingOptions = { reason: 'Sign in to see your applications.', returnTo: 'myapps' };
            view = 'signin';
        } else if (view === 'signin' && current) {
            view = current.type === 'staff' ? 'dashboard' : 'site';
        }
        if (view !== requested && VIEWS[view] !== location.hash) {
            history.replaceState(null, '', VIEWS[view]);
        }

        Object.keys(VIEWS).forEach(function (key) {
            document.getElementById('view-' + key).classList.toggle('d-none', key !== view);
        });
        document.querySelectorAll('[data-nav]').forEach(function (link) {
            var active = link.getAttribute('data-nav') === view;
            link.classList.toggle('active', active);
            if (active) link.setAttribute('aria-current', 'page');
            else link.removeAttribute('aria-current');
        });
        var collapse = document.getElementById('mainNav');
        if (collapse.classList.contains('show')) bootstrap.Collapse.getOrCreateInstance(collapse).hide();

        var options = pendingOptions || {};
        pendingOptions = null;
        currentView = view;
        emit('view', { view: view, options: options });
        window.scrollTo({ top: 0 });
    }

    // Navbar: what shows depends on who is signed in
    function renderNav() {
        var type = current ? current.type : 'anonymous';
        document.querySelectorAll('[data-show]').forEach(function (node) {
            var show = node.getAttribute('data-show');
            var visible = show === type || (show === 'signed-in' && current !== null) ||
                (show === 'admin' && type === 'staff' && !!current.user && current.user.role === 'admin');
            node.classList.toggle('d-none', !visible);
        });
        var user = current && current.user;
        document.getElementById('navUserName').textContent = user ? user.firstName + ' ' + user.lastName : '';
        var roleBadge = document.getElementById('navRoleBadge');
        var role = current && current.type === 'staff' && user ? user.role : '';
        roleBadge.textContent = role;
        roleBadge.classList.toggle('d-none', !role);
        if (!current || current.type !== 'staff') setEscalationBadge(0);
    }

    function setEscalationBadge(count) {
        var badge = document.getElementById('navEscalationBadge');
        badge.textContent = count > 0 ? count + ' escalated' : '';
        badge.classList.toggle('d-none', !(count > 0));
    }

    // ---------------------------------------------------------------
    // EVENTS
    // ---------------------------------------------------------------

    var handlers = {};
    function on(event, handler) {
        (handlers[event] = handlers[event] || []).push(handler);
    }
    function emit(event, data) {
        (handlers[event] || []).forEach(function (handler) { handler(data); });
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

    function formatMoney(amount) {
        return '$' + Number(amount).toLocaleString(undefined, { maximumFractionDigits: 2 });
    }

    function stateName(code) {
        var found = US_STATES.filter(function (pair) { return pair[0] === code; })[0];
        return found ? found[1] : code;
    }

    // ['HOME', 'AUTO'] -> 'Homeowners + Auto'
    function linesLabel(lineCodes) {
        return lineCodes.map(function (code) { return LINE_LABELS[code] || code; }).join(' + ');
    }

    // The API sends MySQL local times without a time zone, which JS reads as local time
    function parseDate(value) {
        return value ? new Date(value) : new Date(0);
    }

    function formatDateTime(value) {
        if (!value) return '';
        return parseDate(value).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
    }

    function formatDate(value) {
        if (!value) return '';
        return parseDate(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    }

    // ---------------------------------------------------------------
    // ADDRESS RULES (same as API/Services/AddressRules.cs). Each returns null when OK,
    // otherwise a message for the customer. Empty values are left to the "required" check.
    // ---------------------------------------------------------------

    // First three digits of each state's ZIP codes (USPS). Add a state with US_STATES.
    var ZIP_PREFIXES = {
        AL: [[350, 369]],
        TX: [[750, 799], [885, 885]],
        NY: [[5, 5], [63, 63], [100, 149]]
    };

    var addressRules = {
        street: function (value) {
            var v = (value || '').trim();
            if (!v) return null;
            if (/\b(p\.?\s*o\.?\s*box|post\s+office\s+box)\b/i.test(v)) return 'A PO box can\'t be insured. Enter the property\'s street address.';
            if (!/^\d+[A-Za-z]?(-\d+[A-Za-z]?)?\s+.*[A-Za-z]{2,}/.test(v)) return 'Enter the street address with the house number first, like 123 Main St.';
            return null;
        },
        city: function (value) {
            var v = (value || '').trim();
            if (!v) return null;
            var distinct = v.split('').filter(function (ch, i, all) { return all.indexOf(ch) === i; }).length;
            if (!/^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ .'\-]*[A-Za-zÀ-ÿ.]$/.test(v) || distinct < 2) return 'Enter a real city name (letters only).';
            return null;
        },
        zip: function (value, stateCode) {
            var v = (value || '').trim();
            if (!v) return null;
            if (!/^\d{5}$/.test(v)) return 'Enter a 5-digit ZIP code.';
            var ranges = ZIP_PREFIXES[stateCode];
            if (!ranges) return null;
            var prefix = parseInt(v.slice(0, 3), 10);
            var ok = ranges.some(function (r) { return prefix >= r[0] && prefix <= r[1]; });
            return ok ? null : 'ZIP code ' + v + ' is outside ' + stateName(stateCode) + '. This application is for ' + stateName(stateCode) + '.';
        }
    };

    function makeEl(tag, className, text) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    window.Valent = {
        API_BASE_URL: API_BASE_URL,
        US_STATES: US_STATES,
        LINE_LABELS: LINE_LABELS,
        api: api,
        rawFetch: rawFetch,
        session: function () { return current; },
        setSession: setSession,
        endSession: endSession,
        signOut: signOut,
        go: go,
        currentView: function () { return currentView; },
        on: on,
        setEscalationBadge: setEscalationBadge,
        signInMessage: null,
        escapeHtml: escapeHtml,
        formatMoney: formatMoney,
        stateName: stateName,
        linesLabel: linesLabel,
        parseDate: parseDate,
        formatDateTime: formatDateTime,
        formatDate: formatDate,
        addressRules: addressRules,
        makeEl: makeEl
    };

    // Start once every script has registered its handlers
    document.addEventListener('DOMContentLoaded', function () {
        document.getElementById('signOutBtn').addEventListener('click', signOut);
        window.addEventListener('hashchange', function () { showView(viewFromHash()); });
        renderNav();
        restoreSession().then(function () {
            showView(viewFromHash());
        });
    });
})();

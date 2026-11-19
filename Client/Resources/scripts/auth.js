/* Valent Partners - sign in, create account, and My Applications.
   One sign-in form for everyone (POST /api/auth/login):
     staff     -> the dashboard
     customers -> back to the website (and straight into whatever needed sign-in, e.g. Start Application)
   Browsing and comparing coverage never needs an account; applying does (Valent.requireCustomer). */

(function () {
    'use strict';

    var el = {};
    var afterSignIn = null;   // function to run once a customer signs in (e.g. continue to the application)
    var emailCheckTimer = null;
    var lastCheckedEmail = null;

    document.addEventListener('DOMContentLoaded', function () {
        cacheDom();
        bindEvents();
        Valent.on('view', onView);
    });

    function cacheDom() {
        [
            'authReason', 'tabSignIn', 'tabRegister', 'loginForm', 'loginError', 'loginEmail', 'loginPassword',
            'loginBtn', 'toRegisterLink', 'registerForm', 'registerError', 'regFirstName', 'regLastName', 'regEmail',
            'regEmailError', 'regEmailHelp', 'regPassword', 'regPasswordError', 'strengthMeter', 'passwordStrength',
            'passwordRules', 'regConfirm', 'registerBtn', 'myAppsList', 'myAppsError', 'myAppsNewBtn'
        ].forEach(function (id) { el[id] = document.getElementById(id); });
    }

    function bindEvents() {
        el.tabSignIn.addEventListener('click', function () { showTab('signin'); });
        el.tabRegister.addEventListener('click', function () { showTab('register'); });
        el.toRegisterLink.addEventListener('click', function (e) {
            e.preventDefault();
            showTab('register');
        });

        el.loginForm.addEventListener('submit', function (e) {
            e.preventDefault();
            signIn();
        });
        el.registerForm.addEventListener('submit', function (e) {
            e.preventDefault();
            register();
        });

        // Live feedback while creating an account
        [el.regPassword, el.regFirstName, el.regLastName, el.regEmail].forEach(function (input) {
            input.addEventListener('input', updateStrength);
        });
        el.regConfirm.addEventListener('input', checkConfirm);
        el.regPassword.addEventListener('input', checkConfirm);
        el.regEmail.addEventListener('input', function () {
            setEmailError('');
            clearTimeout(emailCheckTimer);
            emailCheckTimer = setTimeout(checkEmailDomain, 700);
        });
        el.regEmail.addEventListener('blur', checkEmailDomain);

        el.myAppsNewBtn.addEventListener('click', function () {
            Valent.go('site');
            Valent.startNewApplication();
        });
    }

    // ---------------------------------------------------------------
    // "Sign in to continue"
    // ---------------------------------------------------------------

    // Runs callback now if a customer is signed in; otherwise shows the sign-in screen with
    // reason, and runs callback right after they sign in or create an account.
    Valent.requireCustomer = function (reason, callback) {
        var session = Valent.session();
        if (session && session.type === 'customer') {
            callback();
            return;
        }
        if (session && session.type === 'staff') {
            window.alert('You\'re signed in with a staff account. Sign out, then sign in as a customer to apply.');
            return;
        }
        afterSignIn = callback;
        Valent.go('signin', { reason: reason });
    };

    function onView(event) {
        if (event.view === 'signin') {
            var reason = event.options.reason || Valent.signInMessage;
            Valent.signInMessage = null;
            el.authReason.textContent = reason || '';
            el.authReason.classList.toggle('d-none', !reason);
            if (event.options.returnTo === 'myapps') {
                afterSignIn = function () { Valent.go('myapps'); };
            } else if (!event.options.reason) {
                afterSignIn = null; // opened Sign in from the navbar
            }
            showTab('signin');
        } else if (event.view === 'myapps') {
            loadMyApplications();
        }
    }

    function showTab(tab) {
        var signin = tab === 'signin';
        el.tabSignIn.classList.toggle('active', signin);
        el.tabRegister.classList.toggle('active', !signin);
        el.tabSignIn.setAttribute('aria-selected', String(signin));
        el.tabRegister.setAttribute('aria-selected', String(!signin));
        el.loginForm.classList.toggle('d-none', !signin);
        el.registerForm.classList.toggle('d-none', signin);
        hideError(el.loginError);
        hideError(el.registerError);
        (signin ? el.loginEmail : el.regFirstName).focus();
    }

    // ---------------------------------------------------------------
    // SIGN IN
    // ---------------------------------------------------------------

    function signIn() {
        hideError(el.loginError);
        el.loginForm.classList.add('was-validated');
        if (!el.loginForm.checkValidity()) return;

        setBusy(el.loginBtn, true, 'Signing in…');
        Valent.api('POST', '/auth/login', {
            email: el.loginEmail.value,
            password: el.loginPassword.value
        }).then(function (result) {
            el.loginPassword.value = '';
            el.loginForm.classList.remove('was-validated');
            finishSignIn(result);
        }).catch(function (err) {
            showError(el.loginError, err.message);
        }).then(function () {
            setBusy(el.loginBtn, false, 'Sign in');
        });
    }

    // Staff -> dashboard. Customers -> whatever was waiting on sign-in, or back to the website.
    function finishSignIn(result) {
        var isStaff = result.accountType === 'staff';
        Valent.setSession({
            type: result.accountType,
            token: result.token,
            user: isStaff ? result.staff : result.customer
        });

        if (isStaff) {
            afterSignIn = null;
            Valent.go('dashboard');
            return;
        }
        var next = afterSignIn;
        afterSignIn = null;
        if (next) {
            if (Valent.currentView() === 'signin') Valent.go('site');
            next();
        } else {
            Valent.go('site');
        }
    }

    // ---------------------------------------------------------------
    // CREATE ACCOUNT
    // ---------------------------------------------------------------

    function register() {
        hideError(el.registerError);
        checkConfirm();
        var strength = passwordStrength();
        el.regPassword.setCustomValidity(strength.problems.length ? strength.problems[0] : '');
        el.regPasswordError.textContent = strength.problems[0] || 'Choose a stronger password.';
        el.registerForm.classList.add('was-validated');
        if (!el.registerForm.checkValidity()) return;

        setBusy(el.registerBtn, true, 'Creating your account…');
        Valent.api('POST', '/auth/register', {
            firstName: el.regFirstName.value,
            lastName: el.regLastName.value,
            email: el.regEmail.value,
            password: el.regPassword.value
        }).then(function (result) {
            el.registerForm.reset();
            el.registerForm.classList.remove('was-validated');
            updateStrength();
            finishSignIn(result);
        }).catch(function (err) {
            // Point at the field the server complained about
            var field = err.data && err.data.field;
            if (field === 'email') {
                setEmailError(err.message, err.data.suggestion);
            } else if (field === 'password') {
                el.regPassword.setCustomValidity(err.message);
                el.regPasswordError.textContent = (err.data.problems || [err.message]).join(' ');
            } else {
                showError(el.registerError, err.message);
            }
        }).then(function () {
            setBusy(el.registerBtn, false, 'Create account');
        });
    }

    // Asks the API whether the email's domain can receive mail (typos, made-up domains)
    function checkEmailDomain() {
        clearTimeout(emailCheckTimer);
        var email = el.regEmail.value.trim();
        if (!email || email === lastCheckedEmail || !el.regEmail.checkValidity()) return;
        lastCheckedEmail = email;
        el.regEmailHelp.textContent = 'Checking…';
        Valent.api('POST', '/auth/check-email', { email: email }).then(function (result) {
            if (el.regEmail.value.trim() !== email) return; // they kept typing
            if (result.ok) {
                el.regEmailHelp.textContent = 'Looks good.';
                setEmailError('');
            } else {
                el.regEmailHelp.textContent = '';
                setEmailError(result.error, result.suggestion);
            }
        }).catch(function () {
            el.regEmailHelp.textContent = 'We\'ll check this email when you create your account.';
            lastCheckedEmail = null;
        });
    }

    // message '' clears the error. suggestion: a corrected address the customer can click to use.
    function setEmailError(message, suggestion) {
        el.regEmail.setCustomValidity(message || '');
        el.regEmailError.textContent = '';
        if (!message) {
            el.regEmail.classList.remove('is-invalid');
            return;
        }
        el.regEmail.classList.add('is-invalid');
        el.regEmailError.appendChild(document.createTextNode(suggestion ? 'Did you mean ' : message));
        if (suggestion) {
            var fix = Valent.makeEl('button', 'btn btn-link email-suggestion', suggestion);
            fix.type = 'button';
            fix.addEventListener('click', function () {
                el.regEmail.value = suggestion;
                setEmailError('');
                lastCheckedEmail = null;
                checkEmailDomain();
            });
            el.regEmailError.appendChild(fix);
            el.regEmailError.appendChild(document.createTextNode('?'));
        }
    }

    // ---------------------------------------------------------------
    // PASSWORD STRENGTH (mirrors PasswordRules in API/Services/AccountChecks.cs;
    // the API enforces the rules, this is just live feedback)
    // ---------------------------------------------------------------

    var COMMON_PASSWORDS = [
        'password', 'password1', 'password12', 'password123', 'password1234', 'passw0rd', 'p@ssword', 'p@ssw0rd',
        '123456789', '1234567890', 'qwerty123', 'qwertyuiop', '1q2w3e4r5t', 'iloveyou', 'iloveyou1', 'welcome1',
        'welcome123', 'letmein123', 'football1', 'baseball1', 'sunshine1', 'princess1', 'dragon123', 'monkey123',
        'abc123456', 'abcdefghij', 'trustno1', 'insurance', 'insurance1', 'valent', 'valentpartners',
        'valentdemo2026!', 'rolltide1'
    ];

    function passwordStrength() {
        var pw = el.regPassword.value;
        var lower = pw.toLowerCase();
        var kinds = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter(function (re) { return re.test(pw); }).length;
        var personal = [el.regEmail.value.split('@')[0], el.regFirstName.value, el.regLastName.value]
            .map(function (s) { return s.trim().toLowerCase(); })
            .filter(function (s) { return s.length >= 3; });

        var rules = {
            length: pw.length >= 10,
            mix: kinds >= 3,
            personal: pw.length > 0 && !personal.some(function (p) { return lower.indexOf(p) !== -1; }),
            common: pw.length > 0 && COMMON_PASSWORDS.indexOf(lower) === -1 && new Set(pw).size > 3
        };
        var problems = [];
        if (!rules.length) problems.push('Use at least 10 characters.');
        if (!rules.mix) problems.push('Mix at least three of: lowercase letters, capital letters, numbers, and symbols.');
        if (!rules.personal) problems.push('Don\'t include your name or email in your password.');
        if (!rules.common) problems.push('That password is too common or repetitive.');

        // 0 empty, 1 weak, 2 fair, 3 good, 4 strong
        var score = 0;
        if (pw.length > 0) {
            score = problems.length === 0 ? 3 : (problems.length === 1 && rules.length ? 2 : 1);
            if (score === 3 && pw.length >= 14 && kinds === 4) score = 4;
        }
        return { score: score, rules: rules, problems: problems };
    }

    var STRENGTH_LABELS = ['', 'Weak', 'Fair', 'Good', 'Strong'];

    function updateStrength() {
        var s = passwordStrength();
        el.strengthMeter.setAttribute('data-score', s.score);
        el.passwordStrength.textContent = s.score ? 'Password strength: ' + STRENGTH_LABELS[s.score] : '';
        el.passwordRules.querySelectorAll('li').forEach(function (li) {
            li.classList.toggle('met', !!s.rules[li.getAttribute('data-rule')]);
        });
        if (el.registerForm.classList.contains('was-validated')) {
            el.regPassword.setCustomValidity(s.problems[0] || '');
            el.regPasswordError.textContent = s.problems[0] || '';
        }
    }

    function checkConfirm() {
        el.regConfirm.setCustomValidity(
            el.regConfirm.value && el.regConfirm.value !== el.regPassword.value ? 'Passwords don\'t match.' : '');
    }

    // ---------------------------------------------------------------
    // MY APPLICATIONS
    // ---------------------------------------------------------------

    // What each status means to the customer
    var CUSTOMER_STATUS = {
        in_progress: { label: 'Not submitted', cls: 'queue-status-denied',
            text: 'You started this application but haven\'t submitted it yet.' },
        abandoned: { label: 'Not submitted', cls: 'queue-status-denied',
            text: 'This application was never submitted. Start a new application whenever you\'re ready.' },
        submitted: { label: 'Received', cls: 'queue-status-new',
            text: 'We have your application. A Valent Partners agent will review it and contact you by email.' },
        under_review: { label: 'In review', cls: 'queue-status-pending',
            text: 'An agent is reviewing your application now.' },
        escalated: { label: 'With a specialist', cls: 'queue-status-pending',
            text: 'A Valent Partners specialist is reviewing your application personally. This can take a little longer.' },
        approved: { label: 'Approved', cls: 'queue-status-approved',
            text: 'Approved! Your agent will contact you to finalize your policy and confirm your start date.' },
        rejected: { label: 'Not approved', cls: 'queue-status-escalated', text: '' }
    };

    function loadMyApplications() {
        hideError(el.myAppsError);
        el.myAppsList.innerHTML = '<p class="text-muted">Loading your applications…</p>';
        Valent.api('GET', '/account/applications').then(renderMyApplications).catch(function (err) {
            el.myAppsList.innerHTML = '';
            showError(el.myAppsError, err.message);
        });
    }

    // Built with textContent (makeEl), so nothing from the server is treated as HTML
    function renderMyApplications(apps) {
        var make = Valent.makeEl;
        el.myAppsList.innerHTML = '';
        if (apps.length === 0) {
            var empty = make('div', 'card p-4 text-center');
            empty.appendChild(make('p', 'lead mb-1', 'You don\'t have any applications yet.'));
            empty.appendChild(make('p', 'text-muted mb-0', 'Start one from the home page, or use the button above.'));
            el.myAppsList.appendChild(empty);
            return;
        }

        apps.forEach(function (app) {
            var meta = CUSTOMER_STATUS[app.status] || { label: app.status, cls: 'queue-status-denied', text: '' };
            var card = make('div', 'card my-app-card p-3 mb-3');

            var top = make('div', 'd-flex flex-wrap justify-content-between align-items-start gap-2');
            var title = make('div');
            title.appendChild(make('h2', 'h5 mb-0', Valent.linesLabel(app.lineCodes) + ' Insurance'));
            title.appendChild(make('div', 'small text-muted', 'Application #' + app.applicationId + ' · ' +
                Valent.stateName(app.stateCode) + ' · ' +
                (app.submittedAt ? 'submitted ' + Valent.formatDate(app.submittedAt) : 'started ' + Valent.formatDate(app.createdAt))));
            top.appendChild(title);
            top.appendChild(make('span', 'my-app-status ' + meta.cls, meta.label));
            card.appendChild(top);

            var text = meta.text;
            if (app.status === 'approved' && app.autoDecision === 'approved') {
                text = 'Approved right away! Your application met our standard requirements. Your agent will contact you to finalize your policy.';
            } else if (app.status === 'escalated' && app.autoDecision === 'escalated') {
                text = 'Because of your home\'s value, a Valent Partners specialist is reviewing and pricing your application personally.';
            }
            if (text) card.appendChild(make('p', 'mb-0 mt-2', text));

            if (app.status === 'rejected') {
                var box = make('div', 'rejection-explainer mt-2');
                box.appendChild(make('div', 'rejection-title', 'Why: ' + (app.rejectionTitle || 'See below')));
                box.appendChild(make('div', 'small mt-1', app.rejectionMessage ||
                    'Your application didn\'t meet our current requirements. Contact us for details.'));
                box.appendChild(make('div', 'small text-muted mt-2',
                    'Questions, or think something is wrong? Reply to your confirmation email and an agent will help.'));
                card.appendChild(box);
            }
            el.myAppsList.appendChild(card);
        });
    }

    // ---------------------------------------------------------------
    // HELPERS
    // ---------------------------------------------------------------

    function showError(node, message) {
        node.textContent = message;
        node.classList.remove('d-none');
    }

    function hideError(node) {
        node.classList.add('d-none');
    }

    function setBusy(btn, busy, text) {
        btn.disabled = busy;
        btn.textContent = text;
    }
})();

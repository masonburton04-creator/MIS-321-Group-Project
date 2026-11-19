/* Ask Val - the AI chatbot panel (bottom-right on customer pages).
   Talks to POST /api/chat, which streams the reply one piece at a time (NDJSON), so text
   shows up as the model writes it. The conversation is kept in sessionStorage, so it
   survives moving around the site or refreshing, and ends when the tab closes.
   Quick estimate uses POST /api/chat/quote: no AI, instant, same formula as the application. */
(function () {
    'use strict';

    var STORE_KEY = 'valentChat';
    var HISTORY_SENT = 8;                 // the API only reads the last 8 messages anyway
    var WELCOME = 'Hi, I\'m Val. I can explain **Homeowners, Flood, Jewelry, and Auto** coverage, ' +
        'compare the rules in Alabama, Texas, and New York, and give **demo price estimates**. What would you like to know?';

    var el = {};
    var chat = { conversationId: null, messages: [] };   // messages: { role, content, quote? }
    var streaming = null;                                  // AbortController while a reply streams
    var statusChecked = false;

    // ---------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------
    function load() {
        try {
            var saved = JSON.parse(sessionStorage.getItem(STORE_KEY));
            if (saved && Array.isArray(saved.messages)) chat = saved;
        } catch (e) { /* storage unavailable */ }
    }
    function save() {
        try { sessionStorage.setItem(STORE_KEY, JSON.stringify(chat)); } catch (e) { /* storage unavailable */ }
    }

    // ---------------------------------------------------------------
    // Rendering
    // ---------------------------------------------------------------

    // Small, safe subset of Markdown: **bold**, "- " lists, paragraphs. Escaped first.
    function renderMarkdown(text) {
        var html = Valent.escapeHtml(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        var out = [];
        var list = null;
        html.split('\n').forEach(function (line) {
            var item = /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/.exec(line);
            if (item) {
                if (!list) list = [];
                list.push('<li>' + item[1] + '</li>');
                return;
            }
            if (list) { out.push('<ul>' + list.join('') + '</ul>'); list = null; }
            if (line.trim()) out.push('<p>' + line + '</p>');
        });
        if (list) out.push('<ul>' + list.join('') + '</ul>');
        return out.join('');
    }

    function addBubble(role, text) {
        var bubble = Valent.makeEl('div', 'chat-msg chat-msg-' + role);
        var body = Valent.makeEl('div', 'chat-bubble');
        if (role === 'user') body.textContent = text;
        else body.innerHTML = renderMarkdown(text);
        bubble.appendChild(body);
        el.log.appendChild(bubble);
        scrollDown();
        return bubble;
    }

    function scrollDown() {
        el.log.scrollTop = el.log.scrollHeight;
    }

    function quoteCardHtml(quote) {
        var rows = quote.lines.map(function (line) {
            var name = Valent.LINE_LABELS[line.lineCode] || line.lineCode;
            var price = line.low !== null && line.high !== null
                ? Valent.formatMoney(line.low) + ' &ndash; ' + Valent.formatMoney(line.high) + '<span class="text-muted">/yr</span>'
                : '<span class="text-muted">Specialist prices it</span>';
            var basis = (line.basis || []).map(Valent.escapeHtml).join(' &middot; ');
            return '<div class="chat-quote-line"><div class="d-flex justify-content-between gap-2"><strong>' + name +
                '</strong><span class="text-nowrap">' + price + '</span></div>' +
                (basis ? '<div class="chat-quote-basis">' + basis + '</div>' : '') + '</div>';
        }).join('');
        var total = quote.totalLow !== null && quote.totalHigh !== null && quote.lines.length > 1
            ? '<div class="chat-quote-line d-flex justify-content-between"><strong>Total</strong><span>' +
              Valent.formatMoney(quote.totalLow) + ' &ndash; ' + Valent.formatMoney(quote.totalHigh) + '/yr</span></div>'
            : '';
        return '<div class="chat-quote-card">' +
            '<div class="chat-quote-head"><span class="badge mock-badge">DEMO ESTIMATE</span> ' +
            Valent.escapeHtml(Valent.stateName(quote.stateCode)) + '</div>' +
            rows + total +
            '<button type="button" class="btn btn-sm valent-btn-primary w-100 mt-2" data-chat-apply>Start an application</button>' +
            '</div>';
    }

    function addQuoteCard(bubble, quote) {
        var holder = Valent.makeEl('div');
        holder.innerHTML = quoteCardHtml(quote);
        bubble.appendChild(holder.firstChild);
        scrollDown();
    }

    // Which context documents (API/Knowledge) the answer was based on
    function addSources(bubble, sources) {
        if (!sources || !sources.length) return;
        var line = Valent.makeEl('div', 'chat-sources');
        line.textContent = 'Based on: ' + sources.join(' · ');
        bubble.appendChild(line);
    }

    function addFeedback(bubble, messageId) {
        if (!messageId) return;
        var bar = Valent.makeEl('div', 'chat-feedback');
        bar.innerHTML = '<span>Helpful?</span>' +
            '<button type="button" data-helpful="true" aria-label="Yes, helpful">Yes</button>' +
            '<button type="button" data-helpful="false" aria-label="No, not helpful">No</button>';
        bar.addEventListener('click', function (event) {
            var btn = event.target.closest('button[data-helpful]');
            if (!btn) return;
            Valent.api('POST', '/chat/feedback', {
                conversationId: chat.conversationId,
                messageId: messageId,
                helpful: btn.getAttribute('data-helpful') === 'true'
            }).catch(function () { /* not important enough to show */ });
            bar.innerHTML = '<span>Thanks for the feedback.</span>';
        });
        bubble.appendChild(bar);
    }

    function renderAll() {
        el.log.innerHTML = '';
        addBubble('assistant', WELCOME);
        chat.messages.forEach(function (m) {
            var bubble = addBubble(m.role, m.content);
            if (m.quote) addQuoteCard(bubble, m.quote);
            if (m.sources) addSources(bubble, m.sources);
        });
        el.suggestions.classList.toggle('d-none', chat.messages.length > 0);
    }

    function setStatus(message, tone) {
        el.status.textContent = message || '';
        el.status.className = 'chat-status' + (message ? ' chat-status-' + (tone || 'info') : ' d-none');
    }

    function setBusy(busy) {
        el.send.classList.toggle('is-stop', busy);
        el.send.setAttribute('aria-label', busy ? 'Stop' : 'Send');
        el.send.innerHTML = busy
            ? '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor"/></svg>'
            : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7z"/></svg>';
    }

    // ---------------------------------------------------------------
    // Sending a question (streamed reply)
    // ---------------------------------------------------------------
    function headers() {
        var h = { 'Content-Type': 'application/json' };
        var s = Valent.session();
        if (s && s.type === 'customer') h.Authorization = 'Bearer ' + s.token;
        return h;
    }

    function pageState() {
        return typeof Valent.selectedState === 'function' ? Valent.selectedState() : null;
    }

    function ask(question) {
        question = question.trim();
        if (!question || streaming) return;
        if (question.length > 600) question = question.slice(0, 600);

        chat.messages.push({ role: 'user', content: question });
        save();
        el.suggestions.classList.add('d-none');
        var userBubble = addBubble('user', question);
        el.input.value = '';
        autoSize();

        var bubble = addBubble('assistant', '');
        var body = bubble.querySelector('.chat-bubble');
        body.innerHTML = '<span class="chat-typing" aria-label="Val is typing"><span></span><span></span><span></span></span>';
        var reply = { role: 'assistant', content: '' };
        var drawQueued = false;
        function draw() {
            drawQueued = false;
            body.innerHTML = renderMarkdown(reply.content) || body.innerHTML;
            scrollDown();
        }

        streaming = new AbortController();
        setBusy(true);
        var history = chat.messages.slice(-HISTORY_SENT).map(function (m) { return { role: m.role, content: m.content }; });

        fetch(Valent.API_BASE_URL + '/chat', {
            method: 'POST',
            headers: headers(),
            body: JSON.stringify({ conversationId: chat.conversationId, messages: history, stateCode: pageState() }),
            signal: streaming.signal
        }).then(function (response) {
            if (!response.ok) {
                return response.json().catch(function () { return {}; }).then(function (data) {
                    throw new Error(data.error || (response.status === 429
                        ? 'You\'re sending messages quickly. Wait a moment and try again.'
                        : 'The chatbot had a problem (HTTP ' + response.status + ').'));
                });
            }
            var reader = response.body.getReader();
            var decoder = new TextDecoder();
            var buffer = '';
            var done = null;

            function handle(event) {
                if (event.type === 'meta') {
                    chat.conversationId = event.conversationId;
                } else if (event.type === 'token') {
                    reply.content += event.text;
                    if (!drawQueued) { drawQueued = true; requestAnimationFrame(draw); }
                } else if (event.type === 'quote') {
                    reply.quote = event.quote;
                } else if (event.type === 'sources') {
                    reply.sources = event.sources.map(function (s) { return s.section; });
                } else if (event.type === 'error') {
                    throw new Error(event.message);
                } else if (event.type === 'done') {
                    done = event;
                }
            }

            function pump() {
                return reader.read().then(function (result) {
                    if (result.value) buffer += decoder.decode(result.value, { stream: true });
                    var lines = buffer.split('\n');
                    buffer = lines.pop();
                    lines.forEach(function (line) { if (line.trim()) handle(JSON.parse(line)); });
                    if (result.done) return done;
                    return pump();
                });
            }
            return pump();
        }).then(function (done) {
            draw();
            if (reply.quote) addQuoteCard(bubble, reply.quote);
            if (reply.sources) addSources(bubble, reply.sources);
            if (done) addFeedback(bubble, done.messageId);
            setStatus('');
        }).catch(function (err) {
            if (err.name === 'AbortError') {
                if (!reply.content) reply.content = '(Stopped.)';
                draw();
                return;
            }
            var message = err instanceof TypeError
                ? 'Can\'t reach the server. Is the API running? (dotnet run in the API folder)'
                : err.message;
            if (!reply.content) { bubble.remove(); userBubble.remove(); }
            else draw();
            setStatus(message, 'error');
        }).then(function () {
            if (reply.content) {
                chat.messages.push(reply);
            } else {
                chat.messages.pop();   // no reply: forget the question so it can be asked again
                el.input.value = question;
            }
            save();
            streaming = null;
            setBusy(false);
            el.input.focus();
        });
    }

    // ---------------------------------------------------------------
    // Quick estimate form
    // ---------------------------------------------------------------
    function showQuickFields() {
        var line = el.qeLine.value;
        el.quickForm.querySelectorAll('[data-qe]').forEach(function (group) {
            group.classList.toggle('d-none', group.getAttribute('data-qe') !== line);
        });
    }

    function num(id) {
        var v = document.getElementById(id).value.trim();
        return v === '' ? null : Number(v);
    }

    function submitQuick(event) {
        event.preventDefault();
        var line = el.qeLine.value;
        var body = { conversationId: chat.conversationId, stateCode: pageState(), lines: [line] };
        var problem = null;

        if (line === 'HOME') {
            body.dwellingCoverage = num('qeDwelling');
            if (!(body.dwellingCoverage >= 50000 && body.dwellingCoverage <= 50000000))
                problem = 'Enter a rebuild cost between $50,000 and $50,000,000.';
        } else if (line === 'FLOOD') {
            body.floodZone = document.getElementById('qeZone').value;
            body.floodBuildingCoverage = num('qeBuilding') || 0;
            body.floodContentsCoverage = num('qeContents') || 0;
            if (body.floodBuildingCoverage > 250000 || body.floodContentsCoverage > 100000)
                problem = 'NFIP limits are $250,000 for the building and $100,000 for belongings.';
            else if (!body.floodBuildingCoverage && !body.floodContentsCoverage)
                problem = 'Enter building coverage, belongings coverage, or both.';
        } else if (line === 'JEWELRY') {
            body.jewelryItemValues = document.getElementById('qeJewelry').value.split(',')
                .map(function (v) { return Number(v.replace(/[$\s]/g, '')); })
                .filter(function (v) { return v > 0; });
            if (body.jewelryItemValues.length === 0) problem = 'Enter the value of at least one item, like 6000, 1500.';
        } else {
            body.autoCoverage = document.getElementById('qeAutoCoverage').value;
            body.vehicleCount = num('qeVehicles');
            body.driverCount = num('qeDrivers');
            body.newestDriverYearsLicensed = num('qeYears');
            body.recentIncidents = document.getElementById('qeIncidents').checked;
            body.businessUse = document.getElementById('qeBusiness').checked;
            if (!(body.vehicleCount >= 1) || !(body.driverCount >= 1)) problem = 'Enter at least 1 vehicle and 1 driver.';
            else if (body.newestDriverYearsLicensed === null) problem = 'Enter how many years the newest driver has been licensed.';
        }

        el.qeError.textContent = problem || '';
        el.qeError.classList.toggle('d-none', !problem);
        if (problem) return;

        var asked = 'Quick estimate: ' + (Valent.LINE_LABELS[line] || line);
        Valent.api('POST', '/chat/quote', body).then(function (result) {
            chat.conversationId = result.conversationId;
            var reply = { role: 'assistant', content: result.text, quote: result.quote || undefined };
            chat.messages.push({ role: 'user', content: asked }, reply);
            save();
            el.suggestions.classList.add('d-none');
            addBubble('user', asked);
            var bubble = addBubble('assistant', result.text);
            if (result.quote) addQuoteCard(bubble, result.quote);
            addFeedback(bubble, result.messageId);
            el.quickForm.classList.add('d-none');
        }).catch(function (err) {
            el.qeError.textContent = err.message;
            el.qeError.classList.remove('d-none');
        });
    }

    // ---------------------------------------------------------------
    // Open / close
    // ---------------------------------------------------------------
    function open() {
        el.panel.classList.remove('d-none');
        el.launcher.setAttribute('aria-expanded', 'true');
        el.launcher.classList.add('d-none');
        el.input.focus();
        scrollDown();
        if (!statusChecked) checkStatus();
    }

    function close() {
        if (streaming) streaming.abort();
        el.panel.classList.add('d-none');
        el.launcher.setAttribute('aria-expanded', 'false');
        updateLauncher();
        el.launcher.focus();
    }

    // Also asks the API to load the model now, so the first answer is quicker
    function checkStatus() {
        statusChecked = true;
        Valent.api('GET', '/chat/status').then(function (s) {
            if (!s.available) {
                setStatus(s.problem + ' Quick estimate still works.', 'warning');
                statusChecked = false;  // check again next time it opens
            }
        }).catch(function () {
            setStatus('Can\'t reach the server. Is the API running? (dotnet run in the API folder)', 'error');
            statusChecked = false;
        });
    }

    function newChat() {
        if (streaming) streaming.abort();
        chat = { conversationId: null, messages: [] };
        save();
        setStatus('');
        renderAll();
        el.input.focus();
    }

    // Customer pages only: staff on the dashboard don't need it
    function updateLauncher() {
        var view = Valent.currentView();
        var staffPage = view === 'dashboard' || view === 'team';
        var hide = staffPage || !el.panel.classList.contains('d-none');
        el.launcher.classList.toggle('d-none', hide);
        if (staffPage && !el.panel.classList.contains('d-none')) close();
    }

    function autoSize() {
        el.input.style.height = 'auto';
        el.input.style.height = Math.min(el.input.scrollHeight, 120) + 'px';
        el.input.style.overflowY = el.input.scrollHeight > 120 ? 'auto' : 'hidden';
    }

    document.addEventListener('DOMContentLoaded', function () {
        el.launcher = document.getElementById('chatLauncher');
        el.panel = document.getElementById('chatPanel');
        el.log = document.getElementById('chatLog');
        el.status = document.getElementById('chatStatus');
        el.suggestions = document.getElementById('chatSuggestions');
        el.form = document.getElementById('chatForm');
        el.input = document.getElementById('chatInput');
        el.send = document.getElementById('chatSend');
        el.quickForm = document.getElementById('chatQuickForm');
        el.qeLine = document.getElementById('qeLine');
        el.qeError = document.getElementById('qeError');

        load();
        renderAll();

        el.launcher.addEventListener('click', open);
        // Anything else that opens the chat, like the "Ask Quote Assistant" card on the home page
        document.addEventListener('click', function (event) {
            if (event.target.closest('[data-open-chat]')) open();
        });
        document.getElementById('chatClose').addEventListener('click', close);
        document.getElementById('chatNewBtn').addEventListener('click', newChat);
        el.panel.addEventListener('keydown', function (event) {
            if (event.key === 'Escape') close();
        });

        el.form.addEventListener('submit', function (event) {
            event.preventDefault();
            if (streaming) { streaming.abort(); return; }   // the Send button is Stop while Val is writing
            ask(el.input.value);
        });
        el.input.addEventListener('keydown', function (event) {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                if (!streaming) ask(el.input.value);
            }
        });
        el.input.addEventListener('input', autoSize);

        el.suggestions.addEventListener('click', function (event) {
            var chip = event.target.closest('.chat-chip');
            if (chip) ask(chip.textContent);
        });

        document.getElementById('chatQuickBtn').addEventListener('click', function () {
            el.quickForm.classList.toggle('d-none');
            showQuickFields();
            scrollDown();
        });
        document.getElementById('chatQuickCancel').addEventListener('click', function () {
            el.quickForm.classList.add('d-none');
        });
        el.qeLine.addEventListener('change', showQuickFields);
        el.quickForm.addEventListener('submit', submitQuick);

        // "Start an application" on a quote card
        el.log.addEventListener('click', function (event) {
            if (!event.target.closest('[data-chat-apply]')) return;
            if (chat.conversationId) {
                Valent.api('POST', '/chat/event', { conversationId: chat.conversationId, type: 'apply_click' })
                    .catch(function () { /* metric only */ });
            }
            close();
            Valent.go('site');
            if (typeof Valent.startNewApplication === 'function') Valent.startNewApplication();
        });

        Valent.on('view', updateLauncher);
        updateLauncher();
    });
})();

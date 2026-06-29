// Captures view. Renders ?list=capture — the raw voice/quick-capture log.
//
// Two entry points land a capture here:
//   1. The iOS Shortcut opens ?list=capture&text=…&at=… ; app.js stashes that
//      (pre-auth, so it survives the OAuth redirect) and routes here, where
//      flushPending() inserts the raw row with full UI feedback.
//   2. The manual textarea below (web fallback) — same makeCapture path.
//
// Capture is "dumb": it stores the dictated text + event time verbatim. No
// parsing or macro math happens here — that's the reconcile step (CLI + the
// reconcile-captures skill). DOM + event wiring only; logic via MealsCore.

var CapturesView = (function() {
    var container = null;
    var api = null;
    var items = [];
    var status = null;        // { kind: 'ok'|'err', msg }
    var pendingRetry = null;  // in-memory capture obj kept for a retry after a failed flush

    function init(el, listApi) {
        container = el;
        api = listApi;

        Sync.init(api, function(fresh) {
            items = fresh || [];
            render();
        });

        loadAndRender();
    }

    async function loadAndRender() {
        container.innerHTML = '<div class="loading">Loading...</div>';
        try {
            items = await api.fetchItems();
            render();
            await flushPending();
        } catch (err) {
            container.innerHTML = '<div class="error">Failed to load: ' + escapeHtml(err.message) + '</div>';
        }
    }

    // Insert any capture the Shortcut/redirect left stashed (or a retry).
    async function flushPending() {
        var pending = pendingRetry || App.takePendingCapture();
        if (!pending) return;
        pendingRetry = null;
        status = { kind: 'pending', msg: 'Saving capture…' };
        render();
        try {
            var content = MealsCore.serialize(MealsCore.makeCapture(pending));
            var row = await api.createItem({ content: content });
            items.unshift(row);
            status = { kind: 'ok', msg: '✓ Captured: “' + pending.text + '”' };
        } catch (err) {
            pendingRetry = pending;  // keep it so Retry works without re-fetching
            status = { kind: 'err', msg: 'Capture failed: ' + (err.message || 'unknown error') };
        }
        render();
    }

    function onSubmit(e) {
        e.preventDefault();
        var textarea = container.querySelector('.capture-input');
        var text = (textarea.value || '').trim();
        if (!text) return;
        // Clear before the flush re-renders so the draft-preservation in render()
        // doesn't carry the just-submitted text back into the empty box.
        textarea.value = '';
        // Stage a plain input object; flushPending() runs it through makeCapture
        // (the single insert path shared with the Shortcut/redirect flush).
        pendingRetry = { text: text, source: 'web', at: new Date().toISOString() };
        flushPending();
    }

    function onRetry() {
        flushPending();
    }

    // The capture "endpoint" is just this page. Build the bare upload URL and the
    // Shortcut-flavoured template (with the magic text/at params) from the live
    // origin, so the help always shows the correct address for wherever it's hosted.
    function captureBaseUrl() {
        if (typeof window === 'undefined') return '?list=capture';
        return window.location.origin + window.location.pathname + '?list=capture';
    }

    function shortcutUrl() {
        return captureBaseUrl() + '&source=shortcut&text=[Dictated Text]&at=[Current Date]';
    }

    function onCopyUrl(e) {
        var btn = e.currentTarget;
        var url = captureBaseUrl();
        function flash() {
            var prev = btn.textContent;
            btn.textContent = 'Copied';
            setTimeout(function() { btn.textContent = prev; }, 1500);
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url).then(flash, function() {});
        }
    }

    function fmtTime(at) {
        if (!at) return '(no time)';
        var d = new Date(at);
        if (isNaN(d.getTime())) return escapeHtml(at);
        return d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    }

    function render() {
        // A background Sync tick (30s poll / realtime) re-renders by rebuilding
        // container.innerHTML, which would otherwise tear down the textarea and
        // lose whatever the user is mid-typing. Snapshot the draft (and caret /
        // focus) before the rebuild and restore it after.
        var prevInput = container.querySelector('.capture-input');
        var draft = prevInput ? prevInput.value : null;
        var hadFocus = !!(prevInput && document.activeElement === prevInput);
        var caret = prevInput ? prevInput.selectionStart : null;

        var captures = MealsCore.parseCaptures(items);
        var unprocessed = captures.filter(function(c) { return !MealsCore.isProcessed(c); }).length;

        var html = '<div class="captures">';

        // Read-only upload tools: the capture endpoint URL (copyable, so you can
        // point a Shortcut at it) and a help button that opens the build steps.
        html += '<div class="capture-tools">' +
            '<div class="capture-url">' +
                '<span class="capture-url-label">Capture URL</span>' +
                '<code class="capture-url-value">' + escapeHtml(captureBaseUrl()) + '</code>' +
                '<button type="button" class="capture-url-copy">Copy</button>' +
            '</div>' +
            '<button type="button" class="capture-help-btn">Set up iOS Shortcut</button>' +
        '</div>';

        html += '<form class="capture-box">' +
            '<textarea class="capture-input" rows="2" placeholder="Log a meal or symptom… (e.g. “smoothie and a banana”)"></textarea>' +
            '<button type="submit" class="btn btn-primary capture-submit">Capture</button>' +
        '</form>';

        if (status) {
            var cls = status.kind === 'err' ? 'status-err' : (status.kind === 'ok' ? 'status-ok' : 'status-pending');
            html += '<div class="capture-status ' + cls + '">' + escapeHtml(status.msg);
            if (status.kind === 'err') html += ' <button type="button" class="capture-retry">Retry</button>';
            html += '</div>';
        }

        html += '<div class="captures-head">' +
            '<span class="captures-count">' + captures.length + ' capture' + (captures.length === 1 ? '' : 's') + '</span>' +
            '<span class="captures-unprocessed">' + unprocessed + ' to reconcile</span>' +
        '</div>';

        if (!captures.length) {
            html += '<div class="captures-empty">No captures yet. Speak or type one above, or use the iOS Shortcut.</div>';
        } else {
            html += '<ul class="captures-list">';
            for (var i = 0; i < captures.length; i++) {
                var c = captures[i];
                var done = MealsCore.isProcessed(c);
                html += '<li class="capture-item' + (done ? ' is-processed' : '') + '" data-id="' + escapeHtml(c.id) + '">' +
                    '<div class="capture-text">' + escapeHtml(c.text) + '</div>' +
                    '<div class="capture-meta">' +
                        '<span class="capture-time">' + fmtTime(c.at) + '</span>' +
                        (c.source ? '<span class="capture-source">' + escapeHtml(c.source) + '</span>' : '') +
                        '<span class="capture-badge">' + (done ? 'reconciled' : 'new') + '</span>' +
                    '</div>' +
                    (done && c.note ? '<div class="capture-note">' + escapeHtml(c.note) + '</div>' : '') +
                '</li>';
            }
            html += '</ul>';
        }

        html += renderHelpDialog();

        html += '</div>';
        container.innerHTML = html;

        // Restore any in-progress draft the rebuild above would have dropped.
        var input = container.querySelector('.capture-input');
        if (input && draft) {
            input.value = draft;
            if (hadFocus) {
                input.focus();
                var pos = caret == null ? draft.length : caret;
                try { input.setSelectionRange(pos, pos); } catch (e) {}
            }
        }

        container.querySelector('.capture-box').addEventListener('submit', onSubmit);
        var retry = container.querySelector('.capture-retry');
        if (retry) retry.addEventListener('click', onRetry);
        container.querySelector('.capture-url-copy').addEventListener('click', onCopyUrl);
        bindHelpEvents();
    }

    // Step-by-step iOS Shortcut setup (mirrors docs/voice-capture.md), shown in a
    // modal so the capture log stays uncluttered until you ask for it.
    function renderHelpDialog() {
        var steps = [
            'Open <strong>Shortcuts</strong> → <strong>+</strong> and name it e.g. “Log food/symptom”.',
            'Add <strong>Dictate Text</strong> (Stop Listening → <em>After Pause</em>).',
            'Add <strong>Get Current Date</strong>.',
            'Add <strong>Text</strong> and paste the URL below, replacing the bracketed bits with the ' +
                '<strong>Dictated Text</strong> and <strong>Current Date</strong> variable chips (set Current Date’s format to <em>ISO 8601</em>).',
            'Add <strong>Open URLs</strong> using that Text.',
            'Optional: <strong>Add to Home Screen</strong> or wire it to the Action Button / Back Tap / “Hey Siri”.'
        ];
        var html = '<dialog class="capture-help-dialog">' +
            '<div class="capture-help-head">' +
                '<span class="capture-help-title">Set up the iOS Shortcut</span>' +
                '<button type="button" class="capture-help-close" aria-label="Close">&times;</button>' +
            '</div>' +
            '<p class="capture-help-intro">Dictate a short note and it lands in this log, ready to reconcile. ' +
                'The Shortcut just opens this page with your text — no backend, it reuses your sign-in.</p>' +
            '<ol class="capture-help-steps">';
        for (var i = 0; i < steps.length; i++) html += '<li>' + steps[i] + '</li>';
        html += '</ol>' +
            '<div class="capture-shortcut-label">Shortcut URL</div>' +
            '<code class="capture-shortcut-url">' + escapeHtml(shortcutUrl()) + '</code>' +
            '<div class="capture-help-actions">' +
                '<button type="button" class="capture-help-done btn btn-primary">Done</button>' +
            '</div>' +
        '</dialog>';
        return html;
    }

    function bindHelpEvents() {
        var dialog = container.querySelector('.capture-help-dialog');
        var open = container.querySelector('.capture-help-btn');
        if (!dialog || !open) return;
        open.addEventListener('click', function() {
            if (typeof dialog.showModal === 'function') dialog.showModal();
            else dialog.setAttribute('open', '');
        });
        function close() { dialog.close ? dialog.close() : dialog.removeAttribute('open'); }
        dialog.querySelector('.capture-help-close').addEventListener('click', close);
        dialog.querySelector('.capture-help-done').addEventListener('click', close);
        dialog.addEventListener('click', function(e) { if (e.target === dialog) close(); });
    }

    return {
        init: init
    };
})();

if (typeof window !== 'undefined') window.CapturesView = CapturesView;

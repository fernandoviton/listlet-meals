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
        // Stage a plain input object; flushPending() runs it through makeCapture
        // (the single insert path shared with the Shortcut/redirect flush).
        pendingRetry = { text: text, source: 'web', at: new Date().toISOString() };
        flushPending();
    }

    function onRetry() {
        flushPending();
    }

    function fmtTime(at) {
        if (!at) return '(no time)';
        var d = new Date(at);
        if (isNaN(d.getTime())) return escapeHtml(at);
        return d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    }

    function render() {
        var captures = MealsCore.parseCaptures(items);
        var unprocessed = captures.filter(function(c) { return !MealsCore.isProcessed(c); }).length;

        var html = '<div class="captures">';

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

        html += '</div>';
        container.innerHTML = html;

        container.querySelector('.capture-box').addEventListener('submit', onSubmit);
        var retry = container.querySelector('.capture-retry');
        if (retry) retry.addEventListener('click', onRetry);
    }

    return {
        init: init
    };
})();

if (typeof window !== 'undefined') window.CapturesView = CapturesView;

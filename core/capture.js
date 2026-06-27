// Voice/quick capture logic: build raw capture rows, parse them back, mark them
// processed, and build the structured symptom rows a reconcile step produces.
// Pure functions, no DOM, no window access inside. Loaded as a <script> in the
// browser and require()'d by Jest tests.
//
// A capture is stored verbatim — the capture path does NO parsing or macro math.
// All interpretation (food → slots, symptom classification) happens later in the
// reconcile step. See docs/voice-capture.md.

var MealsCapture = (function() {
    var isNode = (typeof module !== 'undefined' && module.exports);
    var Content = isNode ? require('./content') : MealsContent;
    var Dates   = isNode ? require('./dates')   : MealsDates;

    // A finite number or null (coerces numeric strings; '' / non-numeric → null).
    function numOrNull(v) {
        if (v === '' || v === null || v === undefined) return null;
        var n = Number(v);
        return isFinite(n) ? n : null;
    }

    function strOrNull(v) {
        return (typeof v === 'string' && v !== '') ? v : null;
    }

    // Build a raw capture from the dumb capture endpoint / web box. Stores the
    // dictated text and the event time verbatim; no interpretation.
    function makeCapture(input) {
        var src = input || {};
        var text = typeof src.text === 'string' ? src.text.trim() : '';
        if (!text) throw new Error('capture text is required');
        return {
            kind: 'capture',
            text: text,
            at: strOrNull(src.at),
            source: strOrNull(src.source) || 'unknown',
            processed_at: null
        };
    }

    // Rows ({ id, content }) → parsed capture objects with their row id attached,
    // newest-first by `at` (captures with no `at` sort last).
    function parseCaptures(items) {
        if (!items || !items.length) return [];
        var out = [];
        for (var i = 0; i < items.length; i++) {
            var parsed = Content.parseContent(items[i].content);
            if (parsed && parsed.kind === 'capture') {
                parsed.id = items[i].id;
                out.push(parsed);
            }
        }
        out.sort(function(a, b) {
            var av = a.at || '', bv = b.at || '';
            if (av === bv) return 0;
            if (!av) return 1;   // null at → last
            if (!bv) return -1;
            return av < bv ? 1 : -1;  // descending
        });
        return out;
    }

    function isProcessed(capture) {
        return !!(capture && capture.processed_at);
    }

    // Stamp a capture processed (non-mutating). `opts.at` is the processed time;
    // `opts.note` (optional) records what the reconcile step did with it.
    function markProcessed(capture, opts) {
        var o = opts || {};
        var copy = Object.assign({}, capture);
        copy.processed_at = strOrNull(o.at) || new Date(0).toISOString();
        if (strOrNull(o.note)) copy.note = o.note;
        return copy;
    }

    // Build a structured symptom row (a reconcile output) for a dated calendar
    // list, so it range-fetches alongside meal slots via slot_date.
    function makeSymptom(input) {
        var src = input || {};
        var text = typeof src.text === 'string' ? src.text.trim() : '';
        if (!text) throw new Error('symptom text is required');
        if (!Dates.isIsoDate(src.date)) throw new Error('symptom date must be YYYY-MM-DD');
        return {
            kind: 'symptom',
            text: text,
            date: src.date,
            at: strOrNull(src.at),
            category: strOrNull(src.category),
            severity: numOrNull(src.severity)
        };
    }

    return {
        makeCapture: makeCapture,
        parseCaptures: parseCaptures,
        isProcessed: isProcessed,
        markProcessed: markProcessed,
        makeSymptom: makeSymptom
    };
})();

if (typeof window !== 'undefined') window.MealsCapture = MealsCapture;
if (typeof module !== 'undefined' && module.exports) module.exports = MealsCapture;

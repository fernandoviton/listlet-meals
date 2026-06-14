// Pure date helpers (ISO 'YYYY-MM-DD' string math). No DOM, no window access.
// Day arithmetic uses Date.UTC only — never local `new Date('YYYY-MM-DD')`
// parsing or `toISOString()` on `now` (both introduce timezone drift).
// Loaded as a <script> in the browser and require()'d by Jest tests.
//
var MealsDates = (function() {
    // sat..fri, matching the planner's Saturday-start week.
    var DOW = ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri'];

    // Format regex + real-calendar validity (round-trip the components through
    // Date.UTC so e.g. 2026-02-30 and a non-leap 2026-02-29 are rejected).
    function isIsoDate(s) {
        if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
        var y = Number(s.slice(0, 4));
        var m = Number(s.slice(5, 7));
        var d = Number(s.slice(8, 10));
        var dt = new Date(Date.UTC(y, m - 1, d));
        return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
    }

    // Internal: ISO string → UTC-midnight Date (no validation; callers pass
    // already-valid ISO strings or strings from our own helpers).
    function toUtc(iso) {
        return new Date(Date.UTC(
            Number(iso.slice(0, 4)),
            Number(iso.slice(5, 7)) - 1,
            Number(iso.slice(8, 10))
        ));
    }

    function pad(n) { return (n < 10 ? '0' : '') + n; }

    // Internal: UTC Date → ISO string.
    function fromUtc(dt) {
        return dt.getUTCFullYear() + '-' + pad(dt.getUTCMonth() + 1) + '-' + pad(dt.getUTCDate());
    }

    function addDays(iso, n) {
        var dt = toUtc(iso);
        dt.setUTCDate(dt.getUTCDate() + n);
        return fromUtc(dt);
    }

    function dayOfWeek(iso) {
        // getUTCDay: 0=Sun..6=Sat; DOW is sat-first, so index = (day+1)%7.
        return DOW[(toUtc(iso).getUTCDay() + 1) % 7];
    }

    // The Saturday on or before the given date.
    function weekStart(iso) {
        var offset = (toUtc(iso).getUTCDay() + 1) % 7;
        return addDays(iso, -offset);
    }

    // The 7 ISO dates (Sat→Fri) of the week containing the given date.
    function weekDates(iso) {
        var start = weekStart(iso);
        var out = [];
        for (var i = 0; i < 7; i++) out.push(addDays(start, i));
        return out;
    }

    // Inclusive ISO date range; from after to yields [].
    function dateRange(from, to) {
        var out = [];
        var cur = from;
        while (cur <= to) {
            out.push(cur);
            cur = addDays(cur, 1);
        }
        return out;
    }

    return {
        isIsoDate: isIsoDate,
        addDays: addDays,
        dayOfWeek: dayOfWeek,
        weekStart: weekStart,
        weekDates: weekDates,
        dateRange: dateRange
    };
})();

if (typeof window !== 'undefined') window.MealsDates = MealsDates;
if (typeof module !== 'undefined' && module.exports) module.exports = MealsDates;

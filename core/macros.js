// Macro resolution + summarization across slots joined live to the library.
// Pure functions, no DOM, no window access inside.
// Loaded as a <script> in the browser and require()'d by Jest tests.

var MealsMacros = (function() {
    var Dates = (typeof module !== 'undefined' && module.exports)
        ? require('./dates')
        : MealsDates;

    var MACRO_KEYS = ['cal', 'protein', 'carbs', 'fat'];

    // Join a week slot to its live library meal by library_id. When found,
    // returns the live name/macros; when not (e.g. the meal was deleted), a
    // fallback label and empty macros. A null/undefined map resolves to the
    // fallback rather than throwing (a realtime Sync render can fire before the
    // library map is built).
    function resolveSlot(slot, libraryById) {
        var map = libraryById || {};
        var meal = slot ? map[slot.library_id] : null;
        if (meal) {
            return { name: meal.name || '', macros: meal.macros || {}, found: true };
        }
        return { name: '(deleted meal)', macros: {}, found: false };
    }

    function summarizeMacros(slots, libraryById) {
        var map = libraryById || {};
        var totals = { cal: 0, protein: 0, carbs: 0, fat: 0 };
        var seen = { cal: false, protein: false, carbs: false, fat: false };
        for (var i = 0; i < slots.length; i++) {
            var meal = slots[i] ? map[slots[i].library_id] : null;
            var m = meal && meal.macros;
            if (!m) continue;
            for (var j = 0; j < MACRO_KEYS.length; j++) {
                var k = MACRO_KEYS[j];
                var v = m[k];
                if (typeof v === 'number') {
                    totals[k] += v;
                    seen[k] = true;
                }
            }
        }
        var out = {};
        for (var k2 = 0; k2 < MACRO_KEYS.length; k2++) {
            if (seen[MACRO_KEYS[k2]]) out[MACRO_KEYS[k2]] = totals[MACRO_KEYS[k2]];
        }
        return out;
    }

    // { [iso]: macros } — one entry per date that has ≥1 slot, summing the live
    // library macros for that day (reuses summarizeMacros). Slots without a valid
    // ISO date are ignored; a date whose meals are all deleted maps to {} (still
    // a logged day). Tolerates a null library map.
    function summarizeMacrosByDate(slots, libraryById) {
        var groups = {};
        for (var i = 0; i < slots.length; i++) {
            var s = slots[i];
            if (!s || !Dates.isIsoDate(s.date)) continue;
            (groups[s.date] = groups[s.date] || []).push(s);
        }
        var out = {};
        for (var date in groups) {
            if (Object.prototype.hasOwnProperty.call(groups, date)) {
                out[date] = summarizeMacros(groups[date], libraryById);
            }
        }
        return out;
    }

    function round1(x) {
        return Math.round(x * 10) / 10;
    }

    // Bucket a { [iso]: macros } map (from summarizeMacrosByDate) into the
    // Saturday-start weeks spanning [fromIso, toIso] inclusive. Each bucket's
    // average divides by days_logged (days present in byDate within that week),
    // not 7, so skipped days don't crater the average; each macro is rounded to
    // 1 decimal. Weeks with no logged days are included with an empty avg. An
    // empty range (from after to) yields [].
    function summarizeWeeklyAverages(byDate, fromIso, toIso) {
        byDate = byDate || {};
        var out = [];
        if (!fromIso || !toIso || fromIso > toIso) return out;

        var week = Dates.weekStart(fromIso);
        while (week <= toIso) {
            var dates = Dates.weekDates(week);
            var sums = {};
            var seen = {};
            var daysLogged = 0;
            for (var d = 0; d < dates.length; d++) {
                var m = byDate[dates[d]];
                if (m === undefined) continue;
                daysLogged++;
                for (var j = 0; j < MACRO_KEYS.length; j++) {
                    var k = MACRO_KEYS[j];
                    if (typeof m[k] === 'number') {
                        sums[k] = (sums[k] || 0) + m[k];
                        seen[k] = true;
                    }
                }
            }
            var avg = {};
            for (var a = 0; a < MACRO_KEYS.length; a++) {
                var key = MACRO_KEYS[a];
                if (seen[key]) avg[key] = round1(sums[key] / daysLogged);
            }
            out.push({ week_start: week, days_logged: daysLogged, avg: avg });
            week = Dates.addDays(week, 7);
        }
        return out;
    }

    return {
        resolveSlot: resolveSlot,
        summarizeMacros: summarizeMacros,
        summarizeMacrosByDate: summarizeMacrosByDate,
        summarizeWeeklyAverages: summarizeWeeklyAverages
    };
})();

if (typeof window !== 'undefined') window.MealsMacros = MealsMacros;
if (typeof module !== 'undefined' && module.exports) module.exports = MealsMacros;

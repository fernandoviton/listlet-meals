// Macro resolution + summarization across slots joined live to the library.
// Pure functions, no DOM, no window access inside.
// Loaded as a <script> in the browser and require()'d by Jest tests.

var MealsMacros = (function() {
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

    return {
        resolveSlot: resolveSlot,
        summarizeMacros: summarizeMacros
    };
})();

if (typeof window !== 'undefined') window.MealsMacros = MealsMacros;
if (typeof module !== 'undefined' && module.exports) module.exports = MealsMacros;

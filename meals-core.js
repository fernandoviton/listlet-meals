// Pure logic for listlet-meals. No DOM, no window access inside functions.
// Loaded as a <script> in the browser and require()'d by Jest tests.

var MealsCore = (function() {
    function parseContent(jsonString) {
        if (typeof jsonString !== 'string' || jsonString === '') return null;
        try {
            return JSON.parse(jsonString);
        } catch (e) {
            return null;
        }
    }

    function serialize(obj) {
        return JSON.stringify(obj);
    }

    function nextOrder(slots, day, mealType) {
        var max = -1;
        for (var i = 0; i < slots.length; i++) {
            if (slots[i].day === day && slots[i].meal_type === mealType
                && typeof slots[i].order === 'number' && slots[i].order > max) {
                max = slots[i].order;
            }
        }
        return max + 1;
    }

    function addSlot(weekItems, libraryMeal, day) {
        var meal = parseContent(libraryMeal.content) || {};
        var existingSlots = [];
        for (var i = 0; i < weekItems.length; i++) {
            var parsed = parseContent(weekItems[i].content);
            if (parsed && parsed.kind === 'slot') existingSlots.push(parsed);
        }
        var mealType = meal.default_meal_type || 'dinner';
        var slot = {
            kind: 'slot',
            library_id: libraryMeal.id,
            day: day,
            meal_type: mealType,
            order: nextOrder(existingSlots, day, mealType),
            name_snapshot: meal.name || '',
            macros_snapshot: meal.macros || {}
        };
        return { newSlotContent: serialize(slot) };
    }

    function moveSlot(slots, id, toDay, toMealType, toIndex) {
        var copy = slots.map(function(s) {
            return Object.assign({}, s);
        });
        var moving = null;
        for (var i = 0; i < copy.length; i++) {
            if (copy[i].id === id) { moving = copy[i]; break; }
        }
        if (!moving) return copy;

        var fromDay = moving.day;
        var fromMealType = moving.meal_type;

        var targetSection = copy
            .filter(function(s) { return s.day === toDay && s.meal_type === toMealType && s.id !== id; })
            .sort(function(a, b) { return a.order - b.order; });

        moving.day = toDay;
        moving.meal_type = toMealType;
        var clampedIndex = Math.max(0, Math.min(toIndex, targetSection.length));
        targetSection.splice(clampedIndex, 0, moving);
        targetSection.forEach(function(s, idx) { s.order = idx; });

        if (fromDay !== toDay || fromMealType !== toMealType) {
            var sourceSection = copy
                .filter(function(s) { return s.day === fromDay && s.meal_type === fromMealType && s.id !== id; })
                .sort(function(a, b) { return a.order - b.order; });
            sourceSection.forEach(function(s, idx) { s.order = idx; });
        }

        return copy;
    }

    function removeSlot(slots, id) {
        var removed = null;
        var kept = [];
        for (var i = 0; i < slots.length; i++) {
            if (slots[i].id === id) {
                removed = slots[i];
            } else {
                kept.push(Object.assign({}, slots[i]));
            }
        }
        if (!removed) return kept;
        var sameSection = kept
            .filter(function(s) { return s.day === removed.day && s.meal_type === removed.meal_type; })
            .sort(function(a, b) { return a.order - b.order; });
        sameSection.forEach(function(s, idx) { s.order = idx; });
        return kept;
    }

    function setMealType(slots, id, mealType) {
        return slots.map(function(s) {
            var copy = Object.assign({}, s);
            if (copy.id === id) copy.meal_type = mealType;
            return copy;
        });
    }

    function summarizeMacros(slots) {
        var keys = ['cal', 'protein', 'carbs', 'fat'];
        var totals = { cal: 0, protein: 0, carbs: 0, fat: 0 };
        var seen = { cal: false, protein: false, carbs: false, fat: false };
        for (var i = 0; i < slots.length; i++) {
            var m = slots[i] && slots[i].macros_snapshot;
            if (!m) continue;
            for (var j = 0; j < keys.length; j++) {
                var k = keys[j];
                var v = m[k];
                if (typeof v === 'number') {
                    totals[k] += v;
                    seen[k] = true;
                }
            }
        }
        var out = {};
        for (var k2 = 0; k2 < keys.length; k2++) {
            if (seen[keys[k2]]) out[keys[k2]] = totals[keys[k2]];
        }
        return out;
    }

    function summarizeLibrary(items) {
        var out = [];
        for (var i = 0; i < items.length; i++) {
            var parsed = parseContent(items[i].content);
            if (!parsed || parsed.kind !== 'meal') continue;
            out.push({
                id: items[i].id,
                name: parsed.name || '',
                default_meal_type: parsed.default_meal_type || 'dinner'
            });
        }
        out.sort(function(a, b) {
            var an = a.name.toLowerCase();
            var bn = b.name.toLowerCase();
            if (an < bn) return -1;
            if (an > bn) return 1;
            return 0;
        });
        return out;
    }

    function filterSlotsByType(slots, type) {
        if (type === 'all') return slots;
        return slots.filter(function(s) { return s.meal_type === type; });
    }

    var MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'];
    var MACRO_KEYS = ['cal', 'protein', 'carbs', 'fat'];

    function makeLibraryMeal(input) {
        input = input || {};
        var name = typeof input.name === 'string' ? input.name.trim() : '';
        if (!name) throw new Error('name is required');

        var mealType = input.default_meal_type || 'dinner';
        if (MEAL_TYPES.indexOf(mealType) === -1) {
            throw new Error('invalid meal type "' + mealType + '" (expected one of ' + MEAL_TYPES.join(', ') + ')');
        }

        var rawMacros = input.macros || {};
        var macros = {};
        for (var i = 0; i < MACRO_KEYS.length; i++) {
            var key = MACRO_KEYS[i];
            var num = Number(rawMacros[key]);
            if (rawMacros[key] !== null && rawMacros[key] !== undefined && rawMacros[key] !== '' && !isNaN(num)) {
                macros[key] = num;
            }
        }

        return {
            kind: 'meal',
            name: name,
            recipe: typeof input.recipe === 'string' ? input.recipe : '',
            default_meal_type: mealType,
            macros: macros
        };
    }

    return {
        parseContent: parseContent,
        serialize: serialize,
        nextOrder: nextOrder,
        addSlot: addSlot,
        moveSlot: moveSlot,
        removeSlot: removeSlot,
        setMealType: setMealType,
        summarizeMacros: summarizeMacros,
        summarizeLibrary: summarizeLibrary,
        filterSlotsByType: filterSlotsByType,
        makeLibraryMeal: makeLibraryMeal
    };
})();

if (typeof window !== 'undefined') window.MealsCore = MealsCore;
if (typeof module !== 'undefined' && module.exports) module.exports = MealsCore;

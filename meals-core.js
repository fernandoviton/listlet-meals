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

    function nextOrder(slots, day) {
        var max = -1;
        for (var i = 0; i < slots.length; i++) {
            if (slots[i].day === day && typeof slots[i].order === 'number' && slots[i].order > max) {
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
        var slot = {
            kind: 'slot',
            library_id: libraryMeal.id,
            day: day,
            meal_type: meal.default_meal_type || 'dinner',
            order: nextOrder(existingSlots, day),
            name_snapshot: meal.name || '',
            macros_snapshot: meal.macros || {}
        };
        return { newSlotContent: serialize(slot) };
    }

    function moveSlot(slots, id, toDay, toIndex) {
        var copy = slots.map(function(s) {
            return Object.assign({}, s);
        });
        var moving = null;
        for (var i = 0; i < copy.length; i++) {
            if (copy[i].id === id) { moving = copy[i]; break; }
        }
        if (!moving) return copy;

        var fromDay = moving.day;
        var targetDay = copy
            .filter(function(s) { return s.day === toDay && s.id !== id; })
            .sort(function(a, b) { return a.order - b.order; });

        moving.day = toDay;
        var clampedIndex = Math.max(0, Math.min(toIndex, targetDay.length));
        targetDay.splice(clampedIndex, 0, moving);
        targetDay.forEach(function(s, idx) { s.order = idx; });

        if (fromDay !== toDay) {
            var sourceDay = copy
                .filter(function(s) { return s.day === fromDay && s.id !== id; })
                .sort(function(a, b) { return a.order - b.order; });
            sourceDay.forEach(function(s, idx) { s.order = idx; });
        }

        return copy;
    }

    return {
        parseContent: parseContent,
        serialize: serialize,
        nextOrder: nextOrder,
        addSlot: addSlot,
        moveSlot: moveSlot
    };
})();

if (typeof window !== 'undefined') window.MealsCore = MealsCore;
if (typeof module !== 'undefined' && module.exports) module.exports = MealsCore;

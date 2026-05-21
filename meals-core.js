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

    return {
        parseContent: parseContent,
        serialize: serialize,
        nextOrder: nextOrder,
        addSlot: addSlot
    };
})();

if (typeof window !== 'undefined') window.MealsCore = MealsCore;
if (typeof module !== 'undefined' && module.exports) module.exports = MealsCore;

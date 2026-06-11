// Week-slot logic: ordering, add / move / remove / retype slots in a (day,
// meal_type) section. Pure functions, no DOM, no window access inside.
// Loaded as a <script> in the browser and require()'d by Jest tests.

var MealsSlots = (function() {
    var Content = (typeof module !== 'undefined' && module.exports)
        ? require('./content')
        : MealsContent;

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
        var meal = Content.parseContent(libraryMeal.content) || {};
        var existingSlots = [];
        for (var i = 0; i < weekItems.length; i++) {
            var parsed = Content.parseContent(weekItems[i].content);
            if (parsed && parsed.kind === 'slot') existingSlots.push(parsed);
        }
        var mealType = meal.default_meal_type || 'dinner';
        var slot = {
            kind: 'slot',
            library_id: libraryMeal.id,
            day: day,
            meal_type: mealType,
            order: nextOrder(existingSlots, day, mealType)
        };
        return { newSlotContent: Content.serialize(slot) };
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

    function filterSlotsByType(slots, type) {
        if (type === 'all') return slots;
        return slots.filter(function(s) { return s.meal_type === type; });
    }

    // Strip the legacy snapshot fields from a parsed slot, keeping only the
    // live-join shape. Pure; safe to call on already-clean slots (idempotent).
    function cleanSlot(slot) {
        return {
            kind: 'slot',
            library_id: slot.library_id,
            day: slot.day,
            meal_type: slot.meal_type,
            order: slot.order
        };
    }

    return {
        nextOrder: nextOrder,
        addSlot: addSlot,
        moveSlot: moveSlot,
        removeSlot: removeSlot,
        setMealType: setMealType,
        filterSlotsByType: filterSlotsByType,
        cleanSlot: cleanSlot
    };
})();

if (typeof window !== 'undefined') window.MealsSlots = MealsSlots;
if (typeof module !== 'undefined' && module.exports) module.exports = MealsSlots;

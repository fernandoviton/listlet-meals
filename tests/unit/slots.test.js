const MealsSlots = require('../../core/slots');

describe('MealsSlots', () => {
    describe('nextOrder', () => {
        test('returns 0 for empty slot list', () => {
            expect(MealsSlots.nextOrder([], 'sat', 'breakfast')).toBe(0);
        });

        test('returns max order + 1 for the given (day, meal_type)', () => {
            const slots = [
                { day: 'mon', meal_type: 'lunch', order: 0 },
                { day: 'mon', meal_type: 'lunch', order: 1 },
                { day: 'mon', meal_type: 'lunch', order: 2 }
            ];
            expect(MealsSlots.nextOrder(slots, 'mon', 'lunch')).toBe(3);
        });

        test('ignores slots from other days or other meal types', () => {
            const slots = [
                { day: 'sat', meal_type: 'lunch', order: 5 },
                { day: 'mon', meal_type: 'breakfast', order: 7 },
                { day: 'mon', meal_type: 'lunch', order: 0 }
            ];
            expect(MealsSlots.nextOrder(slots, 'mon', 'lunch')).toBe(1);
            expect(MealsSlots.nextOrder(slots, 'mon', 'dinner')).toBe(0);
            expect(MealsSlots.nextOrder(slots, 'tue', 'lunch')).toBe(0);
        });
    });

    describe('cleanSlot', () => {
        test('strips name_snapshot / macros_snapshot and leaves the rest intact', () => {
            const slot = {
                kind: 'slot', library_id: 'lib-1', day: 'mon', meal_type: 'lunch', order: 0,
                name_snapshot: 'Salad', macros_snapshot: { cal: 400 }
            };
            expect(MealsSlots.cleanSlot(slot)).toEqual({
                kind: 'slot', library_id: 'lib-1', day: 'mon', meal_type: 'lunch', order: 0
            });
        });

        test('is a no-op on an already-clean slot (idempotent)', () => {
            const slot = { kind: 'slot', library_id: 'lib-1', day: 'mon', meal_type: 'lunch', order: 0 };
            expect(MealsSlots.cleanSlot(slot)).toEqual(slot);
        });

        test('does not mutate the input', () => {
            const slot = {
                kind: 'slot', library_id: 'x', day: 'mon', meal_type: 'lunch', order: 0, name_snapshot: 'Y'
            };
            const copy = JSON.parse(JSON.stringify(slot));
            MealsSlots.cleanSlot(slot);
            expect(slot).toEqual(copy);
        });
    });

    describe('filterSlotsByType', () => {
        const slots = [
            { meal_type: 'breakfast', id: 'a' },
            { meal_type: 'lunch', id: 'b' },
            { meal_type: 'dinner', id: 'c' },
            { meal_type: 'snack', id: 'd' }
        ];

        test('"all" returns identity', () => {
            expect(MealsSlots.filterSlotsByType(slots, 'all')).toEqual(slots);
        });

        test('specific type returns only matching slots', () => {
            expect(MealsSlots.filterSlotsByType(slots, 'lunch')).toEqual([
                { meal_type: 'lunch', id: 'b' }
            ]);
        });
    });

    describe('moveSlot', () => {
        function s(id, day, mealType, order) {
            return { id: id, day: day, meal_type: mealType, order: order };
        }

        function bySorted(slots, day, mealType) {
            return slots
                .filter(x => x.day === day && x.meal_type === mealType)
                .sort((a, b) => a.order - b.order)
                .map(x => x.id);
        }

        test('moving within the same (day, meal_type) reorders only that section', () => {
            const slots = [
                s('a', 'mon', 'lunch', 0), s('b', 'mon', 'lunch', 1), s('c', 'mon', 'lunch', 2),
                s('x', 'tue', 'lunch', 0), s('y', 'tue', 'lunch', 1)
            ];
            const moved = MealsSlots.moveSlot(slots, 'c', 'mon', 'lunch', 0);
            expect(bySorted(moved, 'mon', 'lunch')).toEqual(['c', 'a', 'b']);
            expect(bySorted(moved, 'tue', 'lunch')).toEqual(['x', 'y']);
        });

        test('moving across days renumbers source and inserts at target index', () => {
            const slots = [
                s('a', 'mon', 'lunch', 0), s('b', 'mon', 'lunch', 1), s('c', 'mon', 'lunch', 2),
                s('x', 'tue', 'lunch', 0), s('y', 'tue', 'lunch', 1)
            ];
            const moved = MealsSlots.moveSlot(slots, 'b', 'tue', 'lunch', 1);
            expect(bySorted(moved, 'mon', 'lunch')).toEqual(['a', 'c']);
            expect(bySorted(moved, 'tue', 'lunch')).toEqual(['x', 'b', 'y']);
        });

        test('moving to a different meal_type within the same day updates meal_type and reorders both sections', () => {
            const slots = [
                s('a', 'mon', 'breakfast', 0), s('b', 'mon', 'breakfast', 1),
                s('c', 'mon', 'lunch', 0), s('d', 'mon', 'lunch', 1)
            ];
            const moved = MealsSlots.moveSlot(slots, 'a', 'mon', 'lunch', 1);
            expect(bySorted(moved, 'mon', 'breakfast')).toEqual(['b']);
            expect(bySorted(moved, 'mon', 'lunch')).toEqual(['c', 'a', 'd']);
            expect(moved.find(x => x.id === 'a').meal_type).toBe('lunch');
        });

        test('moving across both day and meal_type updates both fields and reorders sections', () => {
            const slots = [
                s('a', 'mon', 'breakfast', 0),
                s('x', 'tue', 'dinner', 0), s('y', 'tue', 'dinner', 1)
            ];
            const moved = MealsSlots.moveSlot(slots, 'a', 'tue', 'dinner', 1);
            expect(bySorted(moved, 'mon', 'breakfast')).toEqual([]);
            expect(bySorted(moved, 'tue', 'dinner')).toEqual(['x', 'a', 'y']);
            const a = moved.find(x => x.id === 'a');
            expect(a.day).toBe('tue');
            expect(a.meal_type).toBe('dinner');
        });

        test('is pure (does not mutate input)', () => {
            const slots = [s('a', 'mon', 'lunch', 0), s('b', 'mon', 'lunch', 1)];
            const copy = JSON.parse(JSON.stringify(slots));
            MealsSlots.moveSlot(slots, 'b', 'mon', 'lunch', 0);
            expect(slots).toEqual(copy);
        });
    });

    describe('addSlot', () => {
        test('builds slot content from a library meal and day', () => {
            const libraryMeal = {
                id: 'lib-1',
                content: JSON.stringify({
                    kind: 'meal',
                    name: 'Oatmeal',
                    recipe: 'Cook oats.',
                    default_meal_type: 'breakfast',
                    macros: { cal: 300, protein: 10, carbs: 50, fat: 5 }
                })
            };
            const result = MealsSlots.addSlot([], libraryMeal, 'wed');
            const parsed = JSON.parse(result.newSlotContent);
            expect(parsed.kind).toBe('slot');
            expect(parsed.library_id).toBe('lib-1');
            expect(parsed.day).toBe('wed');
            expect(parsed.meal_type).toBe('breakfast');
            expect(parsed.order).toBe(0);
            // Snapshots are gone — the week now joins live to the library by library_id.
            expect(parsed.name_snapshot).toBeUndefined();
            expect(parsed.macros_snapshot).toBeUndefined();
        });

        test('order continues from existing same-(day, meal_type) slots only', () => {
            const weekItems = [
                { id: 'a', content: JSON.stringify({ kind: 'slot', day: 'wed', meal_type: 'lunch', order: 0 }) },
                { id: 'b', content: JSON.stringify({ kind: 'slot', day: 'wed', meal_type: 'lunch', order: 1 }) },
                { id: 'c', content: JSON.stringify({ kind: 'slot', day: 'wed', meal_type: 'dinner', order: 0 }) },
                { id: 'd', content: JSON.stringify({ kind: 'slot', day: 'thu', meal_type: 'lunch', order: 0 }) }
            ];
            const libraryMeal = {
                id: 'lib-1',
                content: JSON.stringify({ kind: 'meal', name: 'X', recipe: '', default_meal_type: 'lunch', macros: {} })
            };
            const result = MealsSlots.addSlot(weekItems, libraryMeal, 'wed');
            const parsed = JSON.parse(result.newSlotContent);
            expect(parsed.meal_type).toBe('lunch');
            expect(parsed.order).toBe(2);
        });
    });

    describe('removeSlot', () => {
        function s(id, day, mealType, order) {
            return { id: id, day: day, meal_type: mealType, order: order };
        }

        test('removes the slot from the list', () => {
            const slots = [s('a', 'mon', 'lunch', 0), s('b', 'mon', 'lunch', 1)];
            const out = MealsSlots.removeSlot(slots, 'a');
            expect(out.map(x => x.id)).toEqual(['b']);
        });

        test('compacts order within the source (day, meal_type)', () => {
            const slots = [
                s('a', 'mon', 'lunch', 0), s('b', 'mon', 'lunch', 1), s('c', 'mon', 'lunch', 2)
            ];
            const out = MealsSlots.removeSlot(slots, 'b');
            const remaining = out.filter(x => x.day === 'mon' && x.meal_type === 'lunch')
                .sort((a, b) => a.order - b.order);
            expect(remaining.map(x => x.id)).toEqual(['a', 'c']);
            expect(remaining.map(x => x.order)).toEqual([0, 1]);
        });

        test('leaves other sections alone', () => {
            const slots = [
                s('a', 'mon', 'lunch', 0), s('b', 'mon', 'lunch', 1),
                s('p', 'mon', 'dinner', 0), s('q', 'mon', 'dinner', 1),
                s('x', 'tue', 'lunch', 0), s('y', 'tue', 'lunch', 1)
            ];
            const out = MealsSlots.removeSlot(slots, 'a');
            const dinner = out.filter(x => x.day === 'mon' && x.meal_type === 'dinner')
                .sort((a, b) => a.order - b.order);
            expect(dinner.map(x => x.order)).toEqual([0, 1]);
            const tue = out.filter(x => x.day === 'tue' && x.meal_type === 'lunch')
                .sort((a, b) => a.order - b.order);
            expect(tue.map(x => x.id)).toEqual(['x', 'y']);
            expect(tue.map(x => x.order)).toEqual([0, 1]);
        });

        test('unknown id returns an equivalent copy', () => {
            const slots = [s('a', 'mon', 'lunch', 0)];
            const out = MealsSlots.removeSlot(slots, 'missing');
            expect(out).toEqual(slots);
            expect(out).not.toBe(slots);
        });

        test('is pure (does not mutate input)', () => {
            const slots = [s('a', 'mon', 'lunch', 0), s('b', 'mon', 'lunch', 1)];
            const copy = JSON.parse(JSON.stringify(slots));
            MealsSlots.removeSlot(slots, 'a');
            expect(slots).toEqual(copy);
        });
    });

    describe('setMealType', () => {
        function s(id, day, order, mealType) {
            return { id: id, day: day, order: order, meal_type: mealType };
        }

        test('updates meal_type of the targeted slot only', () => {
            const slots = [s('a', 'mon', 0, 'breakfast'), s('b', 'mon', 1, 'lunch')];
            const out = MealsSlots.setMealType(slots, 'b', 'snack');
            expect(out.find(x => x.id === 'a').meal_type).toBe('breakfast');
            expect(out.find(x => x.id === 'b').meal_type).toBe('snack');
        });

        test('is pure (does not mutate input)', () => {
            const slots = [s('a', 'mon', 0, 'lunch')];
            const copy = JSON.parse(JSON.stringify(slots));
            MealsSlots.setMealType(slots, 'a', 'dinner');
            expect(slots).toEqual(copy);
        });

        test('unknown id returns an equivalent copy', () => {
            const slots = [s('a', 'mon', 0, 'lunch')];
            const out = MealsSlots.setMealType(slots, 'missing', 'snack');
            expect(out).toEqual(slots);
            expect(out).not.toBe(slots);
        });
    });
});

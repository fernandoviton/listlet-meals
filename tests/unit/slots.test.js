const MealsSlots = require('../../core/slots');

describe('MealsSlots', () => {
    describe('nextOrder', () => {
        test('returns 0 for empty slot list', () => {
            expect(MealsSlots.nextOrder([], '2026-06-06', 'breakfast')).toBe(0);
        });

        test('returns max order + 1 for the given (date, meal_type)', () => {
            const slots = [
                { date: '2026-06-08', meal_type: 'lunch', order: 0 },
                { date: '2026-06-08', meal_type: 'lunch', order: 1 },
                { date: '2026-06-08', meal_type: 'lunch', order: 2 }
            ];
            expect(MealsSlots.nextOrder(slots, '2026-06-08', 'lunch')).toBe(3);
        });

        test('ignores slots from other dates or other meal types', () => {
            const slots = [
                { date: '2026-06-06', meal_type: 'lunch', order: 5 },
                { date: '2026-06-08', meal_type: 'breakfast', order: 7 },
                { date: '2026-06-08', meal_type: 'lunch', order: 0 }
            ];
            expect(MealsSlots.nextOrder(slots, '2026-06-08', 'lunch')).toBe(1);
            expect(MealsSlots.nextOrder(slots, '2026-06-08', 'dinner')).toBe(0);
            expect(MealsSlots.nextOrder(slots, '2026-06-09', 'lunch')).toBe(0);
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
        function s(id, date, mealType, order) {
            return { id: id, date: date, meal_type: mealType, order: order };
        }

        function bySorted(slots, date, mealType) {
            return slots
                .filter(x => x.date === date && x.meal_type === mealType)
                .sort((a, b) => a.order - b.order)
                .map(x => x.id);
        }

        const MON = '2026-06-08';
        const TUE = '2026-06-09';

        test('moving within the same (date, meal_type) reorders only that section', () => {
            const slots = [
                s('a', MON, 'lunch', 0), s('b', MON, 'lunch', 1), s('c', MON, 'lunch', 2),
                s('x', TUE, 'lunch', 0), s('y', TUE, 'lunch', 1)
            ];
            const moved = MealsSlots.moveSlot(slots, 'c', MON, 'lunch', 0);
            expect(bySorted(moved, MON, 'lunch')).toEqual(['c', 'a', 'b']);
            expect(bySorted(moved, TUE, 'lunch')).toEqual(['x', 'y']);
        });

        test('moving across dates renumbers source and inserts at target index', () => {
            const slots = [
                s('a', MON, 'lunch', 0), s('b', MON, 'lunch', 1), s('c', MON, 'lunch', 2),
                s('x', TUE, 'lunch', 0), s('y', TUE, 'lunch', 1)
            ];
            const moved = MealsSlots.moveSlot(slots, 'b', TUE, 'lunch', 1);
            expect(bySorted(moved, MON, 'lunch')).toEqual(['a', 'c']);
            expect(bySorted(moved, TUE, 'lunch')).toEqual(['x', 'b', 'y']);
        });

        test('moving to a different meal_type within the same date updates meal_type and reorders both sections', () => {
            const slots = [
                s('a', MON, 'breakfast', 0), s('b', MON, 'breakfast', 1),
                s('c', MON, 'lunch', 0), s('d', MON, 'lunch', 1)
            ];
            const moved = MealsSlots.moveSlot(slots, 'a', MON, 'lunch', 1);
            expect(bySorted(moved, MON, 'breakfast')).toEqual(['b']);
            expect(bySorted(moved, MON, 'lunch')).toEqual(['c', 'a', 'd']);
            expect(moved.find(x => x.id === 'a').meal_type).toBe('lunch');
        });

        test('moving across both date and meal_type updates both fields and reorders sections', () => {
            const slots = [
                s('a', MON, 'breakfast', 0),
                s('x', TUE, 'dinner', 0), s('y', TUE, 'dinner', 1)
            ];
            const moved = MealsSlots.moveSlot(slots, 'a', TUE, 'dinner', 1);
            expect(bySorted(moved, MON, 'breakfast')).toEqual([]);
            expect(bySorted(moved, TUE, 'dinner')).toEqual(['x', 'a', 'y']);
            const a = moved.find(x => x.id === 'a');
            expect(a.date).toBe(TUE);
            expect(a.meal_type).toBe('dinner');
        });

        test('is pure (does not mutate input)', () => {
            const slots = [s('a', MON, 'lunch', 0), s('b', MON, 'lunch', 1)];
            const copy = JSON.parse(JSON.stringify(slots));
            MealsSlots.moveSlot(slots, 'b', MON, 'lunch', 0);
            expect(slots).toEqual(copy);
        });
    });

    describe('addSlot', () => {
        test('builds slot content from a library meal and date', () => {
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
            const result = MealsSlots.addSlot([], libraryMeal, '2026-06-10');
            const parsed = JSON.parse(result.newSlotContent);
            expect(parsed.kind).toBe('slot');
            expect(parsed.library_id).toBe('lib-1');
            expect(parsed.date).toBe('2026-06-10');
            expect(parsed.day).toBeUndefined();
            expect(parsed.meal_type).toBe('breakfast');
            expect(parsed.order).toBe(0);
            // Snapshots are gone — the week joins live to the library by library_id.
            expect(parsed.name_snapshot).toBeUndefined();
            expect(parsed.macros_snapshot).toBeUndefined();
        });

        test('order continues from existing same-(date, meal_type) slots only', () => {
            const weekItems = [
                { id: 'a', content: JSON.stringify({ kind: 'slot', date: '2026-06-10', meal_type: 'lunch', order: 0 }) },
                { id: 'b', content: JSON.stringify({ kind: 'slot', date: '2026-06-10', meal_type: 'lunch', order: 1 }) },
                { id: 'c', content: JSON.stringify({ kind: 'slot', date: '2026-06-10', meal_type: 'dinner', order: 0 }) },
                { id: 'd', content: JSON.stringify({ kind: 'slot', date: '2026-06-11', meal_type: 'lunch', order: 0 }) }
            ];
            const libraryMeal = {
                id: 'lib-1',
                content: JSON.stringify({ kind: 'meal', name: 'X', recipe: '', default_meal_type: 'lunch', macros: {} })
            };
            const result = MealsSlots.addSlot(weekItems, libraryMeal, '2026-06-10');
            const parsed = JSON.parse(result.newSlotContent);
            expect(parsed.meal_type).toBe('lunch');
            expect(parsed.order).toBe(2);
        });
    });

    describe('removeSlot', () => {
        function s(id, date, mealType, order) {
            return { id: id, date: date, meal_type: mealType, order: order };
        }
        const MON = '2026-06-08';
        const TUE = '2026-06-09';

        test('removes the slot from the list', () => {
            const slots = [s('a', MON, 'lunch', 0), s('b', MON, 'lunch', 1)];
            const out = MealsSlots.removeSlot(slots, 'a');
            expect(out.map(x => x.id)).toEqual(['b']);
        });

        test('compacts order within the source (date, meal_type)', () => {
            const slots = [
                s('a', MON, 'lunch', 0), s('b', MON, 'lunch', 1), s('c', MON, 'lunch', 2)
            ];
            const out = MealsSlots.removeSlot(slots, 'b');
            const remaining = out.filter(x => x.date === MON && x.meal_type === 'lunch')
                .sort((a, b) => a.order - b.order);
            expect(remaining.map(x => x.id)).toEqual(['a', 'c']);
            expect(remaining.map(x => x.order)).toEqual([0, 1]);
        });

        test('leaves other sections alone', () => {
            const slots = [
                s('a', MON, 'lunch', 0), s('b', MON, 'lunch', 1),
                s('p', MON, 'dinner', 0), s('q', MON, 'dinner', 1),
                s('x', TUE, 'lunch', 0), s('y', TUE, 'lunch', 1)
            ];
            const out = MealsSlots.removeSlot(slots, 'a');
            const dinner = out.filter(x => x.date === MON && x.meal_type === 'dinner')
                .sort((a, b) => a.order - b.order);
            expect(dinner.map(x => x.order)).toEqual([0, 1]);
            const tue = out.filter(x => x.date === TUE && x.meal_type === 'lunch')
                .sort((a, b) => a.order - b.order);
            expect(tue.map(x => x.id)).toEqual(['x', 'y']);
            expect(tue.map(x => x.order)).toEqual([0, 1]);
        });

        test('unknown id returns an equivalent copy', () => {
            const slots = [s('a', MON, 'lunch', 0)];
            const out = MealsSlots.removeSlot(slots, 'missing');
            expect(out).toEqual(slots);
            expect(out).not.toBe(slots);
        });

        test('is pure (does not mutate input)', () => {
            const slots = [s('a', MON, 'lunch', 0), s('b', MON, 'lunch', 1)];
            const copy = JSON.parse(JSON.stringify(slots));
            MealsSlots.removeSlot(slots, 'a');
            expect(slots).toEqual(copy);
        });
    });

    describe('setMealType', () => {
        function s(id, date, order, mealType) {
            return { id: id, date: date, order: order, meal_type: mealType };
        }
        const MON = '2026-06-08';

        test('updates meal_type of the targeted slot only', () => {
            const slots = [s('a', MON, 0, 'breakfast'), s('b', MON, 1, 'lunch')];
            const out = MealsSlots.setMealType(slots, 'b', 'snack');
            expect(out.find(x => x.id === 'a').meal_type).toBe('breakfast');
            expect(out.find(x => x.id === 'b').meal_type).toBe('snack');
        });

        test('is pure (does not mutate input)', () => {
            const slots = [s('a', MON, 0, 'lunch')];
            const copy = JSON.parse(JSON.stringify(slots));
            MealsSlots.setMealType(slots, 'a', 'dinner');
            expect(slots).toEqual(copy);
        });

        test('unknown id returns an equivalent copy', () => {
            const slots = [s('a', MON, 0, 'lunch')];
            const out = MealsSlots.setMealType(slots, 'missing', 'snack');
            expect(out).toEqual(slots);
            expect(out).not.toBe(slots);
        });
    });
});

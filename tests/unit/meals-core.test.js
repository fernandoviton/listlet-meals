const MealsCore = require('../../meals-core');

describe('meals-core', () => {
    describe('nextOrder', () => {
        test('returns 0 for empty slot list', () => {
            expect(MealsCore.nextOrder([], 'sat')).toBe(0);
        });

        test('returns max order + 1 for the given day', () => {
            const slots = [
                { day: 'mon', order: 0 },
                { day: 'mon', order: 1 },
                { day: 'mon', order: 2 }
            ];
            expect(MealsCore.nextOrder(slots, 'mon')).toBe(3);
        });

        test('ignores slots from other days', () => {
            const slots = [
                { day: 'sat', order: 5 },
                { day: 'sun', order: 7 },
                { day: 'mon', order: 0 }
            ];
            expect(MealsCore.nextOrder(slots, 'mon')).toBe(1);
            expect(MealsCore.nextOrder(slots, 'tue')).toBe(0);
        });
    });

    describe('moveSlot', () => {
        function s(id, day, order, extra) {
            return Object.assign({ id: id, day: day, order: order }, extra || {});
        }

        function bySorted(slots, day) {
            return slots.filter(x => x.day === day).sort((a, b) => a.order - b.order).map(x => x.id);
        }

        test('moving within a day reorders and leaves other days alone', () => {
            const slots = [
                s('a', 'mon', 0), s('b', 'mon', 1), s('c', 'mon', 2),
                s('x', 'tue', 0), s('y', 'tue', 1)
            ];
            const moved = MealsCore.moveSlot(slots, 'c', 'mon', 0);
            expect(bySorted(moved, 'mon')).toEqual(['c', 'a', 'b']);
            expect(bySorted(moved, 'tue')).toEqual(['x', 'y']);
        });

        test('moving across days renumbers source and inserts at target index', () => {
            const slots = [
                s('a', 'mon', 0), s('b', 'mon', 1), s('c', 'mon', 2),
                s('x', 'tue', 0), s('y', 'tue', 1)
            ];
            const moved = MealsCore.moveSlot(slots, 'b', 'tue', 1);
            expect(bySorted(moved, 'mon')).toEqual(['a', 'c']);
            expect(bySorted(moved, 'tue')).toEqual(['x', 'b', 'y']);
            for (const day of ['mon', 'tue']) {
                const orders = moved.filter(x => x.day === day).map(x => x.order).sort();
                expect(orders).toEqual(orders.map((_, i) => i));
            }
        });

        test('is pure (does not mutate input)', () => {
            const slots = [s('a', 'mon', 0), s('b', 'mon', 1)];
            const copy = JSON.parse(JSON.stringify(slots));
            MealsCore.moveSlot(slots, 'b', 'mon', 0);
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
            const result = MealsCore.addSlot([], libraryMeal, 'wed');
            const parsed = JSON.parse(result.newSlotContent);
            expect(parsed.kind).toBe('slot');
            expect(parsed.library_id).toBe('lib-1');
            expect(parsed.day).toBe('wed');
            expect(parsed.meal_type).toBe('breakfast');
            expect(parsed.order).toBe(0);
            expect(parsed.name_snapshot).toBe('Oatmeal');
            expect(parsed.macros_snapshot).toEqual({ cal: 300, protein: 10, carbs: 50, fat: 5 });
        });

        test('order continues from existing same-day slots', () => {
            const weekItems = [
                { id: 'a', content: JSON.stringify({ kind: 'slot', day: 'wed', order: 0 }) },
                { id: 'b', content: JSON.stringify({ kind: 'slot', day: 'wed', order: 1 }) },
                { id: 'c', content: JSON.stringify({ kind: 'slot', day: 'thu', order: 0 }) }
            ];
            const libraryMeal = {
                id: 'lib-1',
                content: JSON.stringify({ kind: 'meal', name: 'X', recipe: '', default_meal_type: 'lunch', macros: {} })
            };
            const result = MealsCore.addSlot(weekItems, libraryMeal, 'wed');
            const parsed = JSON.parse(result.newSlotContent);
            expect(parsed.order).toBe(2);
        });
    });

    describe('parseContent / serialize', () => {
        test('round-trip a library meal', () => {
            const meal = {
                kind: 'meal',
                name: 'Oatmeal',
                recipe: 'Cook oats.',
                default_meal_type: 'breakfast',
                macros: { cal: 300, protein: 10, carbs: 50, fat: 5 }
            };
            const s = MealsCore.serialize(meal);
            expect(typeof s).toBe('string');
            expect(MealsCore.parseContent(s)).toEqual(meal);
        });

        test('round-trip a week slot', () => {
            const slot = {
                kind: 'slot',
                library_id: 'lib-1',
                day: 'mon',
                meal_type: 'lunch',
                order: 0,
                name_snapshot: 'Salad',
                macros_snapshot: { cal: 400, protein: null, carbs: null, fat: null }
            };
            expect(MealsCore.parseContent(MealsCore.serialize(slot))).toEqual(slot);
        });

        test('parseContent returns null for invalid JSON', () => {
            expect(MealsCore.parseContent('not json')).toBeNull();
            expect(MealsCore.parseContent('')).toBeNull();
            expect(MealsCore.parseContent(null)).toBeNull();
            expect(MealsCore.parseContent(undefined)).toBeNull();
        });
    });
});

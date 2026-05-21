const MealsCore = require('../../meals-core');

describe('meals-core', () => {
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

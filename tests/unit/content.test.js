const MealsContent = require('../../core/content');

describe('MealsContent.parseContent / serialize', () => {
    test('round-trip a library meal', () => {
        const meal = {
            kind: 'meal',
            name: 'Oatmeal',
            recipe: { ingredients: [{ qty: 50, unit: 'g', item: 'oats' }], steps: ['Cook oats.'] },
            default_meal_type: 'breakfast',
            macros: { cal: 300, protein: 10, carbs: 50, fat: 5 }
        };
        const s = MealsContent.serialize(meal);
        expect(typeof s).toBe('string');
        expect(MealsContent.parseContent(s)).toEqual(meal);
    });

    test('round-trip a week slot', () => {
        const slot = {
            kind: 'slot',
            library_id: 'lib-1',
            date: '2026-06-08',
            meal_type: 'lunch',
            order: 0
        };
        expect(MealsContent.parseContent(MealsContent.serialize(slot))).toEqual(slot);
    });

    test('parseContent returns null for invalid JSON', () => {
        expect(MealsContent.parseContent('not json')).toBeNull();
        expect(MealsContent.parseContent('')).toBeNull();
        expect(MealsContent.parseContent(null)).toBeNull();
        expect(MealsContent.parseContent(undefined)).toBeNull();
    });
});

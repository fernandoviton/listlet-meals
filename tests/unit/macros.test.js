const MealsMacros = require('../../core/macros');

describe('MealsMacros', () => {
    describe('summarizeMacros', () => {
        test('empty list returns empty object', () => {
            expect(MealsMacros.summarizeMacros([], {})).toEqual({});
        });

        test('sums all four macros from the live library', () => {
            const slots = [{ library_id: 'a' }, { library_id: 'b' }];
            const libraryById = {
                a: { macros: { cal: 100, protein: 10, carbs: 20, fat: 5 } },
                b: { macros: { cal: 200, protein: 15, carbs: 30, fat: 8 } }
            };
            expect(MealsMacros.summarizeMacros(slots, libraryById)).toEqual({
                cal: 300, protein: 25, carbs: 50, fat: 13
            });
        });

        test('omits keys that are null in all contributing slots', () => {
            const slots = [{ library_id: 'a' }, { library_id: 'b' }];
            const libraryById = {
                a: { macros: { cal: 100, protein: null, carbs: 20, fat: null } },
                b: { macros: { cal: 200, protein: null, carbs: 30, fat: null } }
            };
            expect(MealsMacros.summarizeMacros(slots, libraryById)).toEqual({ cal: 300, carbs: 50 });
        });

        test('a slot whose library_id is missing from the map contributes nothing', () => {
            const slots = [{ library_id: 'a' }, { library_id: 'gone' }];
            const libraryById = { a: { macros: { cal: 100 } } };
            expect(MealsMacros.summarizeMacros(slots, libraryById)).toEqual({ cal: 100 });
        });

        test('treats a null / missing libraryById as empty (no throw)', () => {
            expect(MealsMacros.summarizeMacros([{ library_id: 'a' }], null)).toEqual({});
            expect(MealsMacros.summarizeMacros([{ library_id: 'a' }])).toEqual({});
        });
    });

    describe('resolveSlot', () => {
        test('returns live name/macros and found:true when the library meal exists', () => {
            const libraryById = { a: { name: 'Pasta', macros: { cal: 500 } } };
            expect(MealsMacros.resolveSlot({ library_id: 'a' }, libraryById)).toEqual({
                name: 'Pasta', macros: { cal: 500 }, found: true
            });
        });

        test('returns the (deleted meal) fallback with found:false when not found', () => {
            expect(MealsMacros.resolveSlot({ library_id: 'gone' }, {})).toEqual({
                name: '(deleted meal)', macros: {}, found: false
            });
        });

        test('treats a null / missing libraryById as empty (no throw)', () => {
            expect(MealsMacros.resolveSlot({ library_id: 'a' }, null).found).toBe(false);
            expect(MealsMacros.resolveSlot({ library_id: 'a' }).found).toBe(false);
        });
    });
});

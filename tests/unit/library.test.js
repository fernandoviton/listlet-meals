const MealsLibrary = require('../../core/library');

describe('MealsLibrary', () => {
    describe('indexLibrary', () => {
        test('maps row id → parsed meal', () => {
            const items = [
                { id: 'a', content: JSON.stringify({ kind: 'meal', name: 'Pasta', macros: { cal: 500 } }) },
                { id: 'b', content: JSON.stringify({ kind: 'meal', name: 'Salad', macros: { cal: 200 } }) }
            ];
            const map = MealsLibrary.indexLibrary(items);
            expect(map.a.name).toBe('Pasta');
            expect(map.b.macros).toEqual({ cal: 200 });
        });

        test('skips non-meal and unparseable rows', () => {
            const items = [
                { id: 'a', content: JSON.stringify({ kind: 'meal', name: 'Pasta' }) },
                { id: 'b', content: JSON.stringify({ kind: 'slot' }) },
                { id: 'c', content: 'not json' }
            ];
            expect(Object.keys(MealsLibrary.indexLibrary(items))).toEqual(['a']);
        });

        test('treats a null / missing input as empty (no throw)', () => {
            expect(MealsLibrary.indexLibrary(null)).toEqual({});
            expect(MealsLibrary.indexLibrary()).toEqual({});
        });

        test('includes ad-hoc meals so placed slots still resolve', () => {
            const items = [
                { id: 'a', content: JSON.stringify({ kind: 'meal', name: 'Pasta' }) },
                { id: 'b', content: JSON.stringify({ kind: 'meal', name: 'Leftover curry', adhoc: true }) }
            ];
            const map = MealsLibrary.indexLibrary(items);
            expect(Object.keys(map).sort()).toEqual(['a', 'b']);
            expect(map.b.adhoc).toBe(true);
        });
    });

    describe('summarizeLibrary', () => {
        test('empty input returns empty array', () => {
            expect(MealsLibrary.summarizeLibrary([])).toEqual([]);
        });

        test('filters out non-meal items and items with unparseable content', () => {
            const items = [
                { id: 'a', content: JSON.stringify({ kind: 'meal', name: 'Pasta', default_meal_type: 'dinner' }) },
                { id: 'b', content: JSON.stringify({ kind: 'slot', name_snapshot: 'X' }) },
                { id: 'c', content: 'not json' },
                { id: 'd', content: '' }
            ];
            const out = MealsLibrary.summarizeLibrary(items);
            expect(out).toEqual([
                { id: 'a', name: 'Pasta', default_meal_type: 'dinner' }
            ]);
        });

        test('sorts case-insensitively by name', () => {
            const items = [
                { id: '1', content: JSON.stringify({ kind: 'meal', name: 'banana', default_meal_type: 'snack' }) },
                { id: '2', content: JSON.stringify({ kind: 'meal', name: 'Apple', default_meal_type: 'snack' }) },
                { id: '3', content: JSON.stringify({ kind: 'meal', name: 'cherry', default_meal_type: 'snack' }) }
            ];
            const names = MealsLibrary.summarizeLibrary(items).map(m => m.name);
            expect(names).toEqual(['Apple', 'banana', 'cherry']);
        });

        test('defaults missing name to empty string and meal_type to "dinner"', () => {
            const items = [
                { id: 'x', content: JSON.stringify({ kind: 'meal' }) }
            ];
            expect(MealsLibrary.summarizeLibrary(items)).toEqual([
                { id: 'x', name: '', default_meal_type: 'dinner' }
            ]);
        });

        test('excludes ad-hoc meals', () => {
            const items = [
                { id: 'a', content: JSON.stringify({ kind: 'meal', name: 'Pasta', default_meal_type: 'dinner' }) },
                { id: 'b', content: JSON.stringify({ kind: 'meal', name: 'Leftover curry', default_meal_type: 'dinner', adhoc: true }) }
            ];
            expect(MealsLibrary.summarizeLibrary(items)).toEqual([
                { id: 'a', name: 'Pasta', default_meal_type: 'dinner' }
            ]);
        });
    });

    describe('groupLibraryByType', () => {
        const meal = (id, name, type) =>
            ({ id, content: JSON.stringify({ kind: 'meal', name, default_meal_type: type }) });

        test('empty input returns empty array', () => {
            expect(MealsLibrary.groupLibraryByType([])).toEqual([]);
        });

        test('groups by meal type in canonical order, omitting empty types', () => {
            const items = [
                meal('1', 'Steak', 'dinner'),
                meal('2', 'Toast', 'breakfast'),
                meal('3', 'Chips', 'snack')
            ];
            const out = MealsLibrary.groupLibraryByType(items);
            expect(out.map(g => g.meal_type)).toEqual(['breakfast', 'dinner', 'snack']);
            expect(out.find(g => g.meal_type === 'breakfast').meals.map(m => m.name)).toEqual(['Toast']);
        });

        test('within a group, meals stay name-sorted (case-insensitive)', () => {
            const items = [
                meal('1', 'banana', 'dinner'),
                meal('2', 'Apple', 'dinner'),
                meal('3', 'cherry', 'dinner')
            ];
            const out = MealsLibrary.groupLibraryByType(items);
            expect(out).toHaveLength(1);
            expect(out[0].meals.map(m => m.name)).toEqual(['Apple', 'banana', 'cherry']);
        });

        test('filter restricts to a single type', () => {
            const items = [
                meal('1', 'Toast', 'breakfast'),
                meal('2', 'Steak', 'dinner'),
                meal('3', 'Salad', 'lunch')
            ];
            const out = MealsLibrary.groupLibraryByType(items, 'dinner');
            expect(out).toEqual([
                { meal_type: 'dinner', meals: [{ id: '2', name: 'Steak', default_meal_type: 'dinner' }] }
            ]);
        });

        test("filter 'all' and undefined both return all non-empty groups", () => {
            const items = [meal('1', 'Toast', 'breakfast'), meal('2', 'Steak', 'dinner')];
            const all = MealsLibrary.groupLibraryByType(items, 'all');
            const undef = MealsLibrary.groupLibraryByType(items);
            expect(all.map(g => g.meal_type)).toEqual(['breakfast', 'dinner']);
            expect(undef).toEqual(all);
        });

        test('filter for a type with no meals returns empty array', () => {
            const items = [meal('1', 'Toast', 'breakfast')];
            expect(MealsLibrary.groupLibraryByType(items, 'snack')).toEqual([]);
        });

        test('excludes non-meal and unparseable items', () => {
            const items = [
                meal('1', 'Toast', 'breakfast'),
                { id: '2', content: JSON.stringify({ kind: 'slot', name_snapshot: 'X' }) },
                { id: '3', content: 'not json' }
            ];
            const out = MealsLibrary.groupLibraryByType(items);
            expect(out).toEqual([
                { meal_type: 'breakfast', meals: [{ id: '1', name: 'Toast', default_meal_type: 'breakfast' }] }
            ]);
        });

        test('excludes ad-hoc meals (hidden from the picker until promoted)', () => {
            const items = [
                meal('1', 'Toast', 'breakfast'),
                { id: '2', content: JSON.stringify({ kind: 'meal', name: 'Leftover curry', default_meal_type: 'breakfast', adhoc: true }) }
            ];
            const out = MealsLibrary.groupLibraryByType(items);
            expect(out).toEqual([
                { meal_type: 'breakfast', meals: [{ id: '1', name: 'Toast', default_meal_type: 'breakfast' }] }
            ]);
        });
    });

    describe('makeLibraryMeal', () => {
        test('builds a full meal object with a normalized recipe', () => {
            expect(MealsLibrary.makeLibraryMeal({
                name: 'Oatmeal',
                recipe: {
                    ingredients: [{ qty: 50, unit: 'g', item: 'oats' }],
                    steps: ['Cook oats.']
                },
                default_meal_type: 'breakfast',
                macros: { cal: 320, protein: 12, carbs: 55, fat: 6 }
            })).toEqual({
                kind: 'meal',
                name: 'Oatmeal',
                recipe: {
                    ingredients: [{ qty: 50, unit: 'g', item: 'oats' }],
                    steps: ['Cook oats.']
                },
                default_meal_type: 'breakfast',
                macros: { cal: 320, protein: 12, carbs: 55, fat: 6 }
            });
        });

        test('defaults recipe to an empty structured recipe and meal_type to dinner', () => {
            expect(MealsLibrary.makeLibraryMeal({ name: 'Mystery Plate' })).toEqual({
                kind: 'meal',
                name: 'Mystery Plate',
                recipe: { ingredients: [], steps: [] },
                default_meal_type: 'dinner',
                macros: {}
            });
        });

        test('normalizes recipe: coerces qty, defaults unit/note, drops item-less rows and blank steps', () => {
            expect(MealsLibrary.makeLibraryMeal({
                name: 'X',
                recipe: {
                    ingredients: [
                        { qty: '200', unit: 'g', item: 'pasta' },
                        { qty: 2, unit: 'clove', item: 'garlic', note: 'minced' },
                        { qty: null, item: 'salt', note: 'to taste' },
                        { qty: 1, unit: 'cup', item: '   ' },
                        { unit: 'g' }
                    ],
                    steps: ['Boil water.', '', '  ', 'Drain.']
                }
            }).recipe).toEqual({
                ingredients: [
                    { qty: 200, unit: 'g', item: 'pasta' },
                    { qty: 2, unit: 'clove', item: 'garlic', note: 'minced' },
                    { qty: null, unit: null, item: 'salt', note: 'to taste' }
                ],
                steps: ['Boil water.', 'Drain.']
            });
        });

        test('a non-object recipe (e.g. legacy string) normalizes to empty', () => {
            expect(MealsLibrary.makeLibraryMeal({ name: 'X', recipe: 'Cook oats.' }).recipe)
                .toEqual({ ingredients: [], steps: [] });
        });

        test('trims the name', () => {
            expect(MealsLibrary.makeLibraryMeal({ name: '  Tacos  ' }).name).toBe('Tacos');
        });

        test('throws when name is missing or blank', () => {
            expect(() => MealsLibrary.makeLibraryMeal({})).toThrow(/name/i);
            expect(() => MealsLibrary.makeLibraryMeal({ name: '   ' })).toThrow(/name/i);
        });

        test('throws on an invalid meal_type', () => {
            expect(() => MealsLibrary.makeLibraryMeal({ name: 'X', default_meal_type: 'brunch' }))
                .toThrow(/meal type/i);
        });

        test('coerces numeric-string macros to numbers', () => {
            expect(MealsLibrary.makeLibraryMeal({
                name: 'X',
                macros: { cal: '320', protein: '12' }
            }).macros).toEqual({ cal: 320, protein: 12 });
        });

        test('drops missing, null, and non-numeric macro keys', () => {
            expect(MealsLibrary.makeLibraryMeal({
                name: 'X',
                macros: { cal: 320, protein: null, carbs: 'lots', fat: undefined }
            }).macros).toEqual({ cal: 320 });
        });

        test('ignores unknown macro keys', () => {
            expect(MealsLibrary.makeLibraryMeal({
                name: 'X',
                macros: { cal: 100, fiber: 9 }
            }).macros).toEqual({ cal: 100 });
        });

        test('carries adhoc: true through when set', () => {
            expect(MealsLibrary.makeLibraryMeal({ name: 'Leftover curry', adhoc: true })).toEqual({
                kind: 'meal',
                name: 'Leftover curry',
                recipe: { ingredients: [], steps: [] },
                default_meal_type: 'dinner',
                macros: {},
                adhoc: true
            });
        });

        test('omits the adhoc key when absent, false, or junk', () => {
            expect('adhoc' in MealsLibrary.makeLibraryMeal({ name: 'X' })).toBe(false);
            expect('adhoc' in MealsLibrary.makeLibraryMeal({ name: 'X', adhoc: false })).toBe(false);
            expect('adhoc' in MealsLibrary.makeLibraryMeal({ name: 'X', adhoc: 'yes' })).toBe(false);
        });
    });

    describe('updateLibraryMeal', () => {
        const base = {
            kind: 'meal',
            name: 'Oatmeal',
            recipe: { ingredients: [{ qty: 50, unit: 'g', item: 'oats' }], steps: ['Cook oats.'] },
            default_meal_type: 'breakfast',
            macros: { cal: 320, protein: 12, carbs: 55, fat: 6 }
        };

        test('overrides only the provided fields, leaving the rest intact', () => {
            const newRecipe = { ingredients: [{ qty: 60, unit: 'g', item: 'oats' }], steps: ['Cook oats with milk.'] };
            expect(MealsLibrary.updateLibraryMeal(base, { recipe: newRecipe })).toEqual({
                kind: 'meal',
                name: 'Oatmeal',
                recipe: { ingredients: [{ qty: 60, unit: 'g', item: 'oats' }], steps: ['Cook oats with milk.'] },
                default_meal_type: 'breakfast',
                macros: { cal: 320, protein: 12, carbs: 55, fat: 6 }
            });
        });

        test('merges macros per-key without dropping untouched ones', () => {
            expect(MealsLibrary.updateLibraryMeal(base, { macros: { cal: 400 } }).macros)
                .toEqual({ cal: 400, protein: 12, carbs: 55, fat: 6 });
        });

        test('clears a macro when passed an empty string or null', () => {
            expect(MealsLibrary.updateLibraryMeal(base, { macros: { fat: '' } }).macros)
                .toEqual({ cal: 320, protein: 12, carbs: 55 });
        });

        test('can change name and meal type', () => {
            const out = MealsLibrary.updateLibraryMeal(base, { name: '  Steel-cut Oats  ', default_meal_type: 'snack' });
            expect(out.name).toBe('Steel-cut Oats');
            expect(out.default_meal_type).toBe('snack');
        });

        test('validates through makeLibraryMeal (bad meal type throws)', () => {
            expect(() => MealsLibrary.updateLibraryMeal(base, { default_meal_type: 'brunch' })).toThrow(/meal type/i);
        });

        test('throws when name would become blank', () => {
            expect(() => MealsLibrary.updateLibraryMeal(base, { name: '   ' })).toThrow(/name/i);
        });

        test('throws when the existing row is not a meal', () => {
            expect(() => MealsLibrary.updateLibraryMeal({ kind: 'slot' }, { recipe: 'x' })).toThrow(/meal/i);
            expect(() => MealsLibrary.updateLibraryMeal(null, { recipe: 'x' })).toThrow(/meal/i);
        });

        test('preserves the adhoc flag when changes do not mention it', () => {
            const adhocBase = { ...base, adhoc: true };
            expect(MealsLibrary.updateLibraryMeal(adhocBase, { macros: { cal: 400 } }).adhoc).toBe(true);
        });

        test('a recipe-only change does not clear the adhoc flag', () => {
            const adhocBase = { ...base, adhoc: true };
            const newRecipe = { ingredients: [{ qty: 1, unit: 'cup', item: 'rice' }], steps: ['Cook.'] };
            expect(MealsLibrary.updateLibraryMeal(adhocBase, { recipe: newRecipe }).adhoc).toBe(true);
        });

        test('adhoc: false removes the key entirely (promotion)', () => {
            const adhocBase = { ...base, adhoc: true };
            expect('adhoc' in MealsLibrary.updateLibraryMeal(adhocBase, { adhoc: false })).toBe(false);
        });

        test('adhoc: true can be set on a normal meal', () => {
            expect(MealsLibrary.updateLibraryMeal(base, { adhoc: true }).adhoc).toBe(true);
        });
    });

    describe('scaleRecipe', () => {
        const recipe = {
            ingredients: [
                { qty: 200, unit: 'g', item: 'pasta' },
                { qty: 0.5, unit: 'cup', item: 'parmesan', note: 'grated' },
                { qty: null, unit: null, item: 'salt', note: 'to taste' }
            ],
            steps: ['Boil water.', 'Cook pasta.']
        };

        test('multiplies each numeric qty by the factor; null qty stays null', () => {
            expect(MealsLibrary.scaleRecipe(recipe, 2)).toEqual({
                ingredients: [
                    { qty: 400, unit: 'g', item: 'pasta' },
                    { qty: 1, unit: 'cup', item: 'parmesan', note: 'grated' },
                    { qty: null, unit: null, item: 'salt', note: 'to taste' }
                ],
                steps: ['Boil water.', 'Cook pasta.']
            });
        });

        test('factor 1 is an identity (by value)', () => {
            expect(MealsLibrary.scaleRecipe(recipe, 1)).toEqual(recipe);
        });

        test('handles a fractional factor', () => {
            expect(MealsLibrary.scaleRecipe(recipe, 0.5).ingredients[0].qty).toBe(100);
        });

        test('does not mutate the input', () => {
            const copy = JSON.parse(JSON.stringify(recipe));
            MealsLibrary.scaleRecipe(recipe, 3);
            expect(recipe).toEqual(copy);
        });

        test('tolerates a missing / null / empty recipe', () => {
            const empty = { ingredients: [], steps: [] };
            expect(MealsLibrary.scaleRecipe(undefined, 2)).toEqual(empty);
            expect(MealsLibrary.scaleRecipe(null, 2)).toEqual(empty);
            expect(MealsLibrary.scaleRecipe({}, 2)).toEqual(empty);
        });
    });
});

const MealsCore = require('../../meals-core');

describe('meals-core', () => {
    describe('nextOrder', () => {
        test('returns 0 for empty slot list', () => {
            expect(MealsCore.nextOrder([], 'sat', 'breakfast')).toBe(0);
        });

        test('returns max order + 1 for the given (day, meal_type)', () => {
            const slots = [
                { day: 'mon', meal_type: 'lunch', order: 0 },
                { day: 'mon', meal_type: 'lunch', order: 1 },
                { day: 'mon', meal_type: 'lunch', order: 2 }
            ];
            expect(MealsCore.nextOrder(slots, 'mon', 'lunch')).toBe(3);
        });

        test('ignores slots from other days or other meal types', () => {
            const slots = [
                { day: 'sat', meal_type: 'lunch', order: 5 },
                { day: 'mon', meal_type: 'breakfast', order: 7 },
                { day: 'mon', meal_type: 'lunch', order: 0 }
            ];
            expect(MealsCore.nextOrder(slots, 'mon', 'lunch')).toBe(1);
            expect(MealsCore.nextOrder(slots, 'mon', 'dinner')).toBe(0);
            expect(MealsCore.nextOrder(slots, 'tue', 'lunch')).toBe(0);
        });
    });

    describe('summarizeMacros', () => {
        test('empty list returns empty object', () => {
            expect(MealsCore.summarizeMacros([], {})).toEqual({});
        });

        test('sums all four macros from the live library', () => {
            const slots = [{ library_id: 'a' }, { library_id: 'b' }];
            const libraryById = {
                a: { macros: { cal: 100, protein: 10, carbs: 20, fat: 5 } },
                b: { macros: { cal: 200, protein: 15, carbs: 30, fat: 8 } }
            };
            expect(MealsCore.summarizeMacros(slots, libraryById)).toEqual({
                cal: 300, protein: 25, carbs: 50, fat: 13
            });
        });

        test('omits keys that are null in all contributing slots', () => {
            const slots = [{ library_id: 'a' }, { library_id: 'b' }];
            const libraryById = {
                a: { macros: { cal: 100, protein: null, carbs: 20, fat: null } },
                b: { macros: { cal: 200, protein: null, carbs: 30, fat: null } }
            };
            expect(MealsCore.summarizeMacros(slots, libraryById)).toEqual({ cal: 300, carbs: 50 });
        });

        test('a slot whose library_id is missing from the map contributes nothing', () => {
            const slots = [{ library_id: 'a' }, { library_id: 'gone' }];
            const libraryById = { a: { macros: { cal: 100 } } };
            expect(MealsCore.summarizeMacros(slots, libraryById)).toEqual({ cal: 100 });
        });

        test('treats a null / missing libraryById as empty (no throw)', () => {
            expect(MealsCore.summarizeMacros([{ library_id: 'a' }], null)).toEqual({});
            expect(MealsCore.summarizeMacros([{ library_id: 'a' }])).toEqual({});
        });
    });

    describe('indexLibrary', () => {
        test('maps row id → parsed meal', () => {
            const items = [
                { id: 'a', content: JSON.stringify({ kind: 'meal', name: 'Pasta', macros: { cal: 500 } }) },
                { id: 'b', content: JSON.stringify({ kind: 'meal', name: 'Salad', macros: { cal: 200 } }) }
            ];
            const map = MealsCore.indexLibrary(items);
            expect(map.a.name).toBe('Pasta');
            expect(map.b.macros).toEqual({ cal: 200 });
        });

        test('skips non-meal and unparseable rows', () => {
            const items = [
                { id: 'a', content: JSON.stringify({ kind: 'meal', name: 'Pasta' }) },
                { id: 'b', content: JSON.stringify({ kind: 'slot' }) },
                { id: 'c', content: 'not json' }
            ];
            expect(Object.keys(MealsCore.indexLibrary(items))).toEqual(['a']);
        });

        test('treats a null / missing input as empty (no throw)', () => {
            expect(MealsCore.indexLibrary(null)).toEqual({});
            expect(MealsCore.indexLibrary()).toEqual({});
        });

        test('includes ad-hoc meals so placed slots still resolve', () => {
            const items = [
                { id: 'a', content: JSON.stringify({ kind: 'meal', name: 'Pasta' }) },
                { id: 'b', content: JSON.stringify({ kind: 'meal', name: 'Leftover curry', adhoc: true }) }
            ];
            const map = MealsCore.indexLibrary(items);
            expect(Object.keys(map).sort()).toEqual(['a', 'b']);
            expect(map.b.adhoc).toBe(true);
        });
    });

    describe('resolveSlot', () => {
        test('returns live name/macros and found:true when the library meal exists', () => {
            const libraryById = { a: { name: 'Pasta', macros: { cal: 500 } } };
            expect(MealsCore.resolveSlot({ library_id: 'a' }, libraryById)).toEqual({
                name: 'Pasta', macros: { cal: 500 }, found: true
            });
        });

        test('returns the (deleted meal) fallback with found:false when not found', () => {
            expect(MealsCore.resolveSlot({ library_id: 'gone' }, {})).toEqual({
                name: '(deleted meal)', macros: {}, found: false
            });
        });

        test('treats a null / missing libraryById as empty (no throw)', () => {
            expect(MealsCore.resolveSlot({ library_id: 'a' }, null).found).toBe(false);
            expect(MealsCore.resolveSlot({ library_id: 'a' }).found).toBe(false);
        });
    });

    describe('cleanSlot', () => {
        test('strips name_snapshot / macros_snapshot and leaves the rest intact', () => {
            const slot = {
                kind: 'slot', library_id: 'lib-1', day: 'mon', meal_type: 'lunch', order: 0,
                name_snapshot: 'Salad', macros_snapshot: { cal: 400 }
            };
            expect(MealsCore.cleanSlot(slot)).toEqual({
                kind: 'slot', library_id: 'lib-1', day: 'mon', meal_type: 'lunch', order: 0
            });
        });

        test('is a no-op on an already-clean slot (idempotent)', () => {
            const slot = { kind: 'slot', library_id: 'lib-1', day: 'mon', meal_type: 'lunch', order: 0 };
            expect(MealsCore.cleanSlot(slot)).toEqual(slot);
        });

        test('does not mutate the input', () => {
            const slot = {
                kind: 'slot', library_id: 'x', day: 'mon', meal_type: 'lunch', order: 0, name_snapshot: 'Y'
            };
            const copy = JSON.parse(JSON.stringify(slot));
            MealsCore.cleanSlot(slot);
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
            expect(MealsCore.filterSlotsByType(slots, 'all')).toEqual(slots);
        });

        test('specific type returns only matching slots', () => {
            expect(MealsCore.filterSlotsByType(slots, 'lunch')).toEqual([
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
            const moved = MealsCore.moveSlot(slots, 'c', 'mon', 'lunch', 0);
            expect(bySorted(moved, 'mon', 'lunch')).toEqual(['c', 'a', 'b']);
            expect(bySorted(moved, 'tue', 'lunch')).toEqual(['x', 'y']);
        });

        test('moving across days renumbers source and inserts at target index', () => {
            const slots = [
                s('a', 'mon', 'lunch', 0), s('b', 'mon', 'lunch', 1), s('c', 'mon', 'lunch', 2),
                s('x', 'tue', 'lunch', 0), s('y', 'tue', 'lunch', 1)
            ];
            const moved = MealsCore.moveSlot(slots, 'b', 'tue', 'lunch', 1);
            expect(bySorted(moved, 'mon', 'lunch')).toEqual(['a', 'c']);
            expect(bySorted(moved, 'tue', 'lunch')).toEqual(['x', 'b', 'y']);
        });

        test('moving to a different meal_type within the same day updates meal_type and reorders both sections', () => {
            const slots = [
                s('a', 'mon', 'breakfast', 0), s('b', 'mon', 'breakfast', 1),
                s('c', 'mon', 'lunch', 0), s('d', 'mon', 'lunch', 1)
            ];
            const moved = MealsCore.moveSlot(slots, 'a', 'mon', 'lunch', 1);
            expect(bySorted(moved, 'mon', 'breakfast')).toEqual(['b']);
            expect(bySorted(moved, 'mon', 'lunch')).toEqual(['c', 'a', 'd']);
            expect(moved.find(x => x.id === 'a').meal_type).toBe('lunch');
        });

        test('moving across both day and meal_type updates both fields and reorders sections', () => {
            const slots = [
                s('a', 'mon', 'breakfast', 0),
                s('x', 'tue', 'dinner', 0), s('y', 'tue', 'dinner', 1)
            ];
            const moved = MealsCore.moveSlot(slots, 'a', 'tue', 'dinner', 1);
            expect(bySorted(moved, 'mon', 'breakfast')).toEqual([]);
            expect(bySorted(moved, 'tue', 'dinner')).toEqual(['x', 'a', 'y']);
            const a = moved.find(x => x.id === 'a');
            expect(a.day).toBe('tue');
            expect(a.meal_type).toBe('dinner');
        });

        test('is pure (does not mutate input)', () => {
            const slots = [s('a', 'mon', 'lunch', 0), s('b', 'mon', 'lunch', 1)];
            const copy = JSON.parse(JSON.stringify(slots));
            MealsCore.moveSlot(slots, 'b', 'mon', 'lunch', 0);
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
            const result = MealsCore.addSlot(weekItems, libraryMeal, 'wed');
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
            const out = MealsCore.removeSlot(slots, 'a');
            expect(out.map(x => x.id)).toEqual(['b']);
        });

        test('compacts order within the source (day, meal_type)', () => {
            const slots = [
                s('a', 'mon', 'lunch', 0), s('b', 'mon', 'lunch', 1), s('c', 'mon', 'lunch', 2)
            ];
            const out = MealsCore.removeSlot(slots, 'b');
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
            const out = MealsCore.removeSlot(slots, 'a');
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
            const out = MealsCore.removeSlot(slots, 'missing');
            expect(out).toEqual(slots);
            expect(out).not.toBe(slots);
        });

        test('is pure (does not mutate input)', () => {
            const slots = [s('a', 'mon', 'lunch', 0), s('b', 'mon', 'lunch', 1)];
            const copy = JSON.parse(JSON.stringify(slots));
            MealsCore.removeSlot(slots, 'a');
            expect(slots).toEqual(copy);
        });
    });

    describe('setMealType', () => {
        function s(id, day, order, mealType) {
            return { id: id, day: day, order: order, meal_type: mealType };
        }

        test('updates meal_type of the targeted slot only', () => {
            const slots = [s('a', 'mon', 0, 'breakfast'), s('b', 'mon', 1, 'lunch')];
            const out = MealsCore.setMealType(slots, 'b', 'snack');
            expect(out.find(x => x.id === 'a').meal_type).toBe('breakfast');
            expect(out.find(x => x.id === 'b').meal_type).toBe('snack');
        });

        test('is pure (does not mutate input)', () => {
            const slots = [s('a', 'mon', 0, 'lunch')];
            const copy = JSON.parse(JSON.stringify(slots));
            MealsCore.setMealType(slots, 'a', 'dinner');
            expect(slots).toEqual(copy);
        });

        test('unknown id returns an equivalent copy', () => {
            const slots = [s('a', 'mon', 0, 'lunch')];
            const out = MealsCore.setMealType(slots, 'missing', 'snack');
            expect(out).toEqual(slots);
            expect(out).not.toBe(slots);
        });
    });

    describe('summarizeLibrary', () => {
        test('empty input returns empty array', () => {
            expect(MealsCore.summarizeLibrary([])).toEqual([]);
        });

        test('filters out non-meal items and items with unparseable content', () => {
            const items = [
                { id: 'a', content: JSON.stringify({ kind: 'meal', name: 'Pasta', default_meal_type: 'dinner' }) },
                { id: 'b', content: JSON.stringify({ kind: 'slot', name_snapshot: 'X' }) },
                { id: 'c', content: 'not json' },
                { id: 'd', content: '' }
            ];
            const out = MealsCore.summarizeLibrary(items);
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
            const names = MealsCore.summarizeLibrary(items).map(m => m.name);
            expect(names).toEqual(['Apple', 'banana', 'cherry']);
        });

        test('defaults missing name to empty string and meal_type to "dinner"', () => {
            const items = [
                { id: 'x', content: JSON.stringify({ kind: 'meal' }) }
            ];
            expect(MealsCore.summarizeLibrary(items)).toEqual([
                { id: 'x', name: '', default_meal_type: 'dinner' }
            ]);
        });

        test('excludes ad-hoc meals', () => {
            const items = [
                { id: 'a', content: JSON.stringify({ kind: 'meal', name: 'Pasta', default_meal_type: 'dinner' }) },
                { id: 'b', content: JSON.stringify({ kind: 'meal', name: 'Leftover curry', default_meal_type: 'dinner', adhoc: true }) }
            ];
            expect(MealsCore.summarizeLibrary(items)).toEqual([
                { id: 'a', name: 'Pasta', default_meal_type: 'dinner' }
            ]);
        });
    });

    describe('groupLibraryByType', () => {
        const meal = (id, name, type) =>
            ({ id, content: JSON.stringify({ kind: 'meal', name, default_meal_type: type }) });

        test('empty input returns empty array', () => {
            expect(MealsCore.groupLibraryByType([])).toEqual([]);
        });

        test('groups by meal type in canonical order, omitting empty types', () => {
            const items = [
                meal('1', 'Steak', 'dinner'),
                meal('2', 'Toast', 'breakfast'),
                meal('3', 'Chips', 'snack')
            ];
            const out = MealsCore.groupLibraryByType(items);
            expect(out.map(g => g.meal_type)).toEqual(['breakfast', 'dinner', 'snack']);
            expect(out.find(g => g.meal_type === 'breakfast').meals.map(m => m.name)).toEqual(['Toast']);
        });

        test('within a group, meals stay name-sorted (case-insensitive)', () => {
            const items = [
                meal('1', 'banana', 'dinner'),
                meal('2', 'Apple', 'dinner'),
                meal('3', 'cherry', 'dinner')
            ];
            const out = MealsCore.groupLibraryByType(items);
            expect(out).toHaveLength(1);
            expect(out[0].meals.map(m => m.name)).toEqual(['Apple', 'banana', 'cherry']);
        });

        test('filter restricts to a single type', () => {
            const items = [
                meal('1', 'Toast', 'breakfast'),
                meal('2', 'Steak', 'dinner'),
                meal('3', 'Salad', 'lunch')
            ];
            const out = MealsCore.groupLibraryByType(items, 'dinner');
            expect(out).toEqual([
                { meal_type: 'dinner', meals: [{ id: '2', name: 'Steak', default_meal_type: 'dinner' }] }
            ]);
        });

        test("filter 'all' and undefined both return all non-empty groups", () => {
            const items = [meal('1', 'Toast', 'breakfast'), meal('2', 'Steak', 'dinner')];
            const all = MealsCore.groupLibraryByType(items, 'all');
            const undef = MealsCore.groupLibraryByType(items);
            expect(all.map(g => g.meal_type)).toEqual(['breakfast', 'dinner']);
            expect(undef).toEqual(all);
        });

        test('filter for a type with no meals returns empty array', () => {
            const items = [meal('1', 'Toast', 'breakfast')];
            expect(MealsCore.groupLibraryByType(items, 'snack')).toEqual([]);
        });

        test('excludes non-meal and unparseable items', () => {
            const items = [
                meal('1', 'Toast', 'breakfast'),
                { id: '2', content: JSON.stringify({ kind: 'slot', name_snapshot: 'X' }) },
                { id: '3', content: 'not json' }
            ];
            const out = MealsCore.groupLibraryByType(items);
            expect(out).toEqual([
                { meal_type: 'breakfast', meals: [{ id: '1', name: 'Toast', default_meal_type: 'breakfast' }] }
            ]);
        });

        test('excludes ad-hoc meals (hidden from the picker until promoted)', () => {
            const items = [
                meal('1', 'Toast', 'breakfast'),
                { id: '2', content: JSON.stringify({ kind: 'meal', name: 'Leftover curry', default_meal_type: 'breakfast', adhoc: true }) }
            ];
            const out = MealsCore.groupLibraryByType(items);
            expect(out).toEqual([
                { meal_type: 'breakfast', meals: [{ id: '1', name: 'Toast', default_meal_type: 'breakfast' }] }
            ]);
        });
    });

    describe('parseContent / serialize', () => {
        test('round-trip a library meal', () => {
            const meal = {
                kind: 'meal',
                name: 'Oatmeal',
                recipe: { ingredients: [{ qty: 50, unit: 'g', item: 'oats' }], steps: ['Cook oats.'] },
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
                order: 0
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

    describe('makeLibraryMeal', () => {
        test('builds a full meal object with a normalized recipe', () => {
            expect(MealsCore.makeLibraryMeal({
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
            expect(MealsCore.makeLibraryMeal({ name: 'Mystery Plate' })).toEqual({
                kind: 'meal',
                name: 'Mystery Plate',
                recipe: { ingredients: [], steps: [] },
                default_meal_type: 'dinner',
                macros: {}
            });
        });

        test('normalizes recipe: coerces qty, defaults unit/note, drops item-less rows and blank steps', () => {
            expect(MealsCore.makeLibraryMeal({
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
            expect(MealsCore.makeLibraryMeal({ name: 'X', recipe: 'Cook oats.' }).recipe)
                .toEqual({ ingredients: [], steps: [] });
        });

        test('trims the name', () => {
            expect(MealsCore.makeLibraryMeal({ name: '  Tacos  ' }).name).toBe('Tacos');
        });

        test('throws when name is missing or blank', () => {
            expect(() => MealsCore.makeLibraryMeal({})).toThrow(/name/i);
            expect(() => MealsCore.makeLibraryMeal({ name: '   ' })).toThrow(/name/i);
        });

        test('throws on an invalid meal_type', () => {
            expect(() => MealsCore.makeLibraryMeal({ name: 'X', default_meal_type: 'brunch' }))
                .toThrow(/meal type/i);
        });

        test('coerces numeric-string macros to numbers', () => {
            expect(MealsCore.makeLibraryMeal({
                name: 'X',
                macros: { cal: '320', protein: '12' }
            }).macros).toEqual({ cal: 320, protein: 12 });
        });

        test('drops missing, null, and non-numeric macro keys', () => {
            expect(MealsCore.makeLibraryMeal({
                name: 'X',
                macros: { cal: 320, protein: null, carbs: 'lots', fat: undefined }
            }).macros).toEqual({ cal: 320 });
        });

        test('ignores unknown macro keys', () => {
            expect(MealsCore.makeLibraryMeal({
                name: 'X',
                macros: { cal: 100, fiber: 9 }
            }).macros).toEqual({ cal: 100 });
        });

        test('carries adhoc: true through when set', () => {
            expect(MealsCore.makeLibraryMeal({ name: 'Leftover curry', adhoc: true })).toEqual({
                kind: 'meal',
                name: 'Leftover curry',
                recipe: { ingredients: [], steps: [] },
                default_meal_type: 'dinner',
                macros: {},
                adhoc: true
            });
        });

        test('omits the adhoc key when absent, false, or junk', () => {
            expect('adhoc' in MealsCore.makeLibraryMeal({ name: 'X' })).toBe(false);
            expect('adhoc' in MealsCore.makeLibraryMeal({ name: 'X', adhoc: false })).toBe(false);
            expect('adhoc' in MealsCore.makeLibraryMeal({ name: 'X', adhoc: 'yes' })).toBe(false);
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
            expect(MealsCore.updateLibraryMeal(base, { recipe: newRecipe })).toEqual({
                kind: 'meal',
                name: 'Oatmeal',
                recipe: { ingredients: [{ qty: 60, unit: 'g', item: 'oats' }], steps: ['Cook oats with milk.'] },
                default_meal_type: 'breakfast',
                macros: { cal: 320, protein: 12, carbs: 55, fat: 6 }
            });
        });

        test('merges macros per-key without dropping untouched ones', () => {
            expect(MealsCore.updateLibraryMeal(base, { macros: { cal: 400 } }).macros)
                .toEqual({ cal: 400, protein: 12, carbs: 55, fat: 6 });
        });

        test('clears a macro when passed an empty string or null', () => {
            expect(MealsCore.updateLibraryMeal(base, { macros: { fat: '' } }).macros)
                .toEqual({ cal: 320, protein: 12, carbs: 55 });
        });

        test('can change name and meal type', () => {
            const out = MealsCore.updateLibraryMeal(base, { name: '  Steel-cut Oats  ', default_meal_type: 'snack' });
            expect(out.name).toBe('Steel-cut Oats');
            expect(out.default_meal_type).toBe('snack');
        });

        test('validates through makeLibraryMeal (bad meal type throws)', () => {
            expect(() => MealsCore.updateLibraryMeal(base, { default_meal_type: 'brunch' })).toThrow(/meal type/i);
        });

        test('throws when name would become blank', () => {
            expect(() => MealsCore.updateLibraryMeal(base, { name: '   ' })).toThrow(/name/i);
        });

        test('throws when the existing row is not a meal', () => {
            expect(() => MealsCore.updateLibraryMeal({ kind: 'slot' }, { recipe: 'x' })).toThrow(/meal/i);
            expect(() => MealsCore.updateLibraryMeal(null, { recipe: 'x' })).toThrow(/meal/i);
        });

        test('preserves the adhoc flag when changes do not mention it', () => {
            const adhocBase = { ...base, adhoc: true };
            expect(MealsCore.updateLibraryMeal(adhocBase, { macros: { cal: 400 } }).adhoc).toBe(true);
        });

        test('a recipe-only change does not clear the adhoc flag', () => {
            const adhocBase = { ...base, adhoc: true };
            const newRecipe = { ingredients: [{ qty: 1, unit: 'cup', item: 'rice' }], steps: ['Cook.'] };
            expect(MealsCore.updateLibraryMeal(adhocBase, { recipe: newRecipe }).adhoc).toBe(true);
        });

        test('adhoc: false removes the key entirely (promotion)', () => {
            const adhocBase = { ...base, adhoc: true };
            expect('adhoc' in MealsCore.updateLibraryMeal(adhocBase, { adhoc: false })).toBe(false);
        });

        test('adhoc: true can be set on a normal meal', () => {
            expect(MealsCore.updateLibraryMeal(base, { adhoc: true }).adhoc).toBe(true);
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
            expect(MealsCore.scaleRecipe(recipe, 2)).toEqual({
                ingredients: [
                    { qty: 400, unit: 'g', item: 'pasta' },
                    { qty: 1, unit: 'cup', item: 'parmesan', note: 'grated' },
                    { qty: null, unit: null, item: 'salt', note: 'to taste' }
                ],
                steps: ['Boil water.', 'Cook pasta.']
            });
        });

        test('factor 1 is an identity (by value)', () => {
            expect(MealsCore.scaleRecipe(recipe, 1)).toEqual(recipe);
        });

        test('handles a fractional factor', () => {
            expect(MealsCore.scaleRecipe(recipe, 0.5).ingredients[0].qty).toBe(100);
        });

        test('does not mutate the input', () => {
            const copy = JSON.parse(JSON.stringify(recipe));
            MealsCore.scaleRecipe(recipe, 3);
            expect(recipe).toEqual(copy);
        });

        test('tolerates a missing / null / empty recipe', () => {
            const empty = { ingredients: [], steps: [] };
            expect(MealsCore.scaleRecipe(undefined, 2)).toEqual(empty);
            expect(MealsCore.scaleRecipe(null, 2)).toEqual(empty);
            expect(MealsCore.scaleRecipe({}, 2)).toEqual(empty);
        });
    });
});

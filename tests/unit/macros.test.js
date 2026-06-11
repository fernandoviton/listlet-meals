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

    describe('summarizeMacrosByDate', () => {
        test('groups slots by date and sums each day', () => {
            const slots = [
                { date: '2026-06-06', library_id: 'a' },
                { date: '2026-06-06', library_id: 'b' },
                { date: '2026-06-08', library_id: 'a' }
            ];
            const lib = { a: { macros: { cal: 100, protein: 10 } }, b: { macros: { cal: 200 } } };
            expect(MealsMacros.summarizeMacrosByDate(slots, lib)).toEqual({
                '2026-06-06': { cal: 300, protein: 10 },
                '2026-06-08': { cal: 100, protein: 10 }
            });
        });

        test('ignores slots without a valid ISO date', () => {
            const slots = [
                { library_id: 'a' },
                { date: 'nope', library_id: 'a' },
                { date: '2026-06-06', library_id: 'a' }
            ];
            const lib = { a: { macros: { cal: 100 } } };
            expect(Object.keys(MealsMacros.summarizeMacrosByDate(slots, lib))).toEqual(['2026-06-06']);
        });

        test('a date whose only meal was deleted maps to empty macros but stays present', () => {
            expect(MealsMacros.summarizeMacrosByDate([{ date: '2026-06-06', library_id: 'gone' }], {}))
                .toEqual({ '2026-06-06': {} });
        });

        test('tolerates a null library map', () => {
            expect(MealsMacros.summarizeMacrosByDate([{ date: '2026-06-06', library_id: 'a' }], null))
                .toEqual({ '2026-06-06': {} });
        });
    });

    describe('summarizeWeeklyAverages', () => {
        test('averages over the days logged, not 7', () => {
            const byDate = { '2026-06-06': { cal: 400, protein: 20 }, '2026-06-08': { cal: 600, protein: 30 } };
            expect(MealsMacros.summarizeWeeklyAverages(byDate, '2026-06-06', '2026-06-12')).toEqual([
                { week_start: '2026-06-06', days_logged: 2, avg: { cal: 500, protein: 25 } }
            ]);
        });

        test('rounds each average to one decimal', () => {
            const byDate = { '2026-06-06': { cal: 100 }, '2026-06-07': { cal: 100 }, '2026-06-08': { cal: 101 } };
            expect(MealsMacros.summarizeWeeklyAverages(byDate, '2026-06-06', '2026-06-12')[0].avg.cal).toBe(100.3);
        });

        test('buckets across a month boundary into separate weeks', () => {
            const byDate = { '2026-05-31': { cal: 200 }, '2026-06-07': { cal: 400 } };
            const out = MealsMacros.summarizeWeeklyAverages(byDate, '2026-05-30', '2026-06-12');
            expect(out).toEqual([
                { week_start: '2026-05-30', days_logged: 1, avg: { cal: 200 } },
                { week_start: '2026-06-06', days_logged: 1, avg: { cal: 400 } }
            ]);
        });

        test('includes empty weeks (no logged days) with an empty avg', () => {
            const byDate = { '2026-06-06': { cal: 400 } };
            expect(MealsMacros.summarizeWeeklyAverages(byDate, '2026-06-06', '2026-06-19')).toEqual([
                { week_start: '2026-06-06', days_logged: 1, avg: { cal: 400 } },
                { week_start: '2026-06-13', days_logged: 0, avg: {} }
            ]);
        });

        test('a deleted-meal day still counts as a logged day (drags the average to 0)', () => {
            const byDate = { '2026-06-06': { cal: 600 }, '2026-06-08': {} };
            expect(MealsMacros.summarizeWeeklyAverages(byDate, '2026-06-06', '2026-06-12')).toEqual([
                { week_start: '2026-06-06', days_logged: 2, avg: { cal: 300 } }
            ]);
        });

        test('an empty range (from after to) returns []', () => {
            expect(MealsMacros.summarizeWeeklyAverages({}, '2026-06-12', '2026-06-06')).toEqual([]);
            expect(MealsMacros.summarizeWeeklyAverages({}, '2026-06-06', '2026-06-12')).toEqual([
                { week_start: '2026-06-06', days_logged: 0, avg: {} }
            ]);
        });
    });
});

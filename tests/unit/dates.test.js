const MealsDates = require('../../core/dates');

describe('MealsDates', () => {
    describe('isIsoDate', () => {
        test('accepts well-formed real dates', () => {
            expect(MealsDates.isIsoDate('2026-06-06')).toBe(true);
            expect(MealsDates.isIsoDate('2026-02-28')).toBe(true);
            expect(MealsDates.isIsoDate('2024-02-29')).toBe(true); // leap day
            expect(MealsDates.isIsoDate('2000-01-01')).toBe(true);
        });

        test('rejects impossible calendar dates', () => {
            expect(MealsDates.isIsoDate('2026-02-30')).toBe(false);
            expect(MealsDates.isIsoDate('2026-02-29')).toBe(false); // not a leap year
            expect(MealsDates.isIsoDate('2026-13-01')).toBe(false);
            expect(MealsDates.isIsoDate('2026-00-10')).toBe(false);
            expect(MealsDates.isIsoDate('2026-06-31')).toBe(false);
        });

        test('rejects mis-formatted strings', () => {
            expect(MealsDates.isIsoDate('2026-6-1')).toBe(false);
            expect(MealsDates.isIsoDate('2026/06/06')).toBe(false);
            expect(MealsDates.isIsoDate('06-06-2026')).toBe(false);
            expect(MealsDates.isIsoDate('foo')).toBe(false);
            expect(MealsDates.isIsoDate('')).toBe(false);
            expect(MealsDates.isIsoDate(null)).toBe(false);
            expect(MealsDates.isIsoDate(undefined)).toBe(false);
            expect(MealsDates.isIsoDate(20260606)).toBe(false);
        });
    });

    describe('addDays', () => {
        test('adds within a month', () => {
            expect(MealsDates.addDays('2026-06-08', 1)).toBe('2026-06-09');
            expect(MealsDates.addDays('2026-06-08', 7)).toBe('2026-06-15');
        });

        test('crosses a month boundary', () => {
            expect(MealsDates.addDays('2026-06-30', 1)).toBe('2026-07-01');
        });

        test('crosses a year boundary', () => {
            expect(MealsDates.addDays('2026-12-31', 1)).toBe('2027-01-01');
        });

        test('handles negative offsets', () => {
            expect(MealsDates.addDays('2026-01-01', -1)).toBe('2025-12-31');
            expect(MealsDates.addDays('2026-06-06', -6)).toBe('2026-05-31');
        });

        test('lands on a leap day', () => {
            expect(MealsDates.addDays('2024-02-28', 1)).toBe('2024-02-29');
            expect(MealsDates.addDays('2024-02-29', 1)).toBe('2024-03-01');
        });

        test('zero offset is identity', () => {
            expect(MealsDates.addDays('2026-06-06', 0)).toBe('2026-06-06');
        });
    });

    describe('dayOfWeek', () => {
        test('maps ISO dates to sat..fri', () => {
            expect(MealsDates.dayOfWeek('2026-06-06')).toBe('sat');
            expect(MealsDates.dayOfWeek('2026-06-07')).toBe('sun');
            expect(MealsDates.dayOfWeek('2026-06-08')).toBe('mon');
            expect(MealsDates.dayOfWeek('2026-06-11')).toBe('thu');
            expect(MealsDates.dayOfWeek('2026-06-12')).toBe('fri');
            expect(MealsDates.dayOfWeek('2026-06-13')).toBe('sat');
        });
    });

    describe('weekStart', () => {
        test('a Saturday maps to itself', () => {
            expect(MealsDates.weekStart('2026-06-06')).toBe('2026-06-06');
        });

        test('any other day snaps back to the Saturday on/before', () => {
            expect(MealsDates.weekStart('2026-06-08')).toBe('2026-06-06'); // Monday
            expect(MealsDates.weekStart('2026-06-12')).toBe('2026-06-06'); // Friday (−6)
        });

        test('snaps across a month boundary', () => {
            // 2026-06-01 is a Monday → previous Saturday is 2026-05-30.
            expect(MealsDates.weekStart('2026-06-01')).toBe('2026-05-30');
        });
    });

    describe('weekDates', () => {
        test('returns 7 ISO dates Sat→Fri for the containing week', () => {
            expect(MealsDates.weekDates('2026-06-08')).toEqual([
                '2026-06-06', '2026-06-07', '2026-06-08', '2026-06-09',
                '2026-06-10', '2026-06-11', '2026-06-12'
            ]);
        });

        test('is anchored on the week, not the given day', () => {
            expect(MealsDates.weekDates('2026-06-06')).toEqual(MealsDates.weekDates('2026-06-12'));
        });
    });

    describe('dateRange', () => {
        test('inclusive range of ISO dates', () => {
            expect(MealsDates.dateRange('2026-06-06', '2026-06-09')).toEqual([
                '2026-06-06', '2026-06-07', '2026-06-08', '2026-06-09'
            ]);
        });

        test('a single-day range returns that day', () => {
            expect(MealsDates.dateRange('2026-06-06', '2026-06-06')).toEqual(['2026-06-06']);
        });

        test('from after to returns empty', () => {
            expect(MealsDates.dateRange('2026-06-09', '2026-06-06')).toEqual([]);
        });

        test('crosses a month boundary', () => {
            expect(MealsDates.dateRange('2026-05-30', '2026-06-02')).toEqual([
                '2026-05-30', '2026-05-31', '2026-06-01', '2026-06-02'
            ]);
        });
    });
});

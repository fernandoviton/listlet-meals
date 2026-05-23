const ViewUtils = require('../../view/utils');

describe('ViewUtils.formatMacros', () => {
    test('returns empty string for null / undefined', () => {
        expect(ViewUtils.formatMacros(null)).toBe('');
        expect(ViewUtils.formatMacros(undefined)).toBe('');
    });

    test('returns empty string for empty object', () => {
        expect(ViewUtils.formatMacros({})).toBe('');
    });

    test('formats all four keys in cal/P/C/F order with • separator', () => {
        expect(ViewUtils.formatMacros({ cal: 500, protein: 20, carbs: 50, fat: 10 }))
            .toBe('500 cal • 20g P • 50g C • 10g F');
    });

    test('emits only keys that are present, no leading or trailing separator', () => {
        expect(ViewUtils.formatMacros({ cal: 320 })).toBe('320 cal');
        expect(ViewUtils.formatMacros({ protein: 12, fat: 6 })).toBe('12g P • 6g F');
    });

    test('skips non-numeric values', () => {
        expect(ViewUtils.formatMacros({ cal: '500', protein: 20, carbs: null, fat: undefined }))
            .toBe('20g P');
    });
});

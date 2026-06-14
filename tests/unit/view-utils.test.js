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

describe('ViewUtils.formatQuantity', () => {
    test('whole numbers render without a fraction', () => {
        expect(ViewUtils.formatQuantity(2)).toBe('2');
        expect(ViewUtils.formatQuantity(0)).toBe('0');
    });

    test('clean halves / quarters / thirds snap to unicode fractions', () => {
        expect(ViewUtils.formatQuantity(1.5)).toBe('1½');
        expect(ViewUtils.formatQuantity(0.5)).toBe('½');
        expect(ViewUtils.formatQuantity(0.25)).toBe('¼');
        expect(ViewUtils.formatQuantity(0.75)).toBe('¾');
        expect(ViewUtils.formatQuantity(2.75)).toBe('2¾');
        expect(ViewUtils.formatQuantity(2 / 3)).toBe('⅔');
        expect(ViewUtils.formatQuantity(1 / 3)).toBe('⅓');
    });

    test('a decimal with no clean fraction falls back to ≤2dp', () => {
        expect(ViewUtils.formatQuantity(0.2)).toBe('0.2');
        expect(ViewUtils.formatQuantity(1.23)).toBe('1.23');
    });

    test('null / undefined render as empty string', () => {
        expect(ViewUtils.formatQuantity(null)).toBe('');
        expect(ViewUtils.formatQuantity(undefined)).toBe('');
    });
});

describe('ViewUtils.formatDayLabel', () => {
    test('renders weekday + M/D with no leading zeros', () => {
        expect(ViewUtils.formatDayLabel('2026-06-06')).toBe('Sat 6/6');
        expect(ViewUtils.formatDayLabel('2026-06-13')).toBe('Sat 6/13');
        expect(ViewUtils.formatDayLabel('2026-06-08')).toBe('Mon 6/8');
        expect(ViewUtils.formatDayLabel('2026-12-31')).toBe('Thu 12/31');
    });
});

describe('ViewUtils.localIsoDate', () => {
    test('formats a Date as YYYY-MM-DD from its local components', () => {
        // Construct via local-component args so the test is timezone-agnostic.
        expect(ViewUtils.localIsoDate(new Date(2026, 5, 6))).toBe('2026-06-06');
        expect(ViewUtils.localIsoDate(new Date(2026, 11, 31))).toBe('2026-12-31');
        expect(ViewUtils.localIsoDate(new Date(2026, 0, 1))).toBe('2026-01-01');
    });
});

describe('ViewUtils.renderRecipeHtml', () => {
    const recipe = {
        ingredients: [
            { qty: 200, unit: 'g', item: 'pasta' },
            { qty: 0.5, unit: 'cup', item: 'parmesan', note: 'grated' },
            { qty: null, unit: null, item: 'salt', note: 'to taste' }
        ],
        steps: ['Boil water.', 'Cook pasta 10 min.']
    };

    test('renders an ingredient list and a numbered step list', () => {
        const html = ViewUtils.renderRecipeHtml(recipe, 1);
        expect(html).toContain('recipe-ingredients');
        expect(html).toContain('recipe-steps');
        expect(html).toContain('200');
        expect(html).toContain('g');
        expect(html).toContain('pasta');
        expect(html).toContain('½');
        expect(html).toContain('parmesan');
        expect(html).toContain('grated');
        expect(html).toContain('Boil water.');
        expect(html).toContain('Cook pasta 10 min.');
    });

    test('a qty:null row shows just the item (and note), no qty', () => {
        const html = ViewUtils.renderRecipeHtml({
            ingredients: [{ qty: null, unit: null, item: 'salt', note: 'to taste' }],
            steps: []
        }, 1);
        expect(html).toContain('salt');
        expect(html).toContain('to taste');
    });

    test('scales numeric quantities by the factor; null qty unchanged', () => {
        const html = ViewUtils.renderRecipeHtml(recipe, 2);
        expect(html).toContain('400');
        expect(html).toContain('1'); // 0.5 cup parmesan ×2 = 1
        expect(html).toContain('salt');
    });

    test('escapes its input', () => {
        const html = ViewUtils.renderRecipeHtml({
            ingredients: [{ qty: 1, unit: '<b>', item: 'a & b', note: '"x"' }],
            steps: ['<script>boom</script>']
        }, 1);
        expect(html).not.toContain('<script>boom');
        expect(html).toContain('&lt;script&gt;');
        expect(html).toContain('a &amp; b');
        expect(html).toContain('&lt;b&gt;');
    });

    test('empty / null / undefined / {} recipe renders "(no recipe)"', () => {
        expect(ViewUtils.renderRecipeHtml({ ingredients: [], steps: [] }, 1)).toBe('(no recipe)');
        expect(ViewUtils.renderRecipeHtml(null, 1)).toBe('(no recipe)');
        expect(ViewUtils.renderRecipeHtml(undefined, 1)).toBe('(no recipe)');
        expect(ViewUtils.renderRecipeHtml({}, 1)).toBe('(no recipe)');
    });
});

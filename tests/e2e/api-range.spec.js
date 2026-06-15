const { test, expect } = require('./fixtures');

// Exercises the date-range fetch added to shared/api.js#fetchItems (the fix for
// the ~1000-row cap dropping the newest slots). The week/trends DOM already
// filters by date at render time, so a rendered-output test would pass even
// WITHOUT the fix — the new behavior only shows at the fetch layer. So we drive
// createApi() directly in the (mock-mode) browser and assert what fetchItems
// returns, by id.
//
// `createApi` is a global (shared/api.js is a plain script), and the test
// fixture forces mock mode, so this runs entirely against localStorage.

// Seed a calendar list spanning several dates plus one dateless row. Returns the
// page to a loaded mock-mode context with `createApi` available.
async function seed(page) {
    await page.goto('/');
    await page.evaluate(() => {
        localStorage.clear();
        const slot = (id, date) => ({
            id, list_name: 'test-week',
            content: JSON.stringify({ kind: 'slot', library_id: 'lib', date, meal_type: 'dinner', order: 0 }),
            created_at: new Date().toISOString(), updated_at: new Date().toISOString()
        });
        const rows = [
            slot('a', '2026-06-01'), // before window
            slot('b', '2026-06-06'), // window start (inclusive)
            slot('c', '2026-06-10'),
            slot('d', '2026-06-12'), // window end (inclusive)
            slot('e', '2026-06-20'), // after window
            // A dateless row (e.g. a library-shaped item): excluded by any range,
            // returned when no range is set.
            {
                id: 'nodate', list_name: 'test-week',
                content: JSON.stringify({ kind: 'meal', name: 'x' }),
                created_at: new Date().toISOString(), updated_at: new Date().toISOString()
            }
        ];
        localStorage.setItem('listlet_listlet_meals_test-week', JSON.stringify(rows));
    });
}

test('fetchItems({dateFrom,dateTo}) returns only in-range slots (inclusive bounds)', async ({ page }) => {
    await seed(page);
    const r = await page.evaluate(async () => {
        const ids = (arr) => arr.map((x) => x.id).sort();
        const api = createApi('test-week');
        return {
            all: ids(await api.fetchItems()),
            ranged: ids(await api.fetchItems({ dateFrom: '2026-06-06', dateTo: '2026-06-12' }))
        };
    });
    // No range → everything, including the dateless row.
    expect(r.all).toEqual(['a', 'b', 'c', 'd', 'e', 'nodate']);
    // Range → only slots whose date is within [from, to], bounds inclusive;
    // out-of-window and dateless rows are excluded.
    expect(r.ranged).toEqual(['b', 'c', 'd']);
});

test('setDateRange bounds arg-less fetchItems, an explicit range overrides it, and null clears it', async ({ page }) => {
    await seed(page);
    const r = await page.evaluate(async () => {
        const ids = (arr) => arr.map((x) => x.id).sort();
        const api = createApi('test-week');
        // setDateRange sets an instance default that arg-less fetchItems honors
        // (so Sync's arg-less refresh stays bounded)...
        api.setDateRange('2026-06-06', '2026-06-12');
        const def = ids(await api.fetchItems());
        // ...and an explicit per-call range still overrides that default.
        const override = ids(await api.fetchItems({ dateFrom: '2026-06-20', dateTo: '2026-06-20' }));
        // Clearing the default returns to unbounded.
        api.setDateRange(null, null);
        const cleared = ids(await api.fetchItems());
        return { def, override, cleared };
    });
    expect(r.def).toEqual(['b', 'c', 'd']);        // instance default applied
    expect(r.override).toEqual(['e']);              // explicit opts win over the default
    expect(r.cleared).toEqual(['a', 'b', 'c', 'd', 'e', 'nodate']); // default cleared
});

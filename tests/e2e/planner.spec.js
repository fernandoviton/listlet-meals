const { test, expect } = require('./fixtures');

function slotItem(id, day, order, name, meal_type, macros) {
    const now = new Date().toISOString();
    return {
        id: id,
        list_name: 'week',
        content: JSON.stringify({
            kind: 'slot',
            library_id: 'lib-' + id,
            day: day,
            meal_type: meal_type || 'lunch',
            order: order,
            name_snapshot: name,
            macros_snapshot: macros || {}
        }),
        created_at: now,
        updated_at: now
    };
}

test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
});

test('week view renders Sat→Fri columns with seeded slots', async ({ page }) => {
    const seed = [
        slotItem('s1', 'mon', 0, 'Pasta', 'dinner'),
        slotItem('s2', 'wed', 0, 'Salad', 'lunch')
    ];
    await page.evaluate((items) => {
        localStorage.setItem('listlet_listlet_meals_week', JSON.stringify(items));
    }, seed);

    await page.goto('/?list=week');

    const headers = page.locator('.day-header');
    await expect(headers).toHaveText(['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri']);

    await expect(page.locator('.day-column[data-day="mon"] .slot-card')).toHaveText('Pasta');
    await expect(page.locator('.day-column[data-day="wed"] .slot-card')).toHaveText('Salad');
});

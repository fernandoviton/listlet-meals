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
            meal_type: meal_type,
            order: order,
            name_snapshot: name,
            macros_snapshot: macros || {}
        }),
        created_at: now,
        updated_at: now
    };
}

test('filter pills narrow visible slots and shrink daily totals', async ({ page }) => {
    await page.goto('/');
    await page.evaluate((items) => {
        localStorage.clear();
        localStorage.setItem('listlet_listlet_meals_week', JSON.stringify(items));
    }, [
        slotItem('s1', 'mon', 0, 'Oatmeal', 'breakfast', { cal: 300, protein: 10 }),
        slotItem('s2', 'mon', 1, 'Salad',   'lunch',     { cal: 400, protein: 20 }),
        slotItem('s3', 'mon', 2, 'Pasta',   'dinner',    { cal: 700, protein: 25 })
    ]);

    await page.goto('/?list=week');

    const mon = page.locator('.day-column[data-day="mon"]');
    await expect(mon.locator('.slot-card')).toHaveCount(3);
    await expect(mon.locator('.day-summary')).toHaveText('1400 cal • 55g P');

    await page.locator('.filter-pill[data-filter="breakfast"]').click();
    await expect(mon.locator('.slot-card')).toHaveCount(1);
    await expect(mon.locator('.slot-name')).toHaveText('Oatmeal');
    await expect(mon.locator('.day-summary')).toHaveText('300 cal • 10g P');
});

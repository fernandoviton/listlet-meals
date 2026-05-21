const { test, expect } = require('./fixtures');

function slotItem(id, day, order, name, mealType) {
    const now = new Date().toISOString();
    return {
        id: id,
        list_name: 'week',
        content: JSON.stringify({
            kind: 'slot',
            library_id: 'lib-' + id,
            day: day,
            meal_type: mealType,
            order: order,
            name_snapshot: name,
            macros_snapshot: {}
        }),
        created_at: now,
        updated_at: now
    };
}

async function seed(page, week) {
    await page.goto('/');
    await page.evaluate((week) => {
        localStorage.clear();
        localStorage.setItem('listlet_listlet_meals_week', JSON.stringify(week));
    }, week);
}

test('each slot card shows its meal-type badge', async ({ page }) => {
    await seed(page, [
        slotItem('s1', 'mon', 0, 'Pasta', 'dinner'),
        slotItem('s2', 'tue', 0, 'Salad', 'lunch')
    ]);
    await page.goto('/?list=week');

    const mon = page.locator('.day-column[data-day="mon"] .slot-card');
    const tue = page.locator('.day-column[data-day="tue"] .slot-card');
    await expect(mon.locator('.slot-meal-type')).toHaveValue('dinner');
    await expect(tue.locator('.slot-meal-type')).toHaveValue('lunch');
});

test('changing meal type persists across reload and re-filters', async ({ page }) => {
    await seed(page, [slotItem('s1', 'mon', 0, 'Pasta', 'dinner')]);
    await page.goto('/?list=week');

    const card = page.locator('.day-column[data-day="mon"] .slot-card');
    await card.locator('.slot-meal-type').selectOption('lunch');

    // Filter to "Dinner" — card should disappear.
    await page.locator('.filter-pill[data-filter="dinner"]').click();
    await expect(page.locator('.day-column[data-day="mon"] .slot-card')).toHaveCount(0);

    // Filter to "Lunch" — card should appear.
    await page.locator('.filter-pill[data-filter="lunch"]').click();
    await expect(page.locator('.day-column[data-day="mon"] .slot-name')).toHaveText('Pasta');

    // Reload — change persists.
    await page.waitForTimeout(300);
    await page.goto('/?list=week');
    await expect(page.locator('.day-column[data-day="mon"] .slot-card .slot-meal-type'))
        .toHaveValue('lunch');
});

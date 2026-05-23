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

test('each day column shows meal-type sections; cards live in their section', async ({ page }) => {
    await seed(page, [
        slotItem('s1', 'mon', 0, 'Pasta', 'dinner'),
        slotItem('s2', 'tue', 0, 'Salad', 'lunch')
    ]);
    await page.goto('/?list=week');

    // All 4 sections render per day.
    await expect(page.locator('.day-column[data-day="mon"] .meal-section')).toHaveCount(4);

    // Each slot lands in its meal-type section.
    await expect(
        page.locator('.day-column[data-day="mon"] .meal-section[data-meal-type="dinner"] .slot-name')
    ).toHaveText('Pasta');
    await expect(
        page.locator('.day-column[data-day="tue"] .meal-section[data-meal-type="lunch"] .slot-name')
    ).toHaveText('Salad');
});

test('dragging a slot to a different meal-type section updates meal_type and persists', async ({ page }) => {
    await seed(page, [slotItem('s1', 'mon', 0, 'Pasta', 'dinner')]);
    await page.goto('/?list=week');

    const grab = page.locator('.day-column[data-day="mon"] .slot-card .slot-grab');
    const lunchSection = page.locator('.day-column[data-day="mon"] .meal-section[data-meal-type="lunch"]');
    await grab.dragTo(lunchSection);

    // Card now lives in the lunch section.
    await expect(
        page.locator('.day-column[data-day="mon"] .meal-section[data-meal-type="lunch"] .slot-name')
    ).toHaveText('Pasta');
    await expect(
        page.locator('.day-column[data-day="mon"] .meal-section[data-meal-type="dinner"] .slot-card')
    ).toHaveCount(0);

    // Filter to "Dinner" — card hidden.
    await page.locator('.filter-pill[data-filter="dinner"]').click();
    await expect(page.locator('.day-column[data-day="mon"] .slot-card')).toHaveCount(0);

    // Filter to "Lunch" — card visible.
    await page.locator('.filter-pill[data-filter="lunch"]').click();
    await expect(page.locator('.day-column[data-day="mon"] .slot-name')).toHaveText('Pasta');

    // Reload — change persists.
    await page.waitForTimeout(500);
    await page.goto('/?list=week');
    await expect(
        page.locator('.day-column[data-day="mon"] .meal-section[data-meal-type="lunch"] .slot-name')
    ).toHaveText('Pasta');
});

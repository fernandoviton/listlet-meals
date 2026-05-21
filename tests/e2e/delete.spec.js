const { test, expect } = require('./fixtures');

function slotItem(id, day, order, name) {
    const now = new Date().toISOString();
    return {
        id: id,
        list_name: 'week',
        content: JSON.stringify({
            kind: 'slot',
            library_id: 'lib-' + id,
            day: day,
            meal_type: 'lunch',
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

test('each slot card shows a delete button', async ({ page }) => {
    await seed(page, [slotItem('s1', 'mon', 0, 'Pasta')]);
    await page.goto('/?list=week');
    await expect(page.locator('.day-column[data-day="mon"] .slot-delete')).toBeVisible();
});

test('clicking delete removes the slot and persists across reload', async ({ page }) => {
    await seed(page, [
        slotItem('s1', 'mon', 0, 'Pasta'),
        slotItem('s2', 'mon', 1, 'Salad'),
        slotItem('s3', 'tue', 0, 'Soup')
    ]);
    await page.goto('/?list=week');

    page.on('dialog', d => d.accept());
    await page.locator('.day-column[data-day="mon"] .slot-card', { hasText: 'Pasta' })
        .locator('.slot-delete').click();

    // Pasta gone, Salad remains in Mon, Soup untouched.
    await expect(page.locator('.day-column[data-day="mon"] .slot-name')).toHaveText(['Salad']);
    await expect(page.locator('.day-column[data-day="tue"] .slot-name')).toHaveText(['Soup']);

    await page.waitForTimeout(300);
    await page.goto('/?list=week');
    await expect(page.locator('.day-column[data-day="mon"] .slot-name')).toHaveText(['Salad']);
});

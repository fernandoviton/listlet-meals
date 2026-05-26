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
            order: order
        }),
        created_at: now,
        updated_at: now
    };
}

// The week joins live to the library by library_id; seed a matching library row
// (id 'lib-' + slotId) so each slot resolves its name instead of falling back.
function libraryItem(id, name) {
    const now = new Date().toISOString();
    return {
        id: id,
        list_name: 'library',
        content: JSON.stringify({
            kind: 'meal',
            name: name,
            recipe: { ingredients: [], steps: [] },
            default_meal_type: 'lunch',
            macros: {}
        }),
        created_at: now,
        updated_at: now
    };
}

async function seed(page, week, library) {
    await page.goto('/');
    await page.evaluate(({ week, library }) => {
        localStorage.clear();
        localStorage.setItem('listlet_listlet_meals_week', JSON.stringify(week));
        localStorage.setItem('listlet_listlet_meals_library', JSON.stringify(library || []));
    }, { week, library });
}

test('opening a slot reveals a delete action in the modal', async ({ page }) => {
    await seed(page, [slotItem('s1', 'mon', 0, 'Pasta')], [libraryItem('lib-s1', 'Pasta')]);
    await page.goto('/?list=week');
    await page.locator('.day-column[data-day="mon"] .slot-card').click();
    await expect(page.locator('#recipe-dialog .dialog-delete')).toBeVisible();
});

test('confirming delete in the modal removes the slot and persists across reload', async ({ page }) => {
    await seed(page, [
        slotItem('s1', 'mon', 0, 'Pasta'),
        slotItem('s2', 'mon', 1, 'Salad'),
        slotItem('s3', 'tue', 0, 'Soup')
    ], [
        libraryItem('lib-s1', 'Pasta'),
        libraryItem('lib-s2', 'Salad'),
        libraryItem('lib-s3', 'Soup')
    ]);
    await page.goto('/?list=week');

    page.on('dialog', d => d.accept());
    await page.locator('.day-column[data-day="mon"] .slot-card', { hasText: 'Pasta' }).click();
    await page.locator('#recipe-dialog .dialog-delete').click();

    // Pasta gone, Salad remains in Mon, Soup untouched.
    await expect(page.locator('.day-column[data-day="mon"] .slot-name')).toHaveText(['Salad']);
    await expect(page.locator('.day-column[data-day="tue"] .slot-name')).toHaveText(['Soup']);

    await page.waitForTimeout(300);
    await page.goto('/?list=week');
    await expect(page.locator('.day-column[data-day="mon"] .slot-name')).toHaveText(['Salad']);
});

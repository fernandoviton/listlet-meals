const { test, expect } = require('./fixtures');

function libraryItem(id, name, recipe, mealType) {
    const now = new Date().toISOString();
    return {
        id: id,
        list_name: 'library',
        content: JSON.stringify({
            kind: 'meal',
            name: name,
            recipe: recipe,
            default_meal_type: mealType || 'lunch',
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
        if (week) localStorage.setItem('listlet_listlet_meals_week', JSON.stringify(week));
        if (library) localStorage.setItem('listlet_listlet_meals_library', JSON.stringify(library));
    }, { week, library });
}

test('week view: each day column has an "Add meal" button', async ({ page }) => {
    await seed(page, [], [libraryItem('lib-a', 'Apple', 'eat it')]);
    await page.goto('/?list=week');

    // One add button per day column.
    await expect(page.locator('.day-column .day-add')).toHaveCount(7);
});

test('week view: clicking add opens a picker listing library meals sorted by name', async ({ page }) => {
    await seed(page, [], [
        libraryItem('lib-b', 'banana split', 'r1'),
        libraryItem('lib-a', 'Apple Pie', 'r2'),
        libraryItem('lib-c', 'cherry tart', 'r3')
    ]);
    await page.goto('/?list=week');

    await page.locator('.day-column[data-day="wed"] .day-add').click();

    const dialog = page.locator('#picker-dialog');
    await expect(dialog).toHaveAttribute('open', '');
    await expect(dialog.locator('.picker-meal')).toHaveText(['Apple Pie', 'banana split', 'cherry tart']);
});

test('week view: picking a meal adds a slot to the target day and persists', async ({ page }) => {
    await seed(page, [], [libraryItem('lib-pasta', 'Pasta', 'boil')]);
    await page.goto('/?list=week');

    await page.locator('.day-column[data-day="thu"] .day-add').click();
    await page.locator('#picker-dialog .picker-meal', { hasText: 'Pasta' }).click();

    // Picker closes and the slot lands in Thu.
    await expect(page.locator('#picker-dialog')).not.toHaveAttribute('open', '');
    await expect(page.locator('.day-column[data-day="thu"] .slot-name')).toHaveText('Pasta');

    // Reload — slot still there.
    await page.waitForTimeout(300);
    await page.goto('/?list=week');
    await expect(page.locator('.day-column[data-day="thu"] .slot-name')).toHaveText('Pasta');
});


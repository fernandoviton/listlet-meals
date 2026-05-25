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

test('week view: picker groups meals by meal type with section headers', async ({ page }) => {
    await seed(page, [], [
        libraryItem('lib-toast', 'Toast', 'r1', 'breakfast'),
        libraryItem('lib-ziti', 'Ziti', 'r2', 'dinner'),
        libraryItem('lib-steak', 'Apple Steak', 'r3', 'dinner')
    ]);
    await page.goto('/?list=week');

    await page.locator('.day-column[data-day="wed"] .day-add').click();
    const dialog = page.locator('#picker-dialog');
    await expect(dialog).toHaveAttribute('open', '');

    // Groups appear in canonical order; empty types (lunch, snack) omitted.
    await expect(dialog.locator('.picker-group-label')).toHaveText(['Breakfast', 'Dinner']);
    // Each group lists its meals, name-sorted.
    await expect(dialog.locator('.picker-group').nth(0).locator('.picker-meal')).toHaveText(['Toast']);
    await expect(dialog.locator('.picker-group').nth(1).locator('.picker-meal')).toHaveText(['Apple Steak', 'Ziti']);
});

test('week view: a parent filter restricts the picker to that meal type', async ({ page }) => {
    await seed(page, [], [
        libraryItem('lib-toast', 'Toast', 'r1', 'breakfast'),
        libraryItem('lib-ziti', 'Ziti', 'r2', 'dinner'),
        libraryItem('lib-salad', 'Salad', 'r3', 'lunch')
    ]);
    await page.goto('/?list=week');

    // Set the planner filter to Dinner, then open the picker.
    await page.locator('.filter-pill[data-filter="dinner"]').click();
    await page.locator('.day-column[data-day="wed"] .day-add').click();

    const dialog = page.locator('#picker-dialog');
    await expect(dialog.locator('.picker-group-label')).toHaveText(['Dinner']);
    await expect(dialog.locator('.picker-meal')).toHaveText(['Ziti']);
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


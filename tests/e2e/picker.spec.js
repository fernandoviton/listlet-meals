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

function libraryMealRow(id, name, macros) {
    const now = new Date().toISOString();
    return {
        id: id,
        list_name: 'library',
        content: JSON.stringify({
            kind: 'meal',
            name: name,
            recipe: { ingredients: [], steps: [] },
            default_meal_type: 'dinner',
            macros: macros || {}
        }),
        created_at: now,
        updated_at: now
    };
}

function slotRow(id, libraryId) {
    const now = new Date().toISOString();
    return {
        id: id,
        list_name: 'week',
        content: JSON.stringify({
            kind: 'slot',
            library_id: libraryId,
            day: 'mon',
            meal_type: 'dinner',
            order: 0
        }),
        created_at: now,
        updated_at: now
    };
}

test('week view: slot card + day summary render live library macros and follow a library edit', async ({ page }) => {
    await seed(page,
        [slotRow('s1', 'lib-p')],
        [libraryMealRow('lib-p', 'Pasta', { cal: 500, protein: 20 })]
    );
    await page.goto('/?list=week');

    const mon = page.locator('.day-column[data-day="mon"]');
    await expect(mon.locator('.slot-name')).toHaveText('Pasta');
    await expect(mon.locator('.slot-macros')).toHaveText('500 cal • 20g P');
    await expect(mon.locator('.day-summary')).toHaveText('500 cal • 20g P');

    // Edit the library meal's macros directly (mirrors a CLI edit), then reload.
    await page.evaluate(() => {
        const lib = JSON.parse(localStorage.getItem('listlet_listlet_meals_library'));
        const row = lib.find(r => r.id === 'lib-p');
        row.content = JSON.stringify({
            kind: 'meal', name: 'Pasta',
            recipe: { ingredients: [], steps: [] },
            default_meal_type: 'dinner', macros: { cal: 800, protein: 35 }
        });
        localStorage.setItem('listlet_listlet_meals_library', JSON.stringify(lib));
    });
    await page.goto('/?list=week');

    // Live join → the card and the summary show the NEW macros, no remove/re-add.
    await expect(mon.locator('.slot-macros')).toHaveText('800 cal • 35g P');
    await expect(mon.locator('.day-summary')).toHaveText('800 cal • 35g P');
});

test('week view: a slot whose library meal is gone renders the (deleted meal) fallback and totals 0', async ({ page }) => {
    // Seed a NON-EMPTY library (without lib-gone) so the auto-seed does not
    // repopulate demo meals; the slot's library_id has no match → fallback.
    await seed(page,
        [slotRow('s1', 'lib-gone')],
        [libraryMealRow('lib-other', 'Other', { cal: 100 })]
    );
    await page.goto('/?list=week');

    const mon = page.locator('.day-column[data-day="mon"]');
    await expect(mon.locator('.slot-name')).toHaveText('(deleted meal)');
    await expect(mon.locator('.day-summary')).toHaveText('');
});


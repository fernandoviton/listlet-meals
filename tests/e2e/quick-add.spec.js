const { test, expect } = require('./fixtures');

function libraryMealRow(id, name, mealType, macros) {
    const now = new Date().toISOString();
    return {
        id: id,
        list_name: 'library',
        content: JSON.stringify({
            kind: 'meal',
            name: name,
            recipe: { ingredients: [], steps: [] },
            default_meal_type: mealType || 'dinner',
            macros: macros || {}
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

async function quickAdd(page, day, fields) {
    await page.locator('.day-column[data-day="' + day + '"] .day-add').click();
    await page.locator('#picker-dialog .picker-quick-add').click();
    const form = page.locator('#picker-dialog .quick-add-form');
    await form.locator('input[name="name"]').fill(fields.name);
    if (fields.type) await form.locator('select[name="type"]').selectOption(fields.type);
    if (fields.cal) await form.locator('input[name="cal"]').fill(String(fields.cal));
    if (fields.protein) await form.locator('input[name="protein"]').fill(String(fields.protein));
    await form.locator('button[type="submit"]').click();
}

test('quick add: creates an ad-hoc meal and places it on the day, persisting both rows', async ({ page }) => {
    await seed(page, [], [libraryMealRow('lib-other', 'Other', 'dinner')]);
    await page.goto('/?list=week');

    await quickAdd(page, 'wed', { name: 'Leftover curry', cal: 550 });

    // Dialog closes; slot lands in Wed with its macros and counts toward totals.
    await expect(page.locator('#picker-dialog')).not.toHaveAttribute('open', '');
    const wed = page.locator('.day-column[data-day="wed"]');
    await expect(wed.locator('.slot-name')).toHaveText('Leftover curry');
    await expect(wed.locator('.slot-macros')).toHaveText('550 cal');
    await expect(wed.locator('.day-summary')).toHaveText('550 cal');

    // Reload — both the library row and the slot survived.
    await page.waitForTimeout(300);
    await page.goto('/?list=week');
    await expect(wed.locator('.slot-name')).toHaveText('Leftover curry');
    await expect(wed.locator('.day-summary')).toHaveText('550 cal');
});

test('quick add: ad-hoc meal stays hidden from the picker and the library page', async ({ page }) => {
    await seed(page, [], [libraryMealRow('lib-other', 'Other', 'dinner')]);
    await page.goto('/?list=week');

    await quickAdd(page, 'wed', { name: 'Leftover curry' });
    await expect(page.locator('.day-column[data-day="wed"] .slot-name')).toHaveText('Leftover curry');

    // Reopen the picker — only the real library meal is listed.
    await page.locator('.day-column[data-day="thu"] .day-add').click();
    await expect(page.locator('#picker-dialog .picker-meal')).toHaveText(['Other']);
    await page.locator('#picker-dialog .picker-close').click();

    // Library page hides it too.
    await page.waitForTimeout(300);
    await page.goto('/?list=library');
    await expect(page.locator('.library-name')).toHaveText(['Other']);
});

test('quick add: still available when the picker list is empty for the active filter', async ({ page }) => {
    await seed(page, [], [libraryMealRow('lib-toast', 'Toast', 'breakfast')]);
    await page.goto('/?list=week');

    await page.locator('.filter-pill[data-filter="dinner"]').click();
    await page.locator('.day-column[data-day="mon"] .day-add').click();

    const dialog = page.locator('#picker-dialog');
    await expect(dialog.locator('.picker-empty')).toBeVisible();
    await expect(dialog.locator('.picker-quick-add')).toBeVisible();

    await dialog.locator('.picker-quick-add').click();
    const form = dialog.locator('.quick-add-form');
    await form.locator('input[name="name"]').fill('Takeout pizza');
    await form.locator('button[type="submit"]').click();

    await expect(page.locator('.meal-section[data-day="mon"][data-meal-type="dinner"] .slot-name'))
        .toHaveText('Takeout pizza');
});

test('quick add: meal-type select defaults to the active filter and places the slot in that section', async ({ page }) => {
    await seed(page, [], [libraryMealRow('lib-other', 'Other', 'dinner')]);
    await page.goto('/?list=week');

    await page.locator('.filter-pill[data-filter="lunch"]').click();
    await page.locator('.day-column[data-day="tue"] .day-add').click();
    await page.locator('#picker-dialog .picker-quick-add').click();

    const form = page.locator('#picker-dialog .quick-add-form');
    await expect(form.locator('select[name="type"]')).toHaveValue('lunch');
    await form.locator('input[name="name"]').fill('Deli sandwich');
    await form.locator('button[type="submit"]').click();

    await expect(page.locator('.meal-section[data-day="tue"][data-meal-type="lunch"] .slot-name'))
        .toHaveText('Deli sandwich');
});

test('quick add: blank name shows an inline error and keeps the dialog open', async ({ page }) => {
    await seed(page, [], [libraryMealRow('lib-other', 'Other', 'dinner')]);
    await page.goto('/?list=week');

    await page.locator('.day-column[data-day="wed"] .day-add').click();
    await page.locator('#picker-dialog .picker-quick-add').click();
    await page.locator('#picker-dialog .quick-add-form button[type="submit"]').click();

    await expect(page.locator('#picker-dialog')).toHaveAttribute('open', '');
    await expect(page.locator('#picker-dialog .quick-add-error')).toBeVisible();
    await expect(page.locator('.day-column[data-day="wed"] .slot-card')).toHaveCount(0);
});

test('quick add: recipe modal on an ad-hoc slot shows a no-recipe note and no scale stepper', async ({ page }) => {
    await seed(page, [], [libraryMealRow('lib-other', 'Other', 'dinner')]);
    await page.goto('/?list=week');

    await quickAdd(page, 'fri', { name: 'Leftover curry', cal: 550 });
    await page.locator('.day-column[data-day="fri"] .slot-card').click();

    const dialog = page.locator('#recipe-dialog');
    await expect(dialog).toHaveAttribute('open', '');
    await expect(dialog.locator('.dialog-adhoc-note')).toBeVisible();
    await expect(dialog.locator('.recipe-scale')).toBeHidden();
});

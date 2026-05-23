const { test, expect } = require('./fixtures');

function slotItem(id, day, order, name, opts) {
    opts = opts || {};
    const now = new Date().toISOString();
    return {
        id: id,
        list_name: 'week',
        content: JSON.stringify({
            kind: 'slot',
            library_id: opts.library_id || 'lib-' + id,
            day: day,
            meal_type: opts.meal_type || 'lunch',
            order: order,
            name_snapshot: name,
            macros_snapshot: opts.macros || {}
        }),
        created_at: now,
        updated_at: now
    };
}

function libraryItem(id, name, recipe, opts) {
    opts = opts || {};
    const now = new Date().toISOString();
    return {
        id: id,
        list_name: 'library',
        content: JSON.stringify({
            kind: 'meal',
            name: name,
            recipe: recipe,
            default_meal_type: opts.meal_type || 'lunch',
            macros: opts.macros || {}
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

test('week view renders Sat→Fri columns with seeded slots', async ({ page }) => {
    await seed(page, [
        slotItem('s1', 'mon', 0, 'Pasta', { meal_type: 'dinner', library_id: 'lib-pasta' }),
        slotItem('s2', 'wed', 0, 'Salad', { meal_type: 'lunch', library_id: 'lib-salad' })
    ], []);
    await page.goto('/?list=week');

    const headers = page.locator('.day-header .day-label');
    await expect(headers).toHaveText(['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri']);

    await expect(page.locator('.day-column[data-day="mon"] .slot-name')).toHaveText('Pasta');
    await expect(page.locator('.day-column[data-day="wed"] .slot-name')).toHaveText('Salad');
});

test('drag a slot from Mon to Wed and reload — it stays in Wed', async ({ page }) => {
    await seed(page, [
        slotItem('s1', 'mon', 0, 'Pasta', { library_id: 'lib-pasta' })
    ], []);
    await page.goto('/?list=week');

    const source = page.locator('.day-column[data-day="mon"] .slot-card .slot-name');
    const target = page.locator('.day-column[data-day="wed"]');
    await source.dragTo(target);

    await expect(page.locator('.day-column[data-day="wed"] .slot-name')).toHaveText('Pasta');
    await expect(page.locator('.day-column[data-day="mon"] .slot-card')).toHaveCount(0);

    // Wait for debounced save then reload
    await page.waitForTimeout(500);
    await page.goto('/?list=week');
    await expect(page.locator('.day-column[data-day="wed"] .slot-name')).toHaveText('Pasta');
});

test('clicking a slot card opens the recipe modal', async ({ page }) => {
    await seed(page,
        [slotItem('s1', 'mon', 0, 'Pasta', { library_id: 'lib-pasta' })],
        [libraryItem('lib-pasta', 'Pasta', 'Boil water. Add pasta. Drain.')]
    );
    await page.goto('/?list=week');

    const card = page.locator('.day-column[data-day="mon"] .slot-card');
    const dialog = page.locator('#recipe-dialog');
    await expect(dialog).not.toHaveAttribute('open', '');

    await card.click();
    await expect(dialog).toHaveAttribute('open', '');
    await expect(dialog.locator('h2')).toHaveText('Pasta');
    await expect(dialog.locator('.dialog-recipe')).toHaveText('Boil water. Add pasta. Drain.');

    await page.keyboard.press('Escape');
    await expect(dialog).not.toHaveAttribute('open', '');
});

const { test, expect } = require('./fixtures');

// Fixed Saturday anchor so the week is deterministic (no clock mocking). The
// week of 2026-06-06 runs Sat 6/6 → Fri 6/12.
const SAT = '2026-06-06';
const MON = '2026-06-08';
const WED = '2026-06-10';

// `name` / `opts.macros` are no longer stored on the slot (the week joins live
// to the library); they stay in the signature to document which library row each
// call expects to be seeded alongside it.
function slotItem(id, date, order, name, opts) {
    opts = opts || {};
    const now = new Date().toISOString();
    return {
        id: id,
        list_name: 'week',
        content: JSON.stringify({
            kind: 'slot',
            library_id: opts.library_id || 'lib-' + id,
            date: date,
            meal_type: opts.meal_type || 'lunch',
            order: order
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
        slotItem('s1', MON, 0, 'Pasta', { meal_type: 'dinner', library_id: 'lib-pasta' }),
        slotItem('s2', WED, 0, 'Salad', { meal_type: 'lunch', library_id: 'lib-salad' })
    ], [
        libraryItem('lib-pasta', 'Pasta', 'boil', { meal_type: 'dinner' }),
        libraryItem('lib-salad', 'Salad', 'toss', { meal_type: 'lunch' })
    ]);
    await page.goto('/?list=week&date=' + SAT);

    const headers = page.locator('.day-header .day-label');
    await expect(headers).toHaveText([
        'Sat 6/6', 'Sun 6/7', 'Mon 6/8', 'Tue 6/9', 'Wed 6/10', 'Thu 6/11', 'Fri 6/12'
    ]);

    await expect(page.locator('.day-column[data-date="' + MON + '"] .slot-name')).toHaveText('Pasta');
    await expect(page.locator('.day-column[data-date="' + WED + '"] .slot-name')).toHaveText('Salad');
});

test('drag a slot from Mon to Wed and reload — it stays in Wed', async ({ page }) => {
    await seed(page, [
        slotItem('s1', MON, 0, 'Pasta', { library_id: 'lib-pasta' })
    ], [
        libraryItem('lib-pasta', 'Pasta', 'boil')
    ]);
    await page.goto('/?list=week&date=' + SAT);

    const source = page.locator('.day-column[data-date="' + MON + '"] .slot-card .slot-grab');
    const target = page.locator('.day-column[data-date="' + WED + '"]');
    await source.dragTo(target);

    await expect(page.locator('.day-column[data-date="' + WED + '"] .slot-name')).toHaveText('Pasta');
    await expect(page.locator('.day-column[data-date="' + MON + '"] .slot-card')).toHaveCount(0);

    // Wait for debounced save then reload
    await page.waitForTimeout(500);
    await page.goto('/?list=week&date=' + SAT);
    await expect(page.locator('.day-column[data-date="' + WED + '"] .slot-name')).toHaveText('Pasta');
});

const PASTA_RECIPE = {
    ingredients: [
        { qty: 200, unit: 'g', item: 'pasta' },
        { qty: null, unit: null, item: 'salt', note: 'to taste' }
    ],
    steps: ['Boil water.', 'Add pasta.', 'Drain.']
};

test('clicking a slot card opens the recipe modal', async ({ page }) => {
    await seed(page,
        [slotItem('s1', MON, 0, 'Pasta', { library_id: 'lib-pasta' })],
        [libraryItem('lib-pasta', 'Pasta', PASTA_RECIPE)]
    );
    await page.goto('/?list=week&date=' + SAT);

    const card = page.locator('.day-column[data-date="' + MON + '"] .slot-card');
    const dialog = page.locator('#recipe-dialog');
    await expect(dialog).not.toHaveAttribute('open', '');

    await card.locator('.slot-name').click();
    await expect(dialog).toHaveAttribute('open', '');
    await expect(dialog.locator('h2')).toHaveText('Pasta');
    // Recipe renders as structured ingredient + step lists.
    await expect(dialog.locator('.dialog-recipe .recipe-ingredients li').first()).toContainText('pasta');
    await expect(dialog.locator('.dialog-recipe .recipe-steps li')).toHaveText([
        'Boil water.', 'Add pasta.', 'Drain.'
    ]);

    await page.keyboard.press('Escape');
    await expect(dialog).not.toHaveAttribute('open', '');
});

test('a slot added via the picker from the real demo seed shows its recipe', async ({ page }) => {
    // Mirror the real GUI path: fresh localStorage → app auto-seeds the demo
    // library → add a meal via the picker → open the slot modal.
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.goto('/?list=week&date=' + SAT);

    await page.locator('.day-column[data-date="' + WED + '"] .day-add').click();
    await page.locator('#picker-dialog .picker-meal', { hasText: 'Oatmeal' }).click();

    const dialog = page.locator('#recipe-dialog');
    await page.locator('.day-column[data-date="' + WED + '"] .slot-card .slot-name').click();
    await expect(dialog).toHaveAttribute('open', '');

    // Scale control AND recipe should both be present.
    await expect(dialog.locator('.recipe-scale')).toBeVisible();
    await expect(dialog.locator('.dialog-recipe .recipe-ingredients li').first()).toBeVisible();
    await expect(dialog.locator('.dialog-recipe')).not.toHaveText('(no recipe)');
});

test('the ×N stepper scales ingredient quantities and the macro line', async ({ page }) => {
    await seed(page,
        [slotItem('s1', MON, 0, 'Pasta', { library_id: 'lib-pasta', macros: { cal: 500, protein: 20 } })],
        [libraryItem('lib-pasta', 'Pasta', PASTA_RECIPE, { macros: { cal: 500, protein: 20 } })]
    );
    await page.goto('/?list=week&date=' + SAT);

    const dialog = page.locator('#recipe-dialog');
    await page.locator('.day-column[data-date="' + MON + '"] .slot-card .slot-name').click();
    await expect(dialog).toHaveAttribute('open', '');

    const firstIng = dialog.locator('.dialog-recipe .recipe-ingredients li').first();
    const macros = dialog.locator('.dialog-macros');

    // ×1 — per-serving.
    await expect(firstIng).toContainText('200');
    await expect(macros).toContainText('500 cal');
    await expect(macros).toContainText('20g P');

    // Bump to ×2 — quantities and macros double; the "to taste" row is unchanged.
    await dialog.locator('.recipe-scale .scale-inc').click();
    await expect(dialog.locator('.recipe-scale .scale-value')).toHaveText('×2');
    await expect(firstIng).toContainText('400');
    await expect(macros).toContainText('1000 cal');
    await expect(macros).toContainText('40g P');
    await expect(dialog.locator('.dialog-recipe .recipe-ingredients li').nth(1)).toContainText('to taste');
});

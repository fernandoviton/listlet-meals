const { test, expect } = require('./fixtures');

function libraryItem(id, name, recipe, macros) {
    const now = new Date().toISOString();
    return {
        id: id,
        list_name: 'library',
        content: JSON.stringify({
            kind: 'meal',
            name: name,
            recipe: recipe,
            default_meal_type: 'lunch',
            macros: macros || {}
        }),
        created_at: now,
        updated_at: now
    };
}

const PASTA_RECIPE = {
    ingredients: [
        { qty: 200, unit: 'g', item: 'pasta' },
        { qty: null, unit: null, item: 'salt', note: 'to taste' }
    ],
    steps: ['Boil water.', 'Add pasta.']
};

test('library shows name, macros, and expandable recipe (no add-to-week UI)', async ({ page }) => {
    await page.goto('/');
    await page.evaluate((items) => {
        localStorage.clear();
        localStorage.setItem('listlet_listlet_meals_library', JSON.stringify(items));
    }, [libraryItem('lib-pasta', 'Pasta', PASTA_RECIPE, { cal: 500, protein: 20 })]);

    await page.goto('/?list=library');

    await expect(page.locator('.library-card .library-name')).toHaveText('Pasta');

    await expect(page.locator('.library-add')).toHaveCount(0);
    await expect(page.locator('.day-pick')).toHaveCount(0);

    var macros = page.locator('.library-card .library-macros');
    await expect(macros).toBeVisible();
    await expect(macros).toContainText('500 cal');
    await expect(macros).toContainText('20g P');

    var recipe = page.locator('.library-card .library-recipe');
    await expect(recipe).toBeHidden();

    await page.locator('.library-card').click();
    await expect(recipe).toBeVisible();
    // Structured recipe: ingredient list + numbered steps.
    await expect(recipe.locator('.recipe-ingredients li').first()).toContainText('pasta');
    await expect(recipe.locator('.recipe-steps li').first()).toContainText('Boil water.');

    await page.locator('.library-card').click();
    await expect(recipe).toBeHidden();
});

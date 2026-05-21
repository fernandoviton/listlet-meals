const { test, expect } = require('./fixtures');

function libraryItem(id, name, recipe) {
    const now = new Date().toISOString();
    return {
        id: id,
        list_name: 'library',
        content: JSON.stringify({
            kind: 'meal',
            name: name,
            recipe: recipe,
            default_meal_type: 'lunch',
            macros: {}
        }),
        created_at: now,
        updated_at: now
    };
}

test('library "+" popover adds a slot to the week', async ({ page }) => {
    await page.goto('/');
    await page.evaluate((items) => {
        localStorage.clear();
        localStorage.setItem('listlet_listlet_meals_library', JSON.stringify(items));
    }, [libraryItem('lib-pasta', 'Pasta', 'Boil water.')]);

    await page.goto('/?list=library');
    await expect(page.locator('.library-card .library-name')).toHaveText('Pasta');

    await page.locator('.library-add').click();
    await page.locator('.day-pick[data-day="wed"]').click();

    await page.goto('/?list=week');
    await expect(page.locator('.day-column[data-day="wed"] .slot-name')).toHaveText('Pasta');
});

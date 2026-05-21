const { test, expect } = require('./fixtures');

// Regression: in mock mode, a fresh visit to '/' must auto-seed the demo
// library so the home page shows a 'library' list to click into. Previously
// the seed only ran when rendering ?list=library, leaving fresh localhost
// users with an empty home page and no way to discover the library.

test('home page seeds and lists library on fresh localStorage (mock mode)', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.goto('/');

    var link = page.locator('.home-list-item a', { hasText: 'library' });
    await expect(link).toBeVisible();

    await link.click();
    await expect(page.locator('.library-card .library-name').first()).toBeVisible();
    var count = await page.locator('.library-card').count();
    expect(count).toBeGreaterThanOrEqual(5);
});

test('seed does not duplicate on second visit', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());

    await page.goto('/');
    await expect(page.locator('.home-list-item a', { hasText: 'library' })).toBeVisible();
    var firstCount = await page.evaluate(() => {
        return JSON.parse(localStorage.getItem('listlet_listlet_meals_library') || '[]').length;
    });

    await page.goto('/');
    await expect(page.locator('.home-list-item a', { hasText: 'library' })).toBeVisible();
    var secondCount = await page.evaluate(() => {
        return JSON.parse(localStorage.getItem('listlet_listlet_meals_library') || '[]').length;
    });

    expect(secondCount).toBe(firstCount);
});

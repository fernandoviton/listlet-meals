const { test, expect } = require('./fixtures');

// The planner is a real, dated Saturday-start week anchored by ?date=. These
// specs use a fixed anchor so they're deterministic; the default-date / today
// cases compute the expected dates in Node (same wall-clock day as the headless
// browser).

const SAT = '2026-06-06';

async function seedEmpty(page) {
    await page.goto('/');
    await page.evaluate(() => {
        localStorage.clear();
        // A non-empty library suppresses the demo auto-seed without adding slots.
        localStorage.setItem('listlet_listlet_meals_library', JSON.stringify([{
            id: 'lib-x', list_name: 'library',
            content: JSON.stringify({ kind: 'meal', name: 'X', recipe: { ingredients: [], steps: [] }, default_meal_type: 'dinner', macros: {} }),
            created_at: new Date().toISOString(), updated_at: new Date().toISOString()
        }]));
    });
}

test('the week is anchored on the ?date= param (Sat→Fri headers)', async ({ page }) => {
    await seedEmpty(page);
    await page.goto('/?list=week&date=' + SAT);

    await expect(page.locator('.day-header .day-label')).toHaveText([
        'Sat 6/6', 'Sun 6/7', 'Mon 6/8', 'Tue 6/9', 'Wed 6/10', 'Thu 6/11', 'Fri 6/12'
    ]);
    await expect(page.locator('.week-nav-label')).toHaveText('Week of Sat 6/6');
});

test('a mid-week date snaps to the Saturday-start week containing it', async ({ page }) => {
    await seedEmpty(page);
    await page.goto('/?list=week&date=2026-06-10'); // Wednesday

    await expect(page.locator('.week-nav-label')).toHaveText('Week of Sat 6/6');
    await expect(page.locator('.day-column[data-date="2026-06-06"]')).toHaveCount(1);
});

test('next / prev links move the anchor by a week', async ({ page }) => {
    await seedEmpty(page);
    await page.goto('/?list=week&date=' + SAT);

    await page.locator('.week-nav-arrow', { hasText: '›' }).click();
    await expect(page).toHaveURL(/date=2026-06-13/);
    await expect(page.locator('.week-nav-label')).toHaveText('Week of Sat 6/13');

    await page.locator('.week-nav-arrow', { hasText: '‹' }).click();
    await expect(page).toHaveURL(/date=2026-06-06/);
    await expect(page.locator('.week-nav-label')).toHaveText('Week of Sat 6/6');
});

test('the next arrow keeps the anchor (never collapses to a bare ?list=week) across reloads', async ({ page }) => {
    await seedEmpty(page);
    await page.goto('/?list=week&date=' + SAT);

    // The arrow must always carry an explicit ?date= — i.e. it must NOT look like
    // the Today link (bare ?list=week), which is the bug being guarded against.
    const next = page.locator('.week-nav-arrow', { hasText: '›' });
    await expect(next).toHaveAttribute('href', /date=2026-06-13/);

    await next.click();
    await expect(page).toHaveURL(/date=2026-06-13/);

    // A second hop (full reload in between) keeps advancing, not snapping back.
    await page.locator('.week-nav-arrow', { hasText: '›' }).click();
    await expect(page).toHaveURL(/date=2026-06-20/);
    await expect(page.locator('.day-column').first()).toHaveAttribute('data-date', '2026-06-20');
});

test('the Today link — and only it — collapses to a bare ?list=week', async ({ page }) => {
    await seedEmpty(page);
    await page.goto('/?list=week&date=' + SAT);

    await expect(page.locator('.week-nav-today')).toHaveAttribute('href', '?list=week');
    // The arrows must not share the Today link's bare href.
    await expect(page.locator('.week-nav-arrow', { hasText: '›' })).not.toHaveAttribute('href', '?list=week');
    await expect(page.locator('.week-nav-arrow', { hasText: '‹' })).not.toHaveAttribute('href', '?list=week');
});

test('the Today link drops the date param and highlights today', async ({ page }) => {
    await seedEmpty(page);
    await page.goto('/?list=week&date=' + SAT);

    await page.locator('.week-nav-today').click();

    // No date param → today's local week. Exactly one column carries .today, and
    // it is today's date.
    const todayIso = await page.evaluate(() => {
        const d = new Date();
        const p = n => (n < 10 ? '0' : '') + n;
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
    });
    await expect(page.locator('.day-column.today')).toHaveCount(1);
    await expect(page.locator('.day-column.today')).toHaveAttribute('data-date', todayIso);
});

test('an off-week anchor shows no today highlight', async ({ page }) => {
    await seedEmpty(page);
    await page.goto('/?list=week&date=2020-01-01'); // a long-past week, never "today"

    await expect(page.locator('.day-column.today')).toHaveCount(0);
});

test('the planner links to the trends view', async ({ page }) => {
    await seedEmpty(page);
    await page.goto('/?list=week&date=' + SAT);

    const trends = page.locator('.week-nav-trends');
    await expect(trends).toBeVisible();
    await expect(trends).toHaveAttribute('href', /view=trends/);
});

test('nav links preserve the current list name (not hardcoded ?list=week)', async ({ page }) => {
    await seedEmpty(page);
    // Open the planner under a NON-default list name. The nav links must point
    // back at this same list — they currently hardcode ?list=week, which
    // silently switches the user to a different list's data.
    await page.goto('/?list=groceries&date=' + SAT);

    await expect(page.locator('.week-nav-arrow', { hasText: '‹' })).toHaveAttribute('href', /list=groceries/);
    await expect(page.locator('.week-nav-arrow', { hasText: '›' })).toHaveAttribute('href', /list=groceries/);
    await expect(page.locator('.week-nav-today')).toHaveAttribute('href', /list=groceries/);
    await expect(page.locator('.week-nav-trends')).toHaveAttribute('href', /list=groceries/);
});

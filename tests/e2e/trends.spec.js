const { test, expect } = require('./fixtures');

// Trends is a read-only view (?list=week&view=trends) over the dated week list.
// Anchor 2026-06-06 (Sat) so ranges are deterministic: the range ends at the
// anchored week's Friday and extends `range` Saturdays back.

const ANCHOR = '2026-06-06';

function slotRow(id, date, libraryId) {
    const now = new Date().toISOString();
    return {
        id: id,
        list_name: 'week',
        content: JSON.stringify({ kind: 'slot', library_id: libraryId, date: date, meal_type: 'dinner', order: 0 }),
        created_at: now,
        updated_at: now
    };
}

function libRow(id, name, macros) {
    const now = new Date().toISOString();
    return {
        id: id,
        list_name: 'library',
        content: JSON.stringify({
            kind: 'meal', name: name, recipe: { ingredients: [], steps: [] },
            default_meal_type: 'dinner', macros: macros || {}
        }),
        created_at: now,
        updated_at: now
    };
}

async function seed(page, week, library) {
    await page.goto('/');
    await page.evaluate(({ week, library }) => {
        localStorage.clear();
        localStorage.setItem('listlet_listlet_meals_week', JSON.stringify(week));
        localStorage.setItem('listlet_listlet_meals_library', JSON.stringify(library));
    }, { week, library });
}

// One day in the 2026-05-30 week and two in the 2026-06-06 week.
const WEEK = [
    slotRow('a', '2026-05-31', 'lib-p'),
    slotRow('b', '2026-06-06', 'lib-p'),
    slotRow('c', '2026-06-08', 'lib-q')
];
const LIBRARY = [
    libRow('lib-p', 'Pasta', { cal: 600, protein: 30 }),
    libRow('lib-q', 'Salad', { cal: 200, protein: 10 })
];

test('trends table shows weekly averages over days logged', async ({ page }) => {
    await seed(page, WEEK, LIBRARY);
    await page.goto('/?list=week&view=trends&date=' + ANCHOR + '&range=2');

    // Two week rows in range.
    await expect(page.locator('.trends-row')).toHaveCount(2);

    // 2026-05-30 week: one logged day (600 cal).
    await expect(page.locator('.trends-row[data-week="2026-05-30"] .tcell-cal')).toHaveText('600');
    // 2026-06-06 week: (600 + 200) / 2 = 400 cal avg over 2 logged days.
    await expect(page.locator('.trends-row[data-week="2026-06-06"] .tcell-cal')).toHaveText('400');
    await expect(page.locator('.trends-row[data-week="2026-06-06"] .tcell-days')).toHaveText('2');
});

test('trends renders a bar for a seeded date', async ({ page }) => {
    await seed(page, WEEK, LIBRARY);
    await page.goto('/?list=week&view=trends&date=' + ANCHOR + '&range=2');

    await expect(page.locator('.trends-chart')).toHaveCount(2); // cal + protein
    await expect(page.locator('.trends-bar[data-date="2026-06-06"]').first()).toBeVisible();
});

test('day-axis tick labels are HTML, not text inside the stretched SVG', async ({ page }) => {
    await seed(page, WEEK, LIBRARY);
    await page.goto('/?list=week&view=trends&date=' + ANCHOR + '&range=2');

    // The bar SVG fills width via preserveAspectRatio="none", so any <text> inside
    // it is stretched horizontally with it (digits visibly spread apart). Tick
    // labels must live in HTML beside the SVG instead.
    await expect(page.locator('.trends-chart text')).toHaveCount(0);

    const axis = page.locator('.trends-section').first().locator('.trends-axis');
    await expect(axis.locator('.trends-tick')).toHaveCount(2); // two Saturdays in range
    await expect(axis.locator('.trends-tick').first()).toHaveText('5/30');
    await expect(axis.locator('.trends-tick').nth(1)).toHaveText('6/6');
});

test('range pills navigate and change the number of weeks shown', async ({ page }) => {
    await seed(page, WEEK, LIBRARY);
    await page.goto('/?list=week&view=trends&date=' + ANCHOR + '&range=2');
    await expect(page.locator('.trends-row')).toHaveCount(2);

    await page.locator('.trends-pill[data-range="12"]').click();
    await expect(page).toHaveURL(/range=12/);
    await expect(page.locator('.trends-row')).toHaveCount(12);
});

test('a back link returns to the planner at the same anchor', async ({ page }) => {
    await seed(page, WEEK, LIBRARY);
    await page.goto('/?list=week&view=trends&date=' + ANCHOR + '&range=2');

    const back = page.locator('.trends-back');
    await expect(back).toBeVisible();
    await expect(back).toHaveAttribute('href', /date=2026-06-06/);
    await expect(back).not.toHaveAttribute('href', /view=trends/);
});

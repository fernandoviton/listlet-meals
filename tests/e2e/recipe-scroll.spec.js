const { test, expect } = require('@playwright/test');

// When the recipe modal is open, wheel/touch gestures must act on the dialog,
// not scroll the page behind it ("the back control"). A native modal dialog
// makes the background inert but does NOT lock background scrolling, so this
// is enforced via CSS (html:has(dialog[open]) { overflow: hidden }) plus an
// internal scroll region on the dialog body.

function slotItem(id, day, order, name) {
    const now = new Date().toISOString();
    return {
        id: id,
        list_name: 'week',
        content: JSON.stringify({
            kind: 'slot',
            library_id: 'lib-' + id,
            day: day,
            meal_type: 'lunch',
            order: order,
            name_snapshot: name,
            macros_snapshot: {}
        }),
        created_at: now,
        updated_at: now
    };
}

test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
        window.CONFIG = {
            SUPABASE_URL: null,
            SUPABASE_PUBLISHABLE_KEY: null,
            APP_TITLE: 'Listlet Meals',
            DB_TABLE: 'listlet_meals',
            DEFAULT_LIST_NAME: 'week'
        };
    });
});

async function seed(page, week) {
    await page.goto('/');
    await page.evaluate((week) => {
        localStorage.clear();
        localStorage.setItem('listlet_listlet_meals_week', JSON.stringify(week));
    }, week);
}

// A handful of slots across days + a short viewport so the document overflows
// and window.scrollY can move if the background is not locked.
const WEEK = [
    slotItem('s1', 'mon', 0, 'Pasta'),
    slotItem('s2', 'tue', 0, 'Soup'),
    slotItem('s3', 'wed', 0, 'Salad'),
    slotItem('s4', 'thu', 0, 'Wrap'),
    slotItem('s5', 'fri', 0, 'Curry')
];

test('wheel over the open recipe modal does not scroll the page behind it', async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 400 });
    await seed(page, WEEK);
    await page.goto('/?list=week');

    // Sanity: the document is actually scrollable.
    const scrollable = await page.evaluate(() =>
        document.documentElement.scrollHeight > window.innerHeight);
    expect(scrollable).toBe(true);

    await page.locator('.day-column[data-day="mon"] .slot-card .slot-name').click();
    const dialog = page.locator('#recipe-dialog');
    await expect(dialog).toHaveAttribute('open', '');

    const before = await page.evaluate(() => window.scrollY);

    // Wheel with the cursor over the dialog.
    const box = await dialog.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(100);

    const after = await page.evaluate(() => window.scrollY);
    expect(after).toBe(before);
});

test('the root is scroll-locked and the dialog body scrolls while the modal is open', async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 400 });
    await seed(page, WEEK);
    await page.goto('/?list=week');

    await page.locator('.day-column[data-day="mon"] .slot-card .slot-name').click();
    await expect(page.locator('#recipe-dialog')).toHaveAttribute('open', '');

    const styles = await page.evaluate(() => {
        const root = getComputedStyle(document.documentElement).overflow;
        const body = getComputedStyle(document.querySelector('#recipe-dialog .dialog-body')).overflowY;
        return { root, body };
    });
    expect(styles.root).toBe('hidden');
    expect(styles.body).toBe('auto');

    // Closing the modal releases the lock.
    await page.locator('#recipe-dialog .dialog-close').click();
    await expect(page.locator('#recipe-dialog')).not.toHaveAttribute('open', '');
    const rootAfter = await page.evaluate(() =>
        getComputedStyle(document.documentElement).overflow);
    expect(rootAfter).not.toBe('hidden');
});

const { test, expect } = require('./fixtures');

function captureRow(id, text, opts) {
    opts = opts || {};
    const now = new Date().toISOString();
    return {
        id: id,
        list_name: 'capture',
        content: JSON.stringify({
            kind: 'capture',
            text: text,
            at: opts.at || now,
            source: opts.source || 'shortcut',
            processed_at: opts.processed_at || null,
            note: opts.note
        }),
        created_at: now,
        updated_at: now
    };
}

async function seedCaptures(page, rows) {
    await page.goto('/');
    await page.evaluate((rows) => {
        localStorage.clear();
        if (rows) localStorage.setItem('listlet_listlet_meals_capture', JSON.stringify(rows));
    }, rows || null);
}

test('manual capture: typing + submit appends a new capture and persists', async ({ page }) => {
    await seedCaptures(page, []);
    await page.goto('/?list=capture');

    await page.locator('.capture-input').fill('smoothie and a banana');
    await page.locator('.capture-submit').click();

    await expect(page.locator('.capture-status')).toHaveClass(/status-ok/);
    const item = page.locator('.capture-item').first();
    await expect(item.locator('.capture-text')).toHaveText('smoothie and a banana');
    await expect(item.locator('.capture-badge')).toHaveText('new');
    await expect(page.locator('.captures-count')).toHaveText('1 capture');

    // Survives a reload (written to the capture list).
    await page.reload();
    await expect(page.locator('.capture-item .capture-text')).toHaveText('smoothie and a banana');
});

test('shortcut auto-capture: ?text= is stored verbatim with its event time', async ({ page }) => {
    await seedCaptures(page, []);
    await page.goto('/?list=capture&text=' + encodeURIComponent('upset stomach right now') + '&at=2026-06-27T14:03:00Z&source=shortcut');

    await expect(page.locator('.capture-status')).toContainText('upset stomach right now');
    const item = page.locator('.capture-item').first();
    await expect(item.locator('.capture-text')).toHaveText('upset stomach right now');
    await expect(item.locator('.capture-source')).toHaveText('shortcut');

    // The capture params are stripped so a reload can't double-capture.
    await expect(page).toHaveURL(/\?list=capture$/);
    await page.reload();
    await expect(page.locator('.capture-item')).toHaveCount(1);
});

test('planner week nav links to the capture log', async ({ page }) => {
    await seedCaptures(page, []);
    await page.goto('/?list=planner');

    const log = page.locator('.week-nav-log');
    await expect(log).toHaveAttribute('href', /\?list=capture$/);
    await log.click();
    await expect(page).toHaveURL(/\?list=capture$/);
    await expect(page.locator('.capture-box')).toBeVisible();
});

test('capture log exposes the upload URL and an iOS Shortcut help dialog', async ({ page }) => {
    await seedCaptures(page, []);
    await page.goto('/?list=capture');

    // The page surfaces the capture endpoint URL so a Shortcut can target it.
    const url = page.locator('.capture-url-value');
    await expect(url).toContainText('?list=capture');

    // Help is hidden until asked for, then reveals the Shortcut build steps + URL template.
    const help = page.locator('.capture-help-dialog');
    await expect(help).toBeHidden();
    await page.locator('.capture-help-btn').click();
    await expect(help).toBeVisible();
    await expect(help).toContainText('Shortcut');
    await expect(help.locator('.capture-shortcut-url')).toContainText('text=');
});

test('a background sync does not clobber in-progress capture text', async ({ page }) => {
    await seedCaptures(page, []);
    await page.goto('/?list=capture');

    const input = page.locator('.capture-input');
    await input.click();
    await input.fill('half typed note about lunch');

    // Simulate the 30s poll tick (Sync) firing mid-typing. It must not rebuild
    // the textarea out from under the user and lose what they've typed.
    await page.evaluate(() => window.Sync.manualRefresh());

    await expect(input).toHaveValue('half typed note about lunch');
});

test('processed capture renders the reconciled badge + note and dims', async ({ page }) => {
    await seedCaptures(page, [
        captureRow('cap-1', 'oatmeal', { processed_at: '2026-06-27T09:00:00Z', note: 'placed Oatmeal (breakfast)' })
    ]);
    await page.goto('/?list=capture');

    const item = page.locator('.capture-item').first();
    await expect(item).toHaveClass(/is-processed/);
    await expect(item.locator('.capture-badge')).toHaveText('reconciled');
    await expect(item.locator('.capture-note')).toHaveText('placed Oatmeal (breakfast)');
    await expect(page.locator('.captures-unprocessed')).toHaveText('0 to reconcile');
});

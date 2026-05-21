const { test, expect, devices } = require('@playwright/test');

// Touch-based drag/drop using pointer events. Uses a mobile Chromium
// preset so hasTouch is true and the app exposes the touch code path.
test.use({ ...devices['Pixel 5'] });

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

// Dispatch a synthetic touch-typed pointer-event sequence: a long press
// (holdMs > LONG_PRESS_MS in app.js) then a drag to (tx, ty).
async function touchDrag(page, fromSelector, toSelector, opts) {
    opts = opts || {};
    const holdMs = opts.holdMs == null ? 400 : opts.holdMs;
    await page.evaluate(async ({ fromSelector, toSelector, holdMs }) => {
        // Pull the source to top so the destination is also reachable
        // within the viewport on mobile (where columns stack vertically).
        document.querySelector(fromSelector).scrollIntoView({ block: 'start' });
        await new Promise(r => requestAnimationFrame(r));
        function center(sel) {
            const el = document.querySelector(sel);
            const r = el.getBoundingClientRect();
            return { el, x: r.left + r.width / 2, y: r.top + r.height / 2 };
        }
        function fire(target, type, x, y) {
            const ev = new PointerEvent(type, {
                bubbles: true,
                cancelable: true,
                pointerId: 1,
                pointerType: 'touch',
                clientX: x,
                clientY: y,
                button: 0,
                buttons: type === 'pointerup' ? 0 : 1
            });
            target.dispatchEvent(ev);
        }
        const from = center(fromSelector);
        const to = center(toSelector);
        const handle = from.el.querySelector('.slot-name') || from.el;
        fire(handle, 'pointerdown', from.x, from.y);
        await new Promise(r => setTimeout(r, holdMs));
        const steps = 8;
        for (let i = 1; i <= steps; i++) {
            const x = from.x + (to.x - from.x) * (i / steps);
            const y = from.y + (to.y - from.y) * (i / steps);
            fire(window, 'pointermove', x, y);
            await new Promise(r => setTimeout(r, 10));
        }
        fire(window, 'pointerup', to.x, to.y);
    }, { fromSelector, toSelector, holdMs });
}

test('long-press touch-drag moves a slot from Mon to Wed and persists', async ({ page }) => {
    await seed(page, [slotItem('s1', 'mon', 0, 'Pasta')]);
    await page.goto('/?list=week');

    await touchDrag(page,
        '.day-column[data-day="mon"] .slot-card',
        '.day-column[data-day="wed"]');

    await expect(page.locator('.day-column[data-day="wed"] .slot-name')).toHaveText(['Pasta']);
    await expect(page.locator('.day-column[data-day="mon"] .slot-card')).toHaveCount(0);

    await page.waitForTimeout(400);
    await page.goto('/?list=week');
    await expect(page.locator('.day-column[data-day="wed"] .slot-name')).toHaveText(['Pasta']);
});

test('tap without long-press does NOT start a drag', async ({ page }) => {
    await seed(page, [slotItem('s1', 'mon', 0, 'Pasta')]);
    await page.goto('/?list=week');

    // Quick "tap then move" — under the long-press threshold, with motion that
    // exceeds the move-cancel distance — should leave the slot in place.
    await touchDrag(page,
        '.day-column[data-day="mon"] .slot-card',
        '.day-column[data-day="wed"]',
        { holdMs: 50 });

    await expect(page.locator('.day-column[data-day="mon"] .slot-name')).toHaveText(['Pasta']);
    await expect(page.locator('.day-column[data-day="wed"] .slot-card')).toHaveCount(0);
});

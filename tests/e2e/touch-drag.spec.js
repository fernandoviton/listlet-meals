const { test, expect, devices } = require('@playwright/test');

// Touch-based drag/drop using pointer events. Uses a mobile Chromium
// preset so hasTouch is true and the app exposes the touch code path.
test.use({ ...devices['Pixel 5'] });

const SAT = '2026-06-06';
const MON = '2026-06-08';
const WED = '2026-06-10';

function slotItem(id, date, order, name) {
    const now = new Date().toISOString();
    return {
        id: id,
        list_name: 'week',
        content: JSON.stringify({
            kind: 'slot',
            library_id: 'lib-' + id,
            date: date,
            meal_type: 'lunch',
            order: order
        }),
        created_at: now,
        updated_at: now
    };
}

// The week joins live to the library by library_id; seed a matching library row
// (id 'lib-' + slotId) so each slot resolves its name instead of falling back.
function libraryItem(id, name) {
    const now = new Date().toISOString();
    return {
        id: id,
        list_name: 'library',
        content: JSON.stringify({
            kind: 'meal',
            name: name,
            recipe: { ingredients: [], steps: [] },
            default_meal_type: 'lunch',
            macros: {}
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
            DB_TABLE: 'listlet_meals'
        };
    });
});

async function seed(page, week, library) {
    await page.goto('/');
    await page.evaluate(({ week, library }) => {
        localStorage.clear();
        localStorage.setItem('listlet_listlet_meals_planner', JSON.stringify(week));
        localStorage.setItem('listlet_listlet_meals_library', JSON.stringify(library || []));
    }, { week, library });
}

// Dispatch a synthetic touch-typed pointer-event sequence: pointerdown on
// the slot-card's grab handle, then drag to the target. No long-press —
// drag begins immediately on pointerdown on .slot-grab.
async function touchDrag(page, fromSelector, toSelector, opts) {
    opts = opts || {};
    const holdMs = opts.holdMs == null ? 20 : opts.holdMs;
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
        // Always grab via .slot-grab. The handle's center may differ from
        // the card's center, so use the handle's own rect for pointerdown.
        const handle = from.el.querySelector('.slot-grab');
        if (!handle) throw new Error('no .slot-grab in source card');
        const hr = handle.getBoundingClientRect();
        const hx = hr.left + hr.width / 2;
        const hy = hr.top + hr.height / 2;
        fire(handle, 'pointerdown', hx, hy);
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

test('touch-drag from the grab handle moves a slot from Mon to Wed and persists', async ({ page }) => {
    await seed(page, [slotItem('s1', MON, 0, 'Pasta')], [libraryItem('lib-s1', 'Pasta')]);
    await page.goto('/?list=planner&date=' + SAT);

    await touchDrag(page,
        '.day-column[data-date="' + MON + '"] .slot-card',
        '.day-column[data-date="' + WED + '"]');

    await expect(page.locator('.day-column[data-date="' + WED + '"] .slot-name')).toHaveText(['Pasta']);
    await expect(page.locator('.day-column[data-date="' + MON + '"] .slot-card')).toHaveCount(0);

    await page.waitForTimeout(400);
    await page.goto('/?list=planner&date=' + SAT);
    await expect(page.locator('.day-column[data-date="' + WED + '"] .slot-name')).toHaveText(['Pasta']);
});

test('tapping the card body (not the handle) opens the recipe modal and does NOT move the slot', async ({ page }) => {
    await seed(page, [slotItem('s1', MON, 0, 'Pasta')], [libraryItem('lib-s1', 'Pasta')]);
    await page.goto('/?list=planner&date=' + SAT);

    // Tap the slot-name (card body), not the grab handle — should open the
    // recipe modal and leave the slot in Mon.
    const name = page.locator('.day-column[data-date="' + MON + '"] .slot-card .slot-name');
    await name.tap();

    await expect(page.locator('#recipe-dialog')).toHaveAttribute('open', '');
    await expect(page.locator('.day-column[data-date="' + MON + '"] .slot-name')).toHaveText(['Pasta']);
    await expect(page.locator('.day-column[data-date="' + WED + '"] .slot-card')).toHaveCount(0);
});

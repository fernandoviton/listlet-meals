// listlet-meals app shell. Render + event-wiring only.
// All state transformations live in MealsCore.

var App = (function() {
    var DAYS = ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri'];
    var DAY_LABELS = {
        sat: 'Sat', sun: 'Sun', mon: 'Mon', tue: 'Tue',
        wed: 'Wed', thu: 'Thu', fri: 'Fri'
    };

    var container = null;
    var api = null;
    var libraryApi = null;
    var listName = null;
    var items = [];
    var libraryCache = null;
    var currentFilter = 'all';

    function init(el, name) {
        container = el;
        listName = name;
        api = createApi(name);

        Sync.init(api, function(fresh) {
            items = fresh || [];
            render();
        });

        loadAndRender();
    }

    async function loadAndRender() {
        container.innerHTML = '<div class="loading">Loading...</div>';
        try {
            items = await api.fetchItems();
            render();
        } catch (err) {
            container.innerHTML = '<div class="error">Failed to load: ' + escapeHtml(err.message) + '</div>';
        }
    }

    async function getLibraryMeal(libraryId) {
        if (!libraryApi) libraryApi = createApi('library');
        if (!libraryCache) libraryCache = await libraryApi.fetchItems();
        for (var i = 0; i < libraryCache.length; i++) {
            if (libraryCache[i].id === libraryId) {
                return MealsCore.parseContent(libraryCache[i].content) || {};
            }
        }
        return {};
    }

    function render() {
        if (listName === 'library') {
            renderLibrary();
        } else {
            renderWeek();
        }
    }

    function parseSlots() {
        var slots = [];
        for (var i = 0; i < items.length; i++) {
            var parsed = MealsCore.parseContent(items[i].content);
            if (parsed && parsed.kind === 'slot') {
                parsed.id = items[i].id;
                slots.push(parsed);
            }
        }
        return slots;
    }

    function renderWeek() {
        var allSlots = parseSlots();
        var slots = MealsCore.filterSlotsByType(allSlots, currentFilter);

        var html = '<div class="planner">';
        html += renderFilterBar();
        html += '<div class="week-grid">';
        for (var d = 0; d < DAYS.length; d++) {
            var day = DAYS[d];
            var daySlots = slots
                .filter(function(s) { return s.day === day; })
                .sort(function(a, b) { return a.order - b.order; });

            html += '<div class="day-column" data-day="' + day + '">';
            html += '<div class="day-header">' +
                '<span class="day-label">' + DAY_LABELS[day] + '</span>' +
                '<button type="button" class="day-add" data-day="' + day + '" title="Add meal">+</button>' +
                '</div>';
            html += '<div class="day-slots">';
            for (var i = 0; i < daySlots.length; i++) {
                html += renderSlotCard(daySlots[i]);
            }
            html += '</div>';
            html += '<div class="day-summary" data-day="' + day + '">' +
                renderSummary(MealsCore.summarizeMacros(daySlots)) + '</div>';
            html += '</div>';
        }
        html += '</div></div>';
        html += '<dialog id="recipe-dialog"><div class="dialog-body"></div><button class="dialog-close" type="button">Close</button></dialog>';
        html += '<dialog id="picker-dialog">' +
            '<div class="picker-header">Add meal to <span class="picker-day"></span></div>' +
            '<div class="picker-body"></div>' +
            '<button class="picker-close" type="button">Cancel</button>' +
            '</dialog>';
        container.innerHTML = html;

        bindCardEvents();
        bindFilterEvents();
        bindDragEvents();
        bindAddDayEvents();
    }

    var saveTimer = null;
    var LONG_PRESS_MS = 300;
    var MOVE_CANCEL_PX = 10;
    var dragState = null;

    function bindDragEvents() {
        var handles = container.querySelectorAll('.slot-card .slot-name');
        for (var i = 0; i < handles.length; i++) {
            handles[i].addEventListener('pointerdown', onHandlePointerDown);
        }
    }

    function onHandlePointerDown(e) {
        // Ignore non-primary mouse buttons.
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        var card = e.target.closest('.slot-card');
        if (!card) return;

        // Mouse: start drag immediately so desktop UX stays snappy.
        // Touch / pen: require a long-press so taps + scrolls still work.
        var immediate = e.pointerType === 'mouse';

        dragState = {
            id: card.dataset.id,
            card: card,
            pointerId: e.pointerId,
            captureTarget: e.target,
            startX: e.clientX,
            startY: e.clientY,
            started: false,
            ghost: null,
            lastColumn: null,
            longPressTimer: null
        };

        // Capture immediately so the browser routes every move/up to us
        // even if the finger drifts off the handle. Without this, Edge/
        // Chromium devtools touch emulation can hand the gesture to the
        // page scroller before our long-press fires.
        try { e.target.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }

        if (immediate) {
            beginDrag(e);
        } else {
            dragState.longPressTimer = setTimeout(function() {
                if (dragState && !dragState.started) beginDrag(e);
            }, LONG_PRESS_MS);
        }

        window.addEventListener('pointermove', onWindowPointerMove);
        window.addEventListener('pointerup', onWindowPointerUp);
        window.addEventListener('pointercancel', onWindowPointerCancel);
    }

    function beginDrag(e) {
        if (!dragState) return;
        dragState.started = true;
        var card = dragState.card;
        var rect = card.getBoundingClientRect();
        var ghost = card.cloneNode(true);
        ghost.classList.add('slot-ghost');
        ghost.style.position = 'fixed';
        ghost.style.left = rect.left + 'px';
        ghost.style.top = rect.top + 'px';
        ghost.style.width = rect.width + 'px';
        ghost.style.pointerEvents = 'none';
        ghost.style.zIndex = '9999';
        document.body.appendChild(ghost);
        dragState.ghost = ghost;
        dragState.offsetX = e.clientX - rect.left;
        dragState.offsetY = e.clientY - rect.top;
        card.classList.add('slot-dragging');
        document.body.style.userSelect = 'none';
        document.body.style.touchAction = 'none';
    }

    function onWindowPointerMove(e) {
        if (!dragState || e.pointerId !== dragState.pointerId) return;

        if (!dragState.started) {
            var dx = e.clientX - dragState.startX;
            var dy = e.clientY - dragState.startY;
            if (Math.sqrt(dx * dx + dy * dy) > MOVE_CANCEL_PX) {
                // Moved before long-press fired — treat as scroll/tap, abort.
                cleanupDrag();
            }
            return;
        }

        var g = dragState.ghost;
        g.style.left = (e.clientX - dragState.offsetX) + 'px';
        g.style.top = (e.clientY - dragState.offsetY) + 'px';

        var col = columnAtPoint(e.clientX, e.clientY);
        if (col !== dragState.lastColumn) {
            if (dragState.lastColumn) dragState.lastColumn.classList.remove('drag-over');
            if (col) col.classList.add('drag-over');
            dragState.lastColumn = col;
        }
    }

    function columnAtPoint(x, y) {
        // Hide the ghost briefly so elementFromPoint sees what's underneath.
        var g = dragState && dragState.ghost;
        if (g) g.style.display = 'none';
        var el = document.elementFromPoint(x, y);
        if (g) g.style.display = '';
        if (!el) return null;
        return el.closest('.day-column');
    }

    function onWindowPointerUp(e) {
        if (!dragState || e.pointerId !== dragState.pointerId) return;
        if (!dragState.started) { cleanupDrag(); return; }

        var col = columnAtPoint(e.clientX, e.clientY);
        var id = dragState.id;
        cleanupDrag();

        if (!col) return;
        var toDay = col.dataset.day;
        commitMove(id, toDay);
    }

    function onWindowPointerCancel(e) {
        if (!dragState || e.pointerId !== dragState.pointerId) return;
        cleanupDrag();
    }

    function cleanupDrag() {
        if (!dragState) return;
        if (dragState.longPressTimer) clearTimeout(dragState.longPressTimer);
        if (dragState.ghost && dragState.ghost.parentNode) {
            dragState.ghost.parentNode.removeChild(dragState.ghost);
        }
        if (dragState.card) dragState.card.classList.remove('slot-dragging');
        if (dragState.lastColumn) dragState.lastColumn.classList.remove('drag-over');
        document.body.style.userSelect = '';
        document.body.style.touchAction = '';
        dragState = null;
        window.removeEventListener('pointermove', onWindowPointerMove);
        window.removeEventListener('pointerup', onWindowPointerUp);
        window.removeEventListener('pointercancel', onWindowPointerCancel);
    }

    function commitMove(id, toDay) {
        var slotsArr = parseSlots();
        var before = JSON.parse(JSON.stringify(slotsArr));
        var toIndex = slotsArr.filter(function(s) { return s.day === toDay && s.id !== id; }).length;
        var moved = MealsCore.moveSlot(slotsArr, id, toDay, toIndex);

        var beforeById = {};
        before.forEach(function(s) { beforeById[s.id] = s; });
        var changed = moved.filter(function(s) {
            var b = beforeById[s.id];
            return !b || b.day !== s.day || b.order !== s.order;
        });

        for (var k = 0; k < items.length; k++) {
            var slot = MealsCore.parseContent(items[k].content);
            if (!slot || slot.kind !== 'slot') continue;
            for (var m = 0; m < moved.length; m++) {
                if (moved[m].id === items[k].id) {
                    slot.day = moved[m].day;
                    slot.order = moved[m].order;
                    items[k].content = MealsCore.serialize(slot);
                    break;
                }
            }
        }
        render();

        clearTimeout(saveTimer);
        saveTimer = setTimeout(async function() {
            for (var n = 0; n < changed.length; n++) {
                var c = changed[n];
                var srcItem = null;
                for (var p = 0; p < items.length; p++) {
                    if (items[p].id === c.id) { srcItem = items[p]; break; }
                }
                if (!srcItem) continue;
                try {
                    await api.updateItem(c.id, { content: srcItem.content });
                } catch (err) {
                    console.error('Save failed:', err);
                }
            }
        }, 300);
    }

    function renderFilterBar() {
        var pills = [
            { key: 'all', label: 'All' },
            { key: 'breakfast', label: 'Breakfast' },
            { key: 'lunch', label: 'Lunch' },
            { key: 'dinner', label: 'Dinner' },
            { key: 'snack', label: 'Snack' }
        ];
        var html = '<div class="filter-bar">';
        for (var i = 0; i < pills.length; i++) {
            var p = pills[i];
            var cls = 'filter-pill' + (p.key === currentFilter ? ' active' : '');
            html += '<button type="button" class="' + cls + '" data-filter="' + p.key + '">' + p.label + '</button>';
        }
        html += '</div>';
        return html;
    }

    function bindFilterEvents() {
        var pills = container.querySelectorAll('.filter-pill');
        for (var i = 0; i < pills.length; i++) {
            pills[i].addEventListener('click', function(e) {
                currentFilter = e.target.dataset.filter;
                render();
            });
        }
    }

    function bindAddDayEvents() {
        var addBtns = container.querySelectorAll('.day-add');
        for (var i = 0; i < addBtns.length; i++) {
            addBtns[i].addEventListener('click', onOpenPicker);
        }
        var dialog = document.getElementById('picker-dialog');
        if (dialog) {
            dialog.querySelector('.picker-close').addEventListener('click', function() { dialog.close(); });
            dialog.addEventListener('click', function(e) {
                if (e.target === dialog) dialog.close();
            });
        }
    }

    async function onOpenPicker(e) {
        var day = e.currentTarget.dataset.day;
        var dialog = document.getElementById('picker-dialog');
        var bodyEl = dialog.querySelector('.picker-body');
        dialog.querySelector('.picker-day').textContent = DAY_LABELS[day] || day;
        dialog.dataset.day = day;
        bodyEl.innerHTML = '<div class="picker-loading">Loading…</div>';
        if (typeof dialog.showModal === 'function') dialog.showModal();

        if (!libraryApi) libraryApi = createApi('library');
        var libItems;
        try {
            libItems = await libraryApi.fetchItems();
            libraryCache = libItems;
        } catch (err) {
            bodyEl.innerHTML = '<div class="picker-empty">Failed to load library.</div>';
            return;
        }

        var meals = MealsCore.summarizeLibrary(libItems);
        if (!meals.length) {
            bodyEl.innerHTML = '<div class="picker-empty">No meals in library yet.</div>';
            return;
        }
        var html = '';
        for (var i = 0; i < meals.length; i++) {
            html += '<button type="button" class="picker-meal" data-id="' + escapeHtml(meals[i].id) + '">' +
                escapeHtml(meals[i].name || '(unnamed)') + '</button>';
        }
        bodyEl.innerHTML = html;
        var btns = bodyEl.querySelectorAll('.picker-meal');
        for (var j = 0; j < btns.length; j++) {
            btns[j].addEventListener('click', onPickMeal);
        }
    }

    async function onPickMeal(e) {
        var btn = e.currentTarget;
        var libraryItemId = btn.dataset.id;
        var dialog = document.getElementById('picker-dialog');
        var day = dialog.dataset.day;
        var libraryItem = null;
        if (libraryCache) {
            for (var i = 0; i < libraryCache.length; i++) {
                if (libraryCache[i].id === libraryItemId) { libraryItem = libraryCache[i]; break; }
            }
        }
        if (!libraryItem) { dialog.close(); return; }

        var result = MealsCore.addSlot(items, libraryItem, day);
        dialog.close();
        try {
            await api.createItem({ content: result.newSlotContent });
            items = await api.fetchItems();
            render();
        } catch (err) {
            console.error('Add slot failed:', err);
        }
    }

    function renderSummary(totals) {
        var parts = [];
        if (typeof totals.cal === 'number') parts.push(totals.cal + ' cal');
        if (typeof totals.protein === 'number') parts.push(totals.protein + 'g P');
        if (typeof totals.carbs === 'number') parts.push(totals.carbs + 'g C');
        if (typeof totals.fat === 'number') parts.push(totals.fat + 'g F');
        return escapeHtml(parts.join(' • '));
    }

    function formatMacros(m) {
        if (!m) return '';
        var parts = [];
        if (typeof m.cal === 'number') parts.push(m.cal + ' cal');
        if (typeof m.protein === 'number') parts.push(m.protein + 'g P');
        if (typeof m.carbs === 'number') parts.push(m.carbs + 'g C');
        if (typeof m.fat === 'number') parts.push(m.fat + 'g F');
        return parts.join(' • ');
    }

    function renderSlotCard(slot) {
        var mt = slot.meal_type || 'dinner';
        var types = ['breakfast', 'lunch', 'dinner', 'snack'];
        var typeOptions = types.map(function(t) {
            var label = t.charAt(0).toUpperCase() + t.slice(1);
            var sel = t === mt ? ' selected' : '';
            return '<option value="' + t + '"' + sel + '>' + label + '</option>';
        }).join('');
        return '<div class="slot-card" data-id="' + escapeHtml(slot.id) + '" data-library-id="' + escapeHtml(slot.library_id || '') + '">' +
            '<div class="slot-header">' +
                '<span class="slot-name">' + escapeHtml(slot.name_snapshot || '(unnamed)') + '</span>' +
                '<select class="slot-meal-type" title="Meal type">' + typeOptions + '</select>' +
                '<button type="button" class="slot-toggle" title="Expand">▾</button>' +
                '<button type="button" class="slot-fullscreen" title="Full screen">⛶</button>' +
                '<button type="button" class="slot-delete" title="Delete">✕</button>' +
            '</div>' +
            '<div class="slot-body" hidden>' +
                '<div class="slot-macros">' + escapeHtml(formatMacros(slot.macros_snapshot)) + '</div>' +
                '<div class="slot-recipe">Loading…</div>' +
            '</div>' +
        '</div>';
    }

    function bindCardEvents() {
        var cards = container.querySelectorAll('.slot-card');
        for (var i = 0; i < cards.length; i++) {
            var card = cards[i];
            var toggle = card.querySelector('.slot-toggle');
            var full = card.querySelector('.slot-fullscreen');
            var select = card.querySelector('.slot-meal-type');
            var del = card.querySelector('.slot-delete');
            toggle.addEventListener('click', onToggleExpand);
            full.addEventListener('click', onOpenModal);
            if (select) select.addEventListener('change', onMealTypeChange);
            if (del) del.addEventListener('click', onDeleteSlot);
        }
        var dialog = document.getElementById('recipe-dialog');
        if (dialog) {
            var closeBtn = dialog.querySelector('.dialog-close');
            closeBtn.addEventListener('click', function() { dialog.close(); });
            dialog.addEventListener('click', function(e) {
                if (e.target === dialog) dialog.close();
            });
        }
    }

    async function onDeleteSlot(e) {
        var card = e.target.closest('.slot-card');
        if (!card) return;
        var id = card.dataset.id;
        var name = card.querySelector('.slot-name').textContent;
        if (!window.confirm('Delete "' + name + '" from the week?')) return;

        var slotsArr = parseSlots();
        var afterRemove = MealsCore.removeSlot(slotsArr, id);
        var newOrderById = {};
        afterRemove.forEach(function(s) { newOrderById[s.id] = s.order; });

        var changed = [];
        var nextItems = [];
        for (var k = 0; k < items.length; k++) {
            if (items[k].id === id) continue;
            var parsed = MealsCore.parseContent(items[k].content);
            if (parsed && parsed.kind === 'slot' && typeof newOrderById[items[k].id] === 'number'
                && parsed.order !== newOrderById[items[k].id]) {
                parsed.order = newOrderById[items[k].id];
                items[k].content = MealsCore.serialize(parsed);
                changed.push({ id: items[k].id, content: items[k].content });
            }
            nextItems.push(items[k]);
        }
        items = nextItems;
        render();

        try {
            await api.deleteItem(id);
            for (var c = 0; c < changed.length; c++) {
                await api.updateItem(changed[c].id, { content: changed[c].content });
            }
        } catch (err) {
            console.error('Delete failed:', err);
        }
    }

    async function onMealTypeChange(e) {
        var card = e.target.closest('.slot-card');
        if (!card) return;
        var id = card.dataset.id;
        var mealType = e.target.value;
        for (var k = 0; k < items.length; k++) {
            if (items[k].id !== id) continue;
            var slot = MealsCore.parseContent(items[k].content);
            if (!slot || slot.kind !== 'slot') return;
            slot.meal_type = mealType;
            items[k].content = MealsCore.serialize(slot);
            render();
            try {
                await api.updateItem(id, { content: items[k].content });
            } catch (err) {
                console.error('Meal type save failed:', err);
            }
            return;
        }
    }

    async function onToggleExpand(e) {
        var card = e.target.closest('.slot-card');
        if (!card) return;
        var body = card.querySelector('.slot-body');
        if (body.hidden) {
            body.hidden = false;
            var recipeEl = body.querySelector('.slot-recipe');
            var libraryId = card.dataset.libraryId;
            try {
                var meal = await getLibraryMeal(libraryId);
                recipeEl.textContent = meal.recipe || '(no recipe)';
            } catch (err) {
                recipeEl.textContent = '(no recipe)';
            }
        } else {
            body.hidden = true;
        }
    }

    async function onOpenModal(e) {
        var card = e.target.closest('.slot-card');
        if (!card) return;
        var dialog = document.getElementById('recipe-dialog');
        var bodyEl = dialog.querySelector('.dialog-body');
        var libraryId = card.dataset.libraryId;
        var name = card.querySelector('.slot-name').textContent;
        bodyEl.innerHTML = '<h2>' + escapeHtml(name) + '</h2><div class="dialog-recipe">Loading…</div>';
        if (typeof dialog.showModal === 'function') dialog.showModal();
        try {
            var meal = await getLibraryMeal(libraryId);
            bodyEl.querySelector('.dialog-recipe').textContent = meal.recipe || '(no recipe)';
        } catch (err) {
            bodyEl.querySelector('.dialog-recipe').textContent = '(no recipe)';
        }
    }

    var DEMO_LIBRARY = [
        { name: 'Oatmeal',          recipe: 'Cook oats with milk. Top with berries.',                default_meal_type: 'breakfast', macros: { cal: 320, protein: 12, carbs: 55, fat: 6 } },
        { name: 'Avocado Toast',    recipe: 'Mash avocado on toasted sourdough. Salt, pepper, chili flakes.', default_meal_type: 'breakfast', macros: { cal: 380, protein: 10, carbs: 38, fat: 22 } },
        { name: 'Greek Yogurt Bowl', recipe: 'Yogurt with honey, granola, and walnuts.',             default_meal_type: 'breakfast', macros: { cal: 290, protein: 18, carbs: 32, fat: 9 } },
        { name: 'Scrambled Eggs',   recipe: 'Whisk 3 eggs with butter. Low heat, stir constantly.',  default_meal_type: 'breakfast', macros: { cal: 270, protein: 19, carbs: 2,  fat: 20 } },
        { name: 'Greek Salad',      recipe: 'Tomato, cucumber, feta, olives, olive oil.',            default_meal_type: 'lunch',     macros: { cal: 420, protein: 14, carbs: 18, fat: 32 } },
        { name: 'Chicken Wrap',     recipe: 'Grilled chicken, lettuce, hummus in a tortilla.',       default_meal_type: 'lunch',     macros: { cal: 510, protein: 38, carbs: 42, fat: 18 } },
        { name: 'Tuna Sandwich',    recipe: 'Tuna with mayo, celery, on rye bread.',                 default_meal_type: 'lunch',     macros: { cal: 460, protein: 28, carbs: 36, fat: 20 } },
        { name: 'Lentil Soup',      recipe: 'Simmer lentils with carrots, onion, cumin, stock.',     default_meal_type: 'lunch',     macros: { cal: 340, protein: 20, carbs: 48, fat: 6 } },
        { name: 'Roast Chicken',    recipe: 'Roast at 200°C for 45 min. Rest 10 min.',               default_meal_type: 'dinner',    macros: { cal: 650, protein: 55, carbs: 5,  fat: 38 } },
        { name: 'Pasta Pomodoro',   recipe: 'Boil pasta. Toss with tomato-basil sauce.',             default_meal_type: 'dinner',    macros: { cal: 580, protein: 18, carbs: 95, fat: 10 } },
        { name: 'Salmon + Rice',    recipe: 'Pan-sear salmon 4 min/side. Serve over jasmine rice.',  default_meal_type: 'dinner',    macros: { cal: 620, protein: 42, carbs: 60, fat: 22 } },
        { name: 'Beef Stir Fry',    recipe: 'Sear beef strips. Add veg + soy-ginger sauce.',         default_meal_type: 'dinner',    macros: { cal: 540, protein: 38, carbs: 32, fat: 26 } },
        { name: 'Veggie Curry',     recipe: 'Simmer chickpeas + spinach in coconut curry sauce.',    default_meal_type: 'dinner',    macros: { cal: 490, protein: 16, carbs: 52, fat: 24 } },
        { name: 'Apple + PB',       recipe: 'Sliced apple with peanut butter.',                      default_meal_type: 'snack',     macros: { cal: 220, protein: 6,  carbs: 28, fat: 11 } },
        { name: 'Trail Mix',        recipe: 'Almonds, cashews, raisins, dark chocolate.',            default_meal_type: 'snack',     macros: { cal: 280, protein: 8,  carbs: 24, fat: 18 } },
        { name: 'Hummus + Carrots', recipe: 'Carrot sticks with a side of hummus.',                  default_meal_type: 'snack',     macros: { cal: 180, protein: 6,  carbs: 22, fat: 8 } }
    ];

    var seedPromise = null;

    async function ensureMockSeed() {
        if (seedPromise) return seedPromise;
        seedPromise = (async function() {
            var seedApi = createApi('library');
            if (!seedApi.isMock) return false;
            var existing = await seedApi.fetchItems();
            if (existing.length > 0) return false;
            for (var i = 0; i < DEMO_LIBRARY.length; i++) {
                await seedApi.createItem({ content: MealsCore.serialize(Object.assign({ kind: 'meal' }, DEMO_LIBRARY[i])) });
            }
            return true;
        })();
        return seedPromise;
    }

    async function renderLibraryAsync() {
        var seeded = await ensureMockSeed();
        if (seeded) {
            items = await api.fetchItems();
            renderLibrarySync();
        }
    }

    function renderLibrary() {
        renderLibrarySync();
        renderLibraryAsync();
    }

    function renderLibrarySync() {
        var html = '<div class="library">';
        if (!items.length) {
            html += '<div class="library-empty">No meals in library yet.</div>';
        } else {
            html += '<div class="library-list">';
            for (var i = 0; i < items.length; i++) {
                var meal = MealsCore.parseContent(items[i].content);
                if (!meal || meal.kind !== 'meal') continue;
                html += '<div class="library-card" data-id="' + escapeHtml(items[i].id) + '">' +
                    '<span class="library-name">' + escapeHtml(meal.name || '(unnamed)') + '</span>' +
                    '<span class="library-macros">' + escapeHtml(formatMacros(meal.macros)) + '</span>' +
                    '<button type="button" class="library-toggle" title="Expand">▾</button>' +
                    '<div class="library-body" hidden>' +
                        '<div class="library-recipe">' + escapeHtml(meal.recipe || '(no recipe)') + '</div>' +
                    '</div>' +
                '</div>';
            }
            html += '</div>';
        }
        html += '</div>';
        container.innerHTML = html;

        var toggles = container.querySelectorAll('.library-toggle');
        for (var t = 0; t < toggles.length; t++) {
            toggles[t].addEventListener('click', function(e) {
                var card = e.target.closest('.library-card');
                var body = card.querySelector('.library-body');
                body.hidden = !body.hidden;
            });
        }
    }

    return {
        init: init,
        ensureMockSeed: ensureMockSeed
    };
})();

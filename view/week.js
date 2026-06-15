// Week view (the planner). Renders any non-library ?list= as a
// real, dated Saturday-start week anchored by ?date=YYYY-MM-DD (default: today).
// DOM + event wiring only.
// All state transformations go through MealsCore; presentation helpers live in ViewUtils.

var WeekView = (function() {
    var MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'];
    var MEAL_TYPE_LABELS = {
        breakfast: 'Breakfast',
        lunch:     'Lunch',
        dinner:    'Dinner',
        snack:     'Snack'
    };

    var container = null;
    var api = null;
    var libraryApi = null;
    var libraryCache = null;
    // { [libraryRowId]: parsedMeal }. Built once per load; slots join live to it.
    // Initialized to {} (not null) so a realtime Sync-triggered render() that
    // fires before the library load resolves to fallbacks instead of crashing.
    var libraryById = {};
    var items = [];
    var currentFilter = 'all';
    var saveTimer = null;

    // The Saturday anchoring the rendered week. Resolved once in init() from
    // ?date= (validated) or today's local date, then snapped to its week start.
    // Module state, so a Sync-triggered re-render keeps the same week.
    var weekOf = null;

    var dragState = null;
    var suppressNextClick = false;

    function init(el, listApi) {
        container = el;
        api = listApi;

        weekOf = resolveWeekOf();

        Sync.init(api, function(fresh) {
            items = fresh || [];
            render();
        });

        loadAndRender();
    }

    // ?date= → the Saturday on/before it; an absent/invalid param falls back to
    // the local "today". Never parses 'YYYY-MM-DD' as a local Date (would drift
    // by a day in negative-UTC zones).
    function resolveWeekOf() {
        var params = new URLSearchParams(window.location.search);
        var d = params.get('date');
        var anchor = (d && MealsCore.isIsoDate(d)) ? d : ViewUtils.localIsoDate(new Date());
        return MealsCore.weekStart(anchor);
    }

    function todayIso() {
        return ViewUtils.localIsoDate(new Date());
    }

    async function loadAndRender() {
        container.innerHTML = '<div class="loading">Loading...</div>';
        if (!libraryApi) libraryApi = createApi('library');
        // Bound the slot fetch to the visible week so the un-paginated ~1000-row
        // cap can't drop recent slots. Set as the instance default so Sync's
        // arg-less refresh stays bounded too. Nav is a full reload, so this is
        // recomputed per load.
        var weekDates = MealsCore.weekDates(weekOf);
        api.setDateRange(weekDates[0], weekDates[weekDates.length - 1]);
        try {
            // Fetch the week and the library in parallel; the week renders as a
            // live join of slots → library by library_id (no stored snapshots).
            var results = await Promise.all([api.fetchItems(), libraryApi.fetchItems()]);
            items = results[0];
            libraryCache = results[1];
            libraryById = MealsCore.indexLibrary(libraryCache);
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

    // Keep only slots carrying a valid ISO date — the dated shape is the slot
    // shape, so anything else simply doesn't render (no legacy fallback).
    function parseSlots() {
        var slots = [];
        for (var i = 0; i < items.length; i++) {
            var parsed = MealsCore.parseContent(items[i].content);
            if (parsed && parsed.kind === 'slot' && MealsCore.isIsoDate(parsed.date)) {
                parsed.id = items[i].id;
                slots.push(parsed);
            }
        }
        return slots;
    }

    function visibleMealTypes() {
        if (currentFilter === 'all') return MEAL_TYPES.slice();
        return [currentFilter];
    }

    function render() {
        var allSlots = parseSlots();
        var slots = MealsCore.filterSlotsByType(allSlots, currentFilter);
        var mealTypes = visibleMealTypes();
        var dates = MealsCore.weekDates(weekOf);
        var today = todayIso();

        var html = '<div class="planner">';
        html += renderNav();
        html += renderFilterBar();
        html += '<div class="week-grid">';
        for (var d = 0; d < dates.length; d++) {
            var date = dates[d];
            var daySlots = slots.filter(function(s) { return s.date === date; });
            var dayLabel = ViewUtils.formatDayLabel(date);
            var isToday = date === today;

            html += '<div class="day-column' + (isToday ? ' today' : '') + '" data-date="' + date + '">';
            html += '<div class="day-header">' +
                '<span class="day-label">' + escapeHtml(dayLabel) + '</span>' +
                '<button type="button" class="day-add" data-date="' + date + '" title="Add meal" aria-label="Add meal to ' + escapeHtml(dayLabel) + '">+</button>' +
                '</div>';

            html += '<div class="day-sections">';
            for (var t = 0; t < mealTypes.length; t++) {
                var mt = mealTypes[t];
                var sectionSlots = daySlots
                    .filter(function(s) { return s.meal_type === mt; })
                    .sort(function(a, b) { return a.order - b.order; });

                html += '<div class="meal-section" data-date="' + date + '" data-meal-type="' + mt + '">';
                html += '<div class="section-label">' + MEAL_TYPE_LABELS[mt] + '</div>';
                html += '<div class="section-slots">';
                for (var i = 0; i < sectionSlots.length; i++) {
                    html += renderSlotCard(sectionSlots[i]);
                }
                html += '</div>';
                html += '</div>';
            }
            html += '</div>';

            html += '<div class="day-summary" data-date="' + date + '">' +
                renderSummary(MealsCore.summarizeMacros(daySlots, libraryById)) + '</div>';
            html += '</div>';
        }
        html += '</div></div>';
        html += '<dialog id="recipe-dialog">' +
            '<div class="dialog-body"></div>' +
            '<div class="dialog-actions">' +
                '<button class="dialog-delete" type="button">Delete</button>' +
                '<button class="dialog-close" type="button">Close</button>' +
            '</div>' +
            '</dialog>';
        html += '<dialog id="picker-dialog">' +
            '<div class="picker-header">Add meal to <span class="picker-day"></span></div>' +
            '<div class="picker-body"></div>' +
            '<button class="picker-close" type="button">Cancel</button>' +
            '</dialog>';
        container.innerHTML = html;

        bindCardEvents();
        bindFilterEvents();
        bindAddDayEvents();
        bindDialogEvents();
    }

    /* ===== Week navigation ===== */

    // Plain links (full reload, consistent with the rest of the app). Prev/next
    // rewrite ?date=; Today drops the param; Trends switches the view.
    function renderNav() {
        var prev = MealsCore.addDays(weekOf, -7);
        var next = MealsCore.addDays(weekOf, 7);
        var label = 'Week of ' + ViewUtils.formatDayLabel(weekOf);
        // Every nav link must carry the *current* list, not a hardcoded 'week':
        // the planner can be opened under any ?list= name and these links must
        // stay on it rather than silently switching to the default list's data.
        var list = '?list=' + encodeURIComponent(api.listName);
        // Two explicit groups so the ‹ label › cluster stays visually distinct
        // from Today/Trends — even if the stylesheet is stale-cached, the grouping
        // markup keeps the next arrow from sitting flush against Today (which
        // drops ?date= and jumps to the current week).
        return '<div class="week-nav">' +
            '<div class="week-nav-group week-nav-steps">' +
                '<a class="week-nav-arrow" href="' + list + '&date=' + prev + '" aria-label="Previous week">‹</a>' +
                '<span class="week-nav-label">' + escapeHtml(label) + '</span>' +
                '<a class="week-nav-arrow" href="' + list + '&date=' + next + '" aria-label="Next week">›</a>' +
            '</div>' +
            '<div class="week-nav-group week-nav-jump">' +
                '<a class="week-nav-today" href="' + list + '">Today</a>' +
                '<a class="week-nav-trends" href="' + list + '&view=trends&date=' + weekOf + '">Trends</a>' +
            '</div>' +
            '</div>';
    }

    /* ===== Pointer (drag from handle) + click (open modal) ===== */

    function bindCardEvents() {
        var cards = container.querySelectorAll('.slot-card');
        for (var i = 0; i < cards.length; i++) {
            cards[i].addEventListener('click', onCardClick);
            cards[i].addEventListener('keydown', onCardKeydown);
            var grab = cards[i].querySelector('.slot-grab');
            if (grab) grab.addEventListener('pointerdown', onGrabPointerDown);
        }
    }

    function onCardClick(e) {
        if (e.target.closest('.slot-grab')) return;
        if (suppressNextClick) { suppressNextClick = false; return; }
        openCardModal(e.currentTarget);
    }

    // The card is role="button" tabindex="0", so Enter/Space must open the same
    // modal a click does (matches the library card's keyboard affordance).
    function onCardKeydown(e) {
        if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
        if (e.target.closest('.slot-grab')) return;
        e.preventDefault();
        openCardModal(e.currentTarget);
    }

    function openCardModal(card) {
        openRecipeModal(card.dataset.id, card.dataset.libraryId,
            card.querySelector('.slot-name').textContent);
    }

    function onGrabPointerDown(e) {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        e.preventDefault();
        var card = e.currentTarget.closest('.slot-card');
        if (!card) return;

        dragState = {
            id: card.dataset.id,
            libraryId: card.dataset.libraryId,
            card: card,
            pointerId: e.pointerId,
            captureTarget: e.target,
            ghost: null,
            lastSection: null
        };

        try { e.target.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }

        beginDrag(e.clientX, e.clientY);

        window.addEventListener('pointermove', onWindowPointerMove);
        window.addEventListener('pointerup', onWindowPointerUp);
        window.addEventListener('pointercancel', onWindowPointerCancel);
    }

    function beginDrag(x, y) {
        if (!dragState) return;
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
        dragState.offsetX = x - rect.left;
        dragState.offsetY = y - rect.top;
        card.classList.add('slot-dragging');
        document.body.style.userSelect = 'none';
        document.body.style.touchAction = 'none';
    }

    function onWindowPointerMove(e) {
        if (!dragState || e.pointerId !== dragState.pointerId) return;

        var g = dragState.ghost;
        g.style.left = (e.clientX - dragState.offsetX) + 'px';
        g.style.top = (e.clientY - dragState.offsetY) + 'px';

        var section = sectionAtPoint(e.clientX, e.clientY);
        if (section !== dragState.lastSection) {
            if (dragState.lastSection) dragState.lastSection.classList.remove('drag-over');
            if (section) section.classList.add('drag-over');
            dragState.lastSection = section;
        }
    }

    function sectionAtPoint(x, y) {
        var g = dragState && dragState.ghost;
        if (g) g.style.display = 'none';
        var el = document.elementFromPoint(x, y);
        if (g) g.style.display = '';
        if (!el) return null;
        var section = el.closest('.meal-section');
        if (section) return section;
        // Fallback: dropped on the column outside any section — use the slot's
        // current meal-type within that column, so a coarse drop still works.
        var col = el.closest('.day-column');
        if (!col) return null;
        var mt = (dragState && dragState.card && dragState.card.dataset.mealType) || 'dinner';
        return col.querySelector('.meal-section[data-meal-type="' + mt + '"]');
    }

    function onWindowPointerUp(e) {
        if (!dragState || e.pointerId !== dragState.pointerId) return;
        var section = sectionAtPoint(e.clientX, e.clientY);
        var movedId = dragState.id;
        suppressNextClick = true;
        cleanupDrag();
        if (!section) return;
        commitMove(movedId, section.dataset.date, section.dataset.mealType);
    }

    function onWindowPointerCancel(e) {
        if (!dragState || e.pointerId !== dragState.pointerId) return;
        cleanupDrag();
    }

    function cleanupDrag() {
        if (!dragState) return;
        if (dragState.ghost && dragState.ghost.parentNode) {
            dragState.ghost.parentNode.removeChild(dragState.ghost);
        }
        if (dragState.card) dragState.card.classList.remove('slot-dragging');
        if (dragState.lastSection) dragState.lastSection.classList.remove('drag-over');
        document.body.style.userSelect = '';
        document.body.style.touchAction = '';
        dragState = null;
        window.removeEventListener('pointermove', onWindowPointerMove);
        window.removeEventListener('pointerup', onWindowPointerUp);
        window.removeEventListener('pointercancel', onWindowPointerCancel);
    }

    function commitMove(id, toDate, toMealType) {
        var slotsArr = parseSlots();
        var before = JSON.parse(JSON.stringify(slotsArr));
        var toIndex = slotsArr.filter(function(s) {
            return s.date === toDate && s.meal_type === toMealType && s.id !== id;
        }).length;
        var moved = MealsCore.moveSlot(slotsArr, id, toDate, toMealType, toIndex);

        var beforeById = {};
        before.forEach(function(s) { beforeById[s.id] = s; });
        var changed = moved.filter(function(s) {
            var b = beforeById[s.id];
            return !b || b.date !== s.date || b.meal_type !== s.meal_type || b.order !== s.order;
        });

        for (var k = 0; k < items.length; k++) {
            var slot = MealsCore.parseContent(items[k].content);
            if (!slot || slot.kind !== 'slot') continue;
            for (var m = 0; m < moved.length; m++) {
                if (moved[m].id === items[k].id) {
                    slot.date = moved[m].date;
                    slot.meal_type = moved[m].meal_type;
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

    /* ===== Filter bar ===== */

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

    /* ===== Picker (add to day) ===== */

    function bindAddDayEvents() {
        var addBtns = container.querySelectorAll('.day-add');
        for (var i = 0; i < addBtns.length; i++) {
            addBtns[i].addEventListener('click', onOpenPicker);
        }
    }

    async function onOpenPicker(e) {
        var date = e.currentTarget.dataset.date;
        var dialog = document.getElementById('picker-dialog');
        var bodyEl = dialog.querySelector('.picker-body');
        dialog.querySelector('.picker-day').textContent = ViewUtils.formatDayLabel(date);
        dialog.dataset.date = date;
        bodyEl.innerHTML = '<div class="picker-loading">Loading…</div>';
        if (typeof dialog.showModal === 'function') dialog.showModal();

        if (!libraryApi) libraryApi = createApi('library');
        try {
            libraryCache = await libraryApi.fetchItems();
        } catch (err) {
            bodyEl.innerHTML = '<div class="picker-empty">Failed to load library.</div>';
            return;
        }
        renderPickerList(bodyEl, date);
    }

    function renderPickerList(bodyEl, date) {
        // Quick add comes first so it stays available when the library is
        // empty or the active filter leaves nothing to pick.
        var html = '<button type="button" class="picker-quick-add">+ Quick add</button>';
        var groups = MealsCore.groupLibraryByType(libraryCache, currentFilter);
        if (!groups.length) {
            var msg = currentFilter !== 'all'
                ? 'No ' + (MEAL_TYPE_LABELS[currentFilter] || currentFilter) + ' meals in library yet.'
                : 'No meals in library yet.';
            html += '<div class="picker-empty">' + escapeHtml(msg) + '</div>';
        }
        for (var g = 0; g < groups.length; g++) {
            var group = groups[g];
            html += '<div class="picker-group" data-meal-type="' + group.meal_type + '">';
            html += '<div class="picker-group-label">' +
                escapeHtml(MEAL_TYPE_LABELS[group.meal_type] || group.meal_type) + '</div>';
            for (var i = 0; i < group.meals.length; i++) {
                html += '<button type="button" class="picker-meal" data-id="' + escapeHtml(group.meals[i].id) + '">' +
                    escapeHtml(group.meals[i].name || '(unnamed)') + '</button>';
            }
            html += '</div>';
        }
        bodyEl.innerHTML = html;
        bodyEl.querySelector('.picker-quick-add').addEventListener('click', function() {
            renderQuickAddForm(bodyEl, date);
        });
        var btns = bodyEl.querySelectorAll('.picker-meal');
        for (var j = 0; j < btns.length; j++) {
            btns[j].addEventListener('click', onPickMeal);
        }
    }

    function renderQuickAddForm(bodyEl, date) {
        var dayLabel = ViewUtils.formatDayLabel(date);
        var preType = currentFilter !== 'all' ? currentFilter : 'dinner';
        var html = '<form class="quick-add-form" novalidate>';
        html += '<label class="quick-add-label">Name' +
            '<input type="text" name="name" autocomplete="off" placeholder="e.g. Leftover curry">' +
            '</label>';
        html += '<label class="quick-add-label">Meal type<select name="type">';
        for (var t = 0; t < MEAL_TYPES.length; t++) {
            var mt = MEAL_TYPES[t];
            html += '<option value="' + mt + '"' + (mt === preType ? ' selected' : '') + '>' +
                MEAL_TYPE_LABELS[mt] + '</option>';
        }
        html += '</select></label>';
        html += '<div class="quick-add-macros">';
        var macroFields = [['cal', 'Calories'], ['protein', 'Protein (g)'], ['carbs', 'Carbs (g)'], ['fat', 'Fat (g)']];
        for (var m = 0; m < macroFields.length; m++) {
            html += '<label class="quick-add-label">' + macroFields[m][1] +
                '<input type="text" inputmode="decimal" name="' + macroFields[m][0] + '" autocomplete="off">' +
                '</label>';
        }
        html += '</div>';
        html += '<div class="quick-add-error" hidden></div>';
        html += '<div class="quick-add-actions">' +
            '<button type="button" class="quick-add-back">Back</button>' +
            '<button type="submit" class="quick-add-submit">Add to ' + escapeHtml(dayLabel) + '</button>' +
            '</div>';
        html += '</form>';
        bodyEl.innerHTML = html;

        var form = bodyEl.querySelector('.quick-add-form');
        form.addEventListener('submit', function(e) { onQuickAddSubmit(e, date); });
        bodyEl.querySelector('.quick-add-back').addEventListener('click', function() {
            renderPickerList(bodyEl, date);
        });
        form.querySelector('input[name="name"]').focus();
    }

    async function onQuickAddSubmit(e, date) {
        e.preventDefault();
        var form = e.currentTarget;
        var dialog = document.getElementById('picker-dialog');
        var errEl = form.querySelector('.quick-add-error');
        var submitBtn = form.querySelector('.quick-add-submit');
        var dayLabel = ViewUtils.formatDayLabel(date);

        function fail(msg) {
            errEl.textContent = msg;
            errEl.hidden = false;
            submitBtn.disabled = false;
        }

        var meal;
        try {
            meal = MealsCore.makeLibraryMeal({
                name: form.elements['name'].value,
                default_meal_type: form.elements['type'].value,
                macros: {
                    cal: form.elements['cal'].value,
                    protein: form.elements['protein'].value,
                    carbs: form.elements['carbs'].value,
                    fat: form.elements['fat'].value
                },
                adhoc: true
            });
        } catch (err) {
            fail(err.message);
            return;
        }

        submitBtn.disabled = true;

        var created;
        try {
            created = await libraryApi.createItem({ content: MealsCore.serialize(meal) });
        } catch (err) {
            fail('Could not save meal.');
            return;
        }
        if (libraryCache) libraryCache.push(created);
        libraryById[created.id] = meal;

        var result = MealsCore.addSlot(items, created, date);
        try {
            await api.createItem({ content: result.newSlotContent });
        } catch (err) {
            // Roll back the just-created ad-hoc row so it doesn't linger
            // invisibly (if even this fails, `library.js list --adhoc` finds it).
            try { await libraryApi.deleteItem(created.id); } catch (err2) { /* ignore */ }
            if (libraryCache) {
                libraryCache = libraryCache.filter(function(r) { return r.id !== created.id; });
            }
            delete libraryById[created.id];
            fail('Could not add to ' + dayLabel + '.');
            return;
        }

        dialog.close();
        try {
            items = await api.fetchItems();
        } catch (err) { /* keep local state; slot was persisted */ }
        render();
    }

    async function onPickMeal(e) {
        var btn = e.currentTarget;
        var libraryItemId = btn.dataset.id;
        var dialog = document.getElementById('picker-dialog');
        var date = dialog.dataset.date;
        var libraryItem = null;
        if (libraryCache) {
            for (var i = 0; i < libraryCache.length; i++) {
                if (libraryCache[i].id === libraryItemId) { libraryItem = libraryCache[i]; break; }
            }
        }
        if (!libraryItem) { dialog.close(); return; }

        var result = MealsCore.addSlot(items, libraryItem, date);
        dialog.close();
        try {
            await api.createItem({ content: result.newSlotContent });
            items = await api.fetchItems();
            render();
        } catch (err) {
            console.error('Add slot failed:', err);
        }
    }

    /* ===== Recipe modal + delete ===== */

    function bindDialogEvents() {
        var dialog = document.getElementById('recipe-dialog');
        if (dialog) {
            dialog.querySelector('.dialog-close').addEventListener('click', function() { dialog.close(); });
            dialog.querySelector('.dialog-delete').addEventListener('click', onDialogDelete);
            dialog.addEventListener('click', function(e) {
                if (e.target === dialog) dialog.close();
            });
        }
        var picker = document.getElementById('picker-dialog');
        if (picker) {
            picker.querySelector('.picker-close').addEventListener('click', function() { picker.close(); });
            picker.addEventListener('click', function(e) {
                if (e.target === picker) picker.close();
            });
        }
    }

    async function openRecipeModal(id, libraryId, name) {
        var dialog = document.getElementById('recipe-dialog');
        var bodyEl = dialog.querySelector('.dialog-body');
        dialog.dataset.slotId = id;
        dialog.dataset.factor = '1';
        var rawMacros = currentSlotMacrosRaw(id);
        bodyEl.innerHTML =
            '<h2>' + escapeHtml(name) + '</h2>' +
            '<div class="dialog-macros">' + escapeHtml(ViewUtils.formatMacros(rawMacros)) + '</div>' +
            '<div class="recipe-scale" hidden>' +
                '<span class="scale-label">Scale</span>' +
                '<button type="button" class="scale-dec" aria-label="Fewer servings">−</button>' +
                '<span class="scale-value">×1</span>' +
                '<button type="button" class="scale-inc" aria-label="More servings">+</button>' +
            '</div>' +
            '<div class="dialog-recipe">Loading…</div>';
        if (typeof dialog.showModal === 'function') dialog.showModal();

        var recipeEl = bodyEl.querySelector('.dialog-recipe');
        var macrosEl = bodyEl.querySelector('.dialog-macros');
        var scaleEl = bodyEl.querySelector('.recipe-scale');
        var valueEl = scaleEl.querySelector('.scale-value');

        var meal = {};
        var recipe = {};
        try {
            meal = await getLibraryMeal(libraryId);
            recipe = meal.recipe || {};
        } catch (err) {
            recipe = {};
        }
        // The user may have opened a different slot while we awaited the fetch.
        if (dialog.dataset.slotId !== id) return;

        // Ad-hoc meals have no recipe yet — show a note and skip the scale
        // stepper (scaling an empty recipe is pointless).
        if (meal.adhoc === true) {
            recipeEl.innerHTML = '<div class="dialog-adhoc-note">Quick-added — no recipe yet.</div>';
            return;
        }

        // Closure over the resolved recipe + the slot's raw macros — dataset holds
        // only the integer factor as a string.
        function rerender() {
            var n = parseInt(dialog.dataset.factor, 10) || 1;
            recipeEl.innerHTML = ViewUtils.renderRecipeHtml(recipe, n);
            macrosEl.textContent = ViewUtils.formatMacros(scaleMacros(rawMacros, n));
            valueEl.textContent = '×' + n;
        }

        scaleEl.querySelector('.scale-dec').addEventListener('click', function() {
            var n = Math.max(1, (parseInt(dialog.dataset.factor, 10) || 1) - 1);
            dialog.dataset.factor = String(n);
            rerender();
        });
        scaleEl.querySelector('.scale-inc').addEventListener('click', function() {
            var n = (parseInt(dialog.dataset.factor, 10) || 1) + 1;
            dialog.dataset.factor = String(n);
            rerender();
        });

        scaleEl.hidden = false;
        rerender();
    }

    // Multiply each present numeric macro by an integer factor (per-serving stays
    // per-serving at ×1). Returns a fresh object for ViewUtils.formatMacros.
    function scaleMacros(macros, factor) {
        var out = {};
        if (!macros) return out;
        var keys = ['cal', 'protein', 'carbs', 'fat'];
        for (var i = 0; i < keys.length; i++) {
            var v = macros[keys[i]];
            if (typeof v === 'number') out[keys[i]] = v * factor;
        }
        return out;
    }

    function currentSlotMacrosRaw(id) {
        for (var i = 0; i < items.length; i++) {
            if (items[i].id !== id) continue;
            var parsed = MealsCore.parseContent(items[i].content);
            if (parsed) return MealsCore.resolveSlot(parsed, libraryById).macros;
        }
        return {};
    }

    async function onDialogDelete() {
        var dialog = document.getElementById('recipe-dialog');
        var id = dialog.dataset.slotId;
        if (!id) return;
        var name = dialog.querySelector('h2').textContent;
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
        dialog.close();
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

    /* ===== Summaries + card markup ===== */

    function renderSummary(totals) {
        var parts = [];
        if (typeof totals.cal === 'number') parts.push(totals.cal + ' cal');
        if (typeof totals.protein === 'number') parts.push(totals.protein + 'g P');
        if (typeof totals.carbs === 'number') parts.push(totals.carbs + 'g C');
        if (typeof totals.fat === 'number') parts.push(totals.fat + 'g F');
        return escapeHtml(parts.join(' • '));
    }

    function renderSlotCard(slot) {
        var resolved = MealsCore.resolveSlot(slot, libraryById);
        return '<div class="slot-card"' +
            ' data-id="' + escapeHtml(slot.id) + '"' +
            ' data-library-id="' + escapeHtml(slot.library_id || '') + '"' +
            ' data-meal-type="' + escapeHtml(slot.meal_type || 'dinner') + '"' +
            ' role="button" tabindex="0"' +
            '>' +
            '<div class="slot-text">' +
                '<span class="slot-name">' + escapeHtml(resolved.name || '(unnamed)') + '</span>' +
                '<span class="slot-macros">' + escapeHtml(ViewUtils.formatMacros(resolved.macros)) + '</span>' +
            '</div>' +
            '<button type="button" class="slot-grab" aria-label="Drag to reorder" tabindex="-1">' +
                '<span></span><span></span><span></span>' +
            '</button>' +
            '</div>';
    }

    return {
        init: init
    };
})();

if (typeof window !== 'undefined') window.WeekView = WeekView;

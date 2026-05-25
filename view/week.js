// Week view (the planner). Renders ?list=week. DOM + event wiring only.
// All state transformations go through MealsCore; presentation helpers live in ViewUtils.

var WeekView = (function() {
    var DAYS = ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri'];
    var DAY_LABELS = {
        sat: 'Sat', sun: 'Sun', mon: 'Mon', tue: 'Tue',
        wed: 'Wed', thu: 'Thu', fri: 'Fri'
    };
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
    var items = [];
    var currentFilter = 'all';
    var saveTimer = null;

    var dragState = null;
    var suppressNextClick = false;

    function init(el, listApi) {
        container = el;
        api = listApi;

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

    function visibleMealTypes() {
        if (currentFilter === 'all') return MEAL_TYPES.slice();
        return [currentFilter];
    }

    function render() {
        var allSlots = parseSlots();
        var slots = MealsCore.filterSlotsByType(allSlots, currentFilter);
        var mealTypes = visibleMealTypes();

        var html = '<div class="planner">';
        html += renderFilterBar();
        html += '<div class="week-grid">';
        for (var d = 0; d < DAYS.length; d++) {
            var day = DAYS[d];
            var daySlots = slots.filter(function(s) { return s.day === day; });

            html += '<div class="day-column" data-day="' + day + '">';
            html += '<div class="day-header">' +
                '<span class="day-label">' + DAY_LABELS[day] + '</span>' +
                '<button type="button" class="day-add" data-day="' + day + '" title="Add meal" aria-label="Add meal to ' + DAY_LABELS[day] + '">+</button>' +
                '</div>';

            html += '<div class="day-sections">';
            for (var t = 0; t < mealTypes.length; t++) {
                var mt = mealTypes[t];
                var sectionSlots = daySlots
                    .filter(function(s) { return s.meal_type === mt; })
                    .sort(function(a, b) { return a.order - b.order; });

                html += '<div class="meal-section" data-day="' + day + '" data-meal-type="' + mt + '">';
                html += '<div class="section-label">' + MEAL_TYPE_LABELS[mt] + '</div>';
                html += '<div class="section-slots">';
                for (var i = 0; i < sectionSlots.length; i++) {
                    html += renderSlotCard(sectionSlots[i]);
                }
                html += '</div>';
                html += '</div>';
            }
            html += '</div>';

            html += '<div class="day-summary" data-day="' + day + '">' +
                renderSummary(MealsCore.summarizeMacros(daySlots)) + '</div>';
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

    /* ===== Pointer (drag from handle) + click (open modal) ===== */

    function bindCardEvents() {
        var cards = container.querySelectorAll('.slot-card');
        for (var i = 0; i < cards.length; i++) {
            cards[i].addEventListener('click', onCardClick);
            var grab = cards[i].querySelector('.slot-grab');
            if (grab) grab.addEventListener('pointerdown', onGrabPointerDown);
        }
    }

    function onCardClick(e) {
        if (e.target.closest('.slot-grab')) return;
        if (suppressNextClick) { suppressNextClick = false; return; }
        var card = e.currentTarget;
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
        commitMove(movedId, section.dataset.day, section.dataset.mealType);
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

    function commitMove(id, toDay, toMealType) {
        var slotsArr = parseSlots();
        var before = JSON.parse(JSON.stringify(slotsArr));
        var toIndex = slotsArr.filter(function(s) {
            return s.day === toDay && s.meal_type === toMealType && s.id !== id;
        }).length;
        var moved = MealsCore.moveSlot(slotsArr, id, toDay, toMealType, toIndex);

        var beforeById = {};
        before.forEach(function(s) { beforeById[s.id] = s; });
        var changed = moved.filter(function(s) {
            var b = beforeById[s.id];
            return !b || b.day !== s.day || b.meal_type !== s.meal_type || b.order !== s.order;
        });

        for (var k = 0; k < items.length; k++) {
            var slot = MealsCore.parseContent(items[k].content);
            if (!slot || slot.kind !== 'slot') continue;
            for (var m = 0; m < moved.length; m++) {
                if (moved[m].id === items[k].id) {
                    slot.day = moved[m].day;
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

        var recipe = {};
        try {
            var meal = await getLibraryMeal(libraryId);
            recipe = meal.recipe || {};
        } catch (err) {
            recipe = {};
        }
        // The user may have opened a different slot while we awaited the fetch.
        if (dialog.dataset.slotId !== id) return;

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
            if (parsed && parsed.macros_snapshot) return parsed.macros_snapshot;
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
        return '<div class="slot-card"' +
            ' data-id="' + escapeHtml(slot.id) + '"' +
            ' data-library-id="' + escapeHtml(slot.library_id || '') + '"' +
            ' data-meal-type="' + escapeHtml(slot.meal_type || 'dinner') + '"' +
            ' role="button" tabindex="0"' +
            '>' +
            '<div class="slot-text">' +
                '<span class="slot-name">' + escapeHtml(slot.name_snapshot || '(unnamed)') + '</span>' +
                '<span class="slot-macros">' + escapeHtml(ViewUtils.formatMacros(slot.macros_snapshot)) + '</span>' +
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

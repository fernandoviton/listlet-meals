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
            html += '<div class="day-header">' + DAY_LABELS[day] + '</div>';
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
        container.innerHTML = html;

        bindCardEvents();
        bindFilterEvents();
        bindDragEvents();
    }

    var saveTimer = null;
    function bindDragEvents() {
        var cards = container.querySelectorAll('.slot-card');
        for (var i = 0; i < cards.length; i++) {
            cards[i].addEventListener('dragstart', function(e) {
                var card = e.target.closest('.slot-card');
                e.dataTransfer.setData('text/plain', card.dataset.id);
                e.dataTransfer.effectAllowed = 'move';
            });
        }
        var columns = container.querySelectorAll('.day-column');
        for (var j = 0; j < columns.length; j++) {
            columns[j].addEventListener('dragover', function(e) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                e.currentTarget.classList.add('drag-over');
            });
            columns[j].addEventListener('dragleave', function(e) {
                e.currentTarget.classList.remove('drag-over');
            });
            columns[j].addEventListener('drop', onDrop);
        }
    }

    async function onDrop(e) {
        e.preventDefault();
        var column = e.currentTarget;
        column.classList.remove('drag-over');
        var id = e.dataTransfer.getData('text/plain');
        if (!id) return;
        var toDay = column.dataset.day;

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
        return '<div class="slot-card" draggable="true" data-id="' + escapeHtml(slot.id) + '" data-library-id="' + escapeHtml(slot.library_id || '') + '">' +
            '<div class="slot-header">' +
                '<span class="slot-name">' + escapeHtml(slot.name_snapshot || '(unnamed)') + '</span>' +
                '<button type="button" class="slot-toggle" title="Expand">▾</button>' +
                '<button type="button" class="slot-fullscreen" title="Full screen">⛶</button>' +
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
            toggle.addEventListener('click', onToggleExpand);
            full.addEventListener('click', onOpenModal);
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

    function renderLibrary() {
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
                    '<button type="button" class="library-add" title="Add to week">+</button>' +
                    '<div class="day-picker" hidden>' +
                        DAYS.map(function(d) {
                            return '<button type="button" class="day-pick" data-day="' + d + '">' + DAY_LABELS[d] + '</button>';
                        }).join('') +
                    '</div>' +
                '</div>';
            }
            html += '</div>';
        }
        html += '</div>';
        container.innerHTML = html;

        var addBtns = container.querySelectorAll('.library-add');
        for (var a = 0; a < addBtns.length; a++) {
            addBtns[a].addEventListener('click', function(e) {
                var card = e.target.closest('.library-card');
                var picker = card.querySelector('.day-picker');
                picker.hidden = !picker.hidden;
            });
        }
        var dayBtns = container.querySelectorAll('.day-pick');
        for (var b = 0; b < dayBtns.length; b++) {
            dayBtns[b].addEventListener('click', onPickDay);
        }
    }

    async function onPickDay(e) {
        var btn = e.target;
        var day = btn.dataset.day;
        var card = btn.closest('.library-card');
        var libraryItemId = card.dataset.id;
        var libraryItem = null;
        for (var i = 0; i < items.length; i++) {
            if (items[i].id === libraryItemId) { libraryItem = items[i]; break; }
        }
        if (!libraryItem) return;

        var weekApi = createApi('week');
        var weekItems = await weekApi.fetchItems();
        var result = MealsCore.addSlot(weekItems, libraryItem, day);
        await weekApi.createItem({ content: result.newSlotContent });

        var picker = card.querySelector('.day-picker');
        picker.hidden = true;
    }

    return {
        init: init
    };
})();

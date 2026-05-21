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
        var slots = parseSlots();

        var html = '<div class="planner">';
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
            html += '<div class="day-summary" data-day="' + day + '"></div>';
            html += '</div>';
        }
        html += '</div></div>';
        html += '<dialog id="recipe-dialog"><div class="dialog-body"></div><button class="dialog-close" type="button">Close</button></dialog>';
        container.innerHTML = html;

        bindCardEvents();
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
        return '<div class="slot-card" data-id="' + escapeHtml(slot.id) + '" data-library-id="' + escapeHtml(slot.library_id || '') + '">' +
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
        container.innerHTML = '<div class="library"><div class="library-empty">Library — coming soon.</div></div>';
    }

    return {
        init: init
    };
})();

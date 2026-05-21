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
    var listName = null;
    var items = [];

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
        container.innerHTML = html;
    }

    function renderSlotCard(slot) {
        return '<div class="slot-card" data-id="' + escapeHtml(slot.id) + '">' +
            '<span class="slot-name">' + escapeHtml(slot.name_snapshot || '(unnamed)') + '</span>' +
            '</div>';
    }

    function renderLibrary() {
        container.innerHTML = '<div class="library"><div class="library-empty">Library — coming soon.</div></div>';
    }

    return {
        init: init
    };
})();

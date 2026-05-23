// Library view. Renders ?list=library. DOM + event wiring only.
// All state transformations go through MealsCore; presentation helpers live in ViewUtils.

var LibraryView = (function() {
    var container = null;
    var api = null;
    var items = [];

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

    function render() {
        renderSync();
        renderAsync();
    }

    async function renderAsync() {
        var seeded = await App.ensureMockSeed();
        if (seeded) {
            items = await api.fetchItems();
            renderSync();
        }
    }

    function renderSync() {
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
                    '<span class="library-macros">' + escapeHtml(ViewUtils.formatMacros(meal.macros)) + '</span>' +
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
        init: init
    };
})();

if (typeof window !== 'undefined') window.LibraryView = LibraryView;

// Trends view (?view=trends over a planner list named by ?list=). Read-only:
// charts calories/protein per day and a weekly-averages table over a range of
// weeks ending at the anchored week. DOM + render only; all aggregation goes
// through MealsCore.

var TrendsView = (function() {
    var RANGES = [2, 4, 12];
    var DEFAULT_RANGE = 4;

    var container = null;
    var api = null;
    var libraryApi = null;

    var weekOf = null;   // Saturday anchoring the latest week in range.
    var range = DEFAULT_RANGE;

    function init(el, listApi) {
        container = el;
        api = listApi;

        var params = new URLSearchParams(window.location.search);
        var d = params.get('date');
        var anchor = (d && MealsCore.isIsoDate(d)) ? d : ViewUtils.localIsoDate(new Date());
        weekOf = MealsCore.weekStart(anchor);

        var r = parseInt(params.get('range'), 10);
        range = RANGES.indexOf(r) !== -1 ? r : DEFAULT_RANGE;

        loadAndRender();
    }

    async function loadAndRender() {
        container.innerHTML = '<div class="loading">Loading...</div>';
        if (!libraryApi) libraryApi = createApi('library');
        try {
            var results = await Promise.all([api.fetchItems(), libraryApi.fetchItems()]);
            var libraryById = MealsCore.indexLibrary(results[1]);
            var slots = parseSlots(results[0]);
            render(MealsCore.summarizeMacrosByDate(slots, libraryById));
        } catch (err) {
            container.innerHTML = '<div class="error">Failed to load: ' + escapeHtml(err.message) + '</div>';
        }
    }

    function parseSlots(items) {
        var slots = [];
        for (var i = 0; i < items.length; i++) {
            var parsed = MealsCore.parseContent(items[i].content);
            if (parsed && parsed.kind === 'slot' && MealsCore.isIsoDate(parsed.date)) {
                slots.push(parsed);
            }
        }
        return slots;
    }

    function render(byDate) {
        // Range ends at the anchored week's Friday, extends `range` Saturdays back.
        var to = MealsCore.addDays(weekOf, 6);
        var from = MealsCore.addDays(weekOf, -7 * (range - 1));
        var dates = MealsCore.dateRange(from, to);
        var weekly = MealsCore.summarizeWeeklyAverages(byDate, from, to);

        var html = '<div class="trends">';
        html += renderHeader();
        html += renderChart('Calories / day', dates, byDate, 'cal');
        html += renderChart('Protein / day', dates, byDate, 'protein');
        html += renderTable(weekly);
        html += '</div>';
        container.innerHTML = html;
    }

    function renderHeader() {
        var label = ViewUtils.formatDayLabel(weekOf);
        // Carry the current list, not a hardcoded 'week' — these links must keep
        // the user on whatever ?list= the trends view was opened under.
        var list = '?list=' + encodeURIComponent(api.listName);
        var html = '<div class="trends-header">';
        html += '<a class="trends-back" href="' + list + '&date=' + weekOf + '">‹ Planner</a>';
        html += '<span class="trends-title">Trends — ' + range + ' weeks to ' + escapeHtml(label) + '</span>';
        html += '<span class="trends-range">';
        for (var i = 0; i < RANGES.length; i++) {
            var r = RANGES[i];
            var cls = 'trends-pill' + (r === range ? ' active' : '');
            html += '<a class="' + cls + '" data-range="' + r + '" href="' + list + '&view=trends&date=' +
                weekOf + '&range=' + r + '">' + r + 'w</a>';
        }
        html += '</span>';
        html += '</div>';
        return html;
    }

    // Inline SVG bar chart (one bar per day, scaled to the range max). The SVG
    // fills width via preserveAspectRatio="none" (responsive without measuring),
    // which scales non-uniformly — so it carries bars only. Saturday tick labels
    // are rendered as HTML positioned by percentage, never as in-SVG <text>
    // (which would stretch horizontally with the chart).
    function renderChart(title, dates, byDate, key) {
        var barStep = 12, chartH = 100;
        var W = Math.max(dates.length * barStep, barStep);
        var max = 1;
        for (var i = 0; i < dates.length; i++) {
            var m = byDate[dates[i]];
            var v = (m && typeof m[key] === 'number') ? m[key] : 0;
            if (v > max) max = v;
        }

        var svg = '<svg class="trends-chart" viewBox="0 0 ' + W + ' ' + chartH + '" ' +
            'preserveAspectRatio="none" role="img" aria-label="' + escapeHtml(title) + '">';
        var ticks = '';
        for (var j = 0; j < dates.length; j++) {
            var date = dates[j];
            var mm = byDate[date];
            var val = (mm && typeof mm[key] === 'number') ? mm[key] : 0;
            var h = (val / max) * chartH;
            var x = j * barStep;
            var y = chartH - h;
            svg += '<rect class="trends-bar" data-date="' + date + '" x="' + (x + 1) + '" y="' + y +
                '" width="' + (barStep - 2) + '" height="' + h + '"><title>' +
                escapeHtml(ViewUtils.formatDayLabel(date) + ': ' + Math.round(val)) + '</title></rect>';
            if (MealsCore.dayOfWeek(date) === 'sat') {
                var mLbl = Number(date.slice(5, 7)) + '/' + Number(date.slice(8, 10));
                // Center over the bar: ((j + 0.5) / dates.length) of the full width.
                var pct = ((j + 0.5) / dates.length) * 100;
                ticks += '<span class="trends-tick" style="left:' + pct.toFixed(3) + '%">' +
                    escapeHtml(mLbl) + '</span>';
            }
        }
        svg += '</svg>';
        var axis = '<div class="trends-axis">' + ticks + '</div>';

        return '<div class="trends-section">' +
            '<div class="trends-section-title">' + escapeHtml(title) + '</div>' +
            svg + axis + '</div>';
    }

    function cell(avg, key) {
        return typeof avg[key] === 'number' ? String(avg[key]) : '—';
    }

    function renderTable(weekly) {
        var html = '<table class="trends-table">';
        html += '<thead><tr><th>Week of</th><th>Days</th><th>Cal</th><th>Protein</th><th>Carbs</th><th>Fat</th></tr></thead>';
        html += '<tbody>';
        for (var i = 0; i < weekly.length; i++) {
            var w = weekly[i];
            html += '<tr class="trends-row" data-week="' + w.week_start + '">' +
                '<td class="tcell-week">' + escapeHtml(ViewUtils.formatDayLabel(w.week_start)) + '</td>' +
                '<td class="tcell-days">' + w.days_logged + '</td>' +
                '<td class="tcell-cal">' + cell(w.avg, 'cal') + '</td>' +
                '<td class="tcell-protein">' + cell(w.avg, 'protein') + '</td>' +
                '<td class="tcell-carbs">' + cell(w.avg, 'carbs') + '</td>' +
                '<td class="tcell-fat">' + cell(w.avg, 'fat') + '</td>' +
                '</tr>';
        }
        html += '</tbody></table>';
        return html;
    }

    return {
        init: init
    };
})();

if (typeof window !== 'undefined') window.TrendsView = TrendsView;

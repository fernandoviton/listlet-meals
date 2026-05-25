// Shared view-layer helpers. Pure functions; no DOM, no window access inside.
// Loaded as a <script> in the browser and require()'d by Jest tests.

var ViewUtils = (function() {
    function formatMacros(m) {
        if (!m) return '';
        var parts = [];
        if (typeof m.cal === 'number') parts.push(m.cal + ' cal');
        if (typeof m.protein === 'number') parts.push(m.protein + 'g P');
        if (typeof m.carbs === 'number') parts.push(m.carbs + 'g C');
        if (typeof m.fat === 'number') parts.push(m.fat + 'g F');
        return parts.join(' • ');
    }

    // Local escape (element content only): single-quote escaping is intentionally
    // omitted — narrower than shared escapeHtml by design. Kept self-contained so
    // view/utils.js require()s standalone under Jest with no browser globals.
    function esc(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // Vulgar fractions we snap decimals to (rendering concern only — quantities are
    // stored as plain decimals).
    var FRACTIONS = [
        { v: 1 / 8, s: '⅛' },
        { v: 1 / 4, s: '¼' },
        { v: 1 / 3, s: '⅓' },
        { v: 3 / 8, s: '⅜' },
        { v: 1 / 2, s: '½' },
        { v: 5 / 8, s: '⅝' },
        { v: 2 / 3, s: '⅔' },
        { v: 3 / 4, s: '¾' },
        { v: 7 / 8, s: '⅞' }
    ];
    // Tight enough that 0.23 does NOT snap to ¼ (0.25) — falls back to a decimal.
    var FRAC_TOL = 0.0125;

    // Decimal → nice display: whole + snapped unicode fraction, else ≤2dp decimal.
    // null / undefined / non-number → ''.
    function formatQuantity(num) {
        if (typeof num !== 'number' || isNaN(num)) return '';
        var whole = Math.floor(num);
        var frac = num - whole;
        if (frac < FRAC_TOL) return String(whole);
        if (frac > 1 - FRAC_TOL) return String(whole + 1);
        for (var i = 0; i < FRACTIONS.length; i++) {
            if (Math.abs(frac - FRACTIONS[i].v) <= FRAC_TOL) {
                return (whole > 0 ? String(whole) : '') + FRACTIONS[i].s;
            }
        }
        return String(Math.round(num * 100) / 100);
    }

    // Render a structured recipe to an (already-escaped) HTML string shared by the
    // library card and the week modal. `factor` scales each numeric ingredient qty
    // (null qty never scales). A missing / null / {} / empty recipe → '(no recipe)'.
    function renderRecipeHtml(recipe, factor) {
        var f = Number(factor);
        if (isNaN(f)) f = 1;
        var base = (recipe && typeof recipe === 'object') ? recipe : {};
        var ingredients = Array.isArray(base.ingredients) ? base.ingredients : [];
        var steps = Array.isArray(base.steps) ? base.steps : [];
        if (ingredients.length === 0 && steps.length === 0) return '(no recipe)';

        var html = '';
        if (ingredients.length) {
            html += '<ul class="recipe-ingredients">';
            for (var i = 0; i < ingredients.length; i++) {
                var ing = ingredients[i] || {};
                var qty = (typeof ing.qty === 'number') ? ing.qty * f : null;
                var parts = [];
                var qtyStr = formatQuantity(qty);
                if (qtyStr) parts.push('<span class="ing-qty">' + esc(qtyStr) + '</span>');
                if (ing.unit) parts.push(esc(ing.unit));
                parts.push(esc(ing.item != null ? ing.item : ''));
                var line = parts.join(' ');
                if (ing.note) line += ' <span class="ing-note">(' + esc(ing.note) + ')</span>';
                html += '<li>' + line + '</li>';
            }
            html += '</ul>';
        }
        if (steps.length) {
            html += '<ol class="recipe-steps">';
            for (var j = 0; j < steps.length; j++) {
                html += '<li>' + esc(steps[j]) + '</li>';
            }
            html += '</ol>';
        }
        return html;
    }

    return {
        formatMacros: formatMacros,
        formatQuantity: formatQuantity,
        renderRecipeHtml: renderRecipeHtml
    };
})();

if (typeof window !== 'undefined') window.ViewUtils = ViewUtils;
if (typeof module !== 'undefined' && module.exports) module.exports = ViewUtils;

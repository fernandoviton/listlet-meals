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

    return {
        formatMacros: formatMacros
    };
})();

if (typeof window !== 'undefined') window.ViewUtils = ViewUtils;
if (typeof module !== 'undefined' && module.exports) module.exports = ViewUtils;

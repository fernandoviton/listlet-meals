// Pure date helpers (ISO 'YYYY-MM-DD' string math). No DOM, no window access.
// Day arithmetic uses Date.UTC only — never local `new Date('YYYY-MM-DD')`
// parsing or `toISOString()` on `now` (both introduce timezone drift).
// Loaded as a <script> in the browser and require()'d by Jest tests.
//
// Phase 1 fills this shell.

var MealsDates = (function() {
    return {};
})();

if (typeof window !== 'undefined') window.MealsDates = MealsDates;
if (typeof module !== 'undefined' && module.exports) module.exports = MealsDates;

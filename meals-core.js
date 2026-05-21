// Pure logic for listlet-meals. No DOM, no window access inside functions.
// Loaded as a <script> in the browser and require()'d by Jest tests.

var MealsCore = (function() {
    return {};
})();

if (typeof window !== 'undefined') window.MealsCore = MealsCore;
if (typeof module !== 'undefined' && module.exports) module.exports = MealsCore;

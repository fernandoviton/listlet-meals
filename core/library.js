// Library-meal logic: build / update / index / summarize / scale meal definitions.
// Pure functions, no DOM, no window access inside.
// Loaded as a <script> in the browser and require()'d by Jest tests.

var MealsLibrary = (function() {
    var Content = (typeof module !== 'undefined' && module.exports)
        ? require('./content')
        : MealsContent;

    var MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'];
    var MACRO_KEYS = ['cal', 'protein', 'carbs', 'fat'];

    // Build an { [rowId]: parsedMeal } map from raw library items. Non-meal /
    // unparseable rows are skipped. A null/undefined input yields an empty map.
    function indexLibrary(libraryItems) {
        var map = {};
        if (!libraryItems) return map;
        for (var i = 0; i < libraryItems.length; i++) {
            var parsed = Content.parseContent(libraryItems[i].content);
            if (parsed && parsed.kind === 'meal') map[libraryItems[i].id] = parsed;
        }
        return map;
    }

    function summarizeLibrary(items) {
        var out = [];
        for (var i = 0; i < items.length; i++) {
            var parsed = Content.parseContent(items[i].content);
            if (!parsed || parsed.kind !== 'meal') continue;
            // Ad-hoc meals are hidden from pickers/listings until promoted,
            // but stay in indexLibrary so placed slots still resolve.
            if (parsed.adhoc === true) continue;
            out.push({
                id: items[i].id,
                name: parsed.name || '',
                default_meal_type: parsed.default_meal_type || 'dinner'
            });
        }
        out.sort(function(a, b) {
            var an = a.name.toLowerCase();
            var bn = b.name.toLowerCase();
            if (an < bn) return -1;
            if (an > bn) return 1;
            return 0;
        });
        return out;
    }

    // Group summarized library meals by meal type, in canonical MEAL_TYPES order,
    // omitting empty types. When `filter` is a specific type, only that group is
    // considered ('all'/undefined = no restriction). Meals stay name-sorted within
    // each group (inherited from summarizeLibrary).
    function groupLibraryByType(items, filter) {
        var meals = summarizeLibrary(items);
        var groups = [];
        for (var i = 0; i < MEAL_TYPES.length; i++) {
            var mt = MEAL_TYPES[i];
            if (filter && filter !== 'all' && mt !== filter) continue;
            var inType = meals.filter(function(m) { return m.default_meal_type === mt; });
            if (inType.length) groups.push({ meal_type: mt, meals: inType });
        }
        return groups;
    }

    // Coerce any input into the canonical structured recipe shape:
    // { ingredients: [{ qty:<number|null>, unit:<string|null>, item:<string>, note?:<string> }], steps: [<non-empty string>] }.
    // A non-object input (e.g. a legacy recipe string) or a missing recipe yields
    // an empty recipe. Ingredient rows with no `item` are dropped; blank steps too.
    function normalizeRecipe(input) {
        var out = { ingredients: [], steps: [] };
        if (!input || typeof input !== 'object') return out;

        if (Array.isArray(input.ingredients)) {
            for (var i = 0; i < input.ingredients.length; i++) {
                var ing = input.ingredients[i];
                if (!ing || typeof ing !== 'object') continue;
                var item = typeof ing.item === 'string' ? ing.item.trim() : '';
                if (!item) continue;

                var qty = null;
                if (ing.qty !== null && ing.qty !== undefined && ing.qty !== '') {
                    var num = Number(ing.qty);
                    if (!isNaN(num)) qty = num;
                }

                var norm = {
                    qty: qty,
                    unit: (typeof ing.unit === 'string' && ing.unit.trim() !== '') ? ing.unit : null,
                    item: item
                };
                if (typeof ing.note === 'string' && ing.note.trim() !== '') norm.note = ing.note;
                out.ingredients.push(norm);
            }
        }

        if (Array.isArray(input.steps)) {
            for (var j = 0; j < input.steps.length; j++) {
                var step = input.steps[j];
                if (typeof step === 'string' && step.trim() !== '') out.steps.push(step);
            }
        }

        return out;
    }

    // Pure, non-mutating: returns a recipe whose ingredient quantities are scaled
    // by `factor` (null qty stays null; units/items/notes/steps untouched).
    // Tolerates a missing / null / {} recipe (getLibraryMeal returns {} for orphaned
    // slots) by returning an empty recipe.
    function scaleRecipe(recipe, factor) {
        var base = (recipe && typeof recipe === 'object') ? recipe : {};
        var ingredients = Array.isArray(base.ingredients) ? base.ingredients : [];
        var steps = Array.isArray(base.steps) ? base.steps : [];
        var f = Number(factor);
        if (isNaN(f)) f = 1;
        return {
            ingredients: ingredients.map(function(ing) {
                var copy = Object.assign({}, ing);
                if (typeof copy.qty === 'number') copy.qty = copy.qty * f;
                return copy;
            }),
            steps: steps.slice()
        };
    }

    function makeLibraryMeal(input) {
        input = input || {};
        var name = typeof input.name === 'string' ? input.name.trim() : '';
        if (!name) throw new Error('name is required');

        var mealType = input.default_meal_type || 'dinner';
        if (MEAL_TYPES.indexOf(mealType) === -1) {
            throw new Error('invalid meal type "' + mealType + '" (expected one of ' + MEAL_TYPES.join(', ') + ')');
        }

        var rawMacros = input.macros || {};
        var macros = {};
        for (var i = 0; i < MACRO_KEYS.length; i++) {
            var key = MACRO_KEYS[i];
            var num = Number(rawMacros[key]);
            if (rawMacros[key] !== null && rawMacros[key] !== undefined && rawMacros[key] !== '' && !isNaN(num)) {
                macros[key] = num;
            }
        }

        var meal = {
            kind: 'meal',
            name: name,
            recipe: normalizeRecipe(input.recipe),
            default_meal_type: mealType,
            macros: macros
        };
        // Key is present only when true; real (promoted) meals omit it entirely.
        if (input.adhoc === true) meal.adhoc = true;
        return meal;
    }

    // Merge `changes` onto an existing parsed library meal, keeping its id-bearing
    // row stable. Only fields present in `changes` override; macros merge per-key
    // (pass '' / null for a macro to clear it). Validation is delegated to
    // makeLibraryMeal so update and add stay in lockstep.
    function updateLibraryMeal(existing, changes) {
        if (!existing || existing.kind !== 'meal') {
            throw new Error('can only update a library meal');
        }
        changes = changes || {};

        var macros = {};
        var baseMacros = existing.macros || {};
        var changeMacros = changes.macros || {};
        for (var i = 0; i < MACRO_KEYS.length; i++) {
            var key = MACRO_KEYS[i];
            macros[key] = Object.prototype.hasOwnProperty.call(changeMacros, key)
                ? changeMacros[key]
                : baseMacros[key];
        }

        return makeLibraryMeal({
            name: changes.name !== undefined ? changes.name : existing.name,
            recipe: changes.recipe !== undefined ? changes.recipe : existing.recipe,
            default_meal_type: changes.default_meal_type !== undefined
                ? changes.default_meal_type
                : existing.default_meal_type,
            macros: macros,
            adhoc: changes.adhoc !== undefined ? changes.adhoc : existing.adhoc
        });
    }

    return {
        indexLibrary: indexLibrary,
        summarizeLibrary: summarizeLibrary,
        groupLibraryByType: groupLibraryByType,
        normalizeRecipe: normalizeRecipe,
        scaleRecipe: scaleRecipe,
        makeLibraryMeal: makeLibraryMeal,
        updateLibraryMeal: updateLibraryMeal
    };
})();

if (typeof window !== 'undefined') window.MealsLibrary = MealsLibrary;
if (typeof module !== 'undefined' && module.exports) module.exports = MealsLibrary;

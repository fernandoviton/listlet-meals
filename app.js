// listlet-meals shell. Dispatches ?list= to the right view module
// and owns the one-time mock-mode seed of the library.

var App = (function() {
    function init(el, listName) {
        var api = createApi(listName);
        // The trends view reads the week list, so it's gated on ?view=trends
        // before the list branch. (?list=library&view=trends is harmless-empty.)
        var params = new URLSearchParams(window.location.search);
        if (params.get('view') === 'trends') {
            TrendsView.init(el, api);
            return;
        }
        if (listName === 'capture') {
            CapturesView.init(el, api);
            return;
        }
        if (listName === 'library') {
            LibraryView.init(el, api);
        } else {
            WeekView.init(el, api);
        }
    }

    // ---- Voice/quick capture plumbing -------------------------------------
    // The iOS Shortcut opens ?list=capture&text=…&at=… . We stash that to
    // localStorage *before* auth so it survives the OAuth sign-in redirect
    // (which strips the query string), then the CapturesView flushes it once
    // authenticated. See docs/voice-capture.md.
    var PENDING_KEY = 'listlet_meals_pending_capture';

    function stashPendingCaptureFromUrl() {
        if (typeof window === 'undefined') return;
        var params = new URLSearchParams(window.location.search);
        var text = params.get('text');
        if (!text || !text.trim()) return;
        var pending = {
            text: text.trim(),
            at: (params.get('at') || '').trim() || null,
            source: (params.get('source') || '').trim() || 'shortcut'
        };
        try { localStorage.setItem(PENDING_KEY, JSON.stringify(pending)); } catch (e) {}
        // Strip the capture params so a reload can't double-capture; keep the rest.
        params.delete('text'); params.delete('at'); params.delete('source');
        var qs = params.toString();
        if (window.history && window.history.replaceState) {
            window.history.replaceState(null, '', window.location.pathname + (qs ? '?' + qs : ''));
        }
    }

    function hasPendingCapture() {
        try { return !!localStorage.getItem(PENDING_KEY); } catch (e) { return false; }
    }

    // Read + clear the stashed capture atomically (so a flush can't double-insert).
    function takePendingCapture() {
        var raw;
        try {
            raw = localStorage.getItem(PENDING_KEY);
            localStorage.removeItem(PENDING_KEY);
        } catch (e) { return null; }
        if (!raw) return null;
        try { return JSON.parse(raw); } catch (e) { return null; }
    }

    // Recipes are pre-normalized (numeric/null qty, string item, non-empty steps) —
    // the seed path bypasses makeLibraryMeal/normalizeRecipe (see ensureMockSeed).
    var DEMO_LIBRARY = [
        { name: 'Oatmeal', default_meal_type: 'breakfast', macros: { cal: 320, protein: 12, carbs: 55, fat: 6 }, recipe: {
            ingredients: [
                { qty: 50, unit: 'g', item: 'rolled oats' },
                { qty: 200, unit: 'ml', item: 'milk' },
                { qty: 0.5, unit: 'cup', item: 'berries' }
            ],
            steps: ['Simmer oats in milk for 5 min, stirring.', 'Top with berries.']
        } },
        { name: 'Avocado Toast', default_meal_type: 'breakfast', macros: { cal: 380, protein: 10, carbs: 38, fat: 22 }, recipe: {
            ingredients: [
                { qty: 1, unit: null, item: 'avocado' },
                { qty: 2, unit: 'slice', item: 'sourdough' },
                { qty: null, unit: null, item: 'salt, pepper, chili flakes', note: 'to taste' }
            ],
            steps: ['Toast the sourdough.', 'Mash avocado on top.', 'Season with salt, pepper, and chili flakes.']
        } },
        { name: 'Greek Yogurt Bowl', default_meal_type: 'breakfast', macros: { cal: 290, protein: 18, carbs: 32, fat: 9 }, recipe: {
            ingredients: [
                { qty: 200, unit: 'g', item: 'Greek yogurt' },
                { qty: 1, unit: 'tbsp', item: 'honey' },
                { qty: 0.5, unit: 'cup', item: 'granola' },
                { qty: 2, unit: 'tbsp', item: 'walnuts', note: 'chopped' }
            ],
            steps: ['Spoon yogurt into a bowl.', 'Drizzle with honey and top with granola and walnuts.']
        } },
        { name: 'Scrambled Eggs', default_meal_type: 'breakfast', macros: { cal: 270, protein: 19, carbs: 2, fat: 20 }, recipe: {
            ingredients: [
                { qty: 3, unit: null, item: 'eggs' },
                { qty: 1, unit: 'tbsp', item: 'butter' },
                { qty: null, unit: null, item: 'salt', note: 'to taste' }
            ],
            steps: ['Whisk the eggs with a pinch of salt.', 'Melt butter over low heat.', 'Add eggs and stir constantly until just set.']
        } },
        { name: 'Greek Salad', default_meal_type: 'lunch', macros: { cal: 420, protein: 14, carbs: 18, fat: 32 }, recipe: {
            ingredients: [
                { qty: 2, unit: null, item: 'tomatoes', note: 'wedged' },
                { qty: 1, unit: null, item: 'cucumber', note: 'sliced' },
                { qty: 100, unit: 'g', item: 'feta' },
                { qty: 0.25, unit: 'cup', item: 'olives' },
                { qty: 2, unit: 'tbsp', item: 'olive oil' }
            ],
            steps: ['Combine tomato, cucumber, feta, and olives.', 'Dress with olive oil.']
        } },
        { name: 'Chicken Wrap', default_meal_type: 'lunch', macros: { cal: 510, protein: 38, carbs: 42, fat: 18 }, recipe: {
            ingredients: [
                { qty: 150, unit: 'g', item: 'grilled chicken', note: 'sliced' },
                { qty: 1, unit: null, item: 'tortilla' },
                { qty: 1, unit: 'cup', item: 'lettuce' },
                { qty: 2, unit: 'tbsp', item: 'hummus' }
            ],
            steps: ['Spread hummus on the tortilla.', 'Layer chicken and lettuce.', 'Roll up tightly.']
        } },
        { name: 'Tuna Sandwich', default_meal_type: 'lunch', macros: { cal: 460, protein: 28, carbs: 36, fat: 20 }, recipe: {
            ingredients: [
                { qty: 1, unit: 'can', item: 'tuna', note: 'drained' },
                { qty: 2, unit: 'tbsp', item: 'mayo' },
                { qty: 1, unit: 'stalk', item: 'celery', note: 'diced' },
                { qty: 2, unit: 'slice', item: 'rye bread' }
            ],
            steps: ['Mix tuna with mayo and celery.', 'Spread between the bread slices.']
        } },
        { name: 'Lentil Soup', default_meal_type: 'lunch', macros: { cal: 340, protein: 20, carbs: 48, fat: 6 }, recipe: {
            ingredients: [
                { qty: 1, unit: 'cup', item: 'lentils' },
                { qty: 2, unit: null, item: 'carrots', note: 'diced' },
                { qty: 1, unit: null, item: 'onion', note: 'chopped' },
                { qty: 1, unit: 'tsp', item: 'cumin' },
                { qty: 1, unit: 'l', item: 'stock' }
            ],
            steps: ['Sauté onion and carrot.', 'Add lentils, cumin, and stock.', 'Simmer 25 min until tender.']
        } },
        { name: 'Roast Chicken', default_meal_type: 'dinner', macros: { cal: 650, protein: 55, carbs: 5, fat: 38 }, recipe: {
            ingredients: [
                { qty: 1, unit: null, item: 'whole chicken' },
                { qty: 2, unit: 'tbsp', item: 'olive oil' },
                { qty: null, unit: null, item: 'salt and pepper', note: 'to taste' }
            ],
            steps: ['Rub chicken with oil, salt, and pepper.', 'Roast at 200°C for 45 min.', 'Rest 10 min before carving.']
        } },
        { name: 'Pasta Pomodoro', default_meal_type: 'dinner', macros: { cal: 580, protein: 18, carbs: 95, fat: 10 }, recipe: {
            ingredients: [
                { qty: 200, unit: 'g', item: 'pasta' },
                { qty: 400, unit: 'g', item: 'tomatoes', note: 'crushed' },
                { qty: 2, unit: 'clove', item: 'garlic', note: 'minced' },
                { qty: 6, unit: 'leaf', item: 'basil' }
            ],
            steps: ['Boil pasta in salted water.', 'Simmer garlic and tomato into a sauce.', 'Toss pasta with sauce and basil.']
        } },
        { name: 'Salmon + Rice', default_meal_type: 'dinner', macros: { cal: 620, protein: 42, carbs: 60, fat: 22 }, recipe: {
            ingredients: [
                { qty: 1, unit: 'fillet', item: 'salmon' },
                { qty: 1, unit: 'cup', item: 'jasmine rice' },
                { qty: 1, unit: 'tbsp', item: 'olive oil' }
            ],
            steps: ['Cook rice.', 'Pan-sear salmon 4 min per side.', 'Serve salmon over rice.']
        } },
        { name: 'Beef Stir Fry', default_meal_type: 'dinner', macros: { cal: 540, protein: 38, carbs: 32, fat: 26 }, recipe: {
            ingredients: [
                { qty: 200, unit: 'g', item: 'beef strips' },
                { qty: 2, unit: 'cup', item: 'mixed vegetables' },
                { qty: 3, unit: 'tbsp', item: 'soy-ginger sauce' }
            ],
            steps: ['Sear beef in a hot wok.', 'Add vegetables and stir-fry 3 min.', 'Toss with soy-ginger sauce.']
        } },
        { name: 'Veggie Curry', default_meal_type: 'dinner', macros: { cal: 490, protein: 16, carbs: 52, fat: 24 }, recipe: {
            ingredients: [
                { qty: 1, unit: 'can', item: 'chickpeas', note: 'drained' },
                { qty: 2, unit: 'cup', item: 'spinach' },
                { qty: 1, unit: 'can', item: 'coconut milk' },
                { qty: 2, unit: 'tbsp', item: 'curry paste' }
            ],
            steps: ['Fry curry paste briefly.', 'Add coconut milk and chickpeas.', 'Stir in spinach until wilted.']
        } },
        { name: 'Apple + PB', default_meal_type: 'snack', macros: { cal: 220, protein: 6, carbs: 28, fat: 11 }, recipe: {
            ingredients: [
                { qty: 1, unit: null, item: 'apple', note: 'sliced' },
                { qty: 2, unit: 'tbsp', item: 'peanut butter' }
            ],
            steps: ['Slice the apple.', 'Serve with peanut butter for dipping.']
        } },
        { name: 'Trail Mix', default_meal_type: 'snack', macros: { cal: 280, protein: 8, carbs: 24, fat: 18 }, recipe: {
            ingredients: [
                { qty: 0.25, unit: 'cup', item: 'almonds' },
                { qty: 0.25, unit: 'cup', item: 'cashews' },
                { qty: 0.25, unit: 'cup', item: 'raisins' },
                { qty: 2, unit: 'tbsp', item: 'dark chocolate' }
            ],
            steps: ['Toss everything together.']
        } },
        { name: 'Hummus + Carrots', default_meal_type: 'snack', macros: { cal: 180, protein: 6, carbs: 22, fat: 8 }, recipe: {
            ingredients: [
                { qty: 3, unit: null, item: 'carrots', note: 'cut into sticks' },
                { qty: 0.5, unit: 'cup', item: 'hummus' }
            ],
            steps: ['Cut carrots into sticks.', 'Serve with hummus.']
        } }
    ];

    var seedPromise = null;

    async function ensureMockSeed() {
        if (seedPromise) return seedPromise;
        seedPromise = (async function() {
            var seedApi = createApi('library');
            if (!seedApi.isMock) return false;
            var existing = await seedApi.fetchItems();
            if (existing.length > 0) return false;
            for (var i = 0; i < DEMO_LIBRARY.length; i++) {
                await seedApi.createItem({ content: MealsCore.serialize(Object.assign({ kind: 'meal' }, DEMO_LIBRARY[i])) });
            }
            return true;
        })();
        return seedPromise;
    }

    return {
        init: init,
        ensureMockSeed: ensureMockSeed,
        stashPendingCaptureFromUrl: stashPendingCaptureFromUrl,
        hasPendingCapture: hasPendingCapture,
        takePendingCapture: takePendingCapture
    };
})();

// listlet-meals shell. Dispatches ?list= to the right view module
// and owns the one-time mock-mode seed of the library.

var App = (function() {
    function init(el, listName) {
        var api = createApi(listName);
        if (listName === 'library') {
            LibraryView.init(el, api);
        } else {
            WeekView.init(el, api);
        }
    }

    var DEMO_LIBRARY = [
        { name: 'Oatmeal',          recipe: 'Cook oats with milk. Top with berries.',                default_meal_type: 'breakfast', macros: { cal: 320, protein: 12, carbs: 55, fat: 6 } },
        { name: 'Avocado Toast',    recipe: 'Mash avocado on toasted sourdough. Salt, pepper, chili flakes.', default_meal_type: 'breakfast', macros: { cal: 380, protein: 10, carbs: 38, fat: 22 } },
        { name: 'Greek Yogurt Bowl', recipe: 'Yogurt with honey, granola, and walnuts.',             default_meal_type: 'breakfast', macros: { cal: 290, protein: 18, carbs: 32, fat: 9 } },
        { name: 'Scrambled Eggs',   recipe: 'Whisk 3 eggs with butter. Low heat, stir constantly.',  default_meal_type: 'breakfast', macros: { cal: 270, protein: 19, carbs: 2,  fat: 20 } },
        { name: 'Greek Salad',      recipe: 'Tomato, cucumber, feta, olives, olive oil.',            default_meal_type: 'lunch',     macros: { cal: 420, protein: 14, carbs: 18, fat: 32 } },
        { name: 'Chicken Wrap',     recipe: 'Grilled chicken, lettuce, hummus in a tortilla.',       default_meal_type: 'lunch',     macros: { cal: 510, protein: 38, carbs: 42, fat: 18 } },
        { name: 'Tuna Sandwich',    recipe: 'Tuna with mayo, celery, on rye bread.',                 default_meal_type: 'lunch',     macros: { cal: 460, protein: 28, carbs: 36, fat: 20 } },
        { name: 'Lentil Soup',      recipe: 'Simmer lentils with carrots, onion, cumin, stock.',     default_meal_type: 'lunch',     macros: { cal: 340, protein: 20, carbs: 48, fat: 6 } },
        { name: 'Roast Chicken',    recipe: 'Roast at 200°C for 45 min. Rest 10 min.',               default_meal_type: 'dinner',    macros: { cal: 650, protein: 55, carbs: 5,  fat: 38 } },
        { name: 'Pasta Pomodoro',   recipe: 'Boil pasta. Toss with tomato-basil sauce.',             default_meal_type: 'dinner',    macros: { cal: 580, protein: 18, carbs: 95, fat: 10 } },
        { name: 'Salmon + Rice',    recipe: 'Pan-sear salmon 4 min/side. Serve over jasmine rice.',  default_meal_type: 'dinner',    macros: { cal: 620, protein: 42, carbs: 60, fat: 22 } },
        { name: 'Beef Stir Fry',    recipe: 'Sear beef strips. Add veg + soy-ginger sauce.',         default_meal_type: 'dinner',    macros: { cal: 540, protein: 38, carbs: 32, fat: 26 } },
        { name: 'Veggie Curry',     recipe: 'Simmer chickpeas + spinach in coconut curry sauce.',    default_meal_type: 'dinner',    macros: { cal: 490, protein: 16, carbs: 52, fat: 24 } },
        { name: 'Apple + PB',       recipe: 'Sliced apple with peanut butter.',                      default_meal_type: 'snack',     macros: { cal: 220, protein: 6,  carbs: 28, fat: 11 } },
        { name: 'Trail Mix',        recipe: 'Almonds, cashews, raisins, dark chocolate.',            default_meal_type: 'snack',     macros: { cal: 280, protein: 8,  carbs: 24, fat: 18 } },
        { name: 'Hummus + Carrots', recipe: 'Carrot sticks with a side of hummus.',                  default_meal_type: 'snack',     macros: { cal: 180, protein: 6,  carbs: 22, fat: 8 } }
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
        ensureMockSeed: ensureMockSeed
    };
})();

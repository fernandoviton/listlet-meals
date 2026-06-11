// Facade over the core/ modules. Re-exports the same flat `MealsCore` object the
// view layer and CLI have always called, so splitting the implementation into
// core/{content,dates,library,slots,macros}.js requires zero call-site changes.
//
// In the browser the modules attach themselves to window (script-tag order in
// index.html loads them before this file); under Node each is require()'d.
// Loaded as a <script> in the browser and require()'d by Jest tests.

var MealsCore = (function() {
    var isNode = (typeof module !== 'undefined' && module.exports);
    var Content = isNode ? require('./core/content') : MealsContent;
    var Dates   = isNode ? require('./core/dates')   : MealsDates;
    var Library = isNode ? require('./core/library') : MealsLibrary;
    var Slots   = isNode ? require('./core/slots')   : MealsSlots;
    var Macros  = isNode ? require('./core/macros')  : MealsMacros;

    return {
        // content
        parseContent: Content.parseContent,
        serialize: Content.serialize,
        // slots
        nextOrder: Slots.nextOrder,
        addSlot: Slots.addSlot,
        moveSlot: Slots.moveSlot,
        removeSlot: Slots.removeSlot,
        setMealType: Slots.setMealType,
        filterSlotsByType: Slots.filterSlotsByType,
        cleanSlot: Slots.cleanSlot,
        // macros
        summarizeMacros: Macros.summarizeMacros,
        resolveSlot: Macros.resolveSlot,
        // library
        indexLibrary: Library.indexLibrary,
        summarizeLibrary: Library.summarizeLibrary,
        groupLibraryByType: Library.groupLibraryByType,
        makeLibraryMeal: Library.makeLibraryMeal,
        updateLibraryMeal: Library.updateLibraryMeal,
        scaleRecipe: Library.scaleRecipe
    };
})();

if (typeof window !== 'undefined') window.MealsCore = MealsCore;
if (typeof module !== 'undefined' && module.exports) module.exports = MealsCore;

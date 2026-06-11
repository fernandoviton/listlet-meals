// Content (de)serialization. No DOM, no window access inside functions.
// Loaded as a <script> in the browser and require()'d by Jest tests.

var MealsContent = (function() {
    function parseContent(jsonString) {
        if (typeof jsonString !== 'string' || jsonString === '') return null;
        try {
            return JSON.parse(jsonString);
        } catch (e) {
            return null;
        }
    }

    function serialize(obj) {
        return JSON.stringify(obj);
    }

    return {
        parseContent: parseContent,
        serialize: serialize
    };
})();

if (typeof window !== 'undefined') window.MealsContent = MealsContent;
if (typeof module !== 'undefined' && module.exports) module.exports = MealsContent;

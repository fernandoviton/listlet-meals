# Architecture

Living reference for how `listlet-meals` is wired together. Update on each commit when the structure, data model, or boundaries change.

## Shape of the app

A static, build-step-free vanilla-JS app on top of the `listlet-shared` starter kit. Two pages, selected by the `?list=` query parameter:

- `?list=library` — meal definitions (name, structured recipe, default meal type, macros).
- `?list=week` — planned slots in a hypothetical 7-day week (sat → fri).

`index.html` boots in this order: shared infra (`shared/*.js`) → `meals-core.js` → `view/utils.js` → `view/library.js` → `view/week.js` → `app.js` → `Auth.init` callback that renders `Header`, runs `App.ensureMockSeed`, then either `App.init` (when a list is in the URL) or `Home.render`. `App.init` dispatches to `LibraryView.init` or `WeekView.init` based on `listName`.

## Layers and boundaries

```
┌──────────────────────────────────────────────────────────┐
│ index.html  — script tags, no logic                      │
├──────────────────────────────────────────────────────────┤
│ app.js      — shell. Dispatches ?list= to a view module  │
│               and owns the one-time mock-mode seed.      │
├──────────────────────────────────────────────────────────┤
│ view/                                                    │
│   library.js  — LibraryView: renders ?list=library       │
│   week.js     — WeekView: renders ?list=week (planner,   │
│                 drag-and-drop, picker, slot cards)       │
│   utils.js    — ViewUtils: presentation helpers          │
│                 (formatMacros, formatQuantity,           │
│                 renderRecipeHtml). Pure, Jest-required.  │
│                                                          │
│   View modules own DOM render + event wiring + their own │
│   in-memory items copy. They call into MealsCore for     │
│   every state transformation and persist via api.        │
├──────────────────────────────────────────────────────────┤
│ meals-core.js — pure functions, no DOM, no window.       │
│                 Required by Jest, attached to            │
│                 window.MealsCore in the browser.         │
├──────────────────────────────────────────────────────────┤
│ shared/     — upstream starter kit. DO NOT EDIT.         │
│   api.js          createApi(listName) → CRUD on the      │
│                   shared `content` column (Supabase or   │
│                   localStorage mock).                    │
│   auth.js         Google sign-in, gates app render.      │
│   header.js       Top bar.                               │
│   home.js         Landing page when no ?list= is set.    │
│   sync.js         Polls/refreshes items.                 │
│   supabase-client.js, config-loader.js, utils.js,        │
│   version.js                                             │
└──────────────────────────────────────────────────────────┘
```

The hard rule: every state transformation goes through `MealsCore`. A view module parses items, calls a `MealsCore.*` function, applies the result to its in-memory `items` array, re-renders, then persists via `api`. Presentation formatting (e.g. macro strings) goes through `ViewUtils`, not `MealsCore`.

## Data model

The shared backend only persists a `content` string per item. We JSON-encode meal-specific shapes into it.

**Library item content** (`?list=library`):
```js
{ kind: "meal", name, recipe, default_meal_type, macros: { cal?, protein?, carbs?, fat? } }
```

`recipe` is a **structured object**, not a string:
```js
recipe: {
  ingredients: [
    { qty: 200,  unit: "g",     item: "pasta" },
    { qty: 0.5,  unit: "cup",   item: "parmesan", note: "grated" },
    { qty: null, unit: null,    item: "salt",     note: "to taste" }  // qty:null never scales
  ],
  steps: ["Boil salted water.", "Cook pasta 10 min."]
}
```
Quantities are plain decimals (fractions are a render concern). Macros are **per serving** (= per ×1 batch); the recipe modal's ×N stepper scales the ingredient display and the macro display (`macro × N`) at render time only — stored values never change.

**Week item content** (`?list=week`):
```js
{ kind: "slot", library_id, day, meal_type, order }
```

Notes:
- A slot stores **no name/macros/recipe snapshot**. The week page fetches both lists on boot and renders as a **live join**: it builds a `{ [libraryRowId]: parsedMeal }` map (`MealsCore.indexLibrary`) and resolves each slot's name + macros from its library row by `library_id` (`MealsCore.resolveSlot`); expanding a slot fetches the same row's recipe. A library edit (e.g. via the CLI) therefore shows up on the next week reload without remove/re-add. A slot whose library meal was **deleted** has no match, so it renders a `(deleted meal)` fallback and contributes 0 to day totals — the accepted tradeoff for live correctness in a hypothetical planner.
- `day` is one of `["sat","sun","mon","tue","wed","thu","fri"]`.
- `meal_type` is one of `["breakfast","lunch","dinner","snack"]`.
- Any macro field may be missing or `null`. `summarizeMacros` only emits keys that appeared at least once.
- `order` is per-(day, meal_type), 0-indexed, and recompacted on move / delete.

## `MealsCore` surface

Defined in `meals-core.js`. All pure, all covered by `tests/unit/meals-core.test.js`.

- `parseContent(jsonString)` → object | `null`
- `serialize(obj)` → string
- `nextOrder(slots, day, mealType)` → number
- `addSlot(weekItems, libraryMeal, day)` → `{ newSlotContent }` — meal_type comes from the library meal's `default_meal_type`; emits the snapshot-free slot shape
- `moveSlot(slots, id, toDay, toMealType, toIndex)` → new slot array with recompacted `order` within source and target (day, meal_type) sections
- `removeSlot(slots, id)` → new slot array with recompacted `order` within the source (day, meal_type)
- `setMealType(slots, id, mealType)` → new slot array
- `indexLibrary(libraryItems)` → `{ [rowId]: parsedMeal }` map (skips non-meal / unparseable rows; null input → `{}`). Built once per week load to drive the live join.
- `resolveSlot(slot, libraryById)` → `{ name, macros, found }` — joins a slot to its live library meal; when absent (deleted), returns `{ name: '(deleted meal)', macros: {}, found: false }`. Tolerates a null map (resolves to the fallback, never throws).
- `summarizeMacros(slots, libraryById)` → totals object (only keys that appeared), summing the **live** library macros for each slot; slots with no matching library row contribute nothing. Tolerates a null map.
- `cleanSlot(slot)` → a slot stripped of the legacy `name_snapshot`/`macros_snapshot` fields (idempotent, non-mutating). Used by the `migrate-week` CLI to rewrite existing rows.
- `summarizeLibrary(items)` → `[{ id, name, default_meal_type }]` sorted by name
- `groupLibraryByType(items, filter)` → `[{ meal_type, meals }]` in canonical meal-type order, empty types omitted; `filter` (a meal type) restricts to one group (`'all'`/undefined = no restriction). Drives the picker's grouped/filtered render.
- `filterSlotsByType(slots, type)` — `'all'` passes through
- `makeLibraryMeal(input)` → library `content` object `{ kind:'meal', name, recipe, default_meal_type, macros }`. Requires a non-blank `name`, defaults `default_meal_type` to `dinner` (throws on an unknown type), runs `input.recipe` through an internal `normalizeRecipe` (always a `{ ingredients, steps }` object — coerces `qty` to number/`null`, defaults `unit` to `null`, drops item-less ingredients and blank steps; a missing or non-object recipe → `{ ingredients: [], steps: [] }`), and keeps only macro keys whose value coerces to a finite number. Used by the `scripts/library.js` CLI.
- `updateLibraryMeal(existing, changes)` → merges `changes` onto an existing parsed meal and returns a fresh `content` object. Only fields present in `changes` override; macros merge per-key (pass `''`/`null` to clear one); a `changes.recipe` flows through `normalizeRecipe` via `makeLibraryMeal`. Validation is delegated to `makeLibraryMeal`. Lets the CLI edit a row **in place** (stable `id`) so placed week slots keep their recipe link.
- `scaleRecipe(recipe, factor)` → a new (non-mutating) recipe with each numeric ingredient `qty` multiplied by `factor` (`null` qty stays `null`; units/items/notes/steps untouched). Tolerates a missing / `null` / `{}` recipe (returns `{ ingredients: [], steps: [] }`), since `getLibraryMeal` returns `{}` for an orphaned slot.

## `ViewUtils` surface

Defined in `view/utils.js`. Pure presentation helpers, covered by `tests/unit/view-utils.test.js`.

- `formatMacros(m)` → `'500 cal • 20g P • 50g C • 10g F'` (skips missing / non-numeric keys, no leading/trailing separator, empty string for null / `{}`).
- `formatQuantity(num)` → decimal rendered as a nice fraction: whole part + nearest snapped vulgar fraction (⅛ ¼ ⅓ ⅜ ½ ⅝ ⅔ ¾ ⅞) within a tight tolerance, else a ≤2dp decimal. `1.5 → "1½"`, `2/3 → "⅔"`, `0.2 → "0.2"`, `null → ""`.
- `renderRecipeHtml(recipe, factor)` → an already-escaped HTML string (a `.recipe-ingredients` list + numbered `.recipe-steps` list) shared by the library card (×1) and the week modal (×N). Scales numeric quantities by `factor` (qty:`null` rows show just item/note). Missing / null / `{}` / empty recipe → `(no recipe)`. Self-contained (a local `esc()`, no browser globals) so it `require()`s standalone under Jest.

## `app.js` responsibilities

A thin shell:

- `App.init(el, listName)` — creates the per-list `api` and dispatches to `WeekView.init` or `LibraryView.init`.
- `App.ensureMockSeed()` — one-time `DEMO_LIBRARY` insert when running in mock mode with an empty library. Called from `index.html` before any view init.

## View module responsibilities

Each `*View.init(container, api)` module:

- Owns its own in-memory `items` array (loaded via `api.fetchItems()`).
- Wires `Sync.init(api, refreshCb)` so cross-tab updates re-render.
- Renders its DOM and wires its events.
- Persists by calling `api.updateItem` / `createItem` / `deleteItem` after applying a `MealsCore` result.

`LibraryView` additionally calls back to `App.ensureMockSeed()` during render so a freshly opened mock-mode library page populates itself.

`WeekView` additionally fetches the library alongside the week on boot (`loadAndRender`, in parallel) and keeps a `libraryCache` + a `libraryById` map (`MealsCore.indexLibrary`). The map drives the live join for slot names, macros, and day totals; `libraryCache` also feeds the picker and the recipe modal's `getLibraryMeal`. `libraryById` is initialized to `{}` (not null) so a realtime `Sync`-triggered `render()` that fires before the library load resolves slots to fallbacks instead of crashing.

### Day column layout

Each day column renders four meal-type sections (`breakfast`, `lunch`, `dinner`, `snack`) as `.meal-section[data-day][data-meal-type]`. Slots live in their meal-type section, sorted by `order` within that section. The active filter (`all` / a specific meal type) controls which sections render. Empty sections still render so they remain valid drop targets.

### Slot card interactions

The slot card has two affordances: the card body opens the recipe modal on `click`, and a small iOS-style `.slot-grab` handle on the right starts a drag on `pointerdown`. The card's name + macro line are resolved live via `MealsCore.resolveSlot(slot, libraryById)`. The modal contains the meal name, the (per-serving) macro line, a `− ×N +` scale stepper, the recipe (rendered via `ViewUtils.renderRecipeHtml`), and a destructive **Delete** action. The recipe is fetched async after the modal opens; the stepper is enabled only once the fetch resolves and its change handler closes over the resolved recipe + the slot's live macros (resolved from the library by `library_id`; `dialog.dataset.factor` holds only the integer N), re-rendering ingredients via `renderRecipeHtml(recipe, N)` and the macro line via `formatMacros(macros × N)`. Drag changes both day and meal_type by dropping into a target `.meal-section`.

### Drag-and-drop

Pointer-based, works on mouse and touch alike, no gesture timing. `pointerdown` on `.slot-grab` immediately begins the drag (no long-press, no movement threshold). `.slot-grab` is the only element with `touch-action: none`, so the browser does not steal the gesture for scrolling — the rest of the card scrolls normally. Pointer capture is taken on `pointerdown` so the gesture survives the finger drifting off the handle. A floating ghost element follows the pointer; `elementFromPoint` (with the ghost briefly hidden) resolves the nearest `.meal-section` (falling back to the column + the slot's current meal_type if dropped outside any section). On `pointerup` a flag suppresses the synthesized `click` so the modal does not open after a drag. Commit goes through `MealsCore.moveSlot(id, day, mealType, index)` and a debounced batch of `api.updateItem` calls.

### Library card interactions

The whole library card is the toggle: click (or Enter/Space when focused) flips `library-body[hidden]` and `aria-expanded`. No separate toggle button.

## Persistence

`shared/api.js#createApi(listName)`:
- **Mock mode** (no `SUPABASE_URL` in config) — reads/writes `localStorage` under `listlet_<DB_TABLE>_<listName>`, i.e. `listlet_listlet_meals_week` and `listlet_listlet_meals_library`.
- **Supabase mode** — CRUD on the `listlet_meals` table, filtered by `list_name`.

`shared/sync.js` provides cross-tab refresh; `app.js` re-renders when notified.

## Config

- `config.js` — checked in, default values. CI injects the production Supabase secrets into it at deploy time (`.github/workflows/deploy.yml`); the checked-in copy stays blank.
- `config.local.js` — gitignored, overrides for local dev. Loaded only on localhost by `shared/config-loader.js`, in preference to `config.js`.
- Keys: `APP_TITLE: 'Listlet Meals'`, `DB_TABLE: 'listlet_meals'`, `DEFAULT_LIST_NAME: 'week'`, optional `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY`.

## CLI tooling (`scripts/`)

Node scripts for tasks the browser app has no UI for yet — currently managing the meal library. These run in Node, never in the browser, and read credentials from a gitignored `.env` (see `.env.example`), separate from `config.local.js`.

- `scripts/library.js` — `list` / `add` / `update` / `delete` library meals. `add` and `update` accept `--file <path.json>` (a whole-meal JSON document `{ name, type, macros, recipe }` — the way to supply a structured recipe; its CLI-friendly `type` is mapped to `default_meal_type` before calling core), plus scalar flags (`--name`/`--type`/`--cal`/…) that override the file's fields. `add` builds `content` via `MealsCore.makeLibraryMeal`; `update` selects a row by `--id`/`--name` and rewrites its `content` in place via `MealsCore.updateLibraryMeal` (id stays stable, so week slots that point at it keep their recipe); `delete` accepts `--id <uuid>` or `--name <name>` (errors if a name is ambiguous). A `migrate-week` subcommand (`--list <name>`, `--dry-run`) is a one-time, idempotent cleanup that rewrites week slot rows to the snapshot-free live-join shape via `MealsCore.cleanSlot`. Reads/writes the `listlet_meals` table (`list_name = 'library'`, or `migrate-week`'s `--list`).
- `scripts/supabase-cli.js` — shared client. Authenticates as a real user with a stored Google **refresh token** (not a `service_role` key), so the CLI is bound by the same RLS as the app. Supabase rotates the refresh token on each use, so `login()` writes the new token back to `.env`.
- `scripts/google-login.js` — one-time bootstrap: serves `http://localhost:3000`, runs the Google OAuth flow, and writes `SUPABASE_REFRESH_TOKEN` into `.env`. Requires the Google provider enabled and `http://localhost:3000/auth/callback` allow-listed in Supabase.

`.env` keys: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (same values as `config.local.js`), `SUPABASE_REFRESH_TOKEN` (bootstrapped), optional `DB_TABLE` (defaults to `listlet_meals`).

## Tests

- `tests/unit/meals-core.test.js` — Jest, pure-function coverage of `MealsCore`.
- `tests/unit/view-utils.test.js` — Jest, pure-function coverage of `ViewUtils.formatMacros`, `formatQuantity`, and `renderRecipeHtml`.
- `tests/e2e/*.spec.js` — Playwright, drives the real DOM in mock mode (seed, planner, library, filter, picker, meal-type, delete, touch-drag).
- `npm test` / `npm run test:e2e` / `npm run test:all`.

Working agreement: don't commit on red. TDD when a test can fail first — Jest for `meals-core`, Playwright for DOM/glue.

## Files at a glance

| Path | Role |
|---|---|
| `index.html` | Script tags + boot script |
| `meals-core.js` | Pure logic, the only place state transitions live |
| `app.js` | Shell: dispatch by `?list=`, mock-mode seed |
| `view/utils.js` | `ViewUtils` — shared view-layer helpers (`formatMacros`, `formatQuantity`, `renderRecipeHtml`) |
| `view/library.js` | `LibraryView` — renders `?list=library` |
| `view/week.js` | `WeekView` — renders `?list=week` (grid, drag, picker, cards) |
| `app.css` | App-specific styles |
| `config.js` / `config.local.js` | Runtime config |
| `shared/` | Upstream starter kit — do not edit |
| `scripts/library.js` | CLI to list/add/update/delete library meals (no UI yet) |
| `scripts/supabase-cli.js` | Shared CLI Supabase client + refresh-token login |
| `scripts/google-login.js` | One-time OAuth bootstrap for the CLI refresh token |
| `.env` / `.env.example` | CLI credentials (gitignored / template) |
| `sql/setup.sql` | Supabase table setup |
| `tests/unit/` | Jest |
| `tests/e2e/` | Playwright |
| `docs/architecture.md` | This file |

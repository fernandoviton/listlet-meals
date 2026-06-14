# Architecture

Living reference for how `listlet-meals` is wired together. Update on each commit when the structure, data model, or boundaries change.

## Shape of the app

A static, build-step-free vanilla-JS app on top of the `listlet-shared` starter kit. Pages are selected by the `?list=` query parameter, with a `?view=` overlay:

- `?list=library` — the one special list: meal definitions (name, structured recipe, default meal type, macros).
- `?list=<calendar>` — any non-`library` name is an independent calendar of planned slots on a **real, dated** Saturday-start week. `?date=YYYY-MM-DD` anchors which week renders (default: today); prev/next nav rewrites it. All calendars are structurally identical — there is **no default/privileged name**; a `?list=` is always explicit (Home shows the picker when it's absent).
- `?list=<calendar>&view=trends[&date=][&range=2|4|12]` — read-only trends (calories/protein per day + weekly averages) for that calendar.

`index.html` boots in this order: shared infra (`shared/*.js`) → `core/{content,dates,library,slots,macros}.js` → `meals-core.js` (facade) → `view/utils.js` → `view/library.js` → `view/week.js` → `view/trends.js` → `app.js` → `Auth.init` callback that renders `Header`, runs `App.ensureMockSeed`, then either `App.init` (when a list is in the URL) or `Home.render`. `App.init` reads `?view=`: `trends` → `TrendsView.init`; otherwise it dispatches to `LibraryView.init` or `WeekView.init` based on `listName`.

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
│   week.js     — WeekView: any non-library ?list=         │
│                 (dated planner, drag-and-drop, picker)   │
│   trends.js   — TrendsView: ?view=trends (read-only      │
│                 charts + weekly averages)                │
│   utils.js    — ViewUtils: presentation helpers          │
│                 (formatMacros, formatQuantity,           │
│                 renderRecipeHtml). Pure, Jest-required.  │
│                                                          │
│   View modules own DOM render + event wiring + their own │
│   in-memory items copy. They call into MealsCore for     │
│   every state transformation and persist via api.        │
├──────────────────────────────────────────────────────────┤
│ core/         — pure functions, no DOM, no window.       │
│   content.js  — MealsContent: parseContent, serialize    │
│   dates.js    — MealsDates: ISO date math (Phase 1+)     │
│   library.js  — MealsLibrary: make/update/index/group/   │
│                 summarize/scale meal definitions         │
│   slots.js    — MealsSlots: nextOrder/add/move/remove/   │
│                 setMealType/filterSlotsByType            │
│   macros.js   — MealsMacros: resolveSlot, summarizeMacros│
│ meals-core.js — thin facade re-exporting the flat        │
│                 MealsCore object the views/CLI call.     │
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
{ kind: "meal", name, recipe, default_meal_type, macros: { cal?, protein?, carbs?, fat? }, adhoc?: true }
```

`adhoc: true` marks a meal created by the planner's **quick add** (a name + optional macros logged on the fly, empty recipe). The key is present only when true — real and promoted meals omit it entirely. Ad-hoc meals are hidden from the picker list and the library page, but they stay in the live-join index so their placed slots resolve and count toward day totals, and they can be re-placed only via their existing slots. Promotion happens through the CLI: `update --id <uuid> --file recipe.json` writes a real recipe and clears the flag on the same row id, so already-placed slots keep working.

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

**Calendar item content** (any non-`library` `?list=`):
```js
{ kind: "slot", library_id, date: "YYYY-MM-DD", meal_type, order }
```

Notes:
- A slot stores **no name/macros/recipe snapshot**. A calendar page fetches its own list plus the shared `library` on boot and renders as a **live join**: it builds a `{ [libraryRowId]: parsedMeal }` map (`MealsCore.indexLibrary`) and resolves each slot's name + macros from its library row by `library_id` (`MealsCore.resolveSlot`); expanding a slot fetches the same row's recipe. A library edit (e.g. via the CLI) therefore shows up on the next reload without remove/re-add — and **retroactively changes past day/week totals** (accepted). A slot whose library meal was **deleted** has no match, so it renders a `(deleted meal)` fallback and contributes 0 to totals.
- `date` is a real ISO calendar date. The planner renders the 7 dates (Sat→Fri) of the week containing `?date=` (default today, validated; falls back to the local wall-clock day). **No legacy / migration:** the dated shape *is* the slot shape, so `parseSlots` simply keeps slots with a valid `date` and ignores anything else.
- `meal_type` is one of `["breakfast","lunch","dinner","snack"]`.
- Any macro field may be missing or `null`. `summarizeMacros` only emits keys that appeared at least once.
- `order` is per-(date, meal_type), 0-indexed, and recompacted on move / delete.

## `MealsCore` surface

Implemented across the `core/` modules and re-exported, unchanged, by the `meals-core.js` facade — view modules and the CLI keep calling the same flat `MealsCore.*` names. Each module uses the same UMD-lite pattern (`var X = (function(){…})(); window.X = X; module.exports = X;`); cross-module deps resolve via `require('./content')` under Node and the script-tag-ordered global in the browser (`index.html` loads `core/content.js` → `dates.js` → `library.js` → `slots.js` → `macros.js` → `meals-core.js`). All pure; covered 1:1 by `tests/unit/{content,dates,library,slots,macros}.test.js` (each requires its module directly, not the facade).

- `parseContent(jsonString)` → object | `null` _(content)_
- `serialize(obj)` → string _(content)_
- `isIsoDate(s)`, `addDays(iso, n)`, `dayOfWeek(iso)` → `'sat'..'fri'`, `weekStart(iso)` → the Saturday on/before, `weekDates(iso)` → 7 ISO dates Sat→Fri, `dateRange(from, to)` → inclusive ISO array _(dates; pure UTC string math, no local `Date` parsing)_
- `nextOrder(slots, date, mealType)` → number
- `addSlot(weekItems, libraryMeal, date)` → `{ newSlotContent }` — meal_type comes from the library meal's `default_meal_type`; emits `{ kind, library_id, date, meal_type, order }`
- `moveSlot(slots, id, toDate, toMealType, toIndex)` → new slot array with recompacted `order` within source and target (date, meal_type) sections
- `removeSlot(slots, id)` → new slot array with recompacted `order` within the source (date, meal_type)
- `setMealType(slots, id, mealType)` → new slot array
- `indexLibrary(libraryItems)` → `{ [rowId]: parsedMeal }` map (skips non-meal / unparseable rows; null input → `{}`). Built once per week load to drive the live join. **Includes ad-hoc meals** so their slots resolve.
- `resolveSlot(slot, libraryById)` → `{ name, macros, found }` — joins a slot to its live library meal; when absent (deleted), returns `{ name: '(deleted meal)', macros: {}, found: false }`. Tolerates a null map (resolves to the fallback, never throws).
- `summarizeMacros(slots, libraryById)` → totals object (only keys that appeared), summing the **live** library macros for each slot; slots with no matching library row contribute nothing. Tolerates a null map.
- `summarizeMacrosByDate(slots, libraryById)` → `{ [iso]: macros }` — one entry per date with ≥1 slot (reuses `summarizeMacros` per day group; ignores undated slots; a date whose meals are all deleted → `{}`). Tolerates a null map.
- `summarizeWeeklyAverages(byDate, fromIso, toIso)` → `[{ week_start, days_logged, avg }]` — buckets `byDate` into Saturday-start weeks spanning the inclusive range, averaging each macro over **days logged** (not 7), rounded to 1 decimal; empty weeks included with `avg: {}`; an empty range (from after to) → `[]`.
- `summarizeLibrary(items)` → `[{ id, name, default_meal_type }]` sorted by name. **Excludes ad-hoc meals** (hidden from pickers/listings until promoted); `groupLibraryByType` inherits the exclusion.
- `groupLibraryByType(items, filter)` → `[{ meal_type, meals }]` in canonical meal-type order, empty types omitted; `filter` (a meal type) restricts to one group (`'all'`/undefined = no restriction). Drives the picker's grouped/filtered render.
- `filterSlotsByType(slots, type)` — `'all'` passes through
- `makeLibraryMeal(input)` → library `content` object `{ kind:'meal', name, recipe, default_meal_type, macros }`. Requires a non-blank `name`, defaults `default_meal_type` to `dinner` (throws on an unknown type), runs `input.recipe` through an internal `normalizeRecipe` (always a `{ ingredients, steps }` object — coerces `qty` to number/`null`, defaults `unit` to `null`, drops item-less ingredients and blank steps; a missing or non-object recipe → `{ ingredients: [], steps: [] }`), and keeps only macro keys whose value coerces to a finite number. Appends `adhoc: true` only when `input.adhoc === true` (anything else omits the key). Used by the `scripts/library.js` CLI and the planner's quick add.
- `updateLibraryMeal(existing, changes)` → merges `changes` onto an existing parsed meal and returns a fresh `content` object. Only fields present in `changes` override; macros merge per-key (pass `''`/`null` to clear one); a `changes.recipe` flows through `normalizeRecipe` via `makeLibraryMeal`. The `adhoc` flag is preserved unless `changes.adhoc` is present (a recipe-only change does **not** clear it — promotion is CLI policy, not core policy). Validation is delegated to `makeLibraryMeal`. Lets the CLI edit a row **in place** (stable `id`) so placed week slots keep their recipe link.
- `scaleRecipe(recipe, factor)` → a new (non-mutating) recipe with each numeric ingredient `qty` multiplied by `factor` (`null` qty stays `null`; units/items/notes/steps untouched). Tolerates a missing / `null` / `{}` recipe (returns `{ ingredients: [], steps: [] }`), since `getLibraryMeal` returns `{}` for an orphaned slot.

## `ViewUtils` surface

Defined in `view/utils.js`. Pure presentation helpers, covered by `tests/unit/view-utils.test.js`.

- `formatMacros(m)` → `'500 cal • 20g P • 50g C • 10g F'` (skips missing / non-numeric keys, no leading/trailing separator, empty string for null / `{}`).
- `formatQuantity(num)` → decimal rendered as a nice fraction: whole part + nearest snapped vulgar fraction (⅛ ¼ ⅓ ⅜ ½ ⅝ ⅔ ¾ ⅞) within a tight tolerance, else a ≤2dp decimal. `1.5 → "1½"`, `2/3 → "⅔"`, `0.2 → "0.2"`, `null → ""`.
- `renderRecipeHtml(recipe, factor)` → an already-escaped HTML string (a `.recipe-ingredients` list + numbered `.recipe-steps` list) shared by the library card (×1) and the week modal (×N). Scales numeric quantities by `factor` (qty:`null` rows show just item/note). Missing / null / `{}` / empty recipe → `(no recipe)`. Self-contained (a local `esc()`, no browser globals) so it `require()`s standalone under Jest.
- `formatDayLabel(iso)` → `'Sat 6/13'` (weekday + M/D, no leading zeros). Computes the weekday locally so `view/utils.js` stays standalone-requirable (no `MealsDates` dependency).
- `localIsoDate(dateObj)` → `'YYYY-MM-DD'` from the Date's **local** components, so "today" is the wall-clock day (never a UTC shift across midnight). Takes the Date as an argument for testability.

## `app.js` responsibilities

A thin shell:

- `App.init(el, listName)` — creates the per-list `api`, then reads `?view=`: `trends` → `TrendsView.init` (the trends view reads a planner list, so this is gated before the list branch; `?list=library&view=trends` is harmless-empty). Otherwise dispatches to `WeekView.init` (any non-`library` list) or `LibraryView.init`. The planner is **not** tied to any particular name; any non-library `?list=` renders a planner, so all in-view nav links must carry the *current* `api.listName`, never a literal name.
- `App.ensureMockSeed()` — one-time `DEMO_LIBRARY` insert when running in mock mode with an empty library. Called from `index.html` before any view init.

## View module responsibilities

Each `*View.init(container, api)` module:

- Owns its own in-memory `items` array (loaded via `api.fetchItems()`).
- Wires `Sync.init(api, refreshCb)` so cross-tab updates re-render.
- Renders its DOM and wires its events.
- Persists by calling `api.updateItem` / `createItem` / `deleteItem` after applying a `MealsCore` result.

`LibraryView` additionally calls back to `App.ensureMockSeed()` during render so a freshly opened mock-mode library page populates itself.

`WeekView` additionally fetches the library alongside the week on boot (`loadAndRender`, in parallel) and keeps a `libraryCache` + a `libraryById` map (`MealsCore.indexLibrary`). The map drives the live join for slot names, macros, and day totals; `libraryCache` also feeds the picker and the recipe modal's `getLibraryMeal`. `libraryById` is initialized to `{}` (not null) so a realtime `Sync`-triggered `render()` that fires before the library load resolves slots to fallbacks instead of crashing. It resolves a module-level `weekOf` once in `init` (from `?date=` validated via `isIsoDate`, else `localIsoDate(new Date())`, snapped to `weekStart`); `render` iterates `weekDates(weekOf)`, tags columns/sections/summaries with `data-date`, marks today's column `.today`, and renders a week-nav bar (`‹` / `Week of …` / `›` plain links that rewrite `?date=`, plus **Today** and **Trends**). Every nav link carries the current `?list=` (`api.listName`, URL-encoded), not a hardcoded name, so the planner stays on whatever list it was opened under. A `Sync` re-render keeps the same `weekOf` (module state).

`TrendsView` is **read-only** (no `Sync`). It resolves `weekOf` + `range` (∈ 2|4|12, default 4) from the URL, fetches the week + library in parallel, builds `summarizeMacrosByDate`, and renders range pills (links), a back-to-planner link (all carrying the current `?list=`, not a hardcoded name), two inline-SVG bar charts (`cal`/`protein` per day, scaled to the range max), and a `summarizeWeeklyAverages` table. The SVG fills width via `preserveAspectRatio="none"` (non-uniform scale) so it holds **bars only**; the Saturday tick labels render as HTML in a sibling `.trends-axis` row, each positioned at its bar's center percentage, so glyphs never stretch with the chart. The range ends at the anchored week's Friday and extends `range` Saturdays back.

### Picker + quick add

The day picker (`+` on a day header) lists promoted library meals grouped by type (`MealsCore.groupLibraryByType`). A **Quick add** button at the top — rendered before the empty-list branch so it survives an empty/filtered-out library — flips the picker body to a small form: name, meal-type select (preselected from the active filter, else dinner), and four `inputmode="decimal"` macro inputs (≥16px fonts so iOS doesn't zoom). Submit builds the meal via `MealsCore.makeLibraryMeal({..., adhoc: true})`, creates the library row, then places a slot on that day. If the slot write fails, the just-created library row is rolled back (best effort; a stranded row is recoverable via `library.js list --adhoc`). The created row is pushed into `libraryCache`/`libraryById` so the new slot resolves without a refetch. The recipe modal shows a "no recipe yet" note for ad-hoc meals and hides the scale stepper.

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
- **Mock mode** (no `SUPABASE_URL` in config) — reads/writes `localStorage` under `listlet_<DB_TABLE>_<listName>`, e.g. `listlet_listlet_meals_groceries` and `listlet_listlet_meals_library`.
- **Supabase mode** — CRUD on the `listlet_meals` table, filtered by `list_name`.

`shared/sync.js` provides cross-tab refresh; `app.js` re-renders when notified.

## Config

- `config.js` — checked in, default values. CI injects the production Supabase secrets into it at deploy time (`.github/workflows/deploy.yml`); the checked-in copy stays blank.
- `config.local.js` — gitignored, overrides for local dev. Loaded only on localhost by `shared/config-loader.js`, in preference to `config.js`.
- Keys: `APP_TITLE: 'Listlet Meals'`, `DB_TABLE: 'listlet_meals'`, optional `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY`.

## CLI tooling (`scripts/`)

Node scripts for tasks the browser app has no UI for yet — currently managing the meal library. These run in Node, never in the browser, and read credentials from a gitignored `.env` (see `.env.example`), separate from `config.local.js`.

- `scripts/library.js` — `list` / `add` / `update` / `delete` library meals. `add` and `update` accept `--file <path.json>` (a whole-meal JSON document `{ name, type, macros, recipe }` — the way to supply a structured recipe; its CLI-friendly `type` is mapped to `default_meal_type` before calling core), plus scalar flags (`--name`/`--type`/`--cal`/…) that override the file's fields. `add` builds `content` via `MealsCore.makeLibraryMeal`; `update` selects a row by `--id`/`--name` and rewrites its `content` in place via `MealsCore.updateLibraryMeal` (id stays stable, so week slots that point at it keep their recipe); `delete` accepts `--id <uuid>` or `--name <name>` (errors if a name is ambiguous). Ad-hoc support: `list` tags quick-added meals `[adhoc]` and `list --adhoc` filters to them; on `update`, passing `--file` **promotes** the meal (clears the flag — a full recipe means it's real), with `--adhoc true|false` as the explicit override. A `trends` subcommand exports per-day macro totals over `--from`/`--to` (defaults: `to` = local today, `from` = `to − 27d`) from a dated calendar list (`--list <name>`, required) joined live to the library, as `--format csv` (header `date,cal,protein,carbs,fat`, one row per day in range) or `json` (`{ from, to, days }`). Reads/writes the `listlet_meals` table (`list_name = 'library'`, or the `trends` `--list`).
- `scripts/supabase-cli.js` — shared client. Authenticates as a real user with a stored Google **refresh token** (not a `service_role` key), so the CLI is bound by the same RLS as the app. Supabase rotates the refresh token on each use, so `login()` writes the new token back to `.env`.
- `scripts/google-login.js` — one-time bootstrap: serves `http://localhost:3000`, runs the Google OAuth flow, and writes `SUPABASE_REFRESH_TOKEN` into `.env`. Requires the Google provider enabled and `http://localhost:3000/auth/callback` allow-listed in Supabase.

`.env` keys: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (same values as `config.local.js`), `SUPABASE_REFRESH_TOKEN` (bootstrapped), optional `DB_TABLE` (defaults to `listlet_meals`).

## Known limits

A real dated calendar means a calendar list grows without bound (~4 slots/day). `shared/api.js#fetchItems()` has **no pagination**, and Supabase caps a single `select` at ~1000 rows ordered **ascending by `created_at`** — so once the list passes ~1000 rows (~1 year of daily use), the **newest slots silently drop first** from every read (the browser week/trends fetch *and* the CLI `trends`/list fetch). Nothing handles this yet (user-confirmed: deal with it later). Mitigation sketch when it bites:

- **Paginating fetch wrapper** — decorate the `api` object in our own code with a `.range()`-based loop that pulls all pages (shared `api.js` is upstream, do not edit; wrap it instead).
- **`archive --before <date>` CLI** — move slot rows older than a cutoff into `archive-<year>` lists, keeping the live `week` list small. Trends/CLI would then read the relevant archive list(s) for historical ranges.

This is future work alongside auto meal-picking and meal-prep planning.

## Tests

- `tests/unit/{content,dates,library,slots,macros}.test.js` — Jest, pure-function coverage of the `core/` modules (1:1 with the modules).
- `tests/unit/view-utils.test.js` — Jest, pure-function coverage of `ViewUtils.formatMacros`, `formatQuantity`, and `renderRecipeHtml`.
- `tests/e2e/*.spec.js` — Playwright, drives the real DOM in mock mode (seed, planner, calendar, trends, library, filter, picker, meal-type, delete, quick-add, recipe-scroll, touch-drag). Date-dependent specs pin a fixed Saturday anchor (`2026-06-06`) for determinism.
- `npm test` / `npm run test:e2e` / `npm run test:all`.

Working agreement: don't commit on red. TDD when a test can fail first — Jest for `meals-core`, Playwright for DOM/glue.

## Files at a glance

| Path | Role |
|---|---|
| `index.html` | Script tags + boot script |
| `core/content.js` | `MealsContent` — parse/serialize the JSON `content` |
| `core/dates.js` | `MealsDates` — ISO date math (filled in Phase 1) |
| `core/library.js` | `MealsLibrary` — build/update/index/group/summarize/scale meals |
| `core/slots.js` | `MealsSlots` — slot ordering + add/move/remove/retype |
| `core/macros.js` | `MealsMacros` — slot→library join, macro summaries |
| `meals-core.js` | Thin facade re-exporting the flat `MealsCore` object |
| `app.js` | Shell: dispatch by `?list=`, mock-mode seed |
| `view/utils.js` | `ViewUtils` — shared view-layer helpers (`formatMacros`, `formatQuantity`, `renderRecipeHtml`) |
| `view/library.js` | `LibraryView` — renders `?list=library` |
| `view/week.js` | `WeekView` — renders any non-`library` `?list=` calendar (dated grid, drag, picker, cards, week-nav) |
| `view/trends.js` | `TrendsView` — read-only `?view=trends` (charts + weekly averages) |
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

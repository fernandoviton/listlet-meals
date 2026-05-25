# Listlet Meals

A weekly meal planner built on the listlet-shared starter kit.

See [`docs/architecture.md`](docs/architecture.md) for the full architecture reference (layers, data model, `MealsCore` surface, drag-and-drop, persistence). **Keep that doc up to date on every commit that changes structure, data model, or boundaries.**

## Working Agreement

- **TDD whenever there's a test that can fail first.** For pure logic, write the failing Jest test before implementing. For DOM/glue changes, write or update the Playwright E2E spec and confirm it fails before touching `app.js` / `app.css`. Only skip TDD when no test can meaningfully assert the change (pure styling tweaks, copy edits).
- **Code split.** All state transformations live in `meals-core.js` (pure functions, no DOM, no `window`). `app.js` is a thin render/event-wiring layer. Never put business logic in `app.js`.
- **Do not edit `shared/`.** It is the upstream starter kit. All meal-specific data is JSON-encoded into the shared `content` column.

## Data model — two lists

The shared API persists `content` only. We use two lists (via `?list=`) and store JSON in each item's `content`:

- `?list=library` — meal definitions
  ```
  { kind: "meal", name, recipe, default_meal_type, macros: { cal?, protein?, carbs?, fat? } }
  ```
  `recipe` is a **structured object**, not a string:
  ```
  { ingredients: [ { qty: <number|null>, unit: <string|null>, item: <string>, note?: <string> } ],
    steps: [ <string> ] }
  ```
  Quantities are plain decimals (fractions are render-only). Macros are **per serving** (×1); the recipe modal's ×N stepper scales the ingredient + macro *display* only (`macro × N`), never stored values. `qty: null` rows ("to taste") never scale.
- `?list=week` — planned slots in the hypothetical week
  ```
  { kind: "slot", library_id, day, meal_type, order, name_snapshot, macros_snapshot }
  ```

`name_snapshot` / `macros_snapshot` let the week view render without re-querying the library and survive library deletions. Expanding a slot fetches the live library row for the recipe.

Days: `["sat","sun","mon","tue","wed","thu","fri"]`. Any macro field may be `null` / absent.

## Architecture

- **No build step.** Vanilla JS using IIFEs. Script tags in HTML.
- **Supabase** backend (optional). **Mock mode** on localhost uses localStorage.
- Each list lives at its own localStorage key: `listlet_listlet_meals_<listName>`.

## File Structure

- `meals-core.js` — pure logic (parseContent, serialize, nextOrder, addSlot, moveSlot, summarizeMacros, filterSlotsByType, makeLibraryMeal, scaleRecipe). Loaded in browser and required by Jest. Covered by `tests/unit/meals-core.test.js`.
- `app.js` — DOM/render/event-wiring. Calls into `MealsCore` for every state transformation.
- `app.css` — styles.
- `shared/` — Shared infrastructure. **Do not edit.**
- `config.js` / `config.local.js` — `config.local.js` is gitignored and loaded at runtime.
- `scripts/` — Node CLI tooling (not served to the browser). See "Library CLI" below.

## Config Keys

- `APP_TITLE: 'Listlet Meals'`
- `DB_TABLE: 'listlet_meals'`
- `DEFAULT_LIST_NAME: 'week'`

## Library CLI

There is **no browser UI for adding/editing/deleting library meals yet** — use the CLI at `scripts/library.js`:

```
node scripts/library.js list
node scripts/library.js add --file oatmeal.json
node scripts/library.js add --name "Oatmeal" --type breakfast --cal 320   # quick, no recipe
node scripts/library.js update --name "Oatmeal" --file oatmeal.json       # replace recipe + fields
node scripts/library.js update --name "Oatmeal" --cal 350                 # quick scalar edit
node scripts/library.js update --id <uuid> --name "Steel-cut Oats"        # rename
node scripts/library.js delete --name "Oatmeal"     # or --id <uuid>
```

- **`--file <path.json>` is how you add/update a recipe** — a whole-meal JSON document `{ name, type, macros, recipe }` where `recipe` is the structured `{ ingredients, steps }` object (see the data model above). The file's CLI-friendly `type` is mapped to `default_meal_type` before calling core. Scalar flags (`--name`/`--type`/`--cal`/…) override the file's fields, so `--file` + a flag is fine for tweaks. There is no `--recipe` flag.
- `--type` is one of `breakfast|lunch|dinner|snack` (default `dinner`); all macros are optional. `add` builds `content` via `MealsCore.makeLibraryMeal`.
- **To edit a meal use `update`, never delete+re-add.** `update` rewrites the row's `content` (via `MealsCore.updateLibraryMeal`) while keeping the same `id`, so week slots that point at it keep their live recipe link. Select by `--name` or `--id`; only the flags you pass change (pass a macro as `""` to clear it), and with `--id` a `--name` renames the meal. A delete+re-add assigns a new `id` and orphans the recipe of any already-placed week slot (name/macros still show from the slot snapshot, but expanding shows "(no recipe)").
- Writes to the real Supabase `listlet_meals` table (`list_name='library'`) — **not** mock/localStorage. It authenticates as a real user via a stored Google refresh token, never a `service_role` key.
- Requires `.env` (see `.env.example`) with `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_REFRESH_TOKEN`. **If you (Claude) hit an auth error**, the token is missing/expired — ask the user to run `node scripts/google-login.js` once (it needs a browser OAuth round-trip you can't perform).

## Testing

```
npm test          # Jest unit tests (meals-core)
npm run test:e2e  # Playwright E2E (planner / library / filter)
npm run test:all  # Both
```

Don't commit on red.

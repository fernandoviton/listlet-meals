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

  **Recipe authoring convention:** for ingredients measured cooked but bought/cooked raw — rice, pasta, dried beans/lentils, oats, and similar — always add the uncooked/dry equivalent as a `note` on that ingredient (e.g. `{ qty: 1, unit: "cup", item: "cooked rice", note: "≈ ⅓ cup (65 g) uncooked" }`). The listed qty stays the cooked amount; the note carries the raw equivalent so you know how much to start with.
- `?list=week` — planned slots in the hypothetical week
  ```
  { kind: "slot", library_id, day, meal_type, order }
  ```

Slots store **no name/macros snapshot**. The week page fetches both lists on boot and renders as a live join: a slot resolves its name + macros (and, on expand, its recipe) from the live library row by `library_id`, so a library edit (e.g. via the CLI) shows up on reload without remove/re-add. A slot whose library meal was **deleted** has no match — it renders a `(deleted meal)` fallback and contributes 0 to day totals.

Days: `["sat","sun","mon","tue","wed","thu","fri"]`. Any macro field may be `null` / absent.

## Architecture

- **No build step.** Vanilla JS using IIFEs. Script tags in HTML.
- **Supabase** backend (optional). **Mock mode** on localhost uses localStorage.
- Each list lives at its own localStorage key: `listlet_listlet_meals_<listName>`.

## File Structure

- `meals-core.js` — pure logic (parseContent, serialize, nextOrder, addSlot, moveSlot, summarizeMacros, indexLibrary, resolveSlot, cleanSlot, filterSlotsByType, makeLibraryMeal, scaleRecipe). `summarizeMacros(slots, libraryById)` and `resolveSlot(slot, libraryById)` join slots to the live library map built by `indexLibrary`; `cleanSlot` strips legacy snapshot fields (used by `migrate-week`). Loaded in browser and required by Jest. Covered by `tests/unit/meals-core.test.js`.
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
node scripts/library.js migrate-week --dry-run            # preview the slot cleanup
node scripts/library.js migrate-week --list <name>        # rewrite week slot rows
```

- **`--file <path.json>` is how you add/update a recipe** — a whole-meal JSON document `{ name, type, macros, recipe }` where `recipe` is the structured `{ ingredients, steps }` object (see the data model above). The file's CLI-friendly `type` is mapped to `default_meal_type` before calling core. Scalar flags (`--name`/`--type`/`--cal`/…) override the file's fields, so `--file` + a flag is fine for tweaks. There is no `--recipe` flag.
- `--type` is one of `breakfast|lunch|dinner|snack` (default `dinner`); all macros are optional. `add` builds `content` via `MealsCore.makeLibraryMeal`.
- **To edit a meal use `update`, never delete+re-add.** `update` rewrites the row's `content` (via `MealsCore.updateLibraryMeal`) while keeping the same `id`, so week slots that point at it keep their live join. Select by `--name` or `--id`; only the flags you pass change (pass a macro as `""` to clear it), and with `--id` a `--name` renames the meal. A delete+re-add assigns a new `id` and orphans any already-placed week slot — since slots no longer snapshot name/macros, an orphaned slot renders the `(deleted meal)` fallback and contributes 0 to totals.
- **`migrate-week`** is a one-time data cleanup that rewrites existing week slot rows to the live-join shape (strips the legacy `name_snapshot`/`macros_snapshot` via `MealsCore.cleanSlot`). It is idempotent (already-clean rows are skipped). `--list <name>` targets a week list whose name isn't the literal `week` (the CLI can't read the browser's `DEFAULT_LIST_NAME`); `--dry-run` previews the count without writing.
- Writes to the real Supabase `listlet_meals` table (`list_name='library'`, or the `migrate-week` `--list`) — **not** mock/localStorage. It authenticates as a real user via a stored Google refresh token, never a `service_role` key.
- Requires `.env` (see `.env.example`) with `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_REFRESH_TOKEN`. **If you (Claude) hit an auth error**, the token is missing/expired — ask the user to run `node scripts/google-login.js` once (it needs a browser OAuth round-trip you can't perform).

## Testing

```
npm test          # Jest unit tests (meals-core)
npm run test:e2e  # Playwright E2E (planner / library / filter)
npm run test:all  # Both
```

Don't commit on red.

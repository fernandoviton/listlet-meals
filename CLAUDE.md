# Listlet Meals

A weekly meal planner built on the listlet-shared starter kit.

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

- `meals-core.js` — pure logic (parseContent, serialize, nextOrder, addSlot, moveSlot, summarizeMacros, filterSlotsByType). Loaded in browser and required by Jest. Covered by `tests/unit/meals-core.test.js`.
- `app.js` — DOM/render/event-wiring. Calls into `MealsCore` for every state transformation.
- `app.css` — styles.
- `shared/` — Shared infrastructure. **Do not edit.**
- `config.js` / `config.local.js` — `config.local.js` is gitignored and loaded at runtime.

## Config Keys

- `APP_TITLE: 'Listlet Meals'`
- `DB_TABLE: 'listlet_meals'`
- `DEFAULT_LIST_NAME: 'week'`

## Testing

```
npm test          # Jest unit tests (meals-core)
npm run test:e2e  # Playwright E2E (planner / library / filter)
npm run test:all  # Both
```

Don't commit on red.

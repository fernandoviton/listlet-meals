# Listlet Meals

A weekly meal planner built on the listlet-shared starter kit.

See [`docs/architecture.md`](docs/architecture.md) for the full architecture reference (layers, data model, `MealsCore` surface, drag-and-drop, persistence). **Keep that doc up to date on every commit that changes structure, data model, or boundaries.**

## Working Agreement

- **TDD whenever there's a test that can fail first.** For pure logic, write the failing Jest test before implementing. For DOM/glue changes, write or update the Playwright E2E spec and confirm it fails before touching `app.js` / `app.css`. Only skip TDD when no test can meaningfully assert the change (pure styling tweaks, copy edits).
- **Code split.** All state transformations live in `meals-core.js` (pure functions, no DOM, no `window`). `app.js` is a thin render/event-wiring layer. Never put business logic in `app.js`.
- **Do not edit `shared/`.** It is the upstream starter kit. All meal-specific data is JSON-encoded into the shared `content` column. *One documented exception:* `shared/api.js#fetchItems` carries an optional `{ dateFrom, dateTo }` range param (plus `setDateRange`) so calendar reads can fetch by date — see architecture.md "Persistence". Keep further `shared/` edits to a minimum.

## Data model — the library + calendar lists

The shared API persists `content` only. Data lives in named lists (via `?list=`), each item storing JSON in its `content`. Two list names are special — **`library`** renders the library view and **`capture`** renders the raw voice/quick-capture log (see "Voice capture" below) — and **every other `?list=` is an independent calendar**: a planner of dated slots. All calendars are structurally identical and there is **no default/privileged calendar name** — a `?list=` must always be given explicitly (the app shows the Home list-picker when it's absent). So there are two *kinds* of list (one special `library`, plus any number of calendars), not two fixed lists:

- `?list=library` — meal definitions (the one special, shared list)
  ```
  { kind: "meal", name, recipe, default_meal_type, macros: { cal?, protein?, carbs?, fat? }, adhoc?: true }
  ```
  `adhoc: true` marks a meal created via the planner's **Quick add** (name + optional macros, empty recipe). The key is present **only when true** — real/promoted meals omit it. Ad-hoc meals are hidden from the picker list and the library page, but still live-join into placed slots (name, macros, day totals). Promote via the CLI (see the extraction workflow below); promotion keeps the row id so placed slots are unaffected.
  `recipe` is a **structured object**, not a string:
  ```
  { ingredients: [ { qty: <number|null>, unit: <string|null>, item: <string>, note?: <string> } ],
    steps: [ <string> ] }
  ```
  Quantities are plain decimals (fractions are render-only). Macros are **per serving** (×1); the recipe modal's ×N stepper scales the ingredient + macro *display* only (`macro × N`), never stored values. `qty: null` rows ("to taste") never scale.

  **Recipe authoring convention:** for ingredients measured cooked but bought/cooked raw — rice, pasta, dried beans/lentils, oats, and similar — always add the uncooked/dry equivalent as a `note` on that ingredient (e.g. `{ qty: 1, unit: "cup", item: "cooked rice", note: "≈ ⅓ cup (65 g) uncooked" }`). The listed qty stays the cooked amount; the note carries the raw equivalent so you know how much to start with.
- `?list=<calendar>` — planned slots on real calendar dates. The name is any non-`library` value; each distinct name is a separate calendar with its own slots.
  ```
  { kind: "slot", library_id, date: "YYYY-MM-DD", meal_type, order }
  ```
  `date` is an ISO date ( append `?date=YYYY-MM-DD` to the URL to anchor which Saturday-start week is rendered; default is today). `order` is per-(date, meal_type). The DB mirrors `date` in a generated, content-derived **`slot_date`** column (indexed) so calendar reads can range-fetch by date — `content` stays the only writable source of truth. See architecture.md.

Slots store **no name/macros snapshot**. A calendar page fetches its own list plus the shared `library` on boot and renders as a live join: a slot resolves its name + macros (and, on expand, its recipe) from the live library row by `library_id`, so a library edit (e.g. via the CLI) shows up on reload without remove/re-add. A slot whose library meal was **deleted** has no match — it renders a `(deleted meal)` fallback and contributes 0 to day totals. Editing a library meal's macros therefore retroactively changes past day/week totals (accepted tradeoff).

- `?list=capture` — the raw voice/quick-capture log (one special list).
  ```
  { kind: "capture", text, at, source, processed_at, note? }
  ```
  Captures are stored **verbatim** (dictated `text` + event time `at`); the capture path does **no** parsing or macro math. `processed_at` is null until a later [reconcile step](docs/voice-capture.md) turns the raw text into structured data (meal slots, library recipes, symptom rows) and stamps it with an outcome `note`. The iOS Shortcut opens `?list=capture&text=…&at=…`; the page piggybacks on the existing Google session (no endpoint/secret), stashing the capture pre-auth so it survives the OAuth redirect. Captures have no `date`, so `slot_date` is NULL and they're excluded from calendar/trends range fetches. Reconciled **symptoms** land on a calendar as `{ kind: "symptom", text, date, at, category, severity }` rows. See [`docs/voice-capture.md`](docs/voice-capture.md) and the `/reconcile-captures` skill.

The week renders 7 columns (Sat→Fri) for the week containing `?date=`; prev/next nav rewrites the param, **Today** drops it, **Trends** opens the trends view. There is **no migration / legacy support** — the dated shape is the slot shape; `parseSlots` keeps only slots with a valid `date`.

**Trends** (`?list=<calendar>&view=trends[&date=][&range=2|4|12]`; calendar defaults to `week`): a read-only view ([`view/trends.js`](view/trends.js)) charting calories/protein per day and a weekly-averages table over the last `range` weeks (default 4), ending at the anchored week. Averages divide by *days logged*, not 7. Any macro field may be `null` / absent.

## Architecture

- **No build step.** Vanilla JS using IIFEs. Script tags in HTML.
- **Supabase** backend (optional). **Mock mode** on localhost uses localStorage.
- Each list lives at its own localStorage key: `listlet_listlet_meals_<listName>`.

## File Structure

- `core/` — pure logic, split into focused modules each loaded as a `<script>` and `require()`d by Jest (UMD-lite). `meals-core.js` is a thin **facade** re-exporting the flat `MealsCore` object the views/CLI call, so call sites never change:
  - `core/content.js` (`MealsContent`) — parseContent, serialize
  - `core/dates.js` (`MealsDates`) — isIsoDate, addDays, dayOfWeek, weekStart, weekDates, dateRange (pure ISO/UTC string math)
  - `core/library.js` (`MealsLibrary`) — normalizeRecipe, makeLibraryMeal, updateLibraryMeal, scaleRecipe, summarizeLibrary, groupLibraryByType, indexLibrary
  - `core/slots.js` (`MealsSlots`) — nextOrder, addSlot, moveSlot, removeSlot, setMealType, filterSlotsByType (all keyed on `date`)
  - `core/macros.js` (`MealsMacros`) — resolveSlot, summarizeMacros, summarizeMacrosByDate, summarizeWeeklyAverages
  - `core/capture.js` (`MealsCapture`) — makeCapture, parseCaptures, isProcessed, markProcessed, makeSymptom
  Index-html script order: content → dates → library → slots → macros → capture → meals-core (facade) → views. Each module has a 1:1 test (`tests/unit/{content,dates,library,slots,macros,capture}.test.js`).
- `app.js` — DOM/render/event-wiring. Calls into `MealsCore` for every state transformation.
- `app.css` — styles.
- `shared/` — Shared infrastructure. **Do not edit.**
- `config.js` / `config.local.js` — `config.local.js` is gitignored and loaded at runtime.
- `scripts/` — Node CLI tooling (not served to the browser). See "Library CLI" below.

## Config Keys

- `APP_TITLE: 'Listlet Meals'`
- `DB_TABLE: 'listlet_meals'`

## Library CLI

There is **no browser UI for editing/deleting library meals yet** — the only browser entry point is the planner's Quick add, which creates `adhoc: true` rows. Everything else goes through the CLI at `scripts/library.js`:

```
node scripts/library.js list
node scripts/library.js list --adhoc                # only quick-added meals awaiting a recipe
node scripts/library.js add --file oatmeal.json
node scripts/library.js add --name "Oatmeal" --type breakfast --cal 320   # quick, no recipe
node scripts/library.js update --name "Oatmeal" --file oatmeal.json       # replace recipe + fields
node scripts/library.js update --name "Oatmeal" --cal 350                 # quick scalar edit
node scripts/library.js update --id <uuid> --name "Steel-cut Oats"        # rename
node scripts/library.js delete --name "Oatmeal"     # or --id <uuid>
node scripts/library.js trends --from 2026-06-01 --to 2026-06-28           # CSV per-day macros
node scripts/library.js trends --format json                               # default range: last 28 days
```

- **`--file <path.json>` is how you add/update a recipe** — a whole-meal JSON document `{ name, type, macros, recipe }` where `recipe` is the structured `{ ingredients, steps }` object (see the data model above). The file's CLI-friendly `type` is mapped to `default_meal_type` before calling core. Scalar flags (`--name`/`--type`/`--cal`/…) override the file's fields, so `--file` + a flag is fine for tweaks. There is no `--recipe` flag.
- `--type` is one of `breakfast|lunch|dinner|snack` (default `dinner`); all macros are optional. `add` builds `content` via `MealsCore.makeLibraryMeal`.
- **Ad-hoc extraction workflow (Claude Code):** `list --adhoc` shows quick-added meals (tagged `[adhoc]` in plain `list`). To turn one into a reusable recipe, draft a whole-meal JSON (per the data model + recipe authoring convention above) and run `update --id <uuid> --file meal.json`. Passing `--file` on `update` **auto-clears the adhoc flag** (a full recipe means it's a real meal now); `--adhoc true|false` overrides explicitly. An ad-hoc meal that should become pickable without a recipe can be promoted via `update --id <uuid> --adhoc false`.
- **To edit a meal use `update`, never delete+re-add.** `update` rewrites the row's `content` (via `MealsCore.updateLibraryMeal`) while keeping the same `id`, so week slots that point at it keep their live join. Select by `--name` or `--id`; only the flags you pass change (pass a macro as `""` to clear it), and with `--id` a `--name` renames the meal. A delete+re-add assigns a new `id` and orphans any already-placed week slot — since slots no longer snapshot name/macros, an orphaned slot renders the `(deleted meal)` fallback and contributes 0 to totals.
- **`trends`** exports per-day macro totals over `--from`/`--to` (defaults: `to` = today, `from` = `to − 27d`), reading a dated calendar list (`--list <name>`, required) joined live to the library. `--format csv` (header `date,cal,protein,carbs,fat`, one row per day in range, empty days blank) or `json` (`{ from, to, days: [...] }`). Like the browser, its slot fetch is **bounded to `--from`/`--to`** via the generated `slot_date` column, so it stays well under Supabase's ~1000-row cap (see architecture.md "Known limits").
- Writes to the real Supabase `listlet_meals` table (`list_name='library'`, or `trends`'s `--list`) — **not** mock/localStorage. It authenticates as a real user via a stored Google refresh token, never a `service_role` key.
- Requires `.env` (see `.env.example`) with `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_REFRESH_TOKEN`. **If you (Claude) hit an auth error**, the token is missing/expired — ask the user to run `node scripts/google-login.js` once (it needs a browser OAuth round-trip you can't perform).

## Capture CLI + reconcile

`scripts/capture.js` is the reconcile half of [voice capture](docs/voice-capture.md) — raw captures (`?list=capture`) are dumb/verbatim; this CLI turns them into structured data. Same auth/`.env` as `library.js`.

```
node scripts/capture.js list [--all] [--format json]                       # unprocessed by default
node scripts/capture.js get <id> [--format json]                            # id may be a unique prefix
node scripts/capture.js add --text "smoothie and a banana" [--at <iso>]     # mainly for testing
node scripts/capture.js place --list planner --library-id <uuid> --date <iso> [--type lunch]   # land food
node scripts/capture.js symptom --list planner --date <iso> --text "upset stomach" [--severity 3] [--category gi]
node scripts/capture.js process <id> --note "placed Chicken Wrap (lunch)"   # stamp processed_at + outcome
```

- **Reconcile via the `/reconcile-captures` skill** (`.claude/skills/reconcile-captures/`): list → classify food vs symptom → match against `library.js list` → `place` known meals, `add`/`update` recipes for unknown ones (the ad-hoc workflow above), `symptom` for symptoms → `process` each with a note. Collaborative: propose, confirm, execute — never invent macros/recipes silently.
- `place` joins to a library meal by id and writes a slot (`MealsCore.addSlot`, type defaults to the meal's `default_meal_type`); `symptom` writes a dated `{ kind:'symptom', … }` row (`MealsCore.makeSymptom`) that range-fetches alongside slots. Both take an explicit `--list <calendar>` (no default).

## Testing

```
npm test          # Jest unit tests (meals-core)
npm run test:e2e  # Playwright E2E (planner / library / filter)
npm run test:all  # Both
```

Don't commit on red.

## Shell

This is a Windows box, but **the Bash tool runs `bash`, not PowerShell** — don't mix
the two. For a multi-line commit message in the Bash tool, use a bash heredoc
(`git commit -F - <<'EOF' … EOF`), **never** PowerShell's `@'…'@` here-string
(it parses as filename args and fails). If you use the PowerShell tool instead,
then `@'…'@` is correct. Pick one tool and match its syntax the first time.

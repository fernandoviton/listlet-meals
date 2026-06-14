# Listlet Meals

A weekly meal planner. Define meals in a library (with recipe + macros), then drop them into days/slots of a hypothetical week. Built on the [listlet-shared](../listlet-shared) starter kit.

## Quick Start (Local Dev)

```bash
npm install
python -m http.server 8000
```

Open http://localhost:8000 — mock mode activates automatically (localStorage, no auth, no Supabase needed).

## Supabase Setup

To run against a real backend instead of mock mode:

1. Create a project at [supabase.com](https://supabase.com)
2. Run `sql/setup.sql` in the SQL Editor
3. Copy `config.js` to `config.local.js` and fill in `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY`

For deployment and OAuth setup, see the [listlet-shared README](../listlet-shared/README.md).
If you also want to use the library CLI below, add `http://localhost:3000/auth/callback` to
the allowed redirect URLs in Supabase → Authentication → URL Configuration.

## Managing the meal library (CLI)

There is **no in-app UI for adding/editing/deleting library meals yet** — use the CLI.
It writes to the real Supabase backend (not mock mode) and signs in as you via a stored
Google refresh token (not a `service_role` key).

### One-time setup

```bash
cp .env.example .env
# Fill in SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY (same values as config.local.js)
node scripts/google-login.js   # open http://localhost:3000, sign in — writes the token to .env
```

`.env` is gitignored. The CLI rewrites the (rotating) refresh token on each run, so it
keeps working without re-bootstrapping.

### Usage

```bash
# List every meal
node scripts/library.js list

# Add a meal (--type defaults to dinner; all macros optional)
node scripts/library.js add --name "Oatmeal" --type breakfast \
     --recipe "Cook oats with milk. Top with berries." \
     --cal 320 --protein 12 --carbs 55 --fat 6

# Delete by name (errors if ambiguous) or by row id
node scripts/library.js delete --name "Oatmeal"
node scripts/library.js delete --id <uuid>
```

Meal types: `breakfast`, `lunch`, `dinner`, `snack`.

## Architecture

- **No build step** — vanilla JS, IIFEs, script tags
- **Mock mode** — localStorage on localhost, no backend needed
- **Library + calendars** — `?list=library` is the one special list (meal definitions); every other `?list=` is an independent calendar of planned slots (no default name — the list is always named explicitly). Each list item stores JSON in the shared `content` column.
- `meals-core.js` — pure state/transform logic (no DOM). Loaded in the browser and required by Jest.
- `app.js` — DOM rendering and event wiring. Calls into `MealsCore` for every state transformation.
- `shared/` — infrastructure from listlet-shared (auth, api, sync, header, home). **Do not edit.**

See `CLAUDE.md` for the full data model and working agreement.

## Testing

```bash
npm test          # Jest unit tests (meals-core)
npm run test:e2e  # Playwright E2E
npm run test:all  # Both
```

## Deployment

Push to `main` deploys to GitHub Pages. The deploy workflow generates `config.js` from the `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` repo secrets. See the [listlet-shared README](../listlet-shared/README.md#deployment) for full setup.

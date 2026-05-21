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

## Architecture

- **No build step** — vanilla JS, IIFEs, script tags
- **Mock mode** — localStorage on localhost, no backend needed
- **Two lists** — `?list=library` for meal definitions, `?list=week` for planned slots. Each list item stores JSON in the shared `content` column.
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

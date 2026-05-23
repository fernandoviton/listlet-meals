# TODO

## Wire up Supabase / real login (deferred)

Deployed site at https://fernandoviton.github.io/listlet-meals/ currently runs in mock mode (`local@mock` user, localStorage-only). Holding off until the data shape is settled — no point migrating mock data into a real DB until the `library` / `week` JSON schemas stop changing.

When ready, follow `../listlet-shared/README.md` "Supabase Setup":

1. Create Supabase project, run `sql/setup.sql` in SQL Editor.
2. Authentication → Providers: enable Google (Google Cloud OAuth client setup is once-per-Supabase-project — reuse if already done for another listlet app).
3. Authentication → URL Configuration:
   - Site URL: `https://fernandoviton.github.io/listlet-meals/`
   - Redirect URLs: add both `https://fernandoviton.github.io/listlet-meals` and `.../listlet-meals/` (with and without trailing slash).
4. Add GitHub repo secrets `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` (Settings → Secrets and variables → Actions).
5. Re-run the Deploy workflow. Verify: `curl https://fernandoviton.github.io/listlet-meals/config.js` shows real values; browser console no longer logs `[Supabase] Mock mode`.
6. Optional: paste the same values into local `config.local.js` for local dev against the real backend.

## Deploy workflow: `meals-core.js` not in `cp` list

`.github/workflows/deploy.yml` "Stage deploy files" step copies `index.html app.js app.css config.js` but omits `meals-core.js`. It's currently being served (200) but that may be coincidental — add `meals-core.js` to the `cp` line to make it explicit and future-proof.

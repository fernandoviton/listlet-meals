#!/usr/bin/env node
// CLI for managing the meal library in Supabase. There is no UI for adding /
// deleting library meals yet, so this is the way in.
//
//   node scripts/library.js list
//   node scripts/library.js add --file pasta.json
//   node scripts/library.js add --name "Oatmeal" --type breakfast --cal 320
//   node scripts/library.js update --name "Oatmeal" --file oatmeal.json
//   node scripts/library.js delete --name "Oatmeal"
//   node scripts/library.js delete --id <uuid>
//   node scripts/library.js trends --from 2026-06-01 --to 2026-06-28 --format csv
//
// A --file is a whole-meal JSON document: { name, type, macros, recipe } where
// `recipe` is the structured { ingredients:[...], steps:[...] } object and `type`
// is the CLI-friendly alias for default_meal_type.
//
// Auth: reuses the stored Google refresh token (see scripts/google-login.js).

const fs = require('fs');
const MealsCore = require('../meals-core');
const ViewUtils = require('../view/utils');

// Assigned in main() once we know the command needs Supabase — keeps `help`
// from requiring credentials, since supabase-cli throws on a missing .env.
let supabase, login, DB_TABLE;

const LIST = 'library';

const USAGE = `Usage: node scripts/library.js <command> [options]

Commands:
  list [--adhoc]            List every meal in the library (ad-hoc quick-adds are
                              tagged [adhoc]; --adhoc shows only those)
  add  --name <n> [opts]    Add a meal
  update --id <uuid> [opts] Edit a meal in place (keeps the id, so placed week
  update --name <n> [opts]    slots keep their recipe link). Select by --name OR
                              --id; with --id, --name renames the meal.
  delete --name <n>         Delete a meal by name (errors if the name is ambiguous)
  delete --id <uuid>        Delete a meal by row id
  trends [opts]             Export per-day macro totals over a date range

add options:
  --file <path.json>        whole-meal JSON ({ name, type, macros, recipe }); the
                              way to add a recipe. Scalar flags below override it.
  --name <text>             (required unless --file supplies it) meal name
  --type <type>             meal type: breakfast | lunch | dinner | snack (default dinner)
  --cal --protein           macros, as numbers
  --carbs --fat

update options:
  --file <path.json>        whole-meal JSON base; scalar flags override its fields.
                              Also promotes an ad-hoc meal: --file clears the adhoc
                              flag (a full recipe means it's a real meal now).
  --adhoc <true|false>      set or clear the adhoc flag explicitly (overrides the
                              --file auto-clear)
  same scalar fields as add; only what you pass changes. Pass a macro as "" to clear it.

trends options:
  --from <iso> --to <iso>   date range (default: to = today, from = to − 27 days)
  --format csv|json         output format (default csv)
  --list <name>             calendar list_name to read (required)`;

function parseArgs(argv) {
    const args = {};
    const positional = [];
    let i = 0;
    while (i < argv.length) {
        if (argv[i].startsWith('--')) {
            const key = argv[i].replace(/^--/, '');
            if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
                args[key] = argv[i + 1];
                i += 2;
            } else {
                args[key] = true;
                i += 1;
            }
        } else {
            positional.push(argv[i]);
            i += 1;
        }
    }
    return { args, positional };
}

// Read a whole-meal JSON file and map its CLI-friendly `type` alias onto
// `default_meal_type` (makeLibraryMeal / updateLibraryMeal read default_meal_type,
// never `type` — feeding `type` straight through silently defaults to dinner).
function readMealFile(path) {
    let raw;
    try {
        raw = fs.readFileSync(path, 'utf8');
    } catch (e) {
        throw new Error(`--file: cannot read "${path}" (${e.message})`);
    }
    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch (e) {
        throw new Error(`--file: "${path}" is not valid JSON (${e.message})`);
    }
    if (!parsed || typeof parsed !== 'object') {
        throw new Error(`--file: "${path}" must contain a JSON object`);
    }
    const out = Object.assign({}, parsed);
    if (out.type !== undefined && out.default_meal_type === undefined) {
        out.default_meal_type = out.type;
    }
    delete out.type;
    return out;
}

// Raw { id, content } rows for a list. NOTE: like the browser, this single
// query is capped at ~1000 rows by Supabase (ascending by created_at), so a
// very long history would silently drop its oldest rows — see docs/architecture.md.
async function fetchRows(listName) {
    const { data, error } = await supabase
        .from(DB_TABLE)
        .select('id, content')
        .eq('list_name', listName)
        .order('created_at');
    if (error) throw error;
    return data || [];
}

async function fetchLibrary() {
    return (await fetchRows(LIST)).map((row) => ({ id: row.id, meal: MealsCore.parseContent(row.content) }));
}

// parseArgs yields boolean true for a bare --adhoc and the string 'true'/'false'
// when a value follows; normalize both forms.
function parseAdhocFlag(v) {
    if (v === true || v === 'true') return true;
    if (v === 'false') return false;
    throw new Error('--adhoc takes true or false');
}

async function cmdList(args) {
    let rows = await fetchLibrary();
    const adhocOnly = args.adhoc !== undefined && parseAdhocFlag(args.adhoc);
    if (adhocOnly) rows = rows.filter((r) => r.meal && r.meal.adhoc === true);
    if (rows.length === 0) {
        console.log(adhocOnly ? '(no ad-hoc meals)' : '(library is empty)');
        return;
    }
    for (const { id, meal } of rows) {
        const m = meal || {};
        const macros = ViewUtils.formatMacros(m.macros);
        const tag = m.adhoc === true ? '  [adhoc]' : '';
        console.log(`${id}  ${m.name || '(unnamed)'}  [${m.default_meal_type || '?'}]${tag}${macros ? '  ' + macros : ''}`);
    }
}

async function cmdAdd(args) {
    const base = typeof args.file === 'string' ? readMealFile(args.file) : {};

    // File macros are the base; explicitly-passed scalar macro flags override.
    const macros = Object.assign({}, base.macros || {});
    for (const k of ['cal', 'protein', 'carbs', 'fat']) {
        if (Object.prototype.hasOwnProperty.call(args, k)) macros[k] = args[k];
    }

    const meal = MealsCore.makeLibraryMeal({
        name: typeof args.name === 'string' ? args.name : base.name,
        recipe: base.recipe,
        default_meal_type: typeof args.type === 'string' ? args.type : base.default_meal_type,
        macros: macros,
        adhoc: args.adhoc !== undefined ? parseAdhocFlag(args.adhoc) : undefined
    });
    const { data, error } = await supabase
        .from(DB_TABLE)
        .insert({ list_name: LIST, content: MealsCore.serialize(meal) })
        .select('id')
        .single();
    if (error) throw error;
    console.log(`Added "${meal.name}" [${meal.default_meal_type}] — ${data.id}`);
}

// Resolve a single library row by --id (exact) or --name (case-insensitive,
// errors if ambiguous). Returns { id, meal }.
async function resolveTarget(args) {
    const rows = await fetchLibrary();
    if (typeof args.id === 'string') {
        const match = rows.find((r) => r.id === args.id);
        if (!match) throw new Error(`No library meal with id ${args.id}`);
        return match;
    }
    if (typeof args.name !== 'string') {
        throw new Error('need --id <uuid> or --name "Meal Name"');
    }
    const target = args.name.toLowerCase();
    const matches = rows.filter(
        (r) => r.meal && typeof r.meal.name === 'string' && r.meal.name.toLowerCase() === target
    );
    if (matches.length === 0) throw new Error(`No library meal named "${args.name}"`);
    if (matches.length > 1) {
        throw new Error(`"${args.name}" is ambiguous (${matches.length} matches) — use --id: ${matches.map((m) => m.id).join(', ')}`);
    }
    return matches[0];
}

async function cmdUpdate(args) {
    const target = await resolveTarget(args);

    const base = typeof args.file === 'string' ? readMealFile(args.file) : {};

    // Start from the file's fields, then let explicit scalar flags override.
    const changes = {};
    if (base.name !== undefined) changes.name = base.name;
    if (base.recipe !== undefined) changes.recipe = base.recipe;
    if (base.default_meal_type !== undefined) changes.default_meal_type = base.default_meal_type;

    // When selecting by --name, --name IS the selector, not a rename. Only treat
    // --name as a new name when the row was selected by --id.
    if (typeof args.id === 'string' && typeof args.name === 'string') changes.name = args.name;
    if (typeof args.type === 'string') changes.default_meal_type = args.type;

    // File macros base + scalar overrides; passed whole so updateLibraryMeal's
    // per-key merge preserves any macros neither the file nor a flag touched.
    const macros = Object.assign({}, base.macros || {});
    let hasMacro = base.macros !== undefined;
    for (const k of ['cal', 'protein', 'carbs', 'fat']) {
        if (Object.prototype.hasOwnProperty.call(args, k)) { macros[k] = args[k]; hasMacro = true; }
    }
    if (hasMacro) changes.macros = macros;

    // Promotion: an explicit --adhoc wins; otherwise supplying a --file (a full
    // recipe) clears the flag — the meal is real now. Harmless on non-adhoc
    // rows since core omits a false flag entirely.
    if (args.adhoc !== undefined) changes.adhoc = parseAdhocFlag(args.adhoc);
    else if (typeof args.file === 'string') changes.adhoc = false;

    if (Object.keys(changes).length === 0) {
        throw new Error('nothing to update — pass --file, --name, --type, --adhoc, or a macro flag');
    }

    const updated = MealsCore.updateLibraryMeal(target.meal, changes);
    const { error } = await supabase
        .from(DB_TABLE)
        .update({ content: MealsCore.serialize(updated) })
        .eq('id', target.id)
        .eq('list_name', LIST);
    if (error) throw error;
    console.log(`Updated "${updated.name}" [${updated.default_meal_type}] — ${target.id}`);
}

async function cmdDelete(args) {
    let id = typeof args.id === 'string' ? args.id : null;
    if (!id) {
        if (typeof args.name !== 'string') {
            throw new Error('delete needs --id <uuid> or --name "Meal Name"');
        }
        const target = args.name.toLowerCase();
        const matches = (await fetchLibrary()).filter(
            (r) => r.meal && typeof r.meal.name === 'string' && r.meal.name.toLowerCase() === target
        );
        if (matches.length === 0) throw new Error(`No library meal named "${args.name}"`);
        if (matches.length > 1) {
            throw new Error(`"${args.name}" is ambiguous (${matches.length} matches) — delete by --id: ${matches.map((m) => m.id).join(', ')}`);
        }
        id = matches[0].id;
    }
    const { error } = await supabase.from(DB_TABLE).delete().eq('id', id).eq('list_name', LIST);
    if (error) throw error;
    console.log(`Deleted ${id}`);
}

// Export per-day macro totals over [from, to]. Reads the named dated calendar
// list + library, joins them live (summarizeMacrosByDate), prints one row per day
// in the inclusive range — empty days included (proves the pipeline even with
// no data). CSV header: date,cal,protein,carbs,fat; JSON: { from, to, days }.
async function cmdTrends(args) {
    if (typeof args.list !== 'string' || !args.list.trim()) {
        throw new Error('--list <name> is required (the calendar list to read; there is no default)');
    }
    const listName = args.list.trim();
    const to = typeof args.to === 'string' ? args.to : ViewUtils.localIsoDate(new Date());
    const from = typeof args.from === 'string' ? args.from : MealsCore.addDays(to, -27);
    const format = args.format === 'json' ? 'json' : 'csv';

    if (!MealsCore.isIsoDate(from) || !MealsCore.isIsoDate(to)) {
        throw new Error('--from / --to must be valid YYYY-MM-DD dates');
    }

    const libraryById = MealsCore.indexLibrary(await fetchRows(LIST));
    const slots = (await fetchRows(listName))
        .map((r) => MealsCore.parseContent(r.content))
        .filter((p) => p && p.kind === 'slot' && MealsCore.isIsoDate(p.date));
    const byDate = MealsCore.summarizeMacrosByDate(slots, libraryById);
    const dates = MealsCore.dateRange(from, to);
    const KEYS = ['cal', 'protein', 'carbs', 'fat'];

    if (format === 'json') {
        const days = dates.map((d) => Object.assign({ date: d }, byDate[d] || {}));
        console.log(JSON.stringify({ from, to, days }, null, 2));
        return;
    }
    console.log('date,' + KEYS.join(','));
    for (const d of dates) {
        const m = byDate[d] || {};
        console.log([d].concat(KEYS.map((k) => (typeof m[k] === 'number' ? m[k] : ''))).join(','));
    }
}

async function main() {
    const { args, positional } = parseArgs(process.argv.slice(2));
    const command = positional[0];

    if (!command || command === 'help') {
        console.log(USAGE);
        return;
    }
    if (!['list', 'add', 'update', 'delete', 'trends'].includes(command)) {
        console.error(`Unknown command: ${command}\n`);
        console.log(USAGE);
        process.exitCode = 1;
        return;
    }

    ({ supabase, login, DB_TABLE } = require('./supabase-cli'));
    await login();

    if (command === 'list') await cmdList(args);
    else if (command === 'add') await cmdAdd(args);
    else if (command === 'update') await cmdUpdate(args);
    else if (command === 'delete') await cmdDelete(args);
    else if (command === 'trends') await cmdTrends(args);
}

main().catch((err) => {
    console.error(`Error: ${err.message}`);
    process.exitCode = 1;
});

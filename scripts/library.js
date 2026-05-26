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
//   node scripts/library.js migrate-week [--list <name>] [--dry-run]
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
  list                      List every meal in the library
  add  --name <n> [opts]    Add a meal
  update --id <uuid> [opts] Edit a meal in place (keeps the id, so placed week
  update --name <n> [opts]    slots keep their recipe link). Select by --name OR
                              --id; with --id, --name renames the meal.
  delete --name <n>         Delete a meal by name (errors if the name is ambiguous)
  delete --id <uuid>        Delete a meal by row id
  migrate-week [opts]       One-time data cleanup: rewrite week slot rows to the
                              live-join shape (drops name_snapshot/macros_snapshot)

add options:
  --file <path.json>        whole-meal JSON ({ name, type, macros, recipe }); the
                              way to add a recipe. Scalar flags below override it.
  --name <text>             (required unless --file supplies it) meal name
  --type <type>             meal type: breakfast | lunch | dinner | snack (default dinner)
  --cal --protein           macros, as numbers
  --carbs --fat

update options:
  --file <path.json>        whole-meal JSON base; scalar flags override its fields.
  same scalar fields as add; only what you pass changes. Pass a macro as "" to clear it.

migrate-week options:
  --list <name>             week list_name to migrate (default "week"; the real
                              list may be named differently, e.g. a random id)
  --dry-run                 print what would change without writing`;

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

async function fetchLibrary() {
    const { data, error } = await supabase
        .from(DB_TABLE)
        .select('id, content')
        .eq('list_name', LIST)
        .order('created_at');
    if (error) throw error;
    return (data || []).map((row) => ({ id: row.id, meal: MealsCore.parseContent(row.content) }));
}

async function cmdList() {
    const rows = await fetchLibrary();
    if (rows.length === 0) {
        console.log('(library is empty)');
        return;
    }
    for (const { id, meal } of rows) {
        const m = meal || {};
        const macros = ViewUtils.formatMacros(m.macros);
        console.log(`${id}  ${m.name || '(unnamed)'}  [${m.default_meal_type || '?'}]${macros ? '  ' + macros : ''}`);
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
        macros: macros
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

    if (Object.keys(changes).length === 0) {
        throw new Error('nothing to update — pass --file, --name, --type, or a macro flag');
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

// One-time cleanup of the week list: rewrite each slot row to the live-join
// shape, dropping the legacy name_snapshot / macros_snapshot fields. Idempotent
// (already-clean rows are skipped) and code-independent. The week list_name is
// hardcoded to 'week' (the CLI has no access to the browser's CONFIG global);
// pass --list if the real list is named differently.
async function cmdMigrateWeek(args) {
    const list = typeof args.list === 'string' ? args.list : 'week';
    const dryRun = args['dry-run'] === true;

    const { data, error } = await supabase
        .from(DB_TABLE)
        .select('id, content')
        .eq('list_name', list)
        .order('created_at');
    if (error) throw error;

    const rows = data || [];
    let changed = 0;
    let skipped = 0;
    for (const row of rows) {
        const parsed = MealsCore.parseContent(row.content);
        if (!parsed || parsed.kind !== 'slot') { skipped++; continue; }
        const isClean = !('name_snapshot' in parsed) && !('macros_snapshot' in parsed);
        if (isClean) { skipped++; continue; }

        const cleaned = MealsCore.serialize(MealsCore.cleanSlot(parsed));
        changed++;
        if (dryRun) {
            console.log(`would clean ${row.id}`);
            continue;
        }
        const { error: upErr } = await supabase
            .from(DB_TABLE)
            .update({ content: cleaned })
            .eq('id', row.id)
            .eq('list_name', list);
        if (upErr) throw upErr;
    }
    const verb = dryRun ? 'would rewrite' : 'rewrote';
    console.log(`migrate-week ("${list}"): ${verb} ${changed} slot row(s); ${skipped} already clean / non-slot.`);
}

async function main() {
    const { args, positional } = parseArgs(process.argv.slice(2));
    const command = positional[0];

    if (!command || command === 'help') {
        console.log(USAGE);
        return;
    }
    if (!['list', 'add', 'update', 'delete', 'migrate-week'].includes(command)) {
        console.error(`Unknown command: ${command}\n`);
        console.log(USAGE);
        process.exitCode = 1;
        return;
    }

    ({ supabase, login, DB_TABLE } = require('./supabase-cli'));
    await login();

    if (command === 'list') await cmdList();
    else if (command === 'add') await cmdAdd(args);
    else if (command === 'update') await cmdUpdate(args);
    else if (command === 'delete') await cmdDelete(args);
    else if (command === 'migrate-week') await cmdMigrateWeek(args);
}

main().catch((err) => {
    console.error(`Error: ${err.message}`);
    process.exitCode = 1;
});

#!/usr/bin/env node
// CLI for managing the meal library in Supabase. There is no UI for adding /
// deleting library meals yet, so this is the way in.
//
//   node scripts/library.js list
//   node scripts/library.js add --name "Oatmeal" --type breakfast \
//        --recipe "Cook oats with milk." --cal 320 --protein 12 --carbs 55 --fat 6
//   node scripts/library.js delete --name "Oatmeal"
//   node scripts/library.js delete --id <uuid>
//
// Auth: reuses the stored Google refresh token (see scripts/google-login.js).

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

add options:
  --name <text>             (required) meal name
  --type <type>             meal type: breakfast | lunch | dinner | snack (default dinner)
  --recipe <text>           recipe instructions
  --cal --protein           macros, as numbers
  --carbs --fat

update options:
  same fields as add; only the flags you pass change. Pass a macro as "" to clear it.`;

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
    const meal = MealsCore.makeLibraryMeal({
        name: args.name,
        recipe: args.recipe,
        default_meal_type: args.type,
        macros: { cal: args.cal, protein: args.protein, carbs: args.carbs, fat: args.fat }
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

    const changes = {};
    // When selecting by --name, --name IS the selector, not a rename. Only treat
    // --name as a new name when the row was selected by --id.
    if (typeof args.id === 'string' && typeof args.name === 'string') changes.name = args.name;
    if (typeof args.recipe === 'string') changes.recipe = args.recipe;
    if (typeof args.type === 'string') changes.default_meal_type = args.type;

    const macros = {};
    let hasMacro = false;
    for (const k of ['cal', 'protein', 'carbs', 'fat']) {
        if (Object.prototype.hasOwnProperty.call(args, k)) { macros[k] = args[k]; hasMacro = true; }
    }
    if (hasMacro) changes.macros = macros;

    if (Object.keys(changes).length === 0) {
        throw new Error('nothing to update — pass --recipe, --name, --type, or a macro flag');
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

async function main() {
    const { args, positional } = parseArgs(process.argv.slice(2));
    const command = positional[0];

    if (!command || command === 'help') {
        console.log(USAGE);
        return;
    }
    if (!['list', 'add', 'update', 'delete'].includes(command)) {
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
}

main().catch((err) => {
    console.error(`Error: ${err.message}`);
    process.exitCode = 1;
});

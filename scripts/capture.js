#!/usr/bin/env node
// CLI for the voice/quick-capture reconcile loop. Captures are stored verbatim
// by the capture page (?list=capture); this is where a human + Claude turn them
// into structured data (meal slots, symptom rows) and mark them processed.
//
//   node scripts/capture.js list [--all] [--format json]
//   node scripts/capture.js get <id> [--format json]
//   node scripts/capture.js add --text "smoothie and a banana" [--at <iso>]
//   node scripts/capture.js process <id> [--note "placed Oatmeal (breakfast)"]
//   node scripts/capture.js place --list <cal> --library-id <uuid> --date <iso> [--type <t>]
//   node scripts/capture.js symptom --list <cal> --date <iso> --text "upset stomach" [--severity 3] [--category gi]
//
// Auth: reuses the stored Google refresh token (see scripts/google-login.js).

const MealsCore = require('../meals-core');

let supabase, login, DB_TABLE;

const CAPTURE_LIST = 'capture';
const LIBRARY_LIST = 'library';
const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'];

const USAGE = `Usage: node scripts/capture.js <command> [options]

Commands:
  list [--all]              List captures (unprocessed only unless --all)
  get <id>                  Show one capture (id may be a unique prefix)
  add --text <t> [opts]     Add a raw capture (--at <iso>, --source <s>)
  process <id> [--note <t>] Mark a capture processed, with an optional outcome note
  place [opts]              Land a meal: place a library meal as a slot on a calendar
  symptom [opts]           Land a symptom: write a dated symptom row on a calendar

place options:
  --list <name>             calendar list to write the slot to (required)
  --library-id <uuid>       the library meal to place (required)
  --date <iso>              YYYY-MM-DD (required)
  --type <meal_type>        override breakfast|lunch|dinner|snack (default: the meal's)

symptom options:
  --list <name>             calendar list to write the symptom to (required)
  --date <iso>              YYYY-MM-DD (required)
  --text <t>                symptom description (required)
  --at <iso>                event timestamp (optional)
  --severity <n>            numeric severity (optional)
  --category <c>            free-text category, e.g. gi, energy, skin (optional)

Common:
  --format csv|json         output format for list/get (default text)`;

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

// Raw { id, content } rows for a list, optionally bounded to a slot_date range.
async function fetchRows(listName, range) {
    let query = supabase.from(DB_TABLE).select('id, content').eq('list_name', listName);
    if (range && range.from) query = query.gte('slot_date', range.from);
    if (range && range.to) query = query.lte('slot_date', range.to);
    const { data, error } = await query.order('created_at');
    if (error) throw error;
    return data || [];
}

async function fetchCaptureRows() {
    return fetchRows(CAPTURE_LIST);
}

// Resolve a capture row by exact id or a unique id prefix.
async function resolveCapture(idArg) {
    if (typeof idArg !== 'string' || !idArg.trim()) {
        throw new Error('need a capture <id>');
    }
    const rows = await fetchCaptureRows();
    const exact = rows.find((r) => r.id === idArg);
    if (exact) return exact;
    const matches = rows.filter((r) => r.id.startsWith(idArg));
    if (matches.length === 0) throw new Error(`No capture with id ${idArg}`);
    if (matches.length > 1) {
        throw new Error(`"${idArg}" is ambiguous (${matches.length} matches) — use a longer prefix`);
    }
    return matches[0];
}

function captureLine(c) {
    const flag = MealsCore.isProcessed(c) ? '[done]' : '[new] ';
    const when = c.at || '(no time)';
    const note = c.note ? `  — ${c.note}` : '';
    return `${flag} ${c.id}  ${when}  ${c.source || '?'}\n        ${c.text}${note}`;
}

async function cmdList(args) {
    const all = args.all === true || args.all === 'true';
    let captures = MealsCore.parseCaptures(await fetchCaptureRows());
    if (!all) captures = captures.filter((c) => !MealsCore.isProcessed(c));

    if (args.format === 'json') {
        console.log(JSON.stringify(captures, null, 2));
        return;
    }
    if (captures.length === 0) {
        console.log(all ? '(no captures)' : '(no unprocessed captures)');
        return;
    }
    for (const c of captures) console.log(captureLine(c));
}

async function cmdGet(args, positional) {
    const row = await resolveCapture(positional[1]);
    const c = Object.assign({ id: row.id }, MealsCore.parseContent(row.content));
    if (args.format === 'json') {
        console.log(JSON.stringify(c, null, 2));
        return;
    }
    console.log(captureLine(c));
}

async function cmdAdd(args) {
    if (typeof args.text !== 'string' || !args.text.trim()) {
        throw new Error('add needs --text "..."');
    }
    const capture = MealsCore.makeCapture({
        text: args.text,
        at: typeof args.at === 'string' ? args.at : new Date().toISOString(),
        source: typeof args.source === 'string' ? args.source : 'cli'
    });
    const { data, error } = await supabase
        .from(DB_TABLE)
        .insert({ list_name: CAPTURE_LIST, content: MealsCore.serialize(capture) })
        .select('id')
        .single();
    if (error) throw error;
    console.log(`Captured — ${data.id}`);
}

async function cmdProcess(args, positional) {
    const row = await resolveCapture(positional[1]);
    const capture = MealsCore.parseContent(row.content);
    if (!capture || capture.kind !== 'capture') throw new Error(`${row.id} is not a capture`);
    const updated = MealsCore.markProcessed(capture, {
        at: new Date().toISOString(),
        note: typeof args.note === 'string' ? args.note : undefined
    });
    const { error } = await supabase
        .from(DB_TABLE)
        .update({ content: MealsCore.serialize(updated) })
        .eq('id', row.id)
        .eq('list_name', CAPTURE_LIST);
    if (error) throw error;
    console.log(`Processed ${row.id}`);
}

// Land a food capture: place a library meal as a slot on a calendar date.
async function cmdPlace(args) {
    if (typeof args.list !== 'string' || !args.list.trim()) throw new Error('place needs --list <calendar>');
    if (typeof args['library-id'] !== 'string') throw new Error('place needs --library-id <uuid>');
    if (!MealsCore.isIsoDate(args.date)) throw new Error('place needs --date YYYY-MM-DD');
    if (args.type !== undefined && MEAL_TYPES.indexOf(args.type) === -1) {
        throw new Error(`--type must be one of ${MEAL_TYPES.join(', ')}`);
    }
    const listName = args.list.trim();

    const libRow = (await fetchRows(LIBRARY_LIST)).find((r) => r.id === args['library-id']);
    if (!libRow) throw new Error(`No library meal with id ${args['library-id']}`);

    const dayRows = await fetchRows(listName, { from: args.date, to: args.date });
    const { newSlotContent } = MealsCore.addSlot(dayRows, { id: libRow.id, content: libRow.content }, args.date);
    let slot = MealsCore.parseContent(newSlotContent);

    // Optional meal-type override: recompute order within the chosen section.
    if (typeof args.type === 'string') {
        const existing = dayRows
            .map((r) => MealsCore.parseContent(r.content))
            .filter((p) => p && p.kind === 'slot');
        slot.meal_type = args.type;
        slot.order = MealsCore.nextOrder(existing, args.date, args.type);
    }

    const { data, error } = await supabase
        .from(DB_TABLE)
        .insert({ list_name: listName, content: MealsCore.serialize(slot) })
        .select('id')
        .single();
    if (error) throw error;
    const meal = MealsCore.parseContent(libRow.content) || {};
    console.log(`Placed "${meal.name || '(unnamed)'}" [${slot.meal_type}] on ${args.date} (${listName}) — slot ${data.id}`);
}

// Land a symptom capture: write a dated symptom row on a calendar.
async function cmdSymptom(args) {
    if (typeof args.list !== 'string' || !args.list.trim()) throw new Error('symptom needs --list <calendar>');
    const symptom = MealsCore.makeSymptom({
        text: typeof args.text === 'string' ? args.text : '',
        date: args.date,
        at: typeof args.at === 'string' ? args.at : null,
        severity: args.severity,
        category: typeof args.category === 'string' ? args.category : null
    });
    const { data, error } = await supabase
        .from(DB_TABLE)
        .insert({ list_name: args.list.trim(), content: MealsCore.serialize(symptom) })
        .select('id')
        .single();
    if (error) throw error;
    console.log(`Logged symptom "${symptom.text}" on ${symptom.date} (${args.list.trim()}) — ${data.id}`);
}

async function main() {
    const { args, positional } = parseArgs(process.argv.slice(2));
    const command = positional[0];

    if (!command || command === 'help') {
        console.log(USAGE);
        return;
    }
    if (!['list', 'get', 'add', 'process', 'place', 'symptom'].includes(command)) {
        console.error(`Unknown command: ${command}\n`);
        console.log(USAGE);
        process.exitCode = 1;
        return;
    }

    ({ supabase, login, DB_TABLE } = require('./supabase-cli'));
    await login();

    if (command === 'list') await cmdList(args);
    else if (command === 'get') await cmdGet(args, positional);
    else if (command === 'add') await cmdAdd(args);
    else if (command === 'process') await cmdProcess(args, positional);
    else if (command === 'place') await cmdPlace(args);
    else if (command === 'symptom') await cmdSymptom(args);
}

main().catch((err) => {
    console.error(`Error: ${err.message}`);
    process.exitCode = 1;
});

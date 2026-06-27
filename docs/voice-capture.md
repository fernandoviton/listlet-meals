# Voice capture for food + symptoms

A frictionless capture path: speak a short note ("smoothie and a banana", "upset
stomach right now") into an iOS Shortcut. The note plus its timestamp is stored **verbatim**
in a raw capture log. No parsing or macro math happens at capture time — that is
fully decoupled into a later [reconcile step](#reconcile-the-claude-code-half).

## Core principle: capture is dumb

The capture path only:
1. validates you're signed in (piggybacks on the existing Supabase Google session),
2. stores the raw string + event time,
3. returns fast.

All intelligence (parsing food into items/macros, classifying symptoms, severity,
deciding whether something is a known recipe) lives in the reconcile step, so it
never slows down or blocks capture.

## How it works (no backend, no edge function)

The capture "endpoint" is just the existing web app at `?list=capture`:

```
iOS Shortcut (dictate)
  → Open URL: <app>/?list=capture&text=<dictated>&at=<ISO8601 timestamp>&source=shortcut
  → app.js stashes {text, at} to localStorage BEFORE auth (so it survives the
    OAuth redirect, which strips the query string)
  → if a Supabase session exists  → no redirect; CapturesView inserts the raw row
  → if not signed in              → Google sign-in appears; after sign-in the
                                     stashed capture flushes automatically
  → CapturesView shows "✓ Captured: …" and the raw row lands in ?list=capture
```

Because it reuses the app's client-side Google OAuth, there is **no shared secret,
no service-role key, and no refresh-token rotation problem**. The capture row is a
normal `listlet_meals` row (`list_name='capture'`), written under the same RLS as
everything else.

### Capture row shape

`?list=capture` rows store:

```js
{ kind: "capture", text, at, source, processed_at, note? }
```

- `text` — the dictated string, verbatim.
- `at` — the event time (ISO 8601) the Shortcut passed; `null` if absent.
- `source` — `"shortcut"`, `"web"`, or `"cli"`.
- `processed_at` — `null` until reconciled; set when the reconcile step lands it.
- `note` — optional one-line outcome written at reconcile time ("placed Chicken Wrap").

Captures have no `date` key, so the DB's generated `slot_date` column stays `NULL`
and they never appear in calendar/trends range queries.

## Build the iOS Shortcut

1. Open **Shortcuts** → **+** → name it e.g. "Log food/symptom".
2. Add action **Dictate Text** (set the language; "Stop Listening" → *After Pause*).
3. Add action **Get Current Date**. (Format isn't critical — the next step encodes it.)
4. Add action **Text** and set it to the capture URL, inserting the magic variables:
   ```
   https://<your-username>.github.io/listlet-meals/?list=capture&source=shortcut&text=[Dictated Text]&at=[Current Date]
   ```
   - Insert **Dictated Text** where `[Dictated Text]` is and **Current Date** where
     `[Current Date]` is (tap the variable chips; don't type the brackets).
   - For `at`, tap the **Current Date** chip → set the date format to **ISO 8601**.
   - iOS percent-encodes variables substituted into a URL automatically.
5. Add action **URL Encode**? Not needed — the substituted variables are encoded.
   (If your text ever breaks the URL, wrap the text value in a **URL Encode** action.)
6. Add action **Open URLs** with the Text from step 4.
7. (Optional) **Add to Home Screen** or add it to the Action Button / Back-Tap /
   "Hey Siri, log food" for one-tap dictation.

The first run opens Safari and may prompt for Google sign-in; after that the session
persists and subsequent captures are silent round-trips that land in the log.

### Web fallback

Open `?list=capture` in any signed-in browser and type into the textarea — same
`makeCapture` path, `source: "web"`. Handy for testing without the Shortcut.

## Reconcile (the Claude Code half)

Captures sit unprocessed until you reconcile them — a human + Claude pass that turns
raw text into structured data. Run the **`/reconcile-captures`** skill, or drive the
CLI directly:

```bash
node scripts/capture.js list --format json          # unprocessed captures
node scripts/capture.js get <id> --format json       # one capture

# Land food: place a known library meal as a calendar slot
node scripts/capture.js place --list planner --library-id <uuid> --date 2026-06-27 [--type lunch]

# Land a symptom: dated symptom row on a calendar
node scripts/capture.js symptom --list planner --date 2026-06-27 --text "upset stomach" --severity 3 --category gi

# Mark processed with an outcome note (shows in the web log)
node scripts/capture.js process <id> --note "placed Chicken Wrap (lunch)"
```

Deciding whether a captured food is a **known recipe** is part of reconcile:

- Known → `capture.js place` it.
- Unknown but worth keeping → add a recipe via `library.js add --file tmp/<meal>.json`
  (or a quick macros-only `library.js add --name … --cal …`), then place it. Promote
  an earlier quick-add in place with `library.js update --id <uuid> --file …`.

The goal: after a few weeks, most things you eat are already in the library, so
reconcile becomes mostly "match + place".

## Where it shows up

- **Capture log** — `?list=capture`: every raw capture, newest first, with a
  `new` / `reconciled` badge and the outcome note.
- **Planner** — `?list=<cal>`: placed meals appear as normal slots and count toward
  day/week totals.
- **Trends** — `?list=<cal>&view=trends`: placed meals feed the charts like any slot.

## Tests

- `tests/unit/capture.test.js` — `MealsCapture` pure logic.
- `tests/e2e/capture.spec.js` — manual capture, Shortcut auto-capture (`?text=`),
  the double-capture guard, and the processed badge/note.

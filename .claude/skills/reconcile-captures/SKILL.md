---
name: reconcile-captures
description: Turn raw voice/quick captures (?list=capture) into structured data — place meals as calendar slots, add new recipes to the library, log symptoms — collaboratively with the user, then mark each capture processed. Use when the user says "reconcile captures", "process my captures", or wants to clear the capture log.
---

# /reconcile-captures

Raw captures are stored verbatim by the capture page (a dictated note + event time, no parsing). This skill is the **interpretation** half: walk each unprocessed capture, decide food vs. symptom, land it in the project's data, and mark it processed. **Work collaboratively — propose, let the user confirm, then execute.** Never guess macros or invent a recipe silently.

All commands run from the **main checkout** (needs `.env` + `node_modules`).

## 0. Pick the calendar

Captures are calendar-agnostic. Ask the user which calendar `?list=` to log into (e.g. `planner`) if it isn't obvious from context. Use it as `--list <cal>` below.

## 1. List unprocessed captures

```bash
node scripts/capture.js list --format json
```

If empty, tell the user and stop. Otherwise note each capture's `id`, `text`, and `at` (the event time → its calendar date is the local date of `at`; if `at` is null, ask the user for the date).

## 2. For each capture, classify

Read the text and decide:

- **Food** ("smoothie and a banana", "had the chicken wrap") → one or more meals to place.
- **Symptom** ("upset stomach right now", "low energy", "headache") → a symptom row.
- **Both / ambiguous** → ask the user.

## 3a. Food → match to the library, then place

Check whether each food item is already a known recipe:

```bash
node scripts/library.js list
```

- **Known** → place it as a slot:
  ```bash
  node scripts/capture.js place --list <cal> --library-id <uuid> --date <iso> [--type breakfast|lunch|dinner|snack]
  ```
  (Meal type defaults to the library meal's `default_meal_type`; override with `--type`.)

- **Unknown** → decide *with the user* whether it's worth adding:
  - **Quick log only** (one-off, not worth a recipe): add a macros-only ad-hoc meal, then place it:
    ```bash
    node scripts/library.js add --name "Banana" --type snack --cal 110 --protein 1
    # → prints the new id; then place it with capture.js place
    ```
  - **Add a real recipe** (something the user eats often — the goal is that after a few weeks most foods are in the library): draft a whole-meal JSON per the recipe authoring convention in CLAUDE.md, write it to the gitignored `tmp/` dir, and add it:
    ```bash
    node scripts/library.js add --file tmp/<meal>.json
    ```
    Then place it. If the user previously quick-logged it as an ad-hoc meal, **promote in place** instead so existing slots keep their link:
    ```bash
    node scripts/library.js update --id <uuid> --file tmp/<meal>.json
    ```

## 3b. Symptom → log a dated symptom row

```bash
node scripts/capture.js symptom --list <cal> --date <iso> --text "upset stomach" [--at <iso>] [--severity 1-5] [--category gi]
```

Propose a short `--category` (e.g. `gi`, `energy`, `skin`, `sleep`) and, if the user gives a sense of intensity, a numeric `--severity`. Keep `--text` close to the user's words.

## 4. Mark the capture processed

After the capture's content has been landed, stamp it with a one-line outcome note:

```bash
node scripts/capture.js process <id> --note "placed Chicken Wrap (lunch) on 2026-06-27"
```

The note shows under the capture in the web log so the trail is auditable.

## 5. Continue + summarize

Move to the next capture. When all are processed, summarize what was placed, what recipes were added/promoted, and any symptoms logged. Remind the user they can review results in the planner (`?list=<cal>`), the library page, and the capture log (`?list=capture`).

## Allowed Tools
Bash, AskUserQuestion, Read, Write

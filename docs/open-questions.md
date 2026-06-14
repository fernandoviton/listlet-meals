# Open Questions — dated calendar & trends

Surfaced while testing the in-progress `calendar` branch (real dated week + trends
view). These are **design decisions worth a discussion**, not clear bugs. Clear
bugs found during the same pass were fixed directly (see "Already fixed" at the
bottom for context).

## Trends rendering & semantics

1. **No magnitude reference on the bar charts.**
   The cal/protein charts scale every bar to the *range max*, with no y-axis, no
   gridline, and no numeric label. You can't tell whether a tall bar is 1,500 or
   2,800 cal without hovering for the SVG `<title>` tooltip — and there's no
   tooltip affordance on touch. Worth adding at least a max-value label, and maybe
   a target/goal line (a daily calorie or protein goal would make the chart
   actionable rather than purely comparative).

2. **A logged day with zero (or zero-of-that-macro) is indistinguishable from an
   unlogged day.** Both render as no bar. A day where you logged only carbs shows
   an empty slot in the calories chart, identical to a day you forgot to log.
   Should logged days get a baseline tick/dot so "logged 0" ≠ "didn't log"? This
   also affects how the eye reads adherence over a range.

3. **Only calories and protein are charted; carbs and fat appear only in the
   averages table.** Intentional (protein being the macro most people track), or
   should carbs/fat be chartable too (e.g. a stacked bar, or a macro toggle)?

4. **Retroactive history.** Slots store no macro snapshot — they live-join to the
   library, so editing a meal's macros *rewrites every past day and the whole
   trends history* for slots pointing at it. This is documented as an accepted
   tradeoff, but it means trends are "what these meals would total today," not
   "what you actually ate." If trends are meant to be a food log, snapshotting
   macros onto the slot at placement time (or at week-close) would make history
   immutable. Worth deciding before trends accrete real history.

5. **`today` is highlighted in the planner but not in trends.** Should the trends
   charts mark the current day/week (a colored bar or a "this week" row in the
   table) so the latest, still-in-progress period reads differently from completed
   ones?

## Data / scale

6. **The ~1000-row fetch cap drops the _newest_ slots first.** `shared/api.js`
   has no pagination and Supabase orders ascending by `created_at`, so once the
   week list passes ~1,000 rows (~1 year of ~4 slots/day) the most recent slots
   silently fall out of *every* read — the planner, the browser trends view, and
   the CLI `trends` export. A dated calendar is exactly the feature that hits this.
   It's listed under "Known limits" as later-work, but "recent weeks silently go
   blank" is a worse failure mode than the usual "old data drops" — worth bumping
   the paginating-fetch wrapper up the priority list, or at least surfacing a
   "results truncated" warning.

7. **Day/week totals aren't rounded at the summary layer.** `summarizeMacros`
   sums raw library values; only the *weekly averages* are rounded (`round1`).
   Nothing constrains a library macro to an integer (`makeLibraryMeal` keeps any
   finite number), so a decimal macro — or float-addition artifacts — can surface
   as e.g. `1490.3000000000002 cal` in a day summary. Should the day/week summary
   round (and/or should macro entry be constrained to integers)?

## Interaction / a11y

8. **Slot cards aren't keyboard-operable.** A slot card is `role="button"
   tabindex="0"` but only wires a `click` handler — tabbing to it and pressing
   Enter/Space does nothing, so the recipe modal is mouse/touch-only. The library
   card, by contrast, opens on Enter/Space. Inconsistent; either add a keydown
   handler to the slot card or drop the button affordances. (Low effort to fix if
   we agree it should match the library card.)

9. **Ad-hoc meals accumulate invisibly.** Quick-add creates hidden `adhoc: true`
   library rows that can only be promoted or pruned via the CLI. Over time a heavy
   quick-add user builds an invisible pile of one-off rows. Is an in-app library
   editor (and/or an "unused ad-hoc" cleanup) on the roadmap, or is CLI-only
   management the intended long-term workflow?

---

## Already fixed (clear bugs, committed on this branch)

- **Trends day-axis labels were horizontally stretched.** The bar SVG fills width
  via `preserveAspectRatio="none"` (non-uniform scale); the Saturday tick `<text>`
  stretched with it (~6× at the 2-week range — digits visibly spread apart). Moved
  the labels out of the SVG into an HTML `.trends-axis` row positioned by percent.
- **Next-week arrow sat flush against Today in the week-nav** (pre-existing WIP on
  the branch). Grouped the `‹ label ›` stepper apart from the Today/Trends jump
  links and confirmed the arrows always carry an explicit `?date=`.

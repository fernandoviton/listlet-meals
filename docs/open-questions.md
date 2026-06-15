# Open Questions — dated calendar & trends

Surfaced while testing the in-progress `calendar` branch (real dated week + trends
view). These are **design decisions worth a discussion**, not clear bugs. Clear
bugs found during the same pass were fixed directly (see "Already fixed" at the
bottom for context).

## Interaction / a11y

1. **Ad-hoc meals accumulate invisibly.** Quick-add creates hidden `adhoc: true`
   library rows that can only be promoted or pruned via the CLI. Over time a heavy
   quick-add user builds an invisible pile of one-off rows. Is an in-app library
   editor (and/or an "unused ad-hoc" cleanup) on the roadmap, or is CLI-only
   management the intended long-term workflow?

---

## Resolved

- **The ~1000-row fetch cap dropping the _newest_ slots first.** Was: `shared/api.js`
  had no date filter and Supabase orders ascending by `created_at`, so past ~1,000 rows
  (~1 year of ~4 slots/day) the most recent slots fell out of every calendar read.
  Resolved by a generated, content-derived `slot_date` column (`sql/migrations/001_add_slot_date.sql`)
  plus a `{ dateFrom, dateTo }` range fetch (`shared/api.js#fetchItems` / `setDateRange`,
  used by `view/week.js`, `view/trends.js`, and the CLI `trends`). Calendar reads now pull
  only the visible week / trends range (~28 rows), well under the cap. The library list
  stays unpaginated but is tiny — see architecture.md "Known limits".

## Already fixed (clear bugs, committed on this branch)

- **Trends day-axis labels were horizontally stretched.** The bar SVG fills width
  via `preserveAspectRatio="none"` (non-uniform scale); the Saturday tick `<text>`
  stretched with it (~6× at the 2-week range — digits visibly spread apart). Moved
  the labels out of the SVG into an HTML `.trends-axis` row positioned by percent.
- **Next-week arrow sat flush against Today in the week-nav** (pre-existing WIP on
  the branch). Grouped the `‹ label ›` stepper apart from the Today/Trends jump
  links and confirmed the arrows always carry an explicit `?date=`.
- **Slot cards weren't keyboard-operable.** The card is `role="button"
  tabindex="0"` but only had a `click` handler, so the recipe modal was
  mouse/touch-only. Added a keydown handler so Enter/Space open the modal (matching
  the library card).

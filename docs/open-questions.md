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

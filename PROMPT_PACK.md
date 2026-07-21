# MealCraft — Phase-Gated Prompt Pack (Sonnet execution)

Usage: paste ONE phase at a time into Claude Code, in order. CLAUDE.md must be
in the repo root before Phase 0. Do not paste the next phase until the current
gate passes and you say so.

---

## PHASE 0 — Scaffold, storage module, schema, export/import

Read CLAUDE.md fully. Restate your plan (≤10 bullets) and the files you will
create, then wait for my approval.

Scope:
- Vite + React scaffold, mobile-first shell with bottom tab nav placeholders:
  Pantry · Library · Plan · Track · Settings.
- `src/schema.js`: the shapes from CLAUDE.md §3 as JSDoc-typed factories +
  validators (validate(obj, shape) returning actionable error strings).
- `src/storage.js`: get/set/subscribe over one localStorage root key, with a
  schemaVersion field.
- Settings screen: Export (downloads full-state JSON; also copy-to-clipboard)
  and Import (paste or file; validates before overwriting; shows diff summary
  "X pantry items, Y components, Z weeks" and asks confirm).

Out of scope: any real feature screens.

GATE (show me evidence):
1. Export → wipe localStorage → Import restores identical state (deep equal).
2. Importing malformed JSON produces a human-readable error naming the field.
3. App shell renders correctly on a 390px-wide viewport.

---

## PHASE 1 — Pantry

Restate plan, wait for approval.

Scope:
- Pantry screen: items grouped by category; categories are user-editable
  (add/rename/reorder/delete-if-empty). Seed default categories: Spices,
  Condiments & Sauces, Oils & Fats, Grains & Bases, Legumes, Proteins,
  Vegetables, Fruits, Nuts Seeds & Finishers, Dairy, Frozen.
- Item CRUD: name, category, staple/rotating toggle, onHand toggle, roughQty
  free text. Fast add (type name, enter, done). Swipe/press affordances sized
  for thumbs.
- Filters: staples only / rotating only / on-hand only. Search.
- Seed ~40 sensible starter items across categories (veg + eggs kitchen:
  tofu, paneer, chickpeas, dals, rice, common spices) — all editable/deletable.

GATE:
1. Create, edit, recategorize, delete an item; state survives reload.
2. Rename a category; items follow.
3. onHand toggling from the list view takes one tap.

---

## PHASE 2 — Library

Restate plan, wait for approval.

Scope:
- Library screen: Component CRUD per schema (free-text measures, steps,
  shelf life, storage, station, active/passive min, cuisine tags, macros
  optional at this phase, origin, rating, archive).
- Search + filters: type, cuisine tag, rating, "makeable now" (all ingredient
  names fuzzy-match an onHand pantry item; show near-misses: "missing 1: mint").
- Detail view optimized for cooking: steps readable at arm's length.

GATE:
1. Save a composed dish and a sauce; both searchable and filterable.
2. "Makeable now" correctly flips when I toggle a pantry item onHand.
3. Rating a component from its card takes one tap.

---

## PHASE 3 — Ideator: prompt compiler + week import (paste flow)

Restate plan, wait for approval.

Scope:
- "Generate week" flow on Plan tab: user picks servings target, cook events
  (default Sun + Wed refresh), optional notes ("no repeats of last week's
  sauces", "use up the cabbage").
- Prompt compiler: assembles ONE clipboard-ready prompt containing:
  (a) current on-hand pantry grouped staple/rotating, (b) constraints,
  (c) last WeeklyFeedback + component ratings, (d) the exact WeekPlan +
  Component JSON schema with a STRICT "output only valid JSON" instruction,
  (e) the standing generation brief (below).
- Import box: paste JSON → validate → on success create Components (dedupe by
  name against existing Library, ask on conflicts) + WeekPlan → land on Plan
  view. On failure: name the exact field and produce a copy-ready "fix
  request" message the user can paste back into the chat.

Standing generation brief to embed verbatim:
"Design a component-based meal-prep week (bowl format): bases, protein preps
(veg + eggs: tofu/paneer/legumes/eggs), veg preps, 3–4 sauces from DIFFERENT
cuisine families, finishers. No two consecutive lunches share a sauce family.
Assign durable components to Sunday, fragile ones to the Wednesday refresh
(15 min, one fresh sauce + one quick veg). Produce a timed Sunday run sheet
(~90 min) that runs Instant Pot, oven, and stovetop in parallel, ordered to
maximize passive overlap. Include shelf life, storage notes, and approximate
macros per serving for every component. Grocery suggestions = plan minus
on-hand, advisory."

GATE:
1. Compiled prompt copies in one tap and contains all five sections.
2. A real plan generated in chat imports clean on first paste.
3. Deliberately corrupt one field → import rejects with a usable fix message.

---

## PHASE 4 — Planner

Restate plan, wait for approval.

Scope:
- Week view: Sunday run sheet (checkable timed steps, grouped by station,
  progress persists), Mon–Fri assembly cards (components + note), Wednesday
  refresh card.
- Editing: swap assembly cards between days (drag or tap-to-swap), substitute
  any component from Library, remove/add components.
- Grocery suggestions list: check-off + dismiss; never blocks anything.
- Empty states that explain the paste flow.

GATE:
1. Check run-sheet steps with a thumb; progress survives reload mid-cook.
2. Swap Tue and Thu cards; substitute a sauce from Library.
3. Dismiss the entire grocery list; nothing else changes.

---

## PHASE 4.5 — Nutrition capture waterfall

Restate plan, wait for approval.

Scope:
- NutritionInfo editor on PantryItem and Component, with provenance tag and
  as_packaged/as_prepared toggle and servingsPerContainer prompt.
- Seed table: ship a JSON of ~30 commodity items with naturalUnits
  (canned chickpeas 1/3 cup drained, cooked rice per cup, egg, paneer per
  100 g, tofu per half-block with user-settable block weight, common dals
  cooked, etc.). Applied automatically on name match; user-overridable.
- Barcode scan: camera via @zxing/browser → Open Food Facts lookup → fallback
  USDA FoodData Central (user pastes their free FDC key in Settings) →
  fallback manual. Store once per product.
- Label photo (BYOK mode only): photo → provider vision call → parsed
  NutritionInfo shown for user confirmation before save.
- Component macro derivation: when all ingredients have nutrition + resolvable
  measures, compute macrosPerServing (macroSource: "derived"); otherwise leave
  null or ai_estimate — never fake precision.

GATE:
1. Scan a real barcode; macros land with source "barcode".
2. Seed table fills canned chickpeas from name alone.
3. A component with 3 quantified ingredients shows derived macros; removing
   one ingredient's nutrition reverts gracefully.

---

## PHASE 5 — Tracker (signals, not scores)

Restate plan, wait for approval.

Scope:
- Log a meal: pick the day's assembly card (one tap pre-fills components),
  adjust portions in natural units, optional quickRating.
- Gauges dashboard: protein trend vs Settings.proteinBand (band, not target
  number), plate-mix ratio (protein/carb/veg share of the week), prepped-
  lunches-eaten streak, money saved (logged prepped lunches ×
  Settings.boughtLunchCost minus nothing fancy — directional).
- Friday feedback: the 3-line WeeklyFeedback form, surfaced Fri/Sat, stored,
  and automatically included by the Phase 3 prompt compiler.
- Provenance-aware display: gauges show a subtle "estimates" hint when >50%
  of logged macros are ai_estimate/seed.

GATE:
1. Logging Monday's lunch from the assembly card takes ≤3 taps.
2. Gauges update after logging; protein band renders as a band.
3. Next compiled prompt contains last week's feedback verbatim.

---

## PHASE 6 — BYOK mode + PWA polish

Restate plan, wait for approval.

Scope:
- Settings: apiMode toggle (paste default), provider select, key field
  (localStorage only, masked, removable), test-connection button.
- BYOK features: "Generate week" one-tap (same compiled prompt, same
  validator on the response); per-component micro-actions on Plan/Library
  ("regenerate this sauce", "substitute for X") that patch state after the
  same validation; label-photo capture from Phase 4.5 goes live.
- PWA: manifest, icons, service worker (offline app shell + data; network
  only for lookups/API), install prompt hint.
- Backup nudge: if no export in 14 days, gentle banner (dismissable).

GATE:
1. Airplane mode: full app works in paste mode except lookups.
2. BYOK generate produces an imported week with zero manual JSON handling.
3. Removing the API key leaves no trace in storage; paste mode unaffected.
4. Installs to home screen; icon and title correct.

---

END OF ORIGINAL PACK (Phases 0–6). What follows is a second pack, written
after several weeks of real use, covering what the user found overly
complicated rather than missing.

---

# UX Simplification Pack (Phases 7–12)

Context: after live use, the app felt overcomplicated — too many buttons,
filters, and fields that don't earn their keep. This pack was scoped by
(a) live browser UX testing of all five screens as a first-time user, and
(b) a code audit of which fields actually drive behavior vs. are purely
decorative. Each phase below states exactly what was found to be dead
weight vs. load-bearing, and what to do about it. Same rules as Phases 0–6:
restate plan (≤10 bullets) and files touched, wait for approval, show GATE
evidence, work one phase at a time, do not opportunistically refactor
outside a phase's scope.

Confirmed usage pattern driving these decisions: the user tracks nutrition
and does use the copy-prompt AI generation flow occasionally, but wants a
much smaller/simpler prep session (fewer components, one station, ~45 min
instead of a 90-min 3-station choreography), and does not want the Weekly
Feedback journaling step.

---

## PHASE 7 — Foundational: schema simplification + banner layout

Restate plan, wait for approval.

Scope:
- `src/schema.js`: remove `PantryItem.role` (and `PANTRY_ROLES` export),
  `Component.origin`, `Component.cuisineTags`, and `NutritionInfo.state`
  (and `NUTRITION_STATES` export) from the type shapes, validators, and
  `create*` factory defaults. Leave the `WeeklyFeedback` type and `feedback`
  collection defined as-is in the schema (Phase 11 stops the app from
  writing new entries to it, but old exports containing feedback data must
  still import without error).
- `src/storage.js`: bump `SCHEMA_VERSION` from 5 to 6. Add a `v5 -> v6`
  migrate() step that deletes the now-unused keys from persisted objects
  (`role` off every pantry item, `origin`/`cuisineTags` off every
  component, `state` off every `nutrition` object found on pantry items and
  components) purely for storage hygiene — these keys are otherwise
  harmless if left, so this step must not throw if they're already absent.
- `src/seeds.js`: collapse `staple()`/`rotating()` into a single item
  builder (role argument removed); update all ~40 call sites.
- `src/nutritionSeeds.js`: remove the `state` argument from the `seed()`
  builder and all ~30 call sites; stop setting `NutritionInfo.state`.
- `src/nutritionLookup.js`: remove the 4 `state: 'as_packaged'` literals
  from barcode/label lookup results.
- `src/promptCompiler.js`:
  - `pantrySection()`: replace the Staples/Rotating split with a single
    "On-hand pantry" list (drop `formatPantryGroup` role filtering, keep
    the roughQty-aware line format).
  - `componentExample()`: remove `cuisineTags: []` from the JSON example
    schema sent to the AI (both the week-prompt and component-task shapes
    use this shared function).
  - `feedbackSection()`: remove the `repeatWorthy`/`diedUneaten`/
    `boredomNotes` lines entirely; keep the `repeatNames`/`neverNames`
    component-rating lines (rename the section/heading to reflect that
    it's now rating-only, e.g. "Component ratings"). This function no
    longer needs the `feedback` argument — update its one caller
    (`compileWeekPrompt`) accordingly.
  - `currentComponentSection()`: the destructure already excludes `origin`
    from what's sent to the AI; just drop `origin` from the destructure
    list since the field no longer exists on `component`.
- `src/weekImport.js`: same mechanical destructure cleanup (drop `origin`
  from the two spots that strip it); confirm import validation does not
  hard-fail if a pasted AI response still includes a stray `cuisineTags` or
  `origin` field from an old cached prompt (should be ignored, not
  rejected).
- `src/App.jsx` / wherever `BackupNudge`/`InstallHint` are rendered: change
  both from full-width card-style banners to compact single-line dismissible
  strips (icon + short text + × dismiss, ~32–40px tall) so they never push a
  screen's heading/primary content below the fold on a 390px viewport.

GATE:
1. A pre-Phase-7 (schemaVersion 5) export — including a pantry item with a
   `role`, a component with `origin`/`cuisineTags`, and a nutrition object
   with `state` — imports cleanly, lands on `schemaVersion: 6`, and those
   fields are gone from the resulting state without any error or crash.
2. On a 390px-wide viewport with both banners un-dismissed, a screen's own
   heading is visible without scrolling.
3. "Copy prompt" produces a prompt whose pantry section is a single on-hand
   list (no Staples:/Rotating: headers), whose component JSON example has
   no `cuisineTags` key, and whose feedback section only lists repeat/never
   component names (no repeat-worthy/died-uneaten/boredom-notes lines).

---

## PHASE 8 — Pantry simplification

Restate plan, wait for approval. Depends on Phase 7.

Scope:
- `src/screens/PantryScreen.jsx`: remove the Staples/Rotating filter chips
  (role is gone); add a persistent "+ Add item" control near the search bar
  that works without first expanding a category (prompt for name + category
  in one small inline step; category can default to the first/most-recent
  category if the user doesn't pick one).
- `src/components/PantryItemEditor.jsx`: remove the staple/rotating toggle
  buttons.
- `src/components/NutritionInfoEditor.jsx`:
  - Remove the manual `source` `<select>` entirely. Instead, set `source`
    automatically based on which action populated the fields: barcode scan
    → `'barcode'`, label photo → `'label_photo'`, "autofill from common
    foods" → `'seed_table'`, typing values directly → `'manual'`. The
    existing small provenance tag continues to display whatever the
    resulting value is — no UI change there.
  - Remove the as-packaged/as-prepared toggle (state is gone from schema).
  - Rename the "Fill from seed table" button to "Autofill from common
    foods."
  - Add visible `<label>` text above/beside all 4 per-serving macro inputs
    (Calories / Protein (g) / Carbs (g) / Fat (g)) so they're identifiable
    once a value (including the default 0) is entered — this was a real
    bug (placeholder-as-label disappearing on input), not a design choice.

GATE:
1. A new pantry item can be added via the persistent "+ Add item" control
   without expanding any category first.
2. Opening Nutrition entry, typing macro values manually shows "Manual" as
   the resulting provenance tag with no source dropdown visible anywhere;
   scanning a barcode shows "Barcode" as the tag instead, automatically.
3. All 4 macro fields are legibly labeled at all times, including after a
   default value of 0 is present.

---

## PHASE 9 — Library simplification

Restate plan, wait for approval. Depends on Phase 7.

Scope:
- `src/components/ComponentEditor.jsx`: remove the `origin` `<select>` and
  the cuisine-tags text input entirely (both fields are gone from schema).
  Wrap the "Time & shelf life" block and the macros block in collapsed-by-
  default `<details>`-style sections so saving a simple component only
  requires Name + Type + at least one ingredient + at least one step; the
  collapsed sections should still save sensible defaults/nulls if left
  untouched. Add visible labels to the 3 previously-unlabeled time/shelf-
  life number inputs (Active min / Passive min / Shelf life (days)).
  Rename the "Derive from ingredients" button to "Calculate from pantry"
  and add a one-line caption near it explaining it uses your pantry items'
  nutrition data matched by ingredient name.
- `src/screens/LibraryScreen.jsx`: remove the cuisine-tag filter chips
  entirely. Keep the `type` chip row as the only always-visible filter
  (plus search). Move the rating chips (Repeat/Fine/Never), "Makeable now"
  toggle, and "Archived" toggle behind a "More filters" disclosure that's
  collapsed by default. Add a single "Clear filters" action that resets
  every active filter (type, rating, makeableOnly, archived) in one tap.
- `src/components/ComponentDetail.jsx`: replace raw enum display (e.g.
  `instant_pot`, `ai_estimate`) with friendly labels — reuse/extend the
  `STATION_LABELS`-style mapping pattern already used in
  `src/components/RunSheet.jsx` for stations, and add an equivalent map for
  `macroSource` values. Remove any remaining cuisine-tag display.
- `src/componentOps.js`: remove `cuisineTag` from the `filterComponents`
  filters object/signature (dead now that the field and its filter chip are
  gone).

GATE:
1. Library's default view shows only the type-chip row + search; opening
   "More filters" reveals rating/makeable/archived; "Clear filters" resets
   all of them in one tap.
2. Creating a new component with just a name, type, one ingredient, and one
   step saves successfully without ever opening the macros or time/shelf-
   life sections.
3. An existing component's detail view shows "Instant Pot" (not
   `instant_pot`) and no cuisine-tag UI anywhere.
4. "Calculate from pantry" still derives macros correctly when ingredient
   names match pantry items with nutrition data (same underlying behavior
   as the old "Derive from ingredients", just relabeled and explained).

---

## PHASE 10 — Plan simplification (incl. rescoped generation brief)

Restate plan, wait for approval. Depends on Phase 7.

Scope:
- `src/promptCompiler.js`: rewrite `buildGenerationBrief()` to ask for a
  much smaller session — one base, one protein prep, one veg prep, one
  sauce, cooked sequentially on a single station (stovetop OR oven,
  whichever fits), targeting ~45 minutes total, instead of the current
  bases+multiple-sauces-from-different-cuisines / 90-min / 3-station-
  parallel brief. Keep the existing cook/refresh-day assignment logic
  (durable → cook day, fragile → refresh day) — that's a separately
  configurable setting the user still wants, only the base session's scope
  and station count are shrinking. Update the module-level comment at the
  top of the file that currently states the brief mirrors "the original
  brief verbatim" (Phase 3) since it no longer does.
- `src/components/GenerateWeekForm.jsx` + `src/components/WeekImportBox.jsx`
  (or wherever they're composed on `PlanScreen`): merge these into one
  visually numbered 2-step flow inside a single card — "① Copy prompt"
  (existing Copy-prompt button/behavior) followed by a short instruction
  with real links to open Claude (`https://claude.ai/new`) and Gemini
  (`https://gemini.google.com/app`) in a new tab, then "② Paste the reply
  here" with the existing paste textarea directly below, all in one card
  rather than two visually separate boxes. The BYOK direct "Generate week"
  button (shown only when `byokActive`) stays as an alternative primary
  action above this 2-step flow, unchanged.
- `src/components/AssemblyCards.jsx`: rename the per-day "Swap" button to
  something unambiguous like "Swap with another day" (it swaps the whole
  day's component set, not an ingredient). Add an explicit "Change" button/
  icon next to each component name for the existing tap-to-substitute
  picker (keep the tap-on-name behavior too, just make it discoverable).
  Add an inline "Remove? / Keep" confirm (matching the existing pattern
  used in `PantryItemEditor`/`TrackScreen`) before actually removing a
  component from a day — this is currently missing entirely, which
  conflicts with CLAUDE.md §5's "every destructive action needs undo or
  confirm" rule.

GATE:
1. The compiled prompt's `## 5. Brief` section asks for a single-station,
   ~45-minute, small-component-count session — verify the literal text no
   longer mentions "Instant Pot, oven, and stovetop in parallel" or "3–4
   sauces."
2. On Plan with no BYOK key set, the generate area reads as one numbered
   2-step flow in a single card, and clicking Copy prompt reveals working
   "Open Claude" / "Open Gemini" links.
3. On an existing week, the day-swap button reads unambiguously (e.g.
   "Swap with another day"), each component has a visible "Change" control,
   and removing a component from a day requires confirming first.

---

## PHASE 11 — Track simplification (incl. protein gauge bug)

Restate plan, wait for approval. Depends on Phase 7.

Scope:
- `src/components/GaugesPanel.jsx` / `src/styles.css`: fix the protein
  gauge rendering as a blank box. Code review of `.protein-chart*` CSS and
  the bar-height calculation didn't turn up an obvious cause, so start by
  reproducing it live (log a lunch, inspect the rendered
  `.protein-chart__bar` in devtools — check whether `barHeight`/
  `d.protein_g` is computing as `NaN` for partial-macro days, and whether
  anything from the recent "Warm Kitchen visual refresh" (commit 2362a71)
  is clipping or hiding the bar) before changing anything. Document the
  actual root cause in the commit message once found.
- `src/components/LogMealCard.jsx`: once a day's lunch is logged, collapse
  the card to a compact one-line summary (component names + quick rating)
  with a visible "Edit" control that re-expands the full logging UI, rather
  than always showing all ~14 controls (day tabs, portion steppers, rating
  chips, remove, log-something-else).
- Same file: fix the "Log something else" nested-scroll trap — the inline
  checkbox list of library components currently scrolls inside its own
  fixed-height container nested inside the already-scrolling page. Let it
  expand inline with the page's own scroll instead of introducing a second
  scroll region.
- `src/screens/TrackScreen.jsx` + `src/components/WeeklyFeedbackForm.jsx`:
  remove the Weekly Feedback UI and its wiring (`handleSaveFeedback` etc.)
  from Track entirely. Delete `WeeklyFeedbackForm.jsx`. (Schema/storage
  keep the `feedback` collection for backward-compatible import of old
  exports per Phase 7 — the app just never writes to it anymore.)

GATE:
1. Logging a lunch that includes at least one component with unknown
   macros ("partial") renders a visible, non-blank protein bar for that
   day, verified by eye in the browser, not just in the DOM.
2. After logging a meal, the card shows a compact summary line with a
   working "Edit" control that re-expands full editing.
3. Opening "Log something else" no longer produces a scrollbar nested
   inside another scrollbar.
4. Weekly Feedback no longer appears anywhere on the Track screen.

---

## PHASE 12 — Settings simplification

Restate plan, wait for approval. Depends on Phase 7.

Scope:
- `src/screens/SettingsScreen.jsx`: reorganize into a primary "Backup" view
  (Export + Import, unchanged behavior) shown by default, with a single
  collapsed "Advanced" disclosure containing the Week schedule (cook/
  refresh day), AI (BYOK) config, and Nutrition (FDC) key sections —
  unchanged behavior, just moved/collapsed.
- Replace the Cook day and Refresh day chip rows (7–8 buttons each) with
  `<select>` dropdowns populated from the same `DAY_NAMES`/refresh-day
  constants currently used to build the chips. This also fixes the Cook-day
  row's line-wrapping layout bug.
- Confirm the Settings-route banner change from Phase 7 (compact single-
  line strips) reads correctly now that Export/Import is the first thing
  on the page — no further change needed here if Phase 7 already handled
  it, just verify.

GATE:
1. Opening Settings shows Backup (Export/Import) first, with no banner
   obscuring the heading; Week schedule/AI/Nutrition are inside a collapsed
   Advanced section.
2. Cook day and Refresh day are single-select dropdowns; neither wraps or
   overflows on a 390px viewport.
3. Export, Import (validate → confirm), BYOK save/remove/test-connection,
   and FDC key save/remove all still work exactly as before the
   reorganization.

---

END OF PACK. After Phase 12, propose nothing new; ask the user what they
felt was missing or still overcomplicated during real weekly use, and
wait.

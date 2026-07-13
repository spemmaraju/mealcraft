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

END OF PACK. After Phase 6, propose nothing new; ask the user what they felt
was missing during real weekly use, and wait.

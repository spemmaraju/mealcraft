# Phase 4 — Planner (MealCraft)

## Context

Phases 0–3 are verified complete: code audit found every spec item implemented (storage module, schema validators, export/import, Pantry, Library with makeable-now, Ideator prompt compiler + week import), and all four smoke suites pass (`node scripts/smoke-phase{0..3}.mjs` — 70 checks total, 0 failures).

Phase 4 (per PROMPT_PACK.md) turns the Plan tab from a read-only counts card into the real planner: a checkable Sunday run sheet, editable Mon–Fri assembly cards, the Wednesday refresh card, and an advisory grocery list. The data is already there — `WeekPlan.runSheet[].done` and `grocerySuggestions[].dismissed` are stored and initialized `false` by Phase 3's import; this phase surfaces and flips them. **No schema changes.**

## Approved design decisions

- **Grocery check-off = dismiss (user-approved):** checking an item sets `dismissed: true` (struck-through, re-tappable to undo). "Dismiss all" button with two-step inline confirm. No schema change.
- **Tap-to-swap** for assembly cards (no drag — no new deps, better for thumbs).
- **Refresh card is display-only** (spec's editing bullets target assembly cards only).
- **No week picker** — keep existing "latest week wins" behavior; don't gold-plate.
- **Delete `WeekSummaryCard.jsx`** — it's the Phase-3 placeholder that literally says "full planner comes in Phase 4"; `WeekView` supersedes it.
- Top-level `week.componentIds` recomputed as the ordered union of runSheet/assembly/refresh references after every edit (single source of truth stays consistent).

## Files

### New
| File | Responsibility | ~Lines |
|---|---|---|
| `src/weekOps.js` | Pure functions over WeekPlan (mirrors `pantryOps.js`/`componentOps.js`) | 110 |
| `src/components/WeekView.jsx` | Container: header, sections, swap/picker interaction state, `onCommit` | 130 |
| `src/components/RunSheet.jsx` | Checkable timed steps grouped by station + progress line | 85 |
| `src/components/AssemblyCards.jsx` | Mon–Fri cards (swap/substitute/add/remove) + read-only refresh card | 150 |
| `src/components/ComponentPickerSheet.jsx` | Bottom sheet: pick Library component (search + type chips) | 95 |
| `src/components/GroceryList.jsx` | Check-off rows + Dismiss-all with confirm + collapsed all-dismissed state | 75 |
| `scripts/smoke-phase4.mjs` | weekOps + persistence checks mapped to the gates | 160 |

### Modified
- `src/screens/PlanScreen.jsx` (59 → ~75): render `WeekView` instead of `WeekSummaryCard`; `onCommit` persists via `storage.set('weeks', weekOps.replaceWeek(weeks, next))`; "Back to this week" escape from the generate form; empty-state copy explaining the paste flow.
- `src/styles.css` (+~90, appended only): run-sheet rows/progress, assembly card + `--selected`/`--swap-target` states, grocery rows, picker list. All tap targets ≥44px.

### Deleted
- `src/components/WeekSummaryCard.jsx`

Untouched: `storage.js`, `schema.js`, `weekImport.js`, all Phase 0–2 files. No new dependencies.

## weekOps.js API (pure — no DOM, no storage imports)

```js
replaceWeek(weeks, nextWeek)              // weeks[] with matching weekOf replaced
toggleRunSheetStep(week, stepIndex)       // flip done, immutable
runSheetProgress(week)                    // { done, total }
groupRunSheetByStation(runSheet)          // [{ station, steps: [{ step, index }] }] — original indexes kept
swapAssemblyDays(week, dayA, dayB)        // exchange componentIds+note; day labels stay in place
substituteComponent(week, day, fromId, toId)
addComponentToDay(week, day, componentId) // dedupes
removeComponentFromDay(week, day, componentId)
toggleGrocerySuggestion(week, index)
dismissAllGroceries(week)                 // touches ONLY grocerySuggestions (gate 3)
recomputeComponentIds(week)               // ordered union of all references
```

## UI & interactions

**Run sheet (Gate 1):** `.plan-section` with "X of Y done" progress line + thin bar. Steps grouped by station (Stovetop / Oven / Instant Pot / Other), original order within groups. Each row: 44px check button (reuse `.pantry-row__onhand` pattern), `t` time chip, action text, resolved component name. Done rows dim + strikethrough, still tappable. Every toggle commits straight to storage — no local `done` state, so reload mid-cook restores progress.

**Assembly cards (Gate 2):** one card per stored day, refresh card inserted after the day matching `refresh.day`. Card = day header + "Swap" button; component rows (tap name → substitute picker; trailing × → inline "Remove?" confirm, per the `PantryItemEditor.jsx:92` idiom); note; "Add component".
- *Tap-to-swap:* Swap on Tue → Tue gets accent border + "Cancel", other cards get dashed `--swap-target` styling + "Swap with Tue" → tap Thu → `swapAssemblyDays`, selection clears. Day labels never move; contents+note exchange.
- *Substitute/Add:* bottom sheet (reuse `.sheet-backdrop`/`.sheet`, styles.css:322) listing non-archived Library components via `componentOps.filterComponents` — search + type chips, pre-filtered to the replaced component's type when substituting, current ids excluded.

**Grocery list (Gate 3):** subtitle "Advisory only — dismiss freely." 44px check rows; "Dismiss all N?" two-step confirm; when all dismissed, collapse to one line with a "Show" toggle so it's reversible. `dismissAllGroceries` provably touches nothing else.

**Empty state (no weeks):** intro block above GenerateWeekForm:
> **No week planned yet.** MealCraft works with any AI chat — no API key needed.
> 1. Set options below and **Copy prompt**. 2. Paste into Claude/Gemini. 3. Paste the JSON reply into the import box.
> Your week — run sheet, daily lunches, grocery suggestions — appears here, fully editable.

Plus per-section one-liners inside WeekView for empty runSheet/grocery arrays.

## Implementation sequence

1. `src/weekOps.js` — logic first.
2. `scripts/smoke-phase4.mjs` — prove logic before UI (same MemoryStorage-shim skeleton as smoke-phase3).
3. `RunSheet.jsx` + CSS; new `WeekView.jsx`; rewire `PlanScreen.jsx`; delete `WeekSummaryCard.jsx`.
4. `AssemblyCards.jsx` (display → swap → remove confirm), then `ComponentPickerSheet.jsx`.
5. `GroceryList.jsx` + dismiss-all.
6. Empty-state copy; thumb-target CSS polish.
7. All smoke suites + manual checklist; present acceptance evidence; commit at the checkpoint.

## Verification

**Smoke tests (`node scripts/smoke-phase4.mjs`):**
- toggle flips `done` immutably; **persists across simulated reload** via storage set/get (Gate 1)
- station grouping keeps within-group order + original indexes; progress counts correct
- **swap Tue/Thu** exchanges contents+note, labels/order unchanged; double-swap restores; unknown day no-op (Gate 2a)
- **substitute** replaces on one day only; `componentIds` union drops the old id only when nothing else references it; result passes `validate(week,'WeekPlan')` (Gate 2b)
- add dedupes; remove works; union stays correct
- **dismissAllGroceries: deep-equal on every other field before/after** (Gate 3)
- edited week survives export → wipe → import round-trip
- regression: `node scripts/smoke-phase{0..3}.mjs` still pass

**Manual checklist (dev server, ~390px viewport):**
1. *Gate 1:* thumb-check 3 run-sheet steps across two stations → hard reload → all still checked, progress line matches.
2. *Gate 2:* Swap Tue↔Thu via tap-to-swap → contents exchange, headers stay Mon–Fri. Tap a sauce → picker pre-filtered to sauces → pick a replacement → card updates; Library untouched.
3. *Gate 3:* Dismiss all → confirm → grocery collapses; run sheet, assembly, refresh unchanged; reload persists; "Show" + un-check one item proves reversibility.
4. No new deps in `package.json`; every new file <300 lines.

# Phase 5 — Tracker (signals, not scores)

Status: PLANNED — not yet implemented. Awaiting phase-gate approval per CLAUDE.md §4.

## Context

Phases 0–4.5 are verified complete: all 6 smoke suites pass (111 checks total —
phase 0: 8, phase 1: 8, phase 2: 29, phase 3: 25, phase 4: 15, phase 4.5: 26),
and a codebase survey confirms every phase's features exist per PROMPT_PACK.md.
The only remaining stub is `src/screens/TrackScreen.jsx` (8 lines, "Coming in
Phase 5").

Phase 5 adds the Track tab: meal logging from assembly cards, a gauges
dashboard (directional, never precision theater), and the Friday 3-line
feedback form. **No schema change or migration needed** — `LogEntry` /
`WeeklyFeedback` shapes, factories, and the `logs` / `feedback` storage
collections already exist and are validated on export/import (SCHEMA_VERSION
stays 3). `Settings.proteinBand` and `boughtLunchCost` already exist and are
editable in Settings. Gate 3 ("compiled prompt contains last week's feedback
verbatim") needs zero compiler changes — `promptCompiler.js`
`feedbackSection()` already embeds the latest-weekOf feedback; we only need
the form writing records.

## Plan in 10 bullets (per CLAUDE.md phase gate)

1. New pure ops module `src/trackOps.js` (~220 lines): local-safe date
   helpers, log build/upsert/remove, and all gauge math — no storage/DOM
   imports, mirroring `weekOps.js`.
2. Portion model: 1 portion unit = 1 serving (`{naturalUnitLabel: 'serving',
   count: 1}` default); stepper adjusts count in 0.5 steps; label stays free
   text; macros = count × `macrosPerServing`; null-macro components counted as
   "missing", never faked.
3. Gauges read the **current WeekPlan's Mon–Fri** logs (latest `weekOf` ≤
   today); streak alone spans all logs; money saved shows week + all-time.
4. Rewrite `src/screens/TrackScreen.jsx` (~150 lines): storage get/subscribe
   (PlanScreen pattern), composes LogMealCard → GaugesPanel →
   WeeklyFeedbackForm → recent-log list.
5. New `src/components/LogMealCard.jsx` (~150 lines): Today's assembly card
   with one big "Log lunch" button (**2 taps total: Track tab → Log lunch** —
   beats the ≤3-tap gate); after logging, flips to portion steppers +
   quickRating chips + delete with two-tap confirm; Mon–Fri strip for past
   days; "Log something else" multi-select for `meal: 'other'`.
6. New `src/components/GaugesPanel.jsx` (~150 lines): protein-by-day CSS bar
   chart with a translucent **band region** (shaded `low_g–high_g`, never a
   target line), plate-mix stacked bar (base→carbs / protein / veg / other),
   streak count, money saved with "directional" microcopy.
7. Provenance hint: when >50% of logged portions' macros come from
   `ai_estimate` / `seed_table`, show a subtle "mostly estimates — treat as
   directional" tag (reuse `.provenance-tag`).
8. New `src/components/WeeklyFeedbackForm.jsx` (~80 lines): 3 inputs, upsert
   by `weekOf` (current week's Sunday); collapsed to a one-line link most
   days, expanded and prominent on Fri/Sat.
9. Append a `/* ---- Track ---- */` section to `src/styles.css` (~120 lines);
   no existing rules touched; no new dependencies; nothing from prior phases
   refactored.
10. New `scripts/smoke-phase5.mjs` (~230 lines, smoke-phase4 pattern) covering
    all trackOps math, storage round-trip, and gate 3.

## Files

| File | Action |
|---|---|
| `src/trackOps.js` | new — all log/gauge logic |
| `src/components/LogMealCard.jsx` | new |
| `src/components/GaugesPanel.jsx` | new |
| `src/components/WeeklyFeedbackForm.jsx` | new |
| `scripts/smoke-phase5.mjs` | new |
| `src/screens/TrackScreen.jsx` | rewrite stub |
| `src/styles.css` | append Track section |

Untouched: `App.jsx`, `TabBar.jsx`, `storage.js`, `schema.js`,
`promptCompiler.js`, all prior screens/ops.

## trackOps.js signatures

```js
// Date helpers — format YYYY-MM-DD in LOCAL time (never toISOString: weekOf
// is a Sunday per nextSundayISO, and UTC shifts break evening logging)
todayISO(now?)                       // local YYYY-MM-DD
weekDates(weekOf)                    // -> [{day:'Mon', date}, … 'Fri']
currentWeek(weeks, dateISO)          // latest weekOf <= date, else latest, else null
assemblyCardForDate(week, dateISO)   // matching card | null

// Logging (LogEntry has no id — identity is (date, meal) / index)
buildLogFromCard(card, dateISO)      // prefilled LogEntry, portions default count 1
setPortionCount(log, componentId, count)   // immutable, clamped >= 0
upsertLog(logs, entry)               // lunch: replace same-date; 'other': append
removeLogAt(logs, index)
logFor(logs, dateISO, meal)          // -> {log, index} | null
logsForWeek(logs, weekOf)

// Gauges (portions with null macrosPerServing -> `missing` count, not zeros)
logMacros(log, components)           // {kcal, protein_g, carbs_g, fat_g, missing}
proteinByDay(logs, components, weekOf)  // [{day, date, protein_g, logged, hasMissing}]
plateMix(logs, components)           // {protein, carbs, veg, other} fractions | null
lunchStreak(logs, todayISO)          // consecutive weekdays; unlogged today doesn't break
moneySaved(logs, settings, weekOf)   // {week, allTime} = lunch count × boughtLunchCost
estimateFraction(logs, components)   // {fraction, showHint: fraction > 0.5}

// Feedback
upsertFeedback(feedback, entry)      // by weekOf — no duplicates
feedbackFor(feedback, weekOf)
isFeedbackWindow(dateISO)            // true Fri/Sat
```

## Key design points

- **Protein band chart, plain CSS**: relative container ~140px; band = one
  absolutely-positioned translucent div spanning `low_g→high_g` on a
  JS-computed scale (`max(high_g × 1.3, max daily)`); bars = 5 flex divs with
  inline height %. Un-logged days render a dot, out-of-band days a neutral
  tint — no red, no target numbers on bars.
- **Feedback → prompt (gate 3)**: form saves to the `feedback` collection
  keyed to the current week's Sunday; `compileWeekPrompt` already picks the
  latest record, so it flows through verbatim automatically.
- **Deletes**: two-tap confirm, same `confirmingRemove` pattern as
  `AssemblyCards.jsx`.
- **Empty states**: no week planned / weekend → "No plan for today — log
  something else or plan a week."

## Verification

1. `node scripts/smoke-phase5.mjs` — asserts: local-safe `weekDates`;
   `assemblyCardForDate` day matching; `buildLogFromCard` validates against
   `SHAPES.LogEntry`; `logMacros` math incl. 1.5× counts and null-macro
   `missing`; `proteinByDay` totals; `plateMix` sums to 1; streak across
   weekend + unlogged-today; `moneySaved`; `estimateFraction` threshold both
   sides; `upsertLog` replace-vs-append; logs+feedback export→reset→import
   round-trip; **gate 3**: stored feedback strings appear verbatim in
   `compileWeekPrompt` output and latest weekOf wins.
2. Re-run all prior smoke suites
   (`for f in scripts/smoke-*.mjs; do node $f; done`) — must stay green.
3. Manual gate walkthrough in `npm run dev` (390px viewport):
   (a) log Monday's lunch — count taps, must be ≤3;
   (b) gauges update immediately after logging and the protein band renders
   as a shaded band;
   (c) save Friday feedback, then open Plan → Generate week → compiled prompt
   contains the feedback verbatim;
   (d) reload mid-session — logs persist.

Commit at the end as the Phase 5 checkpoint.

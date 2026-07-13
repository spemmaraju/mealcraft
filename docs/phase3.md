# Phase 3 — Ideator: prompt compiler + week import (paste flow)

Status: IMPLEMENTED and verified. Plan approved per `docs/phase3-plan.md` (user
decisions confirmed 2026-07-12); this doc records the executed result and the
gate evidence.

## What shipped

Per the plan, no schema or storage changes — `weeks`/`feedback` collections and
`WeekPlan`/`WeeklyFeedback` validators already existed from Phase 0.

**New pure modules** (no storage imports; caller persists — mirrors `componentOps.js`):
- `src/promptCompiler.js` — `GENERATION_BRIEF` (verbatim from `PROMPT_PACK.md`),
  `nextSundayISO(from)`, `compileWeekPrompt(state, options)` assembling the five
  `## N.` sections (on-hand pantry, constraints, feedback & ratings, strict
  output-format JSON envelope with enums interpolated from `schema.js`, brief).
- `src/weekImport.js` — `extractJson`, `validatePayload` (all-or-nothing:
  parse → envelope → per-component strip+validate → weekPlan shape →
  cross-referenced `componentName(s)`), `findConflicts` (fuzzy match via
  `componentOps.nameMatches`), `applyImport` (pure; `use-existing` / `replace`
  (keeps rating, overwrites recipe fields) / `new`; upserts the week by
  `weekOf`), `buildFixRequest`.

**UI** (Plan tab only; `App.jsx` untouched): `PlanScreen.jsx` rewritten —
summary view (`WeekSummaryCard`) when a week exists, else
`GenerateWeekForm` + `WeekImportBox`; owns persistence
(`storage.set('components', …)` then `storage.set('weeks', …)`).

**Tests**: `scripts/smoke-phase3.mjs` — 25 checks covering the compiler's five
sections/grouping/fallbacks/enum-interpolation and the importer's parsing,
validation error paths, conflict detection, all three resolution behaviors,
and the same-`weekOf` upsert.

**Untouched**: `schema.js`, `storage.js`, `App.jsx`, `seeds.js`, `package.json`.

## Verification

**Automated** — all green:
```
node scripts/smoke-phase0.mjs   # 8/8
node scripts/smoke-phase1.mjs   # 8/8
node scripts/smoke-phase2.mjs   # 29/29
node scripts/smoke-phase3.mjs   # 25/25
npm run build                   # succeeds
```

**Manual gate walkthrough** (`npm run dev`, Claude-in-Chrome, dark theme, fresh
localStorage):
1. **Gate 1** — Plan tab → servings/toggles/notes untouched from defaults →
   "Copy prompt" → "Prompt copied to clipboard." confirmed on screen.
2. **Gate 2** — pasted a hand-built golden JSON reply (2 components, a run
   sheet, assembly, refresh, grocery suggestion) → Validate → diff summary
   read "2 new components, 0 conflicts, plan for week of 2026-07-19" →
   Confirm import → screen flipped to `WeekSummaryCard` → reloaded the page →
   Plan tab still showed the week, Library tab showed both new components
   (origin `ai`, correct type/cuisine tags, makeability computed correctly).
3. **Gate 3** — pasted a payload with `"station": "microwave"` → Validate
   rejected, naming `components[0].station: expected "stovetop" | "oven" |
   "instant_pot" | "none", got "microwave"` → "Copy fix request" → "Fix
   request copied." → nothing persisted (still on the generate/import screen).
4. **Conflict path (gate 4)** — imported a payload containing `"peanut
   Sauce"` (fuzzy-matches the existing "Peanut sauce") alongside a genuinely
   new component → diff summary read "1 new component, 1 conflict" → conflict
   row rendered "peanut Sauce looks like existing Peanut sauce" with
   Use existing / Replace / Import as new, defaulting to Use existing →
   confirmed → week summary showed the original "Peanut sauce" name (no
   duplicate created) plus the new component → Library confirmed exactly one
   "Peanut sauce" entry.

## Known limitation (flagged, not fixed in this phase)

`nextSundayISO()` (and the pre-existing `todayStamp()` in `SettingsScreen.jsx`
from Phase 0) compute a date via `new Date(...).toISOString().slice(0, 10)`.
For any timezone ahead of UTC, converting local midnight to UTC rolls the
reported date forward by one day in the evening/night (observed live: local
7:07pm PDT showed a `weekOf` of the next calendar day because UTC had already
rolled to the next date). The `weekOf` field is a plain editable date input,
so this only affects the *prefilled default*, not correctness of a
user-confirmed import. Because this is the same pattern already present in
Phase 0's `SettingsScreen`, fixing it here would mean opportunistically
touching a prior phase (CLAUDE.md §4.5 discourages this) — flagging per §4.5's
"fix the class, not the instance" guidance instead of silently patching one
call site. Recommend a small dedicated fix (a shared local-date helper) as a
follow-up, covering both call sites at once.

Commit at completion: `Phase 3: Ideator — prompt compiler, week import, Plan screen`.

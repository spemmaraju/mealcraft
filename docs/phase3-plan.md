# Phase 3 Plan — Ideator: Prompt Compiler + Week Import (paste flow)

Status: PLANNED, not yet implemented. Per CLAUDE.md §4, implementation starts only
after user approval of this plan.

## Context

Phases 0–2 are verified complete: all 45 smoke checks pass (`smoke-phase0/1/2.mjs`),
the working tree is clean on `main`, and gate docs exist (`docs/phase0-2.md`). The
`weeks` and `feedback` storage slices already exist (empty, nothing writes them yet)
and `WeekPlan`/`WeeklyFeedback` validators are in `schema.js` — so **Phase 3 needs no
schema change and no version bump**.

Phase 3 (per PROMPT_PACK.md) turns the Plan tab stub into the Ideator: a form that
compiles one clipboard-ready AI prompt from app state, and an import box that
validates the AI's pasted JSON reply, dedupes new components against the Library, and
creates the Components + WeekPlan. In paste mode this is how weeks get made; Phase 4
builds the full planner UI on top of the `weeks` data this phase writes.

User decisions (confirmed 2026-07-12):
- Servings target = total lunches Mon–Fri (default 5, one per weekday).
- Constraints section includes `settings.proteinBand`.
- Conflict "Replace" preserves the existing rating while overwriting recipe fields.

## JSON envelope (the AI ↔ importer contract)

The AI references components **by name** (never id); the importer assigns real ids
via `createComponent()`. Payload:

```json
{
  "components": [ { "name": "...", "type": "...", "cuisineTags": [], 
                    "ingredients": [{ "name": "...", "measure": "..." }], "steps": [],
                    "shelfLifeDays": 4, "storage": "...", "station": "...",
                    "activeMin": 10, "passiveMin": 25,
                    "macrosPerServing": { "kcal": 0, "protein_g": 0, "carbs_g": 0, "fat_g": 0 } } ],
  "weekPlan": {
    "weekOf": "YYYY-MM-DD",
    "runSheet": [ { "t": "0:05", "station": "...", "action": "...", "componentName": "..." } ],
    "assembly": [ { "day": "Mon", "componentNames": [], "note": "" } ],
    "refresh": { "day": "Wed", "steps": [], "componentNames": [] },
    "grocerySuggestions": [ { "name": "...", "qty": "..." } ]
  }
}
```

Importer conventions: component payload omits `id/rating/archived/origin/macroSource`
(stripped if the AI includes them); importer sets `origin:'ai'`, `rating:null`,
`archived:false`, `macroSource:'ai_estimate'`. Payload names must be unique
(case-insensitive). Every `componentName(s)` reference must resolve to a payload
component name — else a path-exact validation error. Importer fills
`weekPlan.componentIds` (final post-dedupe ids), `done:false` on runSheet rows,
`dismissed:false` on grocery rows. `macrosPerServing` may be null — never fake
precision.

## Files

### New pure modules (no storage imports — caller persists, same style as componentOps.js)

**`src/promptCompiler.js`** (~130 lines)
- `export const GENERATION_BRIEF` — the standing brief from PROMPT_PACK.md (Phase 3
  section), embedded verbatim.
- `nextSundayISO(from)` — default weekOf.
- `compileWeekPrompt({pantry, components, feedback, settings}, {servings, cookSunday, wedRefresh, notes, weekOf}) -> string`
  with five `## N.` sections:
  1. **On-hand pantry** — `onHand` items partitioned by `role` (Staples/Rotating),
     each `- name (roughQty)`; `(none)` for empty groups.
  2. **Constraints** — weekOf, N lunch servings Mon–Fri, cook events per toggles,
     protein band `low_g–high_g` g per serving, user notes verbatim.
  3. **Recent feedback & ratings** — latest `feedback` record (or `(no feedback
     yet)`), plus `repeat`/`never` rated non-archived component names.
  4. **Output format (STRICT)** — "Output ONLY valid JSON… no prose/fences" + the
     annotated envelope; enum lists interpolated from `COMPONENT_TYPES`/`STATIONS`
     imported from `schema.js` so they can never drift.
  5. **Brief** — `GENERATION_BRIEF` verbatim.

**`src/weekImport.js`** (~190 lines)
- `extractJson(text)` — strip markdown fences / surrounding prose (first `{` to last
  `}`), so real chat pastes import clean.
- `validatePayload(text) -> {ok, errors, payload}` — all-or-nothing: parse → envelope
  check → per-component presence check + strip + `createComponent()` +
  `validate(full,'Component')` with `components[i].` error prefixes → weekPlan payload
  shape checks (weekOf regex `\d{4}-\d{2}-\d{2}`, station enums, etc.) →
  cross-reference all `componentName(s)` against payload names with exact error paths.
- `findConflicts(payload, library)` — fuzzy match payload names vs non-archived
  Library via existing `nameMatches()` (componentOps.js).
- `applyImport(payload, resolutions, library, weeks) -> {components, weeks, week, newCount}`
  — pure, never mutates inputs. Per conflict resolution: `use-existing` (default) →
  reuse existing id, discard payload record; `replace` → keep existing id **and
  rating**, overwrite recipe fields, `origin:'ai'`; `new` → fresh id, coexists. Merge
  via `upsertComponent()`. Build the real WeekPlan via `createWeekPlan()` with
  remapped ids + `done/dismissed:false`; backstop `validate(week,'WeekPlan')`. Upsert
  weeks **by `weekOf`** (replace matching entry else append).
- `buildFixRequest(errors)` — copy-ready chat message listing the `path: problem`
  lines + "fix these and output the corrected FULL JSON only — no prose, no fences."

### UI (Plan tab only; App.jsx untouched)

- **`src/screens/PlanScreen.jsx`** — replace the 8-line stub. Standard pattern
  (`useState` + `useEffect` + `storage.subscribe(reload)`, like LibraryScreen). If a
  week exists → `WeekSummaryCard` (latest weekOf) + "Generate a new week" button;
  else the generate flow: `GenerateWeekForm` + `WeekImportBox`. Owns persistence:
  `storage.set('components', …)` then `storage.set('weeks', …)` on confirmed import;
  "land on Plan view" = the screen flips to the summary.
- **`src/components/GenerateWeekForm.jsx`** (~110) — servings stepper (default 5),
  Sunday-cook / Wed-refresh toggle chips (both on), weekOf date input prefilled
  `nextSundayISO()`, notes textarea, one-tap **Copy prompt** (clipboard try/catch
  pattern from SettingsScreen; fallback reveals prompt in a readonly textarea for
  manual copy).
- **`src/components/WeekImportBox.jsx`** (~160) — textarea → **Validate** → on
  failure `.message--error` list + **Copy fix request**; on success `.diff-summary`
  ("N new components, M conflicts, plan for week of X — replaces existing plan" when
  applicable) + per-conflict three-option choice (Use existing / Replace / Import as
  new, `.chip` segmented) + **Confirm import** / Cancel. Mirrors the SettingsScreen
  validate→diff→confirm idiom; the confirm covers the destructive week-replace case.
- **`src/components/WeekSummaryCard.jsx`** (~80) — minimal (not Phase 4's planner):
  weekOf, component names grouped by type, counts (run-sheet steps · assembly days ·
  refresh · grocery suggestions), "full planner comes in Phase 4" hint.
- **`src/styles.css`** — +~60 lines (`.conflict-row`, `.prompt-fallback`, segmented
  chips).

Note: `storage.previewImport/importState` validate full-state exports only —
deliberately **not** reused here; the payload validator is bespoke but built on the
same `validate()`.

### Tests & docs

- **`scripts/smoke-phase3.mjs`** — same zero-dep template as smoke-phase2.mjs
  (MemoryStorage shim first, `check()`, exit 1). Covers:
  - Compiler: five section headers + brief verbatim; staple/rotating grouping and
    off-hand exclusion; empty-feedback fallback and seeded-feedback inclusion;
    repeat/never rating lists; enum interpolation matches schema constants;
    notes/servings/weekOf/protein band in constraints.
  - Import: `extractJson` fence stripping; golden payload → valid import with
    generated ids, `origin:'ai'`, remapped references, `done/dismissed:false`,
    `validate(week,'WeekPlan')===[]`; storage round-trip; corrupt `type` → error
    names `components[0].type`; missing `weekOf` named; unknown `componentName` →
    exact path; `buildFixRequest` content; fuzzy conflict detection ("Mint Chutney"
    vs "mint chutney"); resolution matrix (use-existing / replace-keeps-rating /
    new); double import same `weekOf` → one week, replaced.
- **`docs/phase3.md`** — the manual gate checklist (below), written at implementation
  time.

## Order of work

1. `src/promptCompiler.js`
2. `src/weekImport.js`
3. `scripts/smoke-phase3.mjs` (prove all logic before any UI)
4. `src/styles.css` additions
5. `GenerateWeekForm` + `WeekImportBox` + `WeekSummaryCard`
6. `src/screens/PlanScreen.jsx` rewrite
7. `docs/phase3.md`
8. Verify + commit + push.

Untouched: `schema.js`, `storage.js`, `App.jsx`, `seeds.js`, `package.json`
(no new dependencies).

## Verification (the Phase 3 gate)

Automated: `node scripts/smoke-phase3.mjs`, re-run phase 0–2 smokes as regression,
`npm run build`.

Manual (in `npm run dev`):
1. **Gate 1** — Plan tab → set servings, add a note → one-tap Copy prompt → paste in
   an editor: all five sections present, brief verbatim, note/servings/protein band
   included.
2. **Gate 2** — paste the prompt into a real Claude chat, paste the JSON reply into
   the import box → Validate → Confirm → week summary shows; new components appear in
   Library; state survives reload.
3. **Gate 3** — corrupt one field (e.g. `"station": "microwave"`) → Validate rejects
   naming `components[N].station`; Copy fix request yields a paste-ready message;
   nothing persisted.
4. Conflict path — pre-create "Mint chutney" in Library, import a payload containing
   "mint chutney" → conflict row appears; verify all three resolution options behave
   as specified.

Commit at completion: `Phase 3: Ideator — prompt compiler, week import, Plan screen`
(and push, per checkpoint rules).

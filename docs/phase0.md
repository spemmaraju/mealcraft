# Phase 0 — Approved Execution Spec: Scaffold, storage, schema, export/import

> Status: plan approved, **not yet executed**.
> This document is self-contained: an executor (e.g. Sonnet) should be able to
> build Phase 0 from this file alone, plus repo-root `CLAUDE.md` (the enforced
> ruleset — read it first; it wins on any conflict).

## Context

MealCraft is a local-first meal-prep PWA for a single user. No accounts, no
backend, no analytics. Vite + React SPA, plain CSS, phone-first (390px design
target). All persistence flows through one module (`src/storage.js`) backed by
localStorage in v1, with an interface that can swap to IndexedDB later without
touching callers. Full-state Export/Import JSON is the backup and cross-device
sync mechanism, first-class from this phase.

Phase 0 delivers: project scaffold, mobile shell with bottom tab nav
placeholders, the schema contract as code, the storage module, and a working
Settings screen with Export/Import. **No real feature screens.**

## Steps

1. `git init` (local only — do NOT create a GitHub remote; that needs separate
   user approval). Add `.gitignore` (node_modules, dist). Commit at logical
   checkpoints with clear messages.
2. Scaffold Vite + React in the repo root. Dependencies: **react, react-dom,
   vite only.** No UI frameworks, no router — tab state in React.
3. Mobile-first shell: bottom tab bar with 5 tabs — **Pantry · Library · Plan ·
   Track · Settings**. First four render a placeholder ("Coming in Phase N").
   Tap targets ≥ 44px; layout designed at 390px width, works on desktop.
4. `src/schema.js` — JSDoc-typed factory functions + validators for all 7
   shapes in CLAUDE.md §3: PantryItem, NutritionInfo, Component, WeekPlan,
   LogEntry, WeeklyFeedback, Settings.
   - `validate(obj, shapeName)` returns `[]` when valid, else actionable error
     strings naming the exact path and problem, e.g.
     `pantry[3].role: expected "staple" | "rotating", got "stple"`.
   - Free-text fields (measures, roughQty) are strings — never coerced.
5. `src/storage.js` — the ONLY module that touches localStorage.
   - Root key: `mealcraft.v1`. Stored value:
     `{ schemaVersion: 1, pantry: [], components: [], weeks: [], logs: [],
        feedback: [], settings: <default Settings> }`.
   - API: `get(collection)`, `set(collection, value)`, `subscribe(listener)`
     (called on any change), `getFullState()`, `exportState()` (returns JSON
     string), `importState(jsonString)` (validates first — see step 6),
     `resetState()`.
   - Callers never import localStorage directly. Keep the API async-friendly
     or trivially wrappable so IndexedDB can replace it later.
6. `src/screens/SettingsScreen.jsx` — the one real screen:
   - **Export**: downloads `mealcraft-export-YYYY-MM-DD.json` AND offers
     copy-to-clipboard.
   - **Import**: paste textarea or file picker. Pipeline: parse JSON →
     validate schemaVersion → validate every record via `schema.js` → show
     diff summary ("X pantry items, Y components, Z weeks") → explicit
     Confirm button → only then overwrite. Any failure: show a human-readable
     error naming the offending field; existing state untouched.
7. `scripts/smoke-phase0.mjs` — node smoke script, zero new deps, shims
   localStorage; exercises validators and the export → wipe → import
   round-trip (deep equal). Run with `node scripts/smoke-phase0.mjs`.
8. Verify the gate (below), then commit.

## Files to create

```
package.json, vite.config.js, index.html     (Vite scaffold)
.gitignore
src/main.jsx
src/App.jsx                                  (shell + tab state)
src/styles.css                               (mobile-first, plain CSS)
src/components/TabBar.jsx
src/screens/PantryScreen.jsx                 (placeholder)
src/screens/LibraryScreen.jsx                (placeholder)
src/screens/PlanScreen.jsx                   (placeholder)
src/screens/TrackScreen.jsx                  (placeholder)
src/screens/SettingsScreen.jsx               (Export/Import — real)
src/schema.js
src/storage.js
scripts/smoke-phase0.mjs
```

Every file ≤ ~300 lines. No dependencies beyond react/react-dom/vite.

## Acceptance gate (must show evidence)

1. Export → wipe localStorage → Import restores identical state (deep equal).
   Evidence: smoke script output + manual browser check.
2. Importing malformed JSON produces a human-readable error naming the field,
   and does not overwrite anything. Evidence: smoke script + manual paste of a
   corrupted export.
3. App shell renders correctly at 390px viewport width. Evidence: manual
   checklist — `npm run dev`, browser devtools responsive mode at 390px, all
   five tabs reachable and legible.

## Out of scope

Real Pantry/Library/Plan/Track features, seed data, PWA manifest/service
worker, BYOK, nutrition lookups — all later phases. Do not start Phase 1 until
the user says this gate passed.

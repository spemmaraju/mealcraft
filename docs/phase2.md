# Phase 2 — Library (Component CRUD + "makeable now")

Status: PLANNED — not yet approved for execution.

## Context

Phases 0–1 were verified before planning:
- **Code audit**: every Phase 0 spec point (scaffold, tab nav, `schema.js` factories+validators, single-key `storage.js` with schemaVersion, Settings export/import with diff+confirm) and every Phase 1 spec point (categories CRUD with v1→v2 migration, item CRUD, fast add, filters/search, 41 seed items, one-tap onHand) is implemented with no functional gaps.
- **Executable evidence**: `node scripts/smoke-phase0.mjs` and `node scripts/smoke-phase1.mjs` both pass (16/16 checks), working tree clean on `main`, both phase commits pushed.

Phase 2 builds the Library screen per `PROMPT_PACK.md` lines 57–73: Component CRUD (schema already exists — `createComponent` at `src/schema.js:71`, validator at `:232`; **no schema or storage changes needed**, `components: []` is already a validated collection), search + filters including a "makeable now" fuzzy match against onHand pantry items with near-miss display ("missing 1: mint"), and a cooking-optimized detail view.

## Design decisions (flagged for approval)

1. **One-tap rating (gate 3)**: a 3-segment button row (Repeat / Fine / Never) on each card — any rating is exactly one tap; tapping the active segment clears it. (A cycling button would need up to 3 taps.)
2. **No seed components**: gate 1 requires the *user* to save a dish and a sauce; seeds would muddy the evidence and create name-dedupe noise for Phase 3's import. Empty state copy guides instead.
3. **Makeability is derived at render, never stored** — computed from `components + pantry` each render; `storage.subscribe` makes it flip live when Pantry toggles onHand (gate 2 falls out of the existing pattern).
4. **Search also matches ingredient names** (find a dish by "chickpea") — cheap, useful, easily removed if unwanted.
5. **Detail view is full-screen** (covers tab bar) for arm's-length step reading; sheet stays for the editor.

## Files

**New**
| File | ~Lines | Purpose |
|---|---|---|
| `src/componentOps.js` | 145 | Pure ops + fuzzy matcher (mirrors `pantryOps.js`: no DOM, no storage import) |
| `src/components/ComponentRow.jsx` | 85 | Card: name/type/meta, makeable badge, 3-segment rating |
| `src/components/ComponentEditor.jsx` | 250 | Bottom-sheet form (pattern: `PantryItemEditor.jsx`) |
| `src/components/IngredientListEditor.jsx` | 60 | Dynamic name+measure rows (measure = free text) |
| `src/components/StepListEditor.jsx` | 75 | Numbered steps with ▲▼/remove |
| `src/components/ComponentDetail.jsx` | 140 | Full-screen cooking view |
| `scripts/smoke-phase2.mjs` | 170 | Zero-dep smoke test (template: `smoke-phase1.mjs`) |

**Modified**: `src/screens/LibraryScreen.jsx` (placeholder → ~190-line screen), `src/styles.css` (+~110 lines, existing BEM conventions).
**Untouched**: `storage.js`, `schema.js`, `App.jsx`, `seeds.js`, `package.json` (no new deps).

## componentOps.js API

```js
upsertComponent(components, component)   // replace by id or append
updateComponent(components, id, patch)   // one-tap rating, archive, etc.
deleteComponent(components, id)
normalizeTokens(name)                    // matcher internals, exported for tests
nameMatches(a, b)
makeableStatus(component, pantry)        // -> { makeable, missing: [names] }
makeabilityMap(components, pantry)       // -> { [id]: status }, derived at render
allCuisineTags(components)               // unique (case-insensitive), sorted
filterComponents(components, filters, makeability)
// filters = { search, type, cuisineTag, rating, makeableOnly, includeArchived }
```

## Fuzzy matcher (dependency-free)

- `normalizeTokens`: lowercase → strip non-alphanumerics to spaces → split → singularize tokens >3 chars (`ies`→`y`; `oes/ses/xes/zes/ches/shes`→drop `es`; trailing `s` not `ss`→drop).
- `nameMatches(a, b)`: bidirectional token-subset on Sets; empty set → false.
  - "canned chickpeas" ↔ "Chickpeas" ✓ · "mint" ↔ "mint leaves" ✓ · "tomatoes" ↔ "tomato" ✓ · "paneer" ↔ "peanuts" ✗. Known looseness: "rice" matches "rice vinegar" (accepted MVP trade-off).
- `makeableStatus`: an ingredient is missing if no `onHand: true` pantry item matches; blank ingredient rows ignored; zero ingredients → vacuously makeable.
- Row shows `✓ Makeable now` or `missing {n}: {first 2 names}…`.

## UI

**LibraryScreen**: mirrors `PantryScreen.jsx:24-38` exactly — `reload()` via `Promise.all([storage.get('components'), storage.get('pantry')])`, `useEffect` + `storage.subscribe(reload)`. State: filters (search/type/tag/rating/makeableOnly/showArchived) + overlays (`editingId: null|'new'|id`, `viewingId`). Layout: header + "＋ New component" → search + chip rows (6 type chips, Makeable now, 3 rating chips, derived cuisine tag chips, "Archived (n)" toggle — reusing `.chip`/`.pantry-filters__search`) → card list → empty states.

**ComponentEditor**: draft state from `createComponent()`; fields = name (required), type select, cuisine tags (comma-separated text → array), IngredientListEditor, StepListEditor, shelfLife/active/passive numeric row (NaN-safe), storage text, station select, optional macros (checkbox reveals kcal/protein/carbs/fat + source select manual/ai_estimate; unchecked keeps `null`), origin select, archived checkbox, Save/Cancel + two-tap Delete (copied from `PantryItemEditor.jsx:92-108`).

**ComponentDetail**: fixed full-screen overlay; sticky ← Back + Edit header; meta chips (type · station · times · keeps N days · storage); ingredients name-left/measure-right; steps as large-type `<ol>` (1.25rem, generous padding); macros block only if non-null **with provenance tag** showing `macroSource` (CLAUDE.md §5) — built as a small reusable `.provenance-tag` class for Phase 4.5/5.

## Implementation sequence

1. `src/componentOps.js` → 2. `scripts/smoke-phase2.mjs` (prove logic before UI) → 3. CSS + LibraryScreen + ComponentRow → 4. Editor + sub-editors → 5. ComponentDetail → 6. `npm run build`, re-run smoke-phase0/1 (regression), manual gate walk.

## Verification

**Smoke (`node scripts/smoke-phase2.mjs`)**: component validation; upsert/update/delete; matcher truth table (10 cases incl. case, plural, token-subset both directions, negatives); `makeableStatus` near-miss returns exactly `['mint']`; onHand flip flips makeable (gate-2 logic in pure form); off-hand items never match; filter combos over a fixture (search by name AND ingredient, type, tag case-insensitive, rating, makeableOnly, archived default-hidden); tag dedupe; export→reset→import round-trip with components + `previewImport` rejecting `type: 'entree'` naming `components[0].type`.

**Manual gate checklist** (run in `npm run dev`):
- **Gate 1**: create a dish ("Chickpea coconut curry", tag `indian`, ingredients incl. canned chickpeas + mint) and a sauce ("Mint chutney"); search "chut" → sauce only; type chips isolate each; `indian` tag shows both; reload → persist.
- **Gate 2**: with all chutney ingredients onHand → card shows ✓ Makeable now; Pantry tab → toggle mint off → Library card reads "missing 1: mint" and drops from the Makeable-now filter, **no reload needed**; toggle back → flips again.
- **Gate 3**: tap Repeat on a card once → active immediately, persists across reload, matches the Repeat filter chip; tap Never once → switches; tap Never again → clears.
- Regression: Settings export includes components; export→reset→import restores them.

Commit + push at completion per checkpoint rules: "Phase 2: Library screen, componentOps + makeable-now matcher, smoke tests".

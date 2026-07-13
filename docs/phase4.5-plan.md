# Phase 4.5 — Nutrition Capture Waterfall — Plan

## Context

Phases 0–4 are verified complete: every gate item maps to implemented code, and all 85
smoke checks pass (`node scripts/smoke-phase0..4.mjs`). The only stub is TrackScreen
(Phase 5, expected). Phase 4.5 adds nutrition data capture per PROMPT_PACK.md: a
NutritionInfo editor, a ~30-item seed table auto-applied by name, a barcode-scan
waterfall (Open Food Facts → USDA FDC → manual), and derived component macros —
never faking precision.

**User-approved decisions (2026-07-12):**
- Schema v2→v3: add `Settings.fdcKey`, `Component.servings` (nullable batch yield —
  required for per-serving derivation), optional `NutritionInfo.barcode`. Migration
  backfills seed nutrition onto existing pantry items whose `nutrition === null`
  (never overwrites non-null).
- Label photo **deferred to Phase 6** (BYOK key UI doesn't exist yet); ship only the
  editor's prefill-then-confirm seam it will plug into.
- New dependency `@zxing/browser` (pre-allowlisted in CLAUDE.md §4.6 for this phase).
- No barcode capture on Components (they have no `nutrition` field in the contract);
  Components get the expanded macro editor + Derive.

## Schema & storage (approval granted)

**`src/schema.js`** (303 lines — split validators if it grows much):
- `Settings.fdcKey: string|null` (factory default null)
- `Component.servings: number|null`
- `NutritionInfo.barcode` — optional string (records without it stay valid)

**`src/storage.js`**: `SCHEMA_VERSION = 3`; extend `migrate()` (pattern at :41-55)
with v2→v3: `settings.fdcKey ??= null`, `component.servings ??= null`, seed backfill
via `findSeedForName`. Change the migrate guard in `parseAndValidate` to
`schemaVersion < SCHEMA_VERSION` so v1 and v2 exports both import. Import order stays
acyclic: storage → nutritionOps → nutritionSeeds.

## New pure modules (build + test these first)

1. **`src/measures.js`** (~140 lines) — free-text measure parsing:
   - `parseQty` (decimals, `1/3`, `1 1/2`, unicode fractions), `parseMeasure` →
     `{qty, unitTokens}` reusing `normalizeTokens` from `componentOps.js:31`
   - `gramsFromMeasure` (g/kg/oz/lb only), `servingGrams(nutrition)` (parenthetical
     grams in servingDesc, else naturalUnits match)
   - `measureToServings(measure, nutrition)` → number|null: (a) direct servingDesc
     token-ratio ("2/3 cup drained" vs "1/3 cup drained" → 2, no grams needed),
     (b) naturalUnits/grams → `servingGrams` path, (c) else null. "handful" → null —
     give up, never guess.

2. **`src/nutritionSeeds.js`** (~130 lines, data-only like `seeds.js`) — ~30 commodity
   rows via a compact `seed(name, aliases, state, servingDesc, [kcal,p,c,f,fiber],
   naturalUnits)` builder, `source:'seed_table'`. Covers: canned chickpeas (1/3 cup
   drained = 55 g), cooked rice/quinoa per cup, oats, egg (1 egg = 50 g), paneer per
   100 g, tofu (1 block = 396 g / half block — user edits grams for their brand via
   naturalUnits, no schema change), cooked dals, yogurt, milk, ghee/oils per tbsp,
   peanut butter, tahini, frozen peas/spinach, onion, tomato, nuts, lemon.

3. **`src/nutritionOps.js`** (~160 lines) — pure ops:
   - `resolveIngredient(ing, pantry)` — pantry match via `nameMatches`
     (`componentOps.js:42`), requires nutrition + resolvable measure
   - `deriveComponentMacros(component, pantry)` — needs `servings > 0` and ALL
     ingredients resolvable; else `{ok:false, unresolved:[{name, reason}]}` — never
     partial sums. Round kcal to int, grams to 1 decimal.
   - `resyncDerivedMacros(components, pantry)` — re-derive every
     `macroSource:'derived'` component; failure ⇒ `macrosPerServing: null` (source
     stays `derived`; ComponentDetail already hides null macros = graceful revert).
     Returns `{changed, components}`.
   - `findSeedForName(name)`, `findCachedBarcode(pantry, code)` ("store once per
     product" — cache is the pantry itself)

## Lookup module (only networked code; user-tap triggered only)

**`src/nutritionLookup.js`** (~150 lines):
- `mapOffProduct(json)` / `mapFdcFood(json)` — pure mappers to NutritionInfo
  (per-serving preferred, per-100 g fallback; missing kcal/protein ⇒ null, fall
  through). `source:'barcode'`, `state:'as_packaged'`, `barcode` set.
- `lookupBarcode(code, {fdcKey})`: OFF `api/v2/product/{code}.json` → FDC search by
  GTIN (if key) → `{ok:false}` → caller drops to manual. Each step try/caught so
  offline degrades cleanly.

## UI

- **`src/components/NutritionInfoEditor.jsx`** (new, ~240 lines) — second-layer sheet
  (existing `sheet-backdrop`/`sheet` pattern; check stacking z-index in styles.css).
  Source select (all 5 sources), as_packaged/as_prepared toggle (role-toggle pattern
  from `PantryItemEditor.jsx:47-62`), servingDesc, servingsPerContainer prompt
  (skippable), perServing numerics (fiber optional), naturalUnits editor, actions:
  **Scan barcode**, **Fill from seed table**, Save/Cancel/Remove (confirm-guarded).
  Scan/seed results **prefill fields for confirmation** — nothing saved until Save
  (this is the Phase-6 label-photo seam).
- **`src/components/NaturalUnitsEditor.jsx`** (new, ~55 lines) — clone of
  `IngredientListEditor.jsx` shape.
- **`src/components/BarcodeScanner.jsx`** (new, ~120 lines) — `@zxing/browser`
  `decodeFromVideoDevice` in a sheet; stop controls + camera tracks in effect
  cleanup; camera-denied/no-camera fallback = typed barcode input.
- **`src/components/MacroSectionEditor.jsx`** (new, ~110 lines) — extract macros
  block from `ComponentEditor.jsx:149-192` (file is 243 lines, would blow the 300
  cap). Adds servings-per-batch input, full `MACRO_SOURCES` select, **"Derive from
  ingredients"** button; failure lists unresolved ingredients by name.
- **Modify:** `PantryItemEditor.jsx` (nutrition summary line + provenance tag +
  Add/Edit nutrition button), `PantryItemRow.jsx` (tiny provenance tag),
  `PantryScreen.jsx` (seed auto-apply in `commitAdd` at :63; load `components` and
  run `resyncDerivedMacros` + persist after nutrition writes/deletes),
  `ComponentEditor.jsx` / `ComponentDetail.jsx` (servings chip; provenance tag at :52
  already handles `derived`), `SettingsScreen.jsx` ("Nutrition lookups" section: FDC
  key field, masked, save/remove, note that lookups run only on Scan), `styles.css`.

## Order of work

1. `measures.js` → `nutritionSeeds.js` → `nutritionOps.js` +
   `scripts/smoke-phase4.5.mjs` passing for all three
2. Schema v3 + migration + migration smoke checks
3. Pantry-side UI (NaturalUnitsEditor, NutritionInfoEditor,
   PantryItemEditor/Row/Screen wiring)
4. Library-side (MacroSectionEditor, ComponentEditor/Detail wiring)
5. `nutritionLookup.js` + mapper fixtures in smoke script
6. `npm i @zxing/browser`, BarcodeScanner, Settings FDC key section
7. styles.css polish; run full gate
8. Commit + push at the logical checkpoint

## Verification

**Smoke — `scripts/smoke-phase4.5.mjs`** (zero-dep node, MemoryStorage shim, inline
fixtures, no network):
- Measure parser cases incl. unicode fractions, "handful" ⇒ null
- Resolution: direct ratio, tofu naturalUnits path, parenthetical grams,
  unmatched ⇒ null
- Derivation: 3-ingredient hand-checked macros; missing measure ⇒ ok:false naming
  ingredient; servings null ⇒ ok:false; revert via `resyncDerivedMacros` (macros
  null, source stays `derived`, still validates)
- Seeds: "canned chickpeas"/"Chickpeas (canned)"/"chickpea" match, "chicken"
  doesn't; never overwrites existing nutrition
- Migration: v2→v3 fixture (fields added, chickpeas backfilled, existing nutrition
  untouched), v1→v3 chain, v3 round-trip, all records validate
- Mappers: OFF per-serving, OFF per-100g, OFF missing-nutriments ⇒ null, FDC
  labelNutrients; barcode cache hit/miss
- Regression: smoke-phase0..4 all still pass (85 checks)

**Manual gate (mirrors PROMPT_PACK 4.5 gates):**
1. Barcode: dev server on localhost (secure context — camera won't work over LAN
   http; note in checklist), scan real product → OFF prefill → confirm → source tag
   "barcode"; rescan same code on another item hits cache (no network); offline
   mid-lookup → manual fallback; camera denied → typed-code fallback.
2. Seed: fast-add "canned chickpeas" → nutrition auto-attached with `seed_table` tag
   and 1/3-cup naturalUnit; pre-existing "Chickpeas (canned)" backfilled by
   migration; user edit survives.
3. Derived: component with 3 quantified ingredients + servings → Derive → macros
   with `derived` tag on detail; remove one item's nutrition → macro section
   disappears gracefully; re-add + re-derive → returns.

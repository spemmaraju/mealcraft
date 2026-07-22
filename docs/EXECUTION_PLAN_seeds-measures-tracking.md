# Execution Plan — Seeded Nutrition Library · Standardized Measures · Flexible Meal Logging

**Phases 13–16 · For a Claude (Sonnet) session to execute phase-by-phase**

- Repo: `/Users/subhashp/ai-playground/Claude/mealcraft` (Vite + React, local-first PWA)
- Current state: fully built through Phase 12, `SCHEMA_VERSION = 6` (`src/storage.js:9`)
- CLAUDE.md phase-gating applies to every phase below: restate the plan in ≤10 bullets, list files, WAIT for user approval; end each phase with a passing smoke script in `scripts/` plus a manual checklist; do not start the next phase until the user says the gate passed.
- Only allowed network calls: Open Food Facts, USDA FoodData Central, BYOK Anthropic/Google endpoints. No new dependencies are needed for any phase here.

## Corrections to CLAUDE.md §3 the executor must know (verified against source)

1. **Auto-attach on add already exists.** `src/screens/PantryScreen.jsx:101,133` call `nutritionOps.findSeedForName(name)` when adding a pantry item, and the v2→v3 migration (`src/storage.js:72`) backfilled seeds onto null-nutrition items. Phase 13 is therefore mostly a *data* expansion + one re-backfill migration, not a new mechanism.
2. **`NutritionInfo.state` no longer exists.** CLAUDE.md §3 still shows it, but the v5→v6 migration deleted `state` from all nutrition objects and `schema.js` has no `state` key. Do NOT reintroduce it — encode cooked-state in the entry name and `servingDesc` (see Phase 13 D3).
3. **`LogEntry.portions[].naturalUnitLabel` is vestigial.** `buildLogFromCard` always writes `'serving'`; `logMacros` uses only `count`. It is dropped in the v8 migration with no information loss.
4. **LogEntry consumers are fully contained** in `schema.js`, `trackOps.js`, `screens/TrackScreen.jsx`, `components/LogMealCard.jsx`. `promptCompiler.js` never reads logs. This bounds the Phase 15 blast radius.
5. **`nameMatches` (`componentOps.js:42-49`) is a bidirectional token-subset match** — "Coconut milk" matches "milk". This false-positive class worsens as the seed table grows; Phase 13 D1 mitigates it.
6. **File-size pressure points (~300-line rule):** `schema.js` is at 318 lines; `nutritionSeeds.js` roughly doubles; `LogMealCard.jsx` cannot absorb four meals. New files are named per phase.

---

## Phase 13 — Vegetarian protein/legume/vegetable seed library + nutrition-by-default (SCHEMA_VERSION 7)

**Goal:** A pantry item whose name matches the expanded commodity table gets nutrition attached automatically — at first seeding, at add-time (already wired), and via one backfill migration for existing installs. Coverage: common vegetarian proteins, eggs, dals/legumes (Indian-centric), common vegetables. No network; values baked into seed files.

### Files to touch

| File | Change |
|---|---|
| `src/nutritionSeeds.js` | Keep builder + `findSeedForName`; keep core entries; concatenate the new veg file: `export const NUTRITION_SEEDS = [...CORE_SEEDS, ...VEG_SEEDS]` |
| `src/nutritionSeedsVeg.js` | **NEW** — vegetables, fruits, condiment/spice "derivation unblockers" (data-only, same `seed()` shape; exports `VEG_SEEDS`). Keeps both files under ~300 lines |
| `src/seeds.js` | Add new starter pantry items (list below) |
| `src/storage.js` | `SCHEMA_VERSION = 7`; add v6→v7 migration |
| `src/screens/PantryScreen.jsx` | Non-blocking toast after auto-attach ("Nutrition auto-filled — tap to review"), review path opens the item's nutrition editor (reuse the existing inline-add → editor seam) |
| `scripts/smoke-phase13.mjs` | **NEW** — copy the MemoryStorage shim pattern from `smoke-phase5.mjs` |
| `CLAUDE.md` | §3 note: seed nutrition attaches by default, source `'seed_table'`; also remove the stale `state` field from the NutritionInfo block |

### Migration v6→v7 (no shape change — deterministic re-backfill only)

```js
if (state.schemaVersion === 6) {
  for (const item of Array.isArray(state.pantry) ? state.pantry : []) {
    if (item.nutrition == null) {
      const seeded = findSeedForName(item.name)
      if (seeded) item.nutrition = seeded
    }
  }
  state.schemaVersion = 7
}
```

- Never overwrites non-null nutrition (same guarantee as v2→v3).
- Does NOT insert new starter pantry items into existing installs — `seedPantryItems()` only feeds `defaultState()` for fresh installs. Don't stuff a curated pantry.

### Seed-table content spec (~74 entries total = 30 existing + ~44 new)

> **Data-sourcing instruction:** Do NOT invent macro numbers. Fill `perServing` values from USDA FoodData Central (Foundation/SR Legacy entries) — for Indian preparations without an FDC analog (roti, poha, besan), use IFCT 2017 values as published in secondary references. Round to 1 decimal like existing entries. Every entry must include at least one gram-anchored `naturalUnits` entry, and **every scoopable/pourable food must include a `'1 cup'` (or `'1 tbsp'` for oils/pastes) naturalUnit** — Phase 14's volume conversion depends on this. Dals, beans, rice, and grains use **cooked/as-prepared** values with `servingDesc` like `'1 cup cooked (198 g)'` (see D3).

**New — Legumes & vegetarian proteins (13):**

| Entry name | Aliases | Pantry category |
|---|---|---|
| cooked toor dal | toor dal, arhar dal, pigeon peas | Legumes |
| cooked urad dal | urad dal, black gram | Legumes |
| cooked chickpeas | chole, garbanzo, chickpeas (dry) | Legumes |
| cooked black-eyed peas | lobia, chawli, black eyed peas | Legumes |
| soy chunks (dry) | soya chunks, tvp, textured vegetable protein | Proteins |
| besan | gram flour, chickpea flour | Legumes |
| edamame | shelled edamame | Proteins |
| tempeh | — | Proteins |
| greek yogurt | greek curd, hung curd | Dairy |
| egg whites | egg white | Proteins |
| cottage cheese | curd cheese | Dairy |
| soy milk | unsweetened soy milk | Dairy |
| moong sprouts *(optional)* | sprouted moong, bean sprouts | Legumes |

**New — Grains/bases (5):** roti (aliases: chapati, phulka — per 1 medium, as prepared) · whole wheat bread (per slice) · whole wheat flour (atta — dry, per 1/4 cup) · poha (flattened rice — dry) · cooked millet (fills existing pantry-seed gap).

**New — Vegetables (14):** potato, sweet potato, carrot, cauliflower (gobi), broccoli, cabbage, bell pepper (capsicum), green beans, okra (bhindi), cucumber, eggplant (brinjal, baingan), mushrooms, fresh spinach (palak), bottle gourd (lauki, dudhi). Per-piece or per-cup naturalUnits like the existing `onion`/`tomato` entries.

**New — Fruits/nuts (3):** avocado, peanuts (existing pantry seed lacks nutrition — gap), sesame seeds.

**New — Confusable guards (3):** coconut milk (canned), almond milk (unsweetened), butter. These exist chiefly so `nameMatches` hits the *right* entry instead of subset-matching `milk`.

**New — Derivation unblockers (8, near-zero macros, tiny servings):** garlic (per clove), ginger (per tsp), green chili, cilantro (coriander leaves), one generic "dry ground spices" entry (aliases: turmeric, cumin, coriander powder, garam masala, chili powder, mustard seeds, black pepper, hing — per tsp), salt (0 macros), soy sauce (per tbsp), sugar (per tsp).
*Rationale:* `deriveComponentMacros` (`nutritionOps.js:59`) fails the *whole* component if *any* ingredient is unresolvable — "1 tsp turmeric" currently kills derivation. These fix the class, not the instance.

**New starter pantry items (`seeds.js`):** Moong dal, Urad dal, Rajma, Lobia (black-eyed peas), Soy chunks, Besan (Legumes); Potatoes, Carrots, Cauliflower, Capsicum, Green beans, Bhindi (Vegetables). Keep it modest — "don't overfill."

### Key design decisions

- **D1 — Ordering + alias hygiene for false positives:** `findSeedForName` returns the *first* match, so within the concatenated array, multi-token/specific entries (coconut milk, almond milk, soy milk, greek yogurt, cottage cheese) must precede the generics they'd subset-match (milk, yogurt, paneer). Edit two existing aliases: remove bare `'spinach'` from `frozen spinach` (give it to new `fresh spinach`); remove `'cottage cheese indian'` from `paneer` (it would swallow real cottage cheese). Add a code comment stating the ordering invariant.
- **D2 — Auto-attach stays non-destructive:** attach only when `nutrition == null`; provenance tag (`seed_table`) is already rendered in `PantryItemEditor.jsx`; the toast is informational, not a confirm (nothing is destroyed, and "Remove nutrition" already exists in `NutritionInfoEditor`).
- **D3 — No `NutritionInfo.state` revival:** v6 removed it as unused. Cooked-vs-dry is expressed as: entry name prefixed `cooked …`, `servingDesc` reading `'1 cup cooked (198 g)'`. Safe for the math: `servingGrams` reads the parenthetical grams; `measureToServings` goes through clean naturalUnits labels (`'1 cup'`), unaffected by the word "cooked" in servingDesc. **Documented risk:** a recipe ingredient "1 cup toor dal" *meaning dry* will be under-counted ~2.5×. Accepted as directional ("signals not scores"); mitigate with a one-line note in the seed-file header and in HelpSheet copy.

### Acceptance / manual verification

1. `node scripts/smoke-phase13.mjs` passes:
   - `findSeedForName('Toor dal')`, `('Bhindi')`, `('Soya chunks')`, `('Turmeric powder')` all return nutrition with `source:'seed_table'`
   - `findSeedForName('Coconut milk')` returns the coconut-milk entry, not dairy milk
   - v6 state with a null-nutrition "Toor dal" migrates to v7 with nutrition attached
   - v6 item with existing `manual` nutrition is untouched
   - every seed entry passes `validate(entry.build(), 'NutritionInfo')`
   - every non-piece seed has a volume naturalUnit (asserts Phase 14's precondition)
2. Manual: fresh profile shows new starter items with nutrition in the editor; quick-adding "Rajma" shows kcal immediately; existing dev profile migrates without console errors; a component using "1 tsp turmeric, 1 clove garlic, 1 cup toor dal" now derives macros.

**Gate:** user approves seed coverage list and migration behavior before Phase 14.

---

## Phase 14 — Standardized measures: qty + unit picker with volume→gram math (no schema bump)

**Goal:** Ingredient rows become `[number] [unit ▾]` with a custom free-text escape hatch; tsp/tbsp/cup/fl oz/ml resolve to grams for macro math wherever the food has any volume-anchored naturalUnit.

### Key design decision — measure stays a string (load-bearing)

`Component.ingredients[].measure` remains free text (schema unchanged, **no migration, no version bump this phase**). The new `MeasureInput` component is a *UI affordance* that composes/decomposes canonical strings (`"1.5 cup"`, `"200 g"`, `"2 piece"`) and falls back to a raw text input for anything it can't parse.
*Rationale:* (1) CLAUDE.md §5 keeps free-text measures first-class — a structured `{qty, unit, custom}` shape would demote free text and force rewriting every component; (2) all existing math (`parseMeasure`, `measureToServings`, `resolveIngredient`) already consumes strings — one representation, one parser, zero dual-path bugs; (3) Phase 15 reuses the same string + input for log-item amounts.

### Files to touch

| File | Change |
|---|---|
| `src/measures.js` | Add exported `VOLUME_ML = { tsp: 4.93, teaspoon: 4.93, tbsp: 14.79, tablespoon: 14.79, cup: 236.6, 'fl oz': 29.57, ml: 1, milliliter: 1, l: 1000, liter: 1000 }` and `mlFromMeasure(measure)` (sibling of `gramsFromMeasure`). Extend `measureToServings` with **path (d), volume bridging**: if the measure's unit is a volume unit AND any `naturalUnits` label parses to a volume unit (e.g. `'1 cup'` → 158 g anchor), convert both to ml and scale: `grams = anchorGrams × (measureMl / anchorMl)`. Add **path (0)**: unitTokens `['serving']` → return qty directly (Phases 15/16 depend on it). (~171→~230 lines) |
| `src/components/MeasureInput.jsx` | **NEW** (~90 lines). Props `{ value: string, onChange(string), placeholder }`. Qty text field (`inputMode="decimal"`, fractions via existing `parseQty`) + unit `<select>`: `g, kg, ml, tsp, tbsp, cup, fl oz, piece, serving, custom…`. On mount run `parseMeasure(value)`: qty + known unit → structured mode; else custom mode showing the raw string. Selecting `custom…` switches to a plain text input pre-filled with the current string. Emits canonical strings (`` `${qtyText} ${unit}` ``; `piece` emitted as bare unit word) |
| `src/components/IngredientListEditor.jsx` | Replace the measure `<input>` with `<MeasureInput>`; name input unchanged |
| `src/components/NaturalUnitsEditor.jsx` | Label placeholder nudges canonical volume labels (`e.g. "1 cup"`) |
| `scripts/smoke-phase14.mjs` | **NEW** |

**Not touched:** `schema.js`, `storage.js` (no version bump), tracking portion steppers (counts, not measures — they keep ±0.5).

### Back-compat contract (test these exact cases)

- `"handful"`, `"a splash"`, `"to taste"` → custom mode, string round-trips byte-identical, `measureToServings` still returns null (no fake precision)
- `"1/3 cup drained"` → parses qty 1/3, unit not in list → custom mode, string preserved
- `"2 tbsp"` against peanut-butter nutrition (has `'1 tbsp'` naturalUnit) → resolves via existing path (c), unchanged
- **New capability:** `"1 tbsp"` against cooked-rice nutrition (only `'1 cup'` = 158 g anchor) → path (d): `158 × (14.79 / 236.6) ≈ 9.9 g`
- `"100 ml"` against milk (`'1 cup'` = 244 g) → `244 × (100 / 236.6)`

### Acceptance / manual verification

1. `node scripts/smoke-phase14.mjs`: the five cases above + canonical round-trip for every dropdown unit + a regression sweep re-running Phase 4's `deriveComponentMacros` fixtures unchanged.
2. Manual: editing an existing component with free-text measures and saving without touching them changes nothing (verify via export diff); a new ingredient "0.5 cup" of toor dal contributes macros; derivation shows more `derived` badges and fewer unresolvable-measure failures.

**Gate:** user confirms the editor feels right on mobile and legacy components are untouched.

---

## Phase 15 — Multi-meal flexible logging (SCHEMA_VERSION 8): schema, log UI, gauges

**Goal:** Log breakfast/lunch/dinner/snack from four sources — week-plan assembly card (kept as one-tap), library components, pantry items with an amount, and (Phase 16) online search. Gauges aggregate the whole day.

### Schema changes (v7 → v8) — exact diffs

`schema.js`:

```js
export const MEALS = ['breakfast', 'lunch', 'dinner', 'snack']   // was ['lunch', 'other']
export const NUTRITION_SOURCES = ['barcode', 'label_photo', 'seed_table', 'ai_estimate', 'manual', 'online_search']
// online_search added NOW so Phase 16 needs no schema bump
export const LOG_ITEM_KINDS = ['component', 'pantry', 'adhoc']
```

LogEntry — before:

```
{ date, meal: 'lunch'|'other', componentIds: [string],
  portions: [{ componentId, naturalUnitLabel, count }], quickRating }
```

LogEntry — after (discriminated union on `kind`; `measure` is the same canonical/free string as ingredients):

```
{ date, meal: 'breakfast'|'lunch'|'dinner'|'snack',
  items: [
    { kind: 'component', componentId: string, count: number },   // count = servings, stepper ±0.5
    { kind: 'pantry',    pantryId: string,    measure: string }, // e.g. "1 cup", "150 g"
    { kind: 'adhoc',     name: string, measure: string,
      nutrition: NutritionInfo }                                 // snapshot; survives without pantry save
  ],
  quickRating: 'repeat'|'fine'|'never'|null }
```

`componentIds` and `portions` are **removed** (componentIds derivable; `naturalUnitLabel` vestigial). Validation needs a small `T.discriminated(key, variants)` helper. Since `schema.js` is at 318 lines, extract the `T` engine + `describe`/`isPlainObject` into **new `src/schemaTypes.js`** (pure move, ~90 lines out; scope strictly to the move).

Settings: shape unchanged, but `createSettings` default `proteinBand` becomes `{ low_g: 60, high_g: 90 }` (daily band, was per-lunch 20/35).

### Migration v7→v8 (`storage.js`)

```js
if (state.schemaVersion === 7) {
  const meals = { lunch: 'lunch', other: 'snack' }
  const merged = new Map()             // key `${date}|${meal}` — legacy 'other' entries appended, so
  for (const log of state.logs ?? []) {//   multiple same-date entries must merge into ONE snack entry
    const meal = meals[log.meal] ?? 'snack'
    const items = (log.portions ?? []).map((p) => ({ kind: 'component', componentId: p.componentId, count: p.count }))
    const key = `${log.date}|${meal}`
    if (merged.has(key)) merged.get(key).items.push(...items)
    else merged.set(key, { date: log.date, meal, items, quickRating: log.quickRating ?? null })
  }
  state.logs = [...merged.values()]
  const band = state.settings?.proteinBand
  if (band && band.low_g === 20 && band.high_g === 35) state.settings.proteinBand = { low_g: 60, high_g: 90 }
  state.schemaVersion = 8
}
```

- The proteinBand swap is safe **only because no Settings UI for it has ever shipped** — every install necessarily still has the factory default, so this rewrites no user-chosen value. State this in the migration comment.
- Update CLAUDE.md §3 LogEntry/Settings blocks in the same commit (schema is the contract).

### Files to touch

| File | Change |
|---|---|
| `src/schema.js` | Enums above; `createLogEntry` → `{date, meal:'lunch', items:[], quickRating:null}`; LogEntry shape spec with `T.discriminated`; import T from schemaTypes |
| `src/schemaTypes.js` | **NEW** — extracted `T` engine + new `discriminated` |
| `src/storage.js` | `SCHEMA_VERSION = 8`; migration above |
| `src/trackOps.js` | Rework (~260 lines): `buildLogFromCard(card, dateISO, meal='lunch')` emits component items; `upsertLog` identity = `(date, meal)` for all meals, replace-on-match (drop the append branch); new `mergeItems(log, newItems)`; `setItemCount(log, index, count)` replaces `setPortionCount`; `logMacros(log, components, pantry)` per-kind: component → `macrosPerServing × count` (missing if null); pantry → `measureToServings(measure, item.nutrition)` × perServing (missing if no nutrition/unresolvable); adhoc → same against snapshot; `dayMacros(logs, components, pantry, date)` sums all meals; `proteinByDay` uses dayMacros; `plateMix` over all meals — component items via existing `TYPE_BUCKET`, pantry items via new `CATEGORY_BUCKET = { Proteins:'protein', Legumes:'protein', Dairy:'protein', 'Grains & Bases':'carbs', Vegetables:'veg', Frozen:'veg' }` (weight: component count, or resolved servings, else 1), adhoc → 'other'; `estimateFraction` reads per-item source (component `macroSource`; pantry/adhoc `nutrition.source`; `barcode`/`label_photo`/`manual` count as measured); `lunchStreak`/`moneySaved` unchanged — deliberately still lunch-only (they measure the packed-lunch habit) |
| `src/components/DayLog.jsx` | **NEW** (~140 lines) — replaces `LogMealCard.jsx` (delete it). Day strip (kept from LogMealCard:43-57, dots per meal logged) + four MealSections |
| `src/components/MealSection.jsx` | **NEW** (~150 lines) — one meal: summary line (item names + kcal/protein subtotal), item rows (component → ±0.5 stepper; pantry/adhoc → `MeasureInput`), quickRating chips for all meals, remove-item ×, remove-log with confirm (§5), "＋ Add" opening AddLogItemSheet. Lunch section shows the one-tap **"Log lunch from plan"** button when `assemblyCardForDate` hits and no entry exists (current flow preserved verbatim) |
| `src/components/AddLogItemSheet.jsx` | **NEW** (~120 lines) — source chooser: *Today's plan* (assembly-card components, any meal) · *Library* (reuse `ComponentPickerSheet.jsx`) · *Pantry* (items with nutrition, search box, `MeasureInput` defaulting `"1 serving"`) · *Search online* (disabled placeholder until Phase 16) |
| `src/screens/TrackScreen.jsx` | Rewire handlers to the items API; recent-logs list renders item names across kinds (~150 lines) |
| `src/components/GaugesPanel.jsx` | Pass `pantry` through; protein chart title → "Protein by day (all meals)"; band renders from settings as today |
| `src/screens/SettingsScreen.jsx` + `src/components/TrackingSettings.jsx` | **NEW component** (SettingsScreen is at 284 lines — extract): protein band low/high number inputs + boughtLunchCost. Justified now because the band's meaning changed to daily; the user must be able to tune it |
| `scripts/smoke-phase15.mjs` | **NEW** |
| `CLAUDE.md` | §3 LogEntry + Settings + MEALS update |

### Acceptance / manual verification

1. Smoke: v7 fixture with a lunch + two same-date `other` logs migrates to one lunch + one merged snack, zero `portions`/`componentIds` keys; `validate` accepts all three item kinds and rejects unknown `kind`; `upsertLog` replaces by (date, meal); `logMacros` on pantry item `"1 cup"` cooked toor dal returns seed macros; unresolvable measure increments `missing`, not totals; band migration swaps 20/35→60/90 but preserves e.g. 25/40.
2. Manual: log breakfast from pantry ("2 piece" eggs), lunch one-tap from plan, dinner from library, snack ad-hoc → today's protein bar reflects the sum; partial-data hatching (`hasMissing`) still appears; remove-log requires confirm; a v6 export imports cleanly through the v7→v8 chain (`parseAndValidate` calls `migrate` — verify).

**Gate:** user approves the schema diff (CLAUDE.md §3 requires explicit approval) and the four-meal UI before Phase 16.

---

## Phase 16 — Online food search (Open Food Facts + USDA FDC) + wiring into logging

**Goal:** Text search from AddLogItemSheet against the two already-allowed endpoints; results loggable as one-off ad-hoc items or savable as pantry items. Degrades gracefully offline.

### Files to touch

| File | Change |
|---|---|
| `src/nutritionMappers.js` | **NEW** — pure move of `mapOffProduct`, `mapFdcFood`, `mapLabelReply`, `LABEL_PROMPT`, plus **new `mapFdcSearchFood(food)`**: non-branded FDC search results carry nutrients as `foodNutrients: [{nutrientId, value}]` per 100 g — ids `1008` kcal, `1003` protein, `1005` carbs, `1004` fat, `1079` fiber; emits `createNutritionInfo({ source:'online_search', servingDesc:'100 g', naturalUnits:[{label:'100 g', gramsOrFraction:100}] })`. Branded search hits keep going through `mapFdcFood` with source overridden to `'online_search'` |
| `src/nutritionLookup.js` | Re-export the moved mappers (keeps `scripts/smoke-phase4.5.mjs` and `NutritionInfoEditor` imports working); add `searchFoods(query, { fdcKey })` (~60 lines; file stays under 300 and remains the **only fetch-owning nutrition module** — preserve its header invariant): OFF `GET https://world.openfoodfacts.org/cgi/search.pl?search_terms={q}&search_simple=1&action=process&json=1&page_size=8&fields=code,product_name,brands,serving_size,nutriments` → map each hit by wrapping as `{code, product}` into `mapOffProduct`; FDC (only if `fdcKey`) `GET https://api.nal.usda.gov/fdc/v1/foods/search?api_key={key}&query={q}&dataType=Foundation,SR%20Legacy,Branded&pageSize=8`. Each fetch individually try/caught; return `{ ok: true, results: [{ name, brand, source: 'off'|'fdc', nutrition }] }` or `{ ok: false }` when both fail/none mapped. **Search fires only on explicit submit** — no per-keystroke fetches (OFF etiquette + CLAUDE.md §2 user-triggered spirit) |
| `src/components/FoodSearchSheet.jsx` | **NEW** (~150 lines) — search field + button, spinner, result rows (name, brand, kcal/serving, provenance tag), per-row actions **"Log it"** (returns `{kind:'adhoc', name, measure:'1 serving', nutrition}` — measures path (0) resolves `"1 serving"`; user adjusts via MeasureInput after) and **"Save to pantry"** (category select → `pantryOps.addItem` with the nutrition snapshot, then logs a pantry-kind item). Offline/failed state: *"Search needs a connection — add from the pantry or enter it manually."* with a "Manual entry" fallback opening `NutritionInfoEditor` to build an adhoc snapshot |
| `src/components/AddLogItemSheet.jsx` | Enable the Search tab; hint "add an FDC key in Settings for USDA results" when `fdcKey` is null (OFF works keyless) |
| `scripts/smoke-phase16.mjs` | **NEW** — inline-fixture tests: `mapFdcSearchFood` (Foundation + Branded shapes), OFF search-hit mapping, `searchFoods` offline degrade (shim `fetch` to throw → `{ok:false}`). No network in tests, matching the smoke convention |
| `HelpSheet.jsx` | One paragraph on logging sources + provenance meanings |

### Design decisions

- **Snapshot, don't reference:** adhoc items embed their `NutritionInfo` so a log never dangles if the user doesn't save to pantry; saving to pantry additionally makes the food resolve offline next time. Both endpoints are already on the CLAUDE.md §2 allowlist — no new network surface.
- **`online_search` provenance** (enum added in Phase 15) keeps the estimates-vs-measured gauge honest and visibly tags searched foods per §5.

### Acceptance / manual verification

1. `node scripts/smoke-phase16.mjs` passes.
2. Manual online: "amul paneer" returns OFF results keyless; with fdcKey, "lentils cooked" returns FDC Foundation rows with 100 g servings; "Log it" lands in the chosen meal and moves the protein bar; "Save to pantry" creates the item tagged `online_search`, and the same food next time resolves from the Pantry tab without network.
3. Manual offline (devtools offline): search shows the fallback message; the rest of the Track screen is fully functional (§5 zero-network rule).

**Gate:** user verifies both endpoints and offline behavior on-device.

---

## MyFitnessPal feature-proxy analysis

**What MFP does for tracking:** food diary segmented by meal; multi-source entry (huge crowdsourced database search, barcode scan, recents/frequents, saved meals/recipes, quick-add macros); per-entry serving-size adjustment; daily calorie/macro targets with remaining-budget math; weight logging and trends; micronutrient reports; streaks/social feed; premium recaps.

**What maps to MealCraft after these phases:**

| MFP feature | MealCraft equivalent |
|---|---|
| Meal-segmented diary | `MEALS` + DayLog (Phase 15) |
| Database text search | OFF/FDC `searchFoods`, bounded to the two allowed endpoints (Phase 16) |
| Barcode scan into diary | Already shipped (Phase 4.5); reachable via pantry-item logging |
| Saved meals/recipes | Library components + week-plan one-tap — the plan-first flow is *stronger* than MFP's here |
| Serving-size adjustment | MeasureInput + portion steppers (Phase 14/15) |
| Recents/frequents | The pantry itself plays this role |

**Deliberately excluded (user did not select — future options only):** daily calorie budget / "remaining" UI (conflicts with the app's "signals not scores" identity — the protein band is the chosen proxy); weight logging and trend charts; micronutrient tracking; social features, badges, and gamified streaks beyond the existing quiet lunch-streak line; weekly recap reports (the WeeklyFeedback UI was deliberately removed in Phase 11 — do not resurrect it); crowdsourced user-submitted foods (no backend, by design).

---

## Cross-phase risk register

| Risk | Where handled |
|---|---|
| `nameMatches` subset false positives on auto-attach (coconut milk → milk class) | Phase 13 D1: specificity ordering invariant, confusable-guard entries, alias edits, review toast; attach never overwrites |
| Free-text measure back-compat | Phase 14: string representation retained, custom mode round-trips byte-identical, smoke regression on Phase 4 fixtures |
| Dal/grain cooked-vs-dry ambiguity (no `state` field anymore) | Phase 13 D3: `cooked` in name + servingDesc, clean naturalUnits labels, documented directional under-count for dry-measured recipes |
| Legacy `other` logs colliding when mapped to `snack` | Phase 15 migration merges same `(date, meal)` entries |
| proteinBand semantics shift lunch→daily | Phase 15: exact-factory-default-only rewrite (provably safe — no UI ever existed) + new TrackingSettings UI |
| Import of old exports | `parseAndValidate` already runs `migrate` on lower versions — smoke-test a v6 export through the chain each phase |
| ~300-line file ceiling | Named splits: `nutritionSeedsVeg.js`, `schemaTypes.js`, `nutritionMappers.js`, DayLog/MealSection/AddLogItemSheet replacing LogMealCard, `TrackingSettings.jsx` |
| OFF search etiquette + FDC key absence | Phase 16: submit-only search, FDC skipped without key, per-endpoint try/catch, offline fallback message |

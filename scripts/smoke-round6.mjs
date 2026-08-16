// Zero-dependency Node smoke test for Round 6 ("MFP-style logging"):
// measures.js's serving-first SCALAR_UNIT_CANDIDATES reversal (defaultMeasureFor
// -> '1 serving', resolvableUnitsFor offers 'serving' first, "N servings"
// round-trips through qtyForUnit), and the pure parts of the ONLINE
// search-result group (addSheetOps.buildOnlineRows) and amount-step "stage"
// builders (stageForSeed/stageForPantrySave/stageForAdhoc). No DOM. Run with:
//   node scripts/smoke-round6.mjs

import assert from 'node:assert/strict'
import * as schema from '../src/schema.js'
import * as measures from '../src/measures.js'
import { buildOnlineRows, stageForSeed, stageForPantrySave, stageForAdhoc } from '../src/addSheetOps.js'

let passed = 0
async function check(label, fn) {
  await fn()
  passed++
  console.log(`ok - ${label}`)
}

try {
  // ==== measures.js: serving-first, fixed-order SCALAR_UNIT_CANDIDATES ====

  await check('resolvableUnitsFor: "serving" is always first, and only for items with any nutrition at all', () => {
    const gramOnly = schema.createNutritionInfo({
      source: 'seed_table',
      servingDesc: '30 g',
      perServing: { kcal: 120, protein_g: 3, carbs_g: 20, fat_g: 2 },
      naturalUnits: [{ label: '1 piece', gramsOrFraction: 30 }],
    })
    const { scalar } = measures.resolvableUnitsFor(gramOnly)
    assert.equal(scalar[0], 'serving', '"serving" must be offered, and first, for any item with nutrition')
    // A pure-gram item with a non-volume naturalUnits phrase only resolves
    // serving/g/piece — ml/cup/tbsp/tsp have no volume anchor to bridge
    // through, so the fixed candidate order collapses to exactly this.
    assert.deepEqual(scalar, ['serving', 'g', 'piece'])
  })

  await check('resolvableUnitsFor: relative candidate order (serving, g, ml, cup, tbsp, tsp, piece) is preserved when more units resolve', () => {
    const oatsLike = schema.createNutritionInfo({
      source: 'seed_table',
      servingDesc: '1/2 cup dry (45 g)',
      perServing: { kcal: 219, protein_g: 6, carbs_g: 27, fat_g: 3 },
      naturalUnits: [{ label: '1/2 cup dry', gramsOrFraction: 45 }],
    })
    const { scalar } = measures.resolvableUnitsFor(oatsLike)
    assert.deepEqual(scalar, ['serving', 'g', 'ml', 'cup', 'tbsp', 'tsp'], `got ${JSON.stringify(scalar)}`)
  })

  await check('resolvableUnitsFor: no nutrition at all -> empty (unchanged)', () => {
    assert.deepEqual(measures.resolvableUnitsFor(null), { scalar: [], phrases: [] })
  })

  await check('defaultMeasureFor: "1 serving" for any nutrition, "" for null (Round 6 reverses Round 4.5)', () => {
    const nutrition = schema.createNutritionInfo({ perServing: { kcal: 100, protein_g: 1, carbs_g: 1, fat_g: 1 } })
    assert.equal(measures.defaultMeasureFor(nutrition), '1 serving')
    assert.equal(measures.defaultMeasureFor(null), '')
  })

  await check('measureToServings: "2 servings" (plural) resolves via the same path 0 as "2 serving"', () => {
    const nutrition = schema.createNutritionInfo({ perServing: { kcal: 100, protein_g: 1, carbs_g: 1, fat_g: 1 } })
    assert.equal(measures.measureToServings('2 servings', nutrition), 2)
  })

  await check('matchScalarUnit: "2 servings" matches the offered "serving" scalar unit directly (no more legacy re-expression)', () => {
    const hit = measures.matchScalarUnit('2 servings', ['serving', 'g'])
    assert.deepEqual(hit, { unit: 'serving', qty: 2 })
  })

  await check('qtyForUnit: round-trips serving <-> g for an 85 g/serving item', () => {
    const nutrition = schema.createNutritionInfo({
      source: 'barcode',
      servingDesc: '85 g',
      perServing: { kcal: 100, protein_g: 5, carbs_g: 10, fat_g: 2 },
    })
    const gramsForOneServing = measures.qtyForUnit(1, 'g', nutrition)
    assert.equal(gramsForOneServing, 85, '"1 serving" of an 85 g/serving item is "85 g"')
    const servingsFor85g = measures.measureToServings('85 g', nutrition)
    assert.equal(measures.qtyForUnit(servingsFor85g, 'serving', nutrition), 1, '"85 g" switched back to serving is "1 serving"')
  })

  // ==== addSheetOps.js: ONLINE group row building (pure) ====

  await check('buildOnlineRows: id is the array index, sublabel joins brand + source tag + servingDesc, kcal is per-serving', () => {
    const results = [
      {
        name: 'Rolled Oats',
        brand: "Trader Joe's",
        source: 'off',
        nutrition: { perServing: { kcal: 150 }, servingDesc: '1/2 cup' },
      },
      {
        name: 'Biryani with chicken',
        brand: null,
        source: 'fdc',
        generic: true,
        nutrition: { perServing: { kcal: 320 }, servingDesc: '1 cup' },
      },
      {
        name: 'Peanut Butter',
        brand: 'Jif',
        source: 'fdc',
        generic: false,
        nutrition: { perServing: { kcal: 190 }, servingDesc: '2 tbsp (32 g)' },
      },
    ]
    const rows = buildOnlineRows(results)
    assert.deepEqual(rows[0], { id: 0, label: 'Rolled Oats', sublabel: "Trader Joe's · Open Food Facts · 1/2 cup", kcal: 150 })
    assert.deepEqual(rows[1], { id: 1, label: 'Biryani with chicken', sublabel: 'USDA generic · 1 cup', kcal: 320 }, 'no brand -> not included in sublabel')
    assert.deepEqual(rows[2], { id: 2, label: 'Peanut Butter', sublabel: 'Jif · USDA · 2 tbsp (32 g)', kcal: 190 })
  })

  await check('buildOnlineRows: empty/undefined results -> empty array (no ONLINE group to render)', () => {
    assert.deepEqual(buildOnlineRows([]), [])
    assert.deepEqual(buildOnlineRows(undefined), [])
  })

  // ==== addSheetOps.js: amount-step "stage" builders (pure, no writes — hot-fix #1) ====

  await check('stageForSeed: builds a "create" plan and defaults the amount to "1 serving"', () => {
    const nutrition = schema.createNutritionInfo({ perServing: { kcal: 31, protein_g: 3, carbs_g: 6, fat_g: 0 } })
    const seedCandidates = [{ name: 'Broccoli', aliases: [], build: () => nutrition }]
    const stage = stageForSeed('Broccoli', seedCandidates, ['Spices', 'Vegetables'])
    assert.equal(stage.type, 'pantry')
    assert.equal(stage.initialMeasure, '1 serving')
    assert.deepEqual(stage.plan, { planKind: 'create', name: 'Broccoli', category: 'Vegetables', nutrition })
  })

  await check('stageForSeed: unknown name -> null (no stage, nothing to set)', () => {
    assert.equal(stageForSeed('Nope', [], []), null)
  })

  await check('stageForPantrySave: no existing match -> "create" plan; an existing exact-name match -> "existing"/"attach" (planPantrySave passthrough)', () => {
    const nutrition = schema.createNutritionInfo({ perServing: { kcal: 100, protein_g: 1, carbs_g: 1, fat_g: 1 } })
    const created = stageForPantrySave('Zzyzzx Snack', nutrition, [], ['Spices'], [])
    assert.equal(created.plan.planKind, 'create')
    assert.equal(created.initialMeasure, '1 serving', 'a brand-new item can never be in recents, so it always starts at the default')

    const existingItem = schema.createPantryItem({ name: 'Rice', nutrition })
    const existing = stageForPantrySave('Rice', nutrition, [existingItem], ['Spices'], [])
    assert.equal(existing.plan.planKind, 'existing')
    assert.equal(existing.plan.pantryId, existingItem.id)
  })

  await check('stageForAdhoc: type "adhoc", no pantry plan, defaults to "1 serving" when not in recents', () => {
    const nutrition = schema.createNutritionInfo({ perServing: { kcal: 90, protein_g: 2, carbs_g: 10, fat_g: 3 } })
    const stage = stageForAdhoc({ name: 'Mystery Bar', nutrition }, [])
    assert.equal(stage.type, 'adhoc')
    assert.equal(stage.name, 'Mystery Bar')
    assert.equal(stage.initialMeasure, '1 serving')
    assert.equal(stage.plan, undefined, 'adhoc stages never carry a pantry plan')
  })

  console.log(`\n${passed} checks passed.`)
} catch (err) {
  console.error(`\nFAILED after ${passed} checks:`)
  console.error(err)
  process.exit(1)
}

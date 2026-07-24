// Zero-dependency Node smoke test for Phase 4.5 (Nutrition Capture
// Waterfall). Shims localStorage, then exercises measures.js, nutritionSeeds.js,
// nutritionOps.js, the v2->v3 migration, and the OFF/FDC mappers with inline
// fixtures — no network. Run with:
//   node scripts/smoke-phase4.5.mjs

import assert from 'node:assert/strict'
import * as schema from '../src/schema.js'
import * as storage from '../src/storage.js'
import * as measures from '../src/measures.js'
import * as nutritionSeeds from '../src/nutritionSeeds.js'
import * as nutritionOps from '../src/nutritionOps.js'
import * as nutritionLookup from '../src/nutritionLookup.js'

class MemoryStorage {
  constructor() {
    this.store = new Map()
  }
  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null
  }
  setItem(key, value) {
    this.store.set(key, String(value))
  }
  removeItem(key) {
    this.store.delete(key)
  }
  clear() {
    this.store.clear()
  }
}

globalThis.localStorage = new MemoryStorage()

let passed = 0
async function check(label, fn) {
  await fn()
  passed++
  console.log(`ok - ${label}`)
}

function chickpeaNutrition() {
  return nutritionSeeds.findSeedForName('canned chickpeas')
}

function tofuNutrition() {
  return nutritionSeeds.findSeedForName('tofu')
}

try {
  // ==== measures.js: parseQty ====

  await check('parseQty: integer, decimal, ascii fraction, mixed number', () => {
    assert.equal(measures.parseQty('2'), 2)
    assert.equal(measures.parseQty('0.5'), 0.5)
    assert.equal(measures.parseQty('1/3'), 1 / 3)
    assert.equal(measures.parseQty('1 1/2'), 1.5)
  })

  await check('parseQty: unicode fractions, bare and with a leading whole number', () => {
    assert.equal(measures.parseQty('½'), 0.5)
    assert.equal(measures.parseQty('1½'), 1.5)
    assert.equal(measures.parseQty('⅓'), 1 / 3)
  })

  await check('parseQty: unparseable text is null', () => {
    assert.equal(measures.parseQty('a bunch'), null)
    assert.equal(measures.parseQty(''), null)
  })

  // ==== measures.js: parseMeasure / gramsFromMeasure ====

  await check('parseMeasure splits qty from unit tokens', () => {
    assert.deepEqual(measures.parseMeasure('2/3 cup drained'), { qty: 2 / 3, unitTokens: ['cup', 'drained'] })
    assert.deepEqual(measures.parseMeasure('1 block'), { qty: 1, unitTokens: ['block'] })
  })

  await check('gramsFromMeasure handles g/kg/oz/lb only', () => {
    assert.equal(measures.gramsFromMeasure('200 g'), 200)
    assert.equal(measures.gramsFromMeasure('1.5 kg'), 1500)
    assert.equal(measures.gramsFromMeasure('2 oz'), 2 * 28.3495)
    assert.equal(measures.gramsFromMeasure('1 lb'), 453.592)
    assert.equal(measures.gramsFromMeasure('1 cup'), null)
  })

  await check('measureToServings: "handful" gives up, never guesses', () => {
    assert.equal(measures.measureToServings('a handful', chickpeaNutrition()), null)
  })

  // ==== measures.js: measureToServings resolution paths ====

  await check('measureToServings: direct servingDesc token-ratio, no grams needed', () => {
    const nutrition = chickpeaNutrition()
    assert.equal(measures.measureToServings('2/3 cup drained', nutrition), 2)
    assert.equal(measures.measureToServings('1/3 cup drained', nutrition), 1)
  })

  await check('measureToServings: naturalUnits path (tofu block)', () => {
    const nutrition = tofuNutrition()
    assert.equal(measures.measureToServings('1 block', nutrition), 1)
    assert.equal(measures.measureToServings('half block', nutrition), 0.5)
  })

  await check('measureToServings: parenthetical grams in servingDesc via direct-gram measure', () => {
    const nutrition = tofuNutrition()
    assert.equal(measures.measureToServings('198 g', nutrition), 0.5)
  })

  await check('Round 3.5: "2 tbsp" of chickpeas now resolves via the descriptor-tolerant volume family (its "1/3 cup drained" naturalUnit anchors tbsp too, same volume-bridging path as cup/tsp/ml)', () => {
    // Pre-Round-3.5 this was null — mlFromMeasure needed an exact "cup"
    // match, so the descriptor word "drained" on chickpeas' own naturalUnits
    // label broke the anchor lookup entirely (the root cause behind the
    // reported "serving, g, kg, 1/2 cup dry" picker bug). A genuinely
    // unmatched (non-volume) unit still gives null — see 'a handful' above.
    const nutrition = chickpeaNutrition()
    const servings = measures.measureToServings('2 tbsp', nutrition)
    assert.ok(servings != null && Math.abs(servings - 0.375063398) < 1e-6, `got ${servings}`)
  })

  // ==== nutritionSeeds.js ====

  await check('findSeedForName matches name and aliases, case/word-order tolerant', () => {
    assert.ok(nutritionSeeds.findSeedForName('canned chickpeas'))
    assert.ok(nutritionSeeds.findSeedForName('Chickpeas (canned)'))
    assert.ok(nutritionSeeds.findSeedForName('chickpea'))
  })

  await check('findSeedForName does not match unrelated names', () => {
    assert.equal(nutritionSeeds.findSeedForName('chicken'), null)
  })

  await check('findSeedForName returns a fresh copy each call (no shared reference)', () => {
    const a = nutritionSeeds.findSeedForName('rice')
    const b = nutritionSeeds.findSeedForName('rice')
    assert.notEqual(a, b)
    assert.deepEqual(a, b)
  })

  // ==== nutritionOps.js: resolveIngredient / deriveComponentMacros ====

  function pantryWithChickpeasRiceOnion() {
    return [
      schema.createPantryItem({ name: 'Canned chickpeas', nutrition: chickpeaNutrition() }),
      schema.createPantryItem({ name: 'Rice', nutrition: nutritionSeeds.findSeedForName('rice') }),
      schema.createPantryItem({ name: 'Onion', nutrition: nutritionSeeds.findSeedForName('onion') }),
    ]
  }

  await check('deriveComponentMacros: hand-checked 3-ingredient batch', () => {
    const pantry = pantryWithChickpeasRiceOnion()
    const component = schema.createComponent({
      servings: 2,
      macroSource: 'derived',
      ingredients: [
        { name: 'chickpeas', measure: '2/3 cup drained' },
        { name: 'rice', measure: '2 cup' },
        { name: 'onion', measure: '1 medium' },
      ],
    })
    const result = nutritionOps.deriveComponentMacros(component, pantry)
    assert.equal(result.ok, true, `unexpected: ${JSON.stringify(result)}`)
    // chickpeas: 2 servings * {70,4,11,1}; rice: 2 * {205,4.3,45,0.4}; onion: 1 * {44,1.2,10,0.1}
    // totals: kcal 140+410+44=594, protein 8+8.6+1.2=17.8, carbs 22+90+10=122, fat 2+0.8+0.1=2.9
    // per serving (÷2): kcal 297, protein 8.9, carbs 61, fat 1.45 -> round1 => 1.5
    assert.deepEqual(result.macrosPerServing, { kcal: 297, protein_g: 8.9, carbs_g: 61, fat_g: 1.5 })
  })

  await check('deriveComponentMacros: unresolvable measure names the ingredient, ok:false', () => {
    const pantry = pantryWithChickpeasRiceOnion()
    const component = schema.createComponent({
      servings: 2,
      ingredients: [
        { name: 'chickpeas', measure: '2/3 cup drained' },
        { name: 'rice', measure: 'a handful' },
      ],
    })
    const result = nutritionOps.deriveComponentMacros(component, pantry)
    assert.equal(result.ok, false)
    assert.deepEqual(result.unresolved, [{ name: 'rice', reason: 'unresolvable measure' }])
  })

  await check('deriveComponentMacros: servings not set is ok:false', () => {
    const pantry = pantryWithChickpeasRiceOnion()
    const component = schema.createComponent({
      servings: null,
      ingredients: [{ name: 'chickpeas', measure: '2/3 cup drained' }],
    })
    const result = nutritionOps.deriveComponentMacros(component, pantry)
    assert.equal(result.ok, false)
  })

  await check('resyncDerivedMacros: reverts to null gracefully when an ingredient loses nutrition, and restores', () => {
    let pantry = pantryWithChickpeasRiceOnion()
    const component = schema.createComponent({
      servings: 2,
      macroSource: 'derived',
      ingredients: [
        { name: 'chickpeas', measure: '2/3 cup drained' },
        { name: 'rice', measure: '2 cup' },
        { name: 'onion', measure: '1 medium' },
      ],
    })
    let { changed, components } = nutritionOps.resyncDerivedMacros([component], pantry)
    assert.equal(changed, true)
    assert.ok(components[0].macrosPerServing)
    assert.deepEqual(schema.validate(components[0], 'Component'), [])

    // Remove onion's nutrition -> revert to null, source stays 'derived'.
    pantry = pantry.map((p) => (p.name === 'Onion' ? { ...p, nutrition: null } : p))
    ;({ changed, components } = nutritionOps.resyncDerivedMacros(components, pantry))
    assert.equal(changed, true)
    assert.equal(components[0].macrosPerServing, null)
    assert.equal(components[0].macroSource, 'derived')
    assert.deepEqual(schema.validate(components[0], 'Component'), [])

    // Re-add onion's nutrition -> derivation returns.
    pantry = pantry.map((p) => (p.name === 'Onion' ? { ...p, nutrition: nutritionSeeds.findSeedForName('onion') } : p))
    ;({ changed, components } = nutritionOps.resyncDerivedMacros(components, pantry))
    assert.equal(changed, true)
    assert.ok(components[0].macrosPerServing)
  })

  await check('findCachedBarcode: cache is the pantry itself, hit and miss', () => {
    const nutrition = { ...chickpeaNutrition(), barcode: '012345678905' }
    const pantry = [schema.createPantryItem({ name: 'Canned chickpeas', nutrition })]
    assert.deepEqual(nutritionOps.findCachedBarcode(pantry, '012345678905'), nutrition)
    assert.equal(nutritionOps.findCachedBarcode(pantry, '999999999999'), null)
  })

  // ==== schema v3 / migration ====

  await check('schema v3 factories default fdcKey/servings/barcode to null-ish and validate', () => {
    const settings = schema.createSettings()
    assert.equal(settings.fdcKey, null)
    assert.deepEqual(schema.validate(settings, 'Settings'), [])

    const component = schema.createComponent()
    assert.equal(component.servings, null)
    assert.deepEqual(schema.validate(component, 'Component'), [])

    const nutrition = schema.createNutritionInfo({ barcode: '012345678905' })
    assert.deepEqual(schema.validate(nutrition, 'NutritionInfo'), [])
    assert.deepEqual(schema.validate(schema.createNutritionInfo(), 'NutritionInfo'), [], 'barcode is optional')
  })

  await check('migration v2->v3: adds fields, backfills seed nutrition, never overwrites existing', async () => {
    await storage.resetState()
    const v2State = {
      schemaVersion: 2,
      categories: ['Produce'],
      pantry: [
        { id: 'p1', name: 'Canned chickpeas', category: 'Produce', role: 'rotating', onHand: true, roughQty: null, nutrition: null },
        {
          id: 'p2',
          name: 'Chicken breast',
          category: 'Produce',
          role: 'rotating',
          onHand: true,
          roughQty: null,
          nutrition: schema.createNutritionInfo({ source: 'manual', perServing: { kcal: 165, protein_g: 31, carbs_g: 0, fat_g: 3.6 } }),
        },
      ],
      components: [schema.createComponent({ id: 'c1' })],
      weeks: [],
      logs: [],
      feedback: [],
      settings: { proteinBand: { low_g: 20, high_g: 35 }, boughtLunchCost: 12, apiMode: 'paste', provider: 'anthropic', apiKey: null },
    }
    const result = await storage.importState(JSON.stringify(v2State))
    assert.equal(result.ok, true, `unexpected errors: ${JSON.stringify(result.errors)}`)

    const pantry = await storage.get('pantry')
    const chickpeas = pantry.find((p) => p.id === 'p1')
    assert.equal(chickpeas.nutrition && chickpeas.nutrition.source, 'seed_table', 'null nutrition must be backfilled from the seed table')
    const chicken = pantry.find((p) => p.id === 'p2')
    assert.equal(chicken.nutrition.source, 'manual', 'existing nutrition must never be overwritten')

    const settings = await storage.get('settings')
    assert.equal(settings.fdcKey, null)
    const components = await storage.get('components')
    assert.equal(components[0].servings, null)
  })

  await check('migration chains v1->v3 in one import', async () => {
    await storage.resetState()
    const v1State = {
      schemaVersion: 1,
      pantry: [{ id: 'p1', name: 'Rice', category: 'Grains', role: 'rotating', onHand: true, roughQty: null, nutrition: null }],
      components: [],
      weeks: [],
      logs: [],
      feedback: [],
      settings: { proteinBand: { low_g: 20, high_g: 35 }, boughtLunchCost: 12, apiMode: 'paste', provider: 'anthropic', apiKey: null },
    }
    const result = await storage.importState(JSON.stringify(v1State))
    assert.equal(result.ok, true, `unexpected errors: ${JSON.stringify(result.errors)}`)
    assert.ok((await storage.get('categories')).includes('Grains'))
    assert.equal((await storage.get('settings')).fdcKey, null)
    const rice = (await storage.get('pantry'))[0]
    assert.equal(rice.nutrition.source, 'seed_table')
  })

  await check('v3 state round-trips export -> wipe -> import unchanged', async () => {
    await storage.resetState()
    const exported = await storage.exportState()
    await storage.resetState()
    const result = await storage.importState(exported)
    assert.equal(result.ok, true, `unexpected errors: ${JSON.stringify(result.errors)}`)
    const state = await storage.getFullState()
    assert.equal(state.schemaVersion, 9)
  })

  // ==== nutritionLookup.js: pure mappers ====

  await check('mapOffProduct: prefers per-serving nutriments, sets barcode + source', () => {
    const off = {
      code: '012345678905',
      product: {
        serving_size: '1 cup (245 g)',
        nutriments: {
          'energy-kcal_serving': 149,
          proteins_serving: 8.5,
          carbohydrates_serving: 11,
          fat_serving: 8,
        },
      },
    }
    const mapped = nutritionLookup.mapOffProduct(off)
    assert.ok(mapped)
    assert.equal(mapped.source, 'barcode')
    assert.equal(mapped.barcode, '012345678905')
    assert.deepEqual(mapped.perServing, { kcal: 149, protein_g: 8.5, carbs_g: 11, fat_g: 8 })
  })

  await check('mapOffProduct: falls back to per-100g when serving values are absent', () => {
    const off = {
      code: '111',
      product: {
        nutriments: {
          'energy-kcal_100g': 200,
          proteins_100g: 10,
          carbohydrates_100g: 20,
          fat_100g: 5,
        },
      },
    }
    const mapped = nutritionLookup.mapOffProduct(off)
    assert.ok(mapped)
    assert.equal(mapped.servingDesc, '100 g')
    assert.deepEqual(mapped.perServing, { kcal: 200, protein_g: 10, carbs_g: 20, fat_g: 5 })
  })

  await check('mapOffProduct: missing kcal/protein falls through to null', () => {
    const off = { code: '111', product: { nutriments: {} } }
    assert.equal(nutritionLookup.mapOffProduct(off), null)
  })

  await check('mapFdcFood: reads labelNutrients', () => {
    const fdc = {
      gtinUpc: '012345678905',
      servingSize: 30,
      servingSizeUnit: 'g',
      labelNutrients: {
        calories: { value: 120 },
        protein: { value: 3 },
        carbohydrates: { value: 22 },
        fat: { value: 2 },
      },
    }
    const mapped = nutritionLookup.mapFdcFood(fdc)
    assert.ok(mapped)
    assert.equal(mapped.source, 'barcode')
    assert.equal(mapped.barcode, '012345678905')
    assert.deepEqual(mapped.perServing, { kcal: 120, protein_g: 3, carbs_g: 22, fat_g: 2 })
  })

  console.log(`\n${passed} checks passed.`)
} catch (err) {
  console.error(`\nFAILED after ${passed} checks:`)
  console.error(err)
  process.exit(1)
}

// Zero-dependency Node smoke test for Phase 13 (seeded nutrition library
// expansion + v6->v7 re-backfill migration). Shims localStorage, same
// pattern as scripts/smoke-phase5.mjs. Run with:
//   node scripts/smoke-phase13.mjs

import assert from 'node:assert/strict'
import * as schema from '../src/schema.js'
import * as storage from '../src/storage.js'
import { parseMeasure } from '../src/measures.js'
import { NUTRITION_SEEDS, findSeedForName } from '../src/nutritionSeeds.js'

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

// Entries whose naturalUnits are legitimately piece/weight-style (not
// scoopable/pourable) — exempt from the "every non-piece seed has a volume
// naturalUnit" check below.
const VOLUME_EXEMPT = new Set([
  'egg',
  'paneer',
  'tofu',
  'onion',
  'tomato',
  'lemon',
  'cheddar cheese',
  'banana',
  'roti',
  'whole wheat bread',
  'potato',
  'sweet potato',
  'carrot',
  'bell pepper',
  'avocado',
  'tempeh',
  'egg whites',
  'garlic',
  'green chili',
])

const VOLUME_UNIT_TOKENS = new Set(['cup', 'tbsp', 'tablespoon', 'tsp', 'teaspoon', 'ml', 'milliliter', 'l', 'liter'])

function hasVolumeNaturalUnit(entry) {
  const nutrition = entry.build()
  return nutrition.naturalUnits.some((u) => {
    const { unitTokens } = parseMeasure(u.label)
    return unitTokens.some((t) => VOLUME_UNIT_TOKENS.has(t))
  })
}

try {
  // ==== New seed lookups resolve correctly ====

  await check('findSeedForName resolves the new legume/vegetable/spice entries', () => {
    for (const name of ['Toor dal', 'Bhindi', 'Soya chunks', 'Turmeric powder']) {
      const nutrition = findSeedForName(name)
      assert.ok(nutrition, `expected a seed match for "${name}"`)
      assert.equal(nutrition.source, 'seed_table')
    }
  })

  await check('findSeedForName("Coconut milk") resolves the coconut-milk entry, not dairy milk', () => {
    const nutrition = findSeedForName('Coconut milk')
    assert.ok(nutrition)
    assert.equal(nutrition.servingDesc, '1/4 cup canned (60 g)')
    assert.notEqual(nutrition.servingDesc, '1 cup (244 g)', 'must not resolve to the dairy milk entry')
  })

  await check('findSeedForName("Greek yogurt") resolves greek yogurt, not plain yogurt', () => {
    const nutrition = findSeedForName('Greek yogurt')
    assert.ok(nutrition)
    assert.equal(nutrition.servingDesc, '1 cup (245 g)')
    assert.equal(nutrition.perServing.protein_g, 25)
  })

  await check('findSeedForName("Cottage cheese") resolves cottage cheese, not paneer', () => {
    const nutrition = findSeedForName('Cottage cheese')
    assert.ok(nutrition)
    assert.equal(nutrition.servingDesc, '1/2 cup (113 g)')
  })

  await check('findSeedForName("Peanuts") resolves the peanuts entry, not peanut butter', () => {
    const nutrition = findSeedForName('Peanuts')
    assert.ok(nutrition)
    assert.equal(nutrition.servingDesc, '1/4 cup (36 g)')
    assert.notEqual(nutrition.perServing.fat_g, 16, 'must not resolve to peanut butter (16 g fat/2 tbsp)')
  })

  await check('findSeedForName("Fresh spinach") vs ("Frozen spinach") resolve to distinct entries', () => {
    const fresh = findSeedForName('Fresh spinach')
    const frozen = findSeedForName('Frozen spinach')
    assert.ok(fresh && frozen)
    assert.notEqual(fresh.servingDesc, frozen.servingDesc)
  })

  // ==== Every seed entry is well-formed ====

  await check('every seed entry builds a valid NutritionInfo', () => {
    for (const entry of NUTRITION_SEEDS) {
      const errors = schema.validate(entry.build(), 'NutritionInfo')
      assert.deepEqual(errors, [], `"${entry.name}": ${JSON.stringify(errors)}`)
    }
  })

  await check('every non-piece seed has a volume-anchored naturalUnit (Phase 14 precondition)', () => {
    const failures = NUTRITION_SEEDS.filter((e) => !VOLUME_EXEMPT.has(e.name) && !hasVolumeNaturalUnit(e)).map((e) => e.name)
    assert.deepEqual(failures, [], `missing a volume naturalUnit: ${failures.join(', ')}`)
  })

  await check(`seed table has grown to ${NUTRITION_SEEDS.length} entries (>= 70 expected)`, () => {
    assert.ok(NUTRITION_SEEDS.length >= 70, `only ${NUTRITION_SEEDS.length} entries`)
  })

  // ==== v6 -> v7 migration ====

  await check('v6 export migrates to v7: null-nutrition item backfilled, manual nutrition untouched', async () => {
    await storage.resetState()
    const manualNutrition = schema.createNutritionInfo({
      source: 'manual',
      servingDesc: 'hand-entered',
      perServing: { kcal: 1, protein_g: 1, carbs_g: 1, fat_g: 1 },
    })
    const v6State = {
      schemaVersion: 6,
      categories: ['Legumes', 'Nuts Seeds & Finishers'],
      pantry: [
        schema.createPantryItem({ id: 'p1', name: 'Toor dal', category: 'Legumes', onHand: true, nutrition: null }),
        schema.createPantryItem({ id: 'p2', name: 'Almonds', category: 'Nuts Seeds & Finishers', onHand: true, nutrition: manualNutrition }),
      ],
      components: [],
      weeks: [],
      logs: [],
      feedback: [],
      settings: schema.createSettings(),
    }
    const result = await storage.importState(JSON.stringify(v6State))
    assert.equal(result.ok, true, `unexpected errors: ${JSON.stringify(result.errors)}`)

    const pantry = await storage.get('pantry')
    const toorDal = pantry.find((p) => p.id === 'p1')
    const almonds = pantry.find((p) => p.id === 'p2')
    assert.ok(toorDal.nutrition, 'toor dal must be backfilled')
    assert.equal(toorDal.nutrition.source, 'seed_table')
    assert.deepEqual(almonds.nutrition, manualNutrition, 'existing manual nutrition must be untouched')
  })

  console.log(`\n${passed} checks passed.`)
} catch (err) {
  console.error(`\nFAILED after ${passed} checks:`)
  console.error(err)
  process.exit(1)
}

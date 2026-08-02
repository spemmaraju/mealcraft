// Zero-dependency Node smoke test for Round B ("volume-anchor curation"):
// volumeAnchors.js's curated cup-weight table + matcher, nutritionOps.js's
// enrichWithVolumeAnchor choke point, and storage.js's v11->v12 migration
// that retroactively anchors existing pantry/adhoc nutrition. Run with:
//   node scripts/smoke-volumeB.mjs

import assert from 'node:assert/strict'
import * as schema from '../src/schema.js'
import * as storage from '../src/storage.js'
import { SCHEMA_VERSION, migrate } from '../src/storage.js'
import * as measures from '../src/measures.js'
import * as nutritionOps from '../src/nutritionOps.js'
import { volumeAnchorFor } from '../src/volumeAnchors.js'

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

function closeTo(actual, expected, tolerance = 1e-6, msg) {
  assert.ok(Math.abs(actual - expected) < tolerance, msg || `expected ${actual} to be close to ${expected}`)
}

try {
  // ==== volumeAnchors.js: volumeAnchorFor matching ====

  await check('volumeAnchorFor: "Kirkland Signature Egg Whites" matches egg-white anchor (243), token-subset', () => {
    assert.deepEqual(volumeAnchorFor('Kirkland Signature Egg Whites'), { label: '1 cup', gramsOrFraction: 243 })
  })

  await check('volumeAnchorFor: "egg whites" exact match -> 243', () => {
    assert.deepEqual(volumeAnchorFor('egg whites'), { label: '1 cup', gramsOrFraction: 243 })
  })

  await check('volumeAnchorFor: "coconut milk" -> 226, NOT the generic milk value 244', () => {
    assert.equal(volumeAnchorFor('coconut milk').gramsOrFraction, 226)
  })

  await check('volumeAnchorFor: "milk" -> 244, and can never match the more specific "coconut milk" entry', () => {
    assert.equal(volumeAnchorFor('milk').gramsOrFraction, 244)
  })

  await check('volumeAnchorFor: "peanut butter" -> 258, NOT plain butter\'s 227', () => {
    assert.equal(volumeAnchorFor('peanut butter').gramsOrFraction, 258)
  })

  await check('volumeAnchorFor: "powdered sugar" -> 120, NOT granulated sugar\'s 200', () => {
    assert.equal(volumeAnchorFor('powdered sugar').gramsOrFraction, 120)
  })

  await check('volumeAnchorFor: bare "rice" -> null (deliberately ambiguous, omitted)', () => {
    assert.equal(volumeAnchorFor('rice'), null)
  })

  await check('volumeAnchorFor: "granola bar" -> null (no covering entry at all)', () => {
    assert.equal(volumeAnchorFor('granola bar'), null)
  })

  await check('volumeAnchorFor: "oat milk" -> its own entry (240), NOT rolled oats\' 81', () => {
    assert.equal(volumeAnchorFor('oat milk').gramsOrFraction, 240)
  })

  // ==== nutritionOps.js: enrichWithVolumeAnchor ====

  await check('enrichWithVolumeAnchor: appends a "1 cup" anchor for gram-only "46 g" egg whites', () => {
    const nutrition = schema.createNutritionInfo({
      source: 'barcode',
      servingDesc: '46 g',
      perServing: { kcal: 25, protein_g: 5, carbs_g: 0, fat_g: 0 },
    })
    const enriched = nutritionOps.enrichWithVolumeAnchor('egg whites', nutrition)
    assert.notEqual(enriched, nutrition, 'a real anchor must produce a new object')
    assert.deepEqual(enriched.naturalUnits, [{ label: '1 cup', gramsOrFraction: 243 }])
    assert.equal(enriched.perServing, nutrition.perServing)
    assert.equal(enriched.servingDesc, nutrition.servingDesc)
    assert.equal(enriched.source, nutrition.source)
  })

  await check('enrichWithVolumeAnchor: idempotent — a second call does not duplicate the anchor', () => {
    const nutrition = schema.createNutritionInfo({
      source: 'barcode',
      servingDesc: '46 g',
      perServing: { kcal: 25, protein_g: 5, carbs_g: 0, fat_g: 0 },
    })
    const once = nutritionOps.enrichWithVolumeAnchor('egg whites', nutrition)
    const twice = nutritionOps.enrichWithVolumeAnchor('egg whites', once)
    assert.equal(twice.naturalUnits.length, 1)
    assert.deepEqual(twice.naturalUnits, once.naturalUnits)
  })

  await check('enrichWithVolumeAnchor: no-op when nutrition has no grams-per-serving at all', () => {
    const nutrition = schema.createNutritionInfo({
      source: 'manual',
      servingDesc: '1 packet',
      perServing: { kcal: 25, protein_g: 5, carbs_g: 0, fat_g: 0 },
    })
    assert.equal(measures.servingGrams(nutrition), null, 'fixture must have no resolvable grams-per-serving')
    const result = nutritionOps.enrichWithVolumeAnchor('egg whites', nutrition)
    assert.equal(result, nutrition, 'must return the exact same reference — a true no-op')
  })

  await check('enrichWithVolumeAnchor: no-op for a seed-table item that already has its own "1 cup" naturalUnit', () => {
    const nutrition = schema.createNutritionInfo({
      source: 'seed_table',
      servingDesc: '1 cup (158 g)',
      perServing: { kcal: 205, protein_g: 4.3, carbs_g: 45, fat_g: 0.4 },
      naturalUnits: [{ label: '1 cup', gramsOrFraction: 158 }],
    })
    const result = nutritionOps.enrichWithVolumeAnchor('cooked rice', nutrition)
    assert.equal(result, nutrition)
  })

  await check('enrichWithVolumeAnchor: no-op for a pure-volume servingDesc ("240 ml") — already volume-resolvable', () => {
    const nutrition = schema.createNutritionInfo({
      source: 'barcode',
      servingDesc: '240 ml',
      perServing: { kcal: 100, protein_g: 8, carbs_g: 12, fat_g: 2 },
    })
    assert.notEqual(measures.measureToServings('1 cup', nutrition), null, 'fixture must already resolve "1 cup"')
    const result = nutritionOps.enrichWithVolumeAnchor('milk', nutrition)
    assert.equal(result, nutrition)
  })

  await check('enrichWithVolumeAnchor: no-op (nutrition null passthrough)', () => {
    assert.equal(nutritionOps.enrichWithVolumeAnchor('egg whites', null), null)
  })

  // ==== storage.js: v11 -> v12 migration ====

  function v11Settings() {
    return schema.createSettings()
  }

  function eggWhitesNutrition() {
    return schema.createNutritionInfo({
      source: 'barcode',
      servingDesc: '46 g',
      perServing: { kcal: 25, protein_g: 5, carbs_g: 0, fat_g: 0 },
      naturalUnits: [],
    })
  }

  function v11State() {
    return {
      schemaVersion: 11,
      categories: ['Dairy'],
      pantry: [
        schema.createPantryItem({
          id: 'p1',
          name: 'Kirkland Signature Egg Whites',
          category: 'Dairy',
          onHand: true,
          nutrition: eggWhitesNutrition(),
        }),
      ],
      components: [],
      planSlots: [],
      logs: [
        schema.createLogEntry({
          date: '2026-08-01',
          meal: 'snack',
          items: [{ kind: 'adhoc', name: 'Egg whites', measure: '2 tbsp', nutrition: eggWhitesNutrition() }],
        }),
      ],
      feedback: [],
      grocery: [],
      ideas: [],
      settings: v11Settings(),
    }
  }

  await check('migration v11->v12: importState anchors both pantry item and adhoc log snapshot, perServing untouched', async () => {
    await storage.resetState()
    const before = v11State()
    const beforePantryPerServing = before.pantry[0].nutrition.perServing
    const beforeLogPerServing = before.logs[0].items[0].nutrition.perServing

    const result = await storage.importState(JSON.stringify(before))
    assert.equal(result.ok, true, `import failed: ${JSON.stringify(result.errors)}`)

    const state = await storage.getFullState()
    assert.equal(state.schemaVersion, SCHEMA_VERSION)

    const pantryAnchor = state.pantry[0].nutrition.naturalUnits.find((u) => u.label === '1 cup')
    assert.ok(pantryAnchor, 'pantry item should have gained a 1 cup anchor')
    assert.equal(pantryAnchor.gramsOrFraction, 243)
    assert.deepEqual(state.pantry[0].nutrition.perServing, beforePantryPerServing)

    const logAnchor = state.logs[0].items[0].nutrition.naturalUnits.find((u) => u.label === '1 cup')
    assert.ok(logAnchor, 'adhoc log item should have gained a 1 cup anchor')
    assert.equal(logAnchor.gramsOrFraction, 243)
    assert.deepEqual(state.logs[0].items[0].nutrition.perServing, beforeLogPerServing)
  })

  await check('migration v11->v12: running migrate() twice on the same object is stable (idempotent)', () => {
    const once = migrate(v11State())
    assert.equal(once.schemaVersion, 12)
    const twice = migrate(JSON.parse(JSON.stringify(once)))
    assert.equal(twice.schemaVersion, 12)
    assert.deepEqual(twice.pantry[0].nutrition, once.pantry[0].nutrition)
    assert.deepEqual(twice.logs[0].items[0].nutrition, once.logs[0].items[0].nutrition)
  })

  // ==== end-to-end: enriched anchor actually converts a volume measure ====

  await check('end-to-end: enriched egg-whites nutrition converts "1/2 cup" to ~2.641 servings', () => {
    const nutrition = schema.createNutritionInfo({
      source: 'barcode',
      servingDesc: '46 g',
      perServing: { kcal: 25, protein_g: 5, carbs_g: 0, fat_g: 0 },
    })
    const enriched = nutritionOps.enrichWithVolumeAnchor('egg whites', nutrition)
    const servings = measures.measureToServings('1/2 cup', enriched)
    closeTo(servings, (243 * 0.5) / 46, 0.02)
  })

  console.log(`\n${passed} checks passed.`)
} catch (err) {
  console.error(`\nFAILED after ${passed} checks:`)
  console.error(err)
  process.exit(1)
}

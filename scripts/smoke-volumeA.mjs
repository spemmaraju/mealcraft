// Zero-dependency Node smoke test for Round A ("volume-anchor harvesting"):
// measures.js's new pure-volume ml-ratio conversion path (measureToServings/
// resolvableUnitsFor), and nutritionMappers.js's generalized
// householdUnitFromServingText (both gram-then-measure and measure-then-gram
// orders) feeding mapOffProduct and the label-photo mappers. Run with:
//   node scripts/smoke-volumeA.mjs

import assert from 'node:assert/strict'
import * as schema from '../src/schema.js'
import * as measures from '../src/measures.js'
import { mapOffProduct, mapLabelReply } from '../src/nutritionMappers.js'

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
  // ==== measures.js: pure-volume servingDesc converts volume measures directly ====

  await check('measureToServings: "1/2 cup" of a pure-volume "46 ml" servingDesc converts via ml ratio', () => {
    const nutrition = schema.createNutritionInfo({
      source: 'barcode',
      servingDesc: '46 ml',
      perServing: { kcal: 100, protein_g: 1, carbs_g: 20, fat_g: 0 },
    })
    const servings = measures.measureToServings('1/2 cup', nutrition)
    closeTo(servings, (236.6 * 0.5) / 46, 0.01)
  })

  await check('measureToServings: "100 ml" of servingDesc "1 l" -> 0.1 (different volume units, no gram info)', () => {
    const nutrition = schema.createNutritionInfo({
      source: 'barcode',
      servingDesc: '1 l',
      perServing: { kcal: 100, protein_g: 1, carbs_g: 20, fat_g: 0 },
    })
    closeTo(measures.measureToServings('100 ml', nutrition), 0.1, 1e-9)
  })

  await check('measureToServings: gram-anchored regression unaffected — "1/3 cup drained (55 g)" still converts', () => {
    const nutrition = schema.createNutritionInfo({
      source: 'seed_table',
      servingDesc: '1/3 cup drained (55 g)',
      perServing: { kcal: 80, protein_g: 8, carbs_g: 2, fat_g: 4 },
      naturalUnits: [{ label: '1/3 cup drained', gramsOrFraction: 55 }],
    })
    closeTo(measures.measureToServings('1/3 cup', nutrition), 1, 1e-9)
    closeTo(measures.measureToServings('110 g', nutrition), 2, 1e-9)
  })

  await check('measureToServings: pure-volume servingDesc with a non-volume measure ("1 handful") stays null', () => {
    const nutrition = schema.createNutritionInfo({
      source: 'barcode',
      servingDesc: '46 ml',
      perServing: { kcal: 100, protein_g: 1, carbs_g: 20, fat_g: 0 },
    })
    assert.equal(measures.measureToServings('1 handful', nutrition), null)
  })

  await check('resolvableUnitsFor: a pure-volume "46 ml" servingDesc offers "cup" as a scalar unit', () => {
    const nutrition = schema.createNutritionInfo({
      source: 'barcode',
      servingDesc: '46 ml',
      perServing: { kcal: 100, protein_g: 1, carbs_g: 20, fat_g: 0 },
    })
    const { scalar } = measures.resolvableUnitsFor(nutrition)
    assert.ok(scalar.includes('cup'), `expected 'cup' in scalar units, got ${JSON.stringify(scalar)}`)
  })

  // ==== nutritionMappers.js: householdUnitFromServingText via mapOffProduct ====

  function offFixture(serving_size, opts = {}) {
    return {
      code: '000',
      product: {
        serving_size,
        nutriments: opts.per100g
          ? { 'energy-kcal_100g': 200, proteins_100g: 10, carbohydrates_100g: 30, fat_100g: 5 }
          : { 'energy-kcal_serving': 90, proteins_serving: 3, carbohydrates_serving: 10, fat_serving: 2 },
      },
    }
  }

  await check('mapOffProduct: measure-then-grams order "3 Tbsp (46 g)" harvests naturalUnits', () => {
    const info = mapOffProduct(offFixture('3 Tbsp (46 g)'))
    assert.deepEqual(info.naturalUnits, [{ label: '3 Tbsp', gramsOrFraction: 46 }])
  })

  await check('mapOffProduct: grams-then-measure order "46 g (3 Tbsp)" harvests naturalUnits (Round A)', () => {
    const info = mapOffProduct(offFixture('46 g (3 Tbsp)'))
    assert.deepEqual(info.naturalUnits, [{ label: '3 Tbsp', gramsOrFraction: 46 }])
  })

  await check('mapOffProduct: gram-only "46 g" harvests nothing', () => {
    const info = mapOffProduct(offFixture('46 g'))
    assert.deepEqual(info.naturalUnits, [])
  })

  await check('mapOffProduct: per-100g branch behavior unchanged, still harvests "2 Tbsp (30 g)"', () => {
    const info = mapOffProduct(offFixture('2 Tbsp (30 g)', { per100g: true }))
    assert.equal(info.servingDesc, '100 g')
    assert.deepEqual(info.naturalUnits, [{ label: '2 Tbsp', gramsOrFraction: 30 }])
  })

  // ==== nutritionMappers.js: label-photo mapper inherits the same harvest ====

  await check('mapLabelReply: servingDesc "3 tbsp (46 g)" harvests naturalUnits too', () => {
    const reply = JSON.stringify({
      servingDesc: '3 tbsp (46 g)',
      servingsPerContainer: 10,
      perServing: { kcal: 90, protein_g: 3, carbs_g: 10, fat_g: 2 },
    })
    const info = mapLabelReply(reply)
    assert.ok(info, 'mapLabelReply should succeed on a well-formed reply')
    assert.deepEqual(info.naturalUnits, [{ label: '3 tbsp', gramsOrFraction: 46 }])
  })

  console.log(`\n${passed} checks passed.`)
} catch (err) {
  console.error(`\nFAILED after ${passed} checks:`)
  console.error(err)
  process.exit(1)
}

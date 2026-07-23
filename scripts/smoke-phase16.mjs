// Zero-dependency Node smoke test for Phase 16 (online food search). No
// network — mapFdcSearchFood/OFF-hit mapping are tested with inline
// fixtures, and searchFoods' offline degrade is tested by shimming global
// fetch to throw. Run with:
//   node scripts/smoke-phase16.mjs

import assert from 'node:assert/strict'
import { mapFdcSearchFood, mapOffProduct } from '../src/nutritionMappers.js'
import { searchFoods } from '../src/nutritionLookup.js'

let passed = 0
async function check(label, fn) {
  await fn()
  passed++
  console.log(`ok - ${label}`)
}

try {
  // ==== mapFdcSearchFood ====

  await check('mapFdcSearchFood: Foundation/SR Legacy shape (foodNutrients per 100 g)', () => {
    const food = {
      description: 'Lentils, cooked',
      foodNutrients: [
        { nutrientId: 1008, value: 116 },
        { nutrientId: 1003, value: 9.02 },
        { nutrientId: 1005, value: 20.1 },
        { nutrientId: 1004, value: 0.38 },
        { nutrientId: 1079, value: 7.9 },
      ],
    }
    const nutrition = mapFdcSearchFood(food)
    assert.ok(nutrition)
    assert.equal(nutrition.source, 'online_search')
    assert.equal(nutrition.servingDesc, '100 g')
    assert.deepEqual(nutrition.perServing, { kcal: 116, protein_g: 9.02, carbs_g: 20.1, fat_g: 0.38, fiber_g: 7.9 })
    assert.deepEqual(nutrition.naturalUnits, [{ label: '100 g', gramsOrFraction: 100 }])
  })

  await check('mapFdcSearchFood: missing a required nutrient id is null, not a partial guess', () => {
    const food = { description: 'Weird food', foodNutrients: [{ nutrientId: 1008, value: 100 }] }
    assert.equal(mapFdcSearchFood(food), null)
  })

  await check('mapFdcSearchFood: Branded shape (labelNutrients) falls through to mapFdcFood, source overridden', () => {
    const food = {
      description: 'Branded Snack Bar',
      servingSize: 40,
      servingSizeUnit: 'g',
      labelNutrients: { calories: { value: 180 }, protein: { value: 5 }, carbohydrates: { value: 22 }, fat: { value: 7 } },
    }
    const nutrition = mapFdcSearchFood(food)
    assert.ok(nutrition)
    assert.equal(nutrition.source, 'online_search', 'mapFdcFood defaults to barcode; search must override it')
    assert.equal(nutrition.servingDesc, '40 g')
    assert.equal(nutrition.perServing.kcal, 180)
  })

  await check('mapFdcSearchFood: null/empty input is null', () => {
    assert.equal(mapFdcSearchFood(null), null)
    assert.equal(mapFdcSearchFood({}), null)
  })

  // ==== OFF search-hit mapping (each hit is a flat product object, wrapped as {product}) ====

  await check('OFF search hit maps via mapOffProduct({product}), same as a direct product lookup', () => {
    const hit = {
      code: '0123456789',
      product_name: 'Amul Paneer',
      brands: 'Amul',
      serving_size: '100g',
      nutriments: { 'energy-kcal_100g': 265, proteins_100g: 18, carbohydrates_100g: 1.2, fat_100g: 21 },
    }
    const nutrition = mapOffProduct({ product: hit })
    assert.ok(nutrition)
    assert.equal(nutrition.source, 'barcode', 'the raw mapper always tags barcode; searchFoods relabels it online_search')
    assert.equal(nutrition.barcode, '0123456789')
    assert.equal(nutrition.perServing.kcal, 265)
  })

  // ==== searchFoods: offline degrade, no network in this test ====

  await check('searchFoods: both endpoints failing (offline) returns {ok:false, reason:"offline"}, no throw (Round 2 honest error states)', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () => {
      throw new Error('simulated offline')
    }
    try {
      const result = await searchFoods('paneer', { fdcKey: 'fake-key' })
      assert.deepEqual(result, { ok: false, reason: 'offline' })
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  await check('searchFoods: without an fdcKey, FDC is skipped entirely (no fetch attempted for it)', async () => {
    const originalFetch = globalThis.fetch
    let fetchCount = 0
    globalThis.fetch = async (url) => {
      fetchCount++
      assert.ok(url.includes('openfoodfacts.org'), 'the only fetch attempted must be OFF, not FDC')
      throw new Error('simulated offline')
    }
    try {
      const result = await searchFoods('paneer')
      assert.deepEqual(result, { ok: false, reason: 'offline' })
      assert.equal(fetchCount, 1, 'exactly one fetch attempt: OFF only')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  await check('searchFoods: OFF succeeds with mappable hits -> ok:true, source "off"', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async (url) => {
      assert.ok(url.includes('openfoodfacts.org'))
      return {
        ok: true,
        json: async () => ({
          products: [
            {
              code: '111',
              product_name: 'Test Food',
              brands: 'Test Brand',
              nutriments: { 'energy-kcal_100g': 100, proteins_100g: 5, carbohydrates_100g: 10, fat_100g: 2 },
            },
          ],
        }),
      }
    }
    try {
      const result = await searchFoods('test food')
      assert.equal(result.ok, true)
      assert.equal(result.results.length, 1)
      assert.equal(result.results[0].source, 'off')
      assert.equal(result.results[0].name, 'Test Food')
      assert.equal(result.results[0].brand, 'Test Brand')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  console.log(`\n${passed} checks passed.`)
} catch (err) {
  console.error(`\nFAILED after ${passed} checks:`)
  console.error(err)
  process.exit(1)
}

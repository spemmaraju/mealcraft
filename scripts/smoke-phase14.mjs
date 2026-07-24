// Zero-dependency Node smoke test for Phase 14 (standardized measures: qty +
// unit picker with volume->gram bridging). Run with:
//   node scripts/smoke-phase14.mjs

import assert from 'node:assert/strict'
import * as schema from '../src/schema.js'
import * as nutritionOps from '../src/nutritionOps.js'
import { parseMeasure, mlFromMeasure, gramsFromMeasure, measureToServings } from '../src/measures.js'
import { findSeedForName } from '../src/nutritionSeeds.js'

let passed = 0
async function check(label, fn) {
  await fn()
  passed++
  console.log(`ok - ${label}`)
}

function nutrition(overrides) {
  return schema.createNutritionInfo(overrides)
}

try {
  // ==== Back-compat contract (exact cases from the execution plan) ====

  await check('"handful" — no unit path, never guesses', () => {
    const { qty, unitTokens } = parseMeasure('handful')
    assert.equal(qty, null)
    assert.deepEqual(unitTokens, ['handful'])
    assert.equal(measureToServings('handful', findSeedForName('rice')), null)
  })

  await check('"a splash" / "to taste" — no unit path, never guesses', () => {
    assert.equal(measureToServings('a splash', findSeedForName('rice')), null)
    assert.equal(measureToServings('to taste', findSeedForName('rice')), null)
  })

  await check('Round 3.5: "1/3 cup drained" against rice now resolves via rice\'s OWN cup anchor (descriptor-tolerant volume bridging) — "drained" is just ignored as a descriptor, not borrowed from chickpeas\' phrase', () => {
    // Pre-Round-3.5 this was null: mlFromMeasure required an exact volume-word
    // match, so any trailing descriptor ("drained") broke path (d) entirely —
    // that was the root cause of the "serving, g, kg, 1/2 cup dry" picker bug.
    // Now it honestly resolves to 1/3 cup of rice via rice's own "1 cup"
    // naturalUnit, same as measureToServings('1/3 cup', rice) would.
    const rice = findSeedForName('rice')
    const servings = measureToServings('1/3 cup drained', rice)
    assert.ok(Math.abs(servings - 1 / 3) < 0.001, `got ${servings}`)
    assert.equal(servings, measureToServings('1/3 cup', rice), 'the descriptor word must not change the result')
  })

  await check('"2 tbsp" against peanut butter (has a literal "1 tbsp" naturalUnit) — unchanged path (c)', () => {
    // Built directly from the CORE_SEEDS 'peanut butter' entry's own data
    // rather than via findSeedForName: name resolution for the bare word
    // "peanut" is a separate, documented ambiguity (nutritionSeedsVeg.js's
    // 'peanuts' entry comment) — this check is about measureToServings path
    // (c) math, independent of which seed a name query happens to resolve to.
    const pb = nutrition({
      servingDesc: '2 tbsp (32 g)',
      perServing: { kcal: 188, protein_g: 8, carbs_g: 6, fat_g: 16, fiber_g: 2 },
      naturalUnits: [
        { label: '2 tbsp', gramsOrFraction: 32 },
        { label: '1 tbsp', gramsOrFraction: 16 },
      ],
    })
    assert.equal(measureToServings('2 tbsp', pb), 1, 'peanut butter servingDesc IS 2 tbsp')
  })

  await check('NEW: "1 tbsp" against cooked rice (only a "1 cup" anchor) resolves via path (d)', () => {
    const rice = findSeedForName('rice')
    assert.equal(rice.servingDesc, '1 cup (158 g)')
    const servings = measureToServings('1 tbsp', rice)
    assert.ok(servings != null, 'must resolve, not null')
    const expectedGrams = 158 * (14.79 / 236.6)
    assert.ok(Math.abs(servings - expectedGrams / 158) < 0.001, `got ${servings}`)
  })

  await check('"100 ml" against milk (only a "1 cup" = 244 g anchor) resolves via path (d)', () => {
    const milk = nutrition({
      servingDesc: '1 cup (244 g)',
      perServing: { kcal: 149, protein_g: 7.7, carbs_g: 12, fat_g: 8 },
      naturalUnits: [{ label: '1 cup', gramsOrFraction: 244 }],
    })
    const servings = measureToServings('100 ml', milk)
    const expectedGrams = 244 * (100 / 236.6)
    assert.ok(Math.abs(servings - expectedGrams / 244) < 0.001, `got ${servings}`)
  })

  // ==== New primitives ====

  await check('mlFromMeasure: tsp/tbsp/cup/fl oz/ml/l, unknown units null', () => {
    assert.equal(mlFromMeasure('1 tsp'), 4.93)
    assert.equal(mlFromMeasure('2 tbsp'), 29.58)
    assert.equal(mlFromMeasure('1 cup'), 236.6)
    assert.equal(mlFromMeasure('1 fl oz'), 29.57)
    assert.equal(mlFromMeasure('100 ml'), 100)
    assert.equal(mlFromMeasure('1 l'), 1000)
    assert.equal(mlFromMeasure('2 blocks'), null)
    assert.equal(mlFromMeasure('handful'), null)
  })

  await check('gramsFromMeasure is unaffected by the volume additions', () => {
    assert.equal(gramsFromMeasure('200 g'), 200)
    assert.equal(gramsFromMeasure('1 cup'), null, 'cup is a volume unit, not a gram unit')
  })

  await check('path (0): "N serving(s)" returns the count directly, independent of the food', () => {
    const anyFood = nutrition({ perServing: { kcal: 100, protein_g: 1, carbs_g: 1, fat_g: 1 } })
    assert.equal(measureToServings('1 serving', anyFood), 1)
    assert.equal(measureToServings('2.5 servings', anyFood), 2.5)
  })

  await check('every dropdown unit round-trips through parseMeasure with the composed canonical form', () => {
    const cases = [
      ['1.5', 'g', '1.5 g'],
      ['2', 'kg', '2 kg'],
      ['100', 'ml', '100 ml'],
      ['1', 'tsp', '1 tsp'],
      ['2', 'tbsp', '2 tbsp'],
      ['0.5', 'cup', '0.5 cup'],
      ['1', 'fl oz', '1 fl oz'],
      ['3', 'piece', '3 piece'],
      ['1', 'serving', '1 serving'],
    ]
    for (const [qtyText, unit, composed] of cases) {
      const parsed = parseMeasure(composed)
      assert.equal(parsed.qty, parseFloat(qtyText), `qty for "${composed}"`)
      assert.deepEqual(parsed.unitTokens, unit.split(' '), `unit tokens for "${composed}"`)
    }
  })

  // ==== Regression: Phase 4.5's hand-checked derivation fixture, unchanged ====

  await check('deriveComponentMacros: Phase 4.5 fixture unchanged by the measures.js additions', () => {
    const pantry = [
      schema.createPantryItem({ name: 'Canned chickpeas', nutrition: findSeedForName('canned chickpeas') }),
      schema.createPantryItem({ name: 'Rice', nutrition: findSeedForName('rice') }),
      schema.createPantryItem({ name: 'Onion', nutrition: findSeedForName('onion') }),
    ]
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
    assert.deepEqual(result.macrosPerServing, { kcal: 297, protein_g: 8.9, carbs_g: 61, fat_g: 1.5 })
  })

  await check('a new "0.5 cup" toor dal ingredient now contributes macros (was unresolvable pre-Phase-13/14)', () => {
    const pantry = [schema.createPantryItem({ name: 'Toor dal', nutrition: findSeedForName('toor dal') })]
    const component = schema.createComponent({
      servings: 1,
      macroSource: 'derived',
      ingredients: [{ name: 'toor dal', measure: '0.5 cup' }],
    })
    const result = nutritionOps.deriveComponentMacros(component, pantry)
    assert.equal(result.ok, true, `unexpected: ${JSON.stringify(result)}`)
    assert.ok(result.macrosPerServing.kcal > 0)
  })

  console.log(`\n${passed} checks passed.`)
} catch (err) {
  console.error(`\nFAILED after ${passed} checks:`)
  console.error(err)
  process.exit(1)
}

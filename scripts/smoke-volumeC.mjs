// Zero-dependency Node smoke test for Round C ("teach a manual conversion"):
// measures.js's volumeUnitOfMeasure helper, trackOps.js's setItemNutrition
// op, and the end-to-end pure path of teaching a "1 cup = N g" anchor for an
// item whose measure previously couldn't convert. Run with:
//   node scripts/smoke-volumeC.mjs

import assert from 'node:assert/strict'
import * as schema from '../src/schema.js'
import * as measures from '../src/measures.js'
import * as trackOps from '../src/trackOps.js'

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
  // ==== measures.js: volumeUnitOfMeasure ====

  await check('volumeUnitOfMeasure: "1/2 cup" -> "cup"', () => {
    assert.equal(measures.volumeUnitOfMeasure('1/2 cup'), 'cup')
  })

  await check('volumeUnitOfMeasure: "2 tbsp dry" -> "tbsp" (descriptor-tolerant)', () => {
    assert.equal(measures.volumeUnitOfMeasure('2 tbsp dry'), 'tbsp')
  })

  await check('volumeUnitOfMeasure: "150 g" -> null (not volume-based)', () => {
    assert.equal(measures.volumeUnitOfMeasure('150 g'), null)
  })

  await check('volumeUnitOfMeasure: "handful" -> null (no unit at all)', () => {
    assert.equal(measures.volumeUnitOfMeasure('handful'), null)
  })

  // ==== trackOps.js: setItemNutrition ====

  function fixtureLogs() {
    return [
      schema.createLogEntry({
        date: '2026-08-01',
        meal: 'snack',
        items: [
          { kind: 'adhoc', name: 'Egg whites', measure: '1/2 cup', nutrition: schema.createNutritionInfo({ servingDesc: '46 g' }) },
          { kind: 'adhoc', name: 'Toast', measure: '1 slice', nutrition: schema.createNutritionInfo({ servingDesc: '1 slice' }) },
        ],
      }),
      schema.createLogEntry({
        date: '2026-08-01',
        meal: 'lunch',
        items: [{ kind: 'component', componentId: 'c1', count: 1 }],
      }),
    ]
  }

  await check('setItemNutrition: replaces only the targeted item\'s nutrition, other items/logs untouched', () => {
    const logs = fixtureLogs()
    const newNutrition = { ...logs[0].items[0].nutrition, naturalUnits: [{ label: '1 cup', gramsOrFraction: 200 }] }
    const result = trackOps.setItemNutrition(logs, '2026-08-01', 'snack', 0, newNutrition)

    assert.notEqual(result, logs, 'must return a new logs array')
    assert.notEqual(result[0], logs[0], 'changed log must be a new reference')
    assert.notEqual(result[0].items[0], logs[0].items[0], 'changed item must be a new reference')
    assert.equal(result[0].items[0].nutrition, newNutrition)

    assert.deepEqual(result[0].items[1], logs[0].items[1], 'sibling item must be untouched')
    assert.equal(result[1], logs[1], 'unrelated log must be the exact same reference')
    assert.deepEqual(logs[0].items[0].nutrition.naturalUnits, [], 'original must be unmutated')
  })

  await check('setItemNutrition: no-op (same reference) when no log exists at (date, meal)', () => {
    const logs = fixtureLogs()
    const result = trackOps.setItemNutrition(logs, '2026-08-01', 'dinner', 0, schema.createNutritionInfo())
    assert.equal(result, logs)
  })

  // ==== end-to-end: teaching an anchor makes the measure resolve ====

  await check('end-to-end: unconvertible "1/2 cup" of a 46 g adhoc item resolves after teaching a "1 cup" anchor, and bridges to tbsp too', () => {
    const nutrition = schema.createNutritionInfo({
      source: 'manual',
      servingDesc: '46 g',
      perServing: { kcal: 25, protein_g: 5, carbs_g: 0, fat_g: 0 },
    })

    assert.equal(measures.volumeUnitOfMeasure('1/2 cup'), 'cup')
    assert.equal(measures.measureToServings('1/2 cup', nutrition), null, 'must be unconvertible before teaching')

    const taught = { ...nutrition, naturalUnits: [...(nutrition.naturalUnits || []), { label: '1 cup', gramsOrFraction: 200 }] }

    const halfCupServings = measures.measureToServings('1/2 cup', taught)
    closeTo(halfCupServings, 100 / 46, 1e-6)

    // Volume bridging (measureToServings path (d)): the taught "1 cup"
    // anchor resolves OTHER volume units too, not just cup.
    const tbspServings = measures.measureToServings('1 tbsp', taught)
    assert.notEqual(tbspServings, null, '"1 tbsp" should resolve via volume bridging through the taught cup anchor')
  })

  console.log(`\n${passed} checks passed.`)
} catch (err) {
  console.error(`\nFAILED after ${passed} checks:`)
  console.error(err)
  process.exit(1)
}

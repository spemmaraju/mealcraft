// Zero-dependency Node smoke test for Round 3.5 ("measures standardization +
// design sync"): the descriptor-tolerant volume bridging fix in measures.js
// (the "serving, g, kg, 1/2 cup dry" bug report), formatQty's kitchen
// fractions, and the new trackOps/logSearchOps/addSheetOps pure-logic seams
// behind the design sync (7-day strip, logging streak, recents when-context,
// pantry-row sub-lines). No DOM. Run with:
//   node scripts/smoke-round3.5.mjs

import assert from 'node:assert/strict'
import * as schema from '../src/schema.js'
import * as trackOps from '../src/trackOps.js'
import * as measures from '../src/measures.js'
import * as logSearchOps from '../src/logSearchOps.js'
import { buildAddSheetData } from '../src/addSheetOps.js'
import { findSeedForName } from '../src/nutritionSeeds.js'

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
  // ==== measures.js: descriptor-tolerant volume bridging (the reported bug) ====
  // Root cause: naturalUnits labels are almost always "<qty> <volume unit>
  // <descriptor>" ("1/2 cup dry") — the old mlFromMeasure required an exact
  // full-string VOLUME_ML match, so the descriptor silently broke every
  // volume-anchor lookup, leaving only serving/g/kg in the picker.

  const oatsLike = schema.createNutritionInfo({
    source: 'seed_table',
    servingDesc: '1/2 cup dry (45 g)',
    perServing: { kcal: 219, protein_g: 6, carbs_g: 27, fat_g: 3 },
    naturalUnits: [{ label: '1/2 cup dry', gramsOrFraction: 45 }],
  })

  await check('mlFromMeasure: tolerates trailing descriptor words on a volume unit', () => {
    assert.equal(measures.mlFromMeasure('1/2 cup dry'), 118.3)
    assert.equal(measures.mlFromMeasure('1 cup chopped'), 236.6)
    assert.equal(measures.mlFromMeasure('2 tbsp creamy'), 2 * 14.79)
    // Still honest: a non-volume word (with or without a descriptor) is null.
    assert.equal(measures.mlFromMeasure('2 blocks chopped'), null)
  })

  await check('resolvableUnitsFor: oats-style nutrition unlocks the whole volume family (cup/tbsp/tsp), never kg/fl oz', () => {
    const { scalar, phrases } = measures.resolvableUnitsFor(oatsLike)
    assert.ok(scalar.includes('cup'), 'cup must resolve via the descriptor-tolerant naturalUnits anchor')
    assert.ok(scalar.includes('tbsp'), 'tbsp must resolve too — same volume family')
    assert.ok(scalar.includes('tsp'), 'tsp must resolve too — same volume family')
    assert.ok(scalar.includes('g'), 'g always resolves via the direct-grams path')
    assert.ok(!scalar.includes('kg'), 'kg is dropped from the picker (Round 3.5 §2)')
    assert.ok(!scalar.includes('fl oz'), 'fl oz is dropped from the picker (Round 3.5 §2)')
    assert.deepEqual(phrases, [], '"1/2 cup dry" is hidden — "cup" already covers it with honest math (Round 3.5 §3)')
  })

  await check('measureToServings: "2/3 cup" of the oats-style item = (2/3)/(1/2) servings', () => {
    const servings = measures.measureToServings('2/3 cup', oatsLike)
    closeTo(servings, (2 / 3) / (1 / 2), 1e-9)
    closeTo(servings, 1.3333333333, 1e-6)
  })

  await check('qtyForUnit round-trips cup <-> servings for the oats-style item', () => {
    const servings = measures.measureToServings('2/3 cup', oatsLike)
    const qty = measures.qtyForUnit(servings, 'cup', oatsLike)
    closeTo(qty, 2 / 3, 1e-9)
  })

  await check('real "rolled oats" seed also unlocks cup/tbsp/tsp (not just the constructed test fixture)', () => {
    const oats = findSeedForName('oats')
    assert.ok(oats, 'rolled oats seed must resolve by alias "oats"')
    const { scalar, phrases } = measures.resolvableUnitsFor(oats)
    assert.ok(scalar.includes('cup') && scalar.includes('tbsp') && scalar.includes('tsp'))
    assert.deepEqual(phrases, [])
  })

  await check('matchScalarUnit: recognizes a legacy/hidden phrase measure as its covering scalar unit + qty', () => {
    const hit = measures.matchScalarUnit('1 cup chopped', ['cup', 'g', 'serving'])
    assert.deepEqual(hit, { unit: 'cup', qty: 1 })
    assert.equal(measures.matchScalarUnit('2 blocks', ['cup', 'g']), null, 'a non-volume unmatched unit stays null')
  })

  // ==== measures.js: formatQty (kitchen fractions) ====

  await check('formatQty: nearest kitchen fraction (denominators 2/3/4/8), mixed numbers, decimal fallback', () => {
    assert.equal(measures.formatQty(0.6667), '2/3')
    assert.equal(measures.formatQty(0.5), '1/2')
    assert.equal(measures.formatQty(1.5), '1 1/2')
    assert.equal(measures.formatQty(0.37), '0.37', 'not close enough to 3/8 (0.375) to snap — an honest decimal, not a wrong-looking fraction')
    assert.equal(measures.formatQty(2), '2', 'a whole number is never dressed up as "2 0/1" or similar')
  })

  // ==== trackOps.js: 7-day strip / logging streak / relative day label ====

  await check('weekDatesFull: Sun..Sat following the Sunday weekOf, weekDates itself untouched (still Mon..Fri)', () => {
    assert.deepEqual(trackOps.weekDatesFull('2026-01-04').map((d) => d.day), ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'])
    assert.equal(trackOps.weekDatesFull('2026-01-04')[0].date, '2026-01-04')
    assert.equal(trackOps.weekDatesFull('2026-01-04')[6].date, '2026-01-10')
    assert.deepEqual(trackOps.weekDates('2026-01-04').map((d) => d.day), ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'])
  })

  function logEntry(date, meal, items) {
    return schema.createLogEntry({ date, meal, items })
  }

  await check('loggingStreak: consecutive calendar days with ANY logged meal, weekends/meal-kind do not matter, unlogged today does not break it', () => {
    const logs = [
      logEntry('2026-07-18', 'breakfast', [{ kind: 'adhoc', name: 'Toast', measure: '1 serving', nutrition: schema.createNutritionInfo() }]),
      logEntry('2026-07-19', 'dinner', [{ kind: 'adhoc', name: 'Soup', measure: '1 serving', nutrition: schema.createNutritionInfo() }]),
      logEntry('2026-07-20', 'snack', [{ kind: 'adhoc', name: 'Chips', measure: '1 serving', nutrition: schema.createNutritionInfo() }]),
    ]
    assert.equal(trackOps.loggingStreak(logs, '2026-07-21'), 3, 'unlogged today (21st) does not break the streak')
    assert.equal(trackOps.loggingStreak(logs, '2026-07-20'), 3, 'logged today counts too')
  })

  await check('loggingStreak: a missed day breaks it', () => {
    const logs = [
      logEntry('2026-07-15', 'lunch', [{ kind: 'adhoc', name: 'X', measure: '1 serving', nutrition: schema.createNutritionInfo() }]),
      logEntry('2026-07-17', 'lunch', [{ kind: 'adhoc', name: 'Y', measure: '1 serving', nutrition: schema.createNutritionInfo() }]),
    ]
    assert.equal(trackOps.loggingStreak(logs, '2026-07-17'), 1)
  })

  await check('relativeDayLabel: today, yesterday, else the 3-letter weekday abbreviation', () => {
    assert.equal(trackOps.relativeDayLabel('2026-07-22', '2026-07-22'), 'today')
    assert.equal(trackOps.relativeDayLabel('2026-07-21', '2026-07-22'), 'yesterday')
    assert.equal(trackOps.relativeDayLabel('2026-07-18', '2026-07-22'), trackOps.weekdayName('2026-07-18').slice(0, 3))
    assert.equal(trackOps.relativeDayLabel('2026-07-18', '2026-07-22'), 'Sat')
  })

  // ==== logSearchOps.deriveRecents: now threads date/meal through ====

  await check('deriveRecents: each recent carries the source log\'s own date/meal (Round 3.5 when-context)', () => {
    const logs = [logEntry('2026-07-20', 'breakfast', [{ kind: 'pantry', pantryId: 'p1', measure: '1/2 cup' }])]
    const recents = logSearchOps.deriveRecents(logs, '2026-07-22')
    assert.equal(recents[0].date, '2026-07-20')
    assert.equal(recents[0].meal, 'breakfast')
    assert.equal(recents[0].item.measure, '1/2 cup', 'the item snapshot itself is unchanged')
  })

  // ==== addSheetOps.js: recents when-context + pantry on-hand sub-line ====

  await check('buildAddSheetData: RECENT row sub-line is "{kcal} cal · {measure} · {when}, {meal}"', () => {
    const pantry = [schema.createPantryItem({ id: 'p1', name: 'Rice', nutrition: schema.createNutritionInfo({ perServing: { kcal: 200, protein_g: 4, carbs_g: 44, fat_g: 0.4 } }) })]
    const logs = [logEntry('2026-07-21', 'lunch', [{ kind: 'pantry', pantryId: 'p1', measure: '1 serving' }])]
    const { groups } = buildAddSheetData({ card: null, components: [], pantry, logs, today: '2026-07-22', query: 'rice', existingComponentIds: [] })
    const recentGroup = groups.find((g) => g.key === 'recent')
    assert.equal(recentGroup.rows.length, 1)
    assert.equal(recentGroup.rows[0].sublabel, '200 cal · 1 serving · yesterday, lunch')
  })

  await check('buildAddSheetData: PANTRY row sub-line is "on hand · {roughQty or serving info}" only when on hand', () => {
    const pantry = [
      schema.createPantryItem({ id: 'p1', name: 'Chickpeas', onHand: true, roughQty: 'half can', nutrition: schema.createNutritionInfo() }),
      schema.createPantryItem({ id: 'p2', name: 'Chickpea Flour', onHand: false, nutrition: schema.createNutritionInfo() }),
    ]
    const { groups } = buildAddSheetData({ card: null, components: [], pantry, logs: [], today: '2026-07-22', query: 'chick', existingComponentIds: [] })
    const pantryGroup = groups.find((g) => g.key === 'pantry')
    const onHandRow = pantryGroup.rows.find((r) => r.id === 'p1')
    const offHandRow = pantryGroup.rows.find((r) => r.id === 'p2')
    assert.equal(onHandRow.sublabel, 'on hand · half can')
    assert.equal(offHandRow.sublabel, undefined, 'an off-hand item has no on-hand sub-line')
  })

  console.log(`\n${passed} checks passed.`)
} catch (err) {
  console.error(`\nFAILED after ${passed} checks:`)
  console.error(err)
  process.exit(1)
}

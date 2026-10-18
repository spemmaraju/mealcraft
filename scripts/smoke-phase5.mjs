// Zero-dependency Node smoke test for Phase 5 (Tracker). Shims localStorage,
// then exercises trackOps.js math and the logs/feedback storage round-trip —
// no network. Run with:
//   node scripts/smoke-phase5.mjs
// (Phase 17: checks for the removed WeekPlan/week-prompt code were dropped;
// log fixtures are built with logOf() since buildLogFromCard went with it.)

import assert from 'node:assert/strict'
import * as schema from '../src/schema.js'
import * as storage from '../src/storage.js'
import * as trackOps from '../src/trackOps.js'

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

function component(overrides) {
  return schema.createComponent(overrides)
}

// One component item per id, count 1 — the shape the old buildLogFromCard produced.
function logOf(componentIds, date, meal = 'lunch') {
  return schema.createLogEntry({
    date,
    meal,
    items: componentIds.map((componentId) => ({ kind: 'component', componentId, count: 1 })),
  })
}

try {
  // ==== trackOps.js: date helpers ====

  await check('todayISO: local-safe, no UTC shift for a late-evening local time', () => {
    assert.equal(trackOps.todayISO(new Date(2026, 0, 5, 23, 30)), '2026-01-05')
    assert.equal(trackOps.todayISO(new Date(2026, 6, 1, 0, 5)), '2026-07-01')
  })

  await check('weekDates: Mon..Fri following the Sunday weekOf', () => {
    // 2026-01-04 is a Sunday.
    assert.deepEqual(trackOps.weekDates('2026-01-04'), [
      { day: 'Mon', date: '2026-01-05' },
      { day: 'Tue', date: '2026-01-06' },
      { day: 'Wed', date: '2026-01-07' },
      { day: 'Thu', date: '2026-01-08' },
      { day: 'Fri', date: '2026-01-09' },
    ])
  })

  await check('currentWeekSundayISO: Sunday on/before any weekday, incl. Sunday itself', () => {
    assert.equal(trackOps.currentWeekSundayISO('2026-01-09'), '2026-01-04') // Friday
    assert.equal(trackOps.currentWeekSundayISO('2026-01-04'), '2026-01-04') // Sunday
    assert.equal(trackOps.currentWeekSundayISO('2026-01-10'), '2026-01-04') // Saturday
  })

  // ==== trackOps.js: logging (Phase 15: items[] discriminated union) ====

  await check('createLogEntry: defaults meal lunch, component items validate against LogEntry', () => {
    const entry = logOf(['c1', 'c2'], '2026-01-05')
    assert.equal(entry.meal, 'lunch')
    assert.deepEqual(entry.items, [
      { kind: 'component', componentId: 'c1', count: 1 },
      { kind: 'component', componentId: 'c2', count: 1 },
    ])
    assert.deepEqual(schema.validate(entry, 'LogEntry'), [])

    const snack = logOf(['c3'], '2026-01-05', 'snack')
    assert.equal(snack.meal, 'snack')
    assert.deepEqual(schema.validate(snack, 'LogEntry'), [])
  })

  await check('setItemCount: immutable, clamps below 0', () => {
    const log = logOf(['c1'], '2026-01-05')
    const next = trackOps.setItemCount(log, 0, 1.5)
    assert.equal(next.items[0].count, 1.5)
    assert.equal(log.items[0].count, 1, 'original untouched')
    assert.equal(trackOps.setItemCount(log, 0, -3).items[0].count, 0)
  })

  await check('mergeItems / setItemMeasure / removeItemAt: immutable item-list edits', () => {
    const log = logOf(['c1'], '2026-01-05')
    const merged = trackOps.mergeItems(log, [{ kind: 'pantry', pantryId: 'p1', measure: '1 cup' }])
    assert.equal(merged.items.length, 2)
    assert.equal(log.items.length, 1, 'original untouched')

    const remeasured = trackOps.setItemMeasure(merged, 1, '2 cup')
    assert.equal(remeasured.items[1].measure, '2 cup')
    assert.equal(merged.items[1].measure, '1 cup', 'original untouched')

    const removed = trackOps.removeItemAt(remeasured, 0)
    assert.equal(removed.items.length, 1)
    assert.equal(removed.items[0].kind, 'pantry')
  })

  await check('upsertLog: identity is (date, meal) for every meal — replaces, never appends', () => {
    let logs = [logOf(['c1'], '2026-01-05')]
    const replacement = logOf(['c1', 'c2'], '2026-01-05')
    logs = trackOps.upsertLog(logs, replacement)
    assert.equal(logs.length, 1)
    assert.deepEqual(logs[0], replacement)

    logs = trackOps.upsertLog(logs, logOf(['c3'], '2026-01-05', 'snack'))
    assert.equal(logs.length, 2, 'a different meal on the same date is a distinct entry')

    logs = trackOps.upsertLog(logs, logOf(['c4'], '2026-01-05', 'snack'))
    assert.equal(logs.length, 2, 'same (date, meal) replaces, does not append')
    assert.deepEqual(
      logs.find((l) => l.meal === 'snack').items.map((i) => i.componentId),
      ['c4'],
    )
  })

  await check('removeLogAt / logFor: index-based remove and date+meal lookup', () => {
    const logs = [
      logOf(['c1'], '2026-01-05'),
      logOf(['c2'], '2026-01-06'),
    ]
    const found = trackOps.logFor(logs, '2026-01-06', 'lunch')
    assert.equal(found.index, 1)
    assert.equal(trackOps.logFor(logs, '2026-01-07', 'lunch'), null)
    assert.equal(trackOps.removeLogAt(logs, 0).length, 1)
    assert.equal(trackOps.removeLogAt(logs, 0)[0].date, '2026-01-06')
  })

  await check('logsForWeek: only dates within that week\'s Mon-Fri', () => {
    const logs = [
      logOf([], '2026-01-05'), // Mon in week
      logOf([], '2026-01-09'), // Fri in week
      logOf([], '2026-01-10'), // Sat, out
      logOf([], '2026-01-12'), // next week
    ]
    assert.equal(trackOps.logsForWeek(logs, '2026-01-04').length, 2)
  })

  // ==== trackOps.js: gauges ====

  const chickenBowl = component({ id: 'chicken', type: 'protein', macrosPerServing: { kcal: 300, protein_g: 30, carbs_g: 5, fat_g: 10 }, macroSource: 'ai_estimate' })
  const riceBase = component({ id: 'rice', type: 'base', macrosPerServing: { kcal: 200, protein_g: 4, carbs_g: 45, fat_g: 1 }, macroSource: 'manual' })
  const veg = component({ id: 'veg', type: 'veg', macrosPerServing: { kcal: 50, protein_g: 2, carbs_g: 10, fat_g: 0 }, macroSource: 'seed_table' })
  const mysteryPaste = component({ id: 'mystery', type: 'sauce', macrosPerServing: null })
  const gaugeComponents = [chickenBowl, riceBase, veg, mysteryPaste]

  await check('logMacros: 1.5x count sum, unknown-macro item counts as missing not zero', () => {
    let log = logOf(['chicken', 'rice', 'mystery'], '2026-01-05')
    log = trackOps.setItemCount(log, 0, 1.5)
    const macros = trackOps.logMacros(log, gaugeComponents, [])
    assert.equal(macros.protein_g, 30 * 1.5 + 4 * 1)
    assert.equal(macros.kcal, 300 * 1.5 + 200 * 1)
    assert.equal(macros.missing, 1)
  })

  const cookedRicePantryItem = schema.createPantryItem({
    id: 'pantry-rice',
    name: 'Cooked rice',
    category: 'Grains & Bases',
    nutrition: schema.createNutritionInfo({
      source: 'seed_table',
      servingDesc: '1 cup (158 g)',
      perServing: { kcal: 205, protein_g: 4.3, carbs_g: 45, fat_g: 0.4 },
      naturalUnits: [{ label: '1 cup', gramsOrFraction: 158 }],
    }),
  })
  const gaugePantry = [cookedRicePantryItem]

  await check('logMacros: kind:"pantry" resolves via measureToServings; unresolvable measure counts as missing', () => {
    const log = { date: '2026-01-05', meal: 'snack', items: [{ kind: 'pantry', pantryId: 'pantry-rice', measure: '1 cup' }], quickRating: null }
    const macros = trackOps.logMacros(log, [], gaugePantry)
    assert.equal(macros.kcal, 205)
    assert.equal(macros.missing, 0)

    const unresolvable = { date: '2026-01-05', meal: 'snack', items: [{ kind: 'pantry', pantryId: 'pantry-rice', measure: 'a handful' }], quickRating: null }
    assert.equal(trackOps.logMacros(unresolvable, [], gaugePantry).missing, 1)
  })

  await check('logMacros: kind:"adhoc" resolves against its own embedded nutrition snapshot', () => {
    const adhocNutrition = schema.createNutritionInfo({
      source: 'online_search',
      servingDesc: '100 g',
      perServing: { kcal: 50, protein_g: 5, carbs_g: 2, fat_g: 1 },
      naturalUnits: [{ label: '100 g', gramsOrFraction: 100 }],
    })
    const log = { date: '2026-01-05', meal: 'snack', items: [{ kind: 'adhoc', name: 'Mystery bar', measure: '1 serving', nutrition: adhocNutrition }], quickRating: null }
    const macros = trackOps.logMacros(log, [], [])
    assert.equal(macros.kcal, 50, 'path (0): "1 serving" resolves to the snapshot as-is')
    assert.equal(macros.missing, 0)
  })

  await check('dayMacros: sums logMacros across every meal logged that day', () => {
    const logs = [
      logOf(['chicken'], '2026-01-05', 'lunch'),
      logOf(['rice'], '2026-01-05', 'dinner'),
      logOf(['chicken'], '2026-01-06', 'lunch'),
    ]
    const macros = trackOps.dayMacros(logs, gaugeComponents, [], '2026-01-05')
    assert.equal(macros.kcal, 300 + 200)
    assert.equal(macros.protein_g, 30 + 4)
  })

  await check('proteinByDay: per-day totals across ALL meals, logged flag, hasMissing flag', () => {
    let logs = [
      logOf(['chicken'], '2026-01-05', 'lunch'),
      logOf(['mystery'], '2026-01-05', 'snack'),
    ]
    const days = trackOps.proteinByDay(logs, gaugeComponents, [], '2026-01-04')
    assert.equal(days[0].day, 'Mon')
    assert.equal(days[0].protein_g, 30, 'both meals summed, mystery contributes 0 (missing, not faked)')
    assert.equal(days[0].logged, true)
    assert.equal(days[0].hasMissing, true)
    assert.equal(days[1].logged, false)
    assert.equal(days[1].protein_g, 0)
  })

  await check('plateMix: fractions sum to 1 across ALL meals, base->carbs / protein->protein / veg->veg / sauce->other', () => {
    const logs = [
      logOf(['chicken', 'rice'], '2026-01-05', 'lunch'),
      logOf(['veg', 'mystery'], '2026-01-05', 'dinner'),
    ]
    const mix = trackOps.plateMix(logs, gaugeComponents, [])
    assert.equal(mix.protein, 0.25)
    assert.equal(mix.carbs, 0.25)
    assert.equal(mix.veg, 0.25)
    assert.equal(mix.other, 0.25)
    assert.equal(mix.protein + mix.carbs + mix.veg + mix.other, 1)
  })

  await check('plateMix: pantry items bucket by pantry category, weighted by resolved servings', () => {
    const logs = [{ date: '2026-01-05', meal: 'snack', items: [{ kind: 'pantry', pantryId: 'pantry-rice', measure: '2 cup' }], quickRating: null }]
    const mix = trackOps.plateMix(logs, [], gaugePantry)
    assert.equal(mix.carbs, 1, 'Grains & Bases -> carbs, sole item so full weight')
  })

  await check('plateMix: null when nothing logged', () => {
    assert.equal(trackOps.plateMix([], gaugeComponents, []), null)
  })

  await check('lunchStreak: consecutive weekdays, weekend does not break, unlogged today does not break', () => {
    // Mon 1/5 .. Thu 1/8 logged; Fri 1/9 unlogged (today).
    const partialWeek = ['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08'].map((d) =>
      logOf(['chicken'], d),
    )
    assert.equal(trackOps.lunchStreak(partialWeek, '2026-01-09'), 4, 'unlogged today should not break the streak')

    // Mon 1/5 .. Fri 1/9 all logged; check spans the weekend into the next Monday.
    const fullWeek = ['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09'].map((d) =>
      logOf(['chicken'], d),
    )
    assert.equal(trackOps.lunchStreak(fullWeek, '2026-01-10'), 5, 'checked on Saturday: weekend does not break it')
    assert.equal(trackOps.lunchStreak(fullWeek, '2026-01-12'), 5, 'checked on next unlogged Monday: still spans the weekend')
  })

  await check('lunchStreak: a missed weekday breaks it', () => {
    const logs = [
      logOf(['chicken'], '2026-01-05'),
      // 1/6 missed
      logOf(['chicken'], '2026-01-07'),
      logOf(['chicken'], '2026-01-08'),
    ]
    assert.equal(trackOps.lunchStreak(logs, '2026-01-08'), 2)
  })

  await check('estimateFraction: threshold both sides of 50%, unknown-macro items excluded', () => {
    const majorityEstimate = [logOf(['chicken', 'veg', 'mystery'], '2026-01-05')]
    const est = trackOps.estimateFraction(majorityEstimate, gaugeComponents, [])
    assert.equal(est.fraction, 1, 'both resolvable items are ai_estimate/seed_table')
    assert.equal(est.showHint, true)

    const minorityEstimate = [logOf(['chicken', 'rice'], '2026-01-05')]
    const est2 = trackOps.estimateFraction(minorityEstimate, gaugeComponents, [])
    assert.equal(est2.fraction, 0.5)
    assert.equal(est2.showHint, false, 'exactly 50% does not trigger the hint')
  })

  await check('estimateFraction: pantry/adhoc read nutrition.source; barcode/label_photo/manual count as measured', () => {
    const measured = [{ date: '2026-01-05', meal: 'snack', items: [{ kind: 'pantry', pantryId: 'pantry-rice', measure: '1 cup' }], quickRating: null }]
    assert.equal(trackOps.estimateFraction(measured, [], gaugePantry).fraction, 1, 'pantry-rice is seed_table -> estimate')

    const manualPantry = [
      schema.createPantryItem({
        id: 'pantry-manual',
        name: 'Homemade granola',
        category: 'Grains & Bases',
        nutrition: schema.createNutritionInfo({ source: 'manual', servingDesc: '1 cup', perServing: { kcal: 1, protein_g: 1, carbs_g: 1, fat_g: 1 }, naturalUnits: [{ label: '1 cup', gramsOrFraction: 100 }] }),
      }),
    ]
    const manualLog = [{ date: '2026-01-05', meal: 'snack', items: [{ kind: 'pantry', pantryId: 'pantry-manual', measure: '1 cup' }], quickRating: null }]
    assert.equal(trackOps.estimateFraction(manualLog, [], manualPantry).fraction, 0, 'manual counts as measured, not estimate')
  })

  // ==== trackOps.js: feedback ====

  await check('upsertFeedback / feedbackFor: no duplicate weekOf records', () => {
    let feedback = [schema.createWeeklyFeedback({ weekOf: '2026-01-04', repeatWorthy: 'chicken bowl' })]
    feedback = trackOps.upsertFeedback(feedback, schema.createWeeklyFeedback({ weekOf: '2026-01-04', repeatWorthy: 'updated' }))
    assert.equal(feedback.length, 1)
    assert.equal(trackOps.feedbackFor(feedback, '2026-01-04').repeatWorthy, 'updated')
    assert.equal(trackOps.feedbackFor(feedback, '2026-02-01'), null)
  })

  await check('isFeedbackWindow: true Fri/Sat only', () => {
    assert.equal(trackOps.isFeedbackWindow('2026-01-09'), true) // Friday
    assert.equal(trackOps.isFeedbackWindow('2026-01-10'), true) // Saturday
    assert.equal(trackOps.isFeedbackWindow('2026-01-08'), false) // Thursday
    assert.equal(trackOps.isFeedbackWindow('2026-01-11'), false) // Sunday
  })

  // ==== storage.js: logs + feedback round-trip ====

  await check('logs + feedback export -> reset -> import round-trip unchanged', async () => {
    await storage.resetState()
    const log = logOf(['c1'], '2026-01-05')
    const fb = schema.createWeeklyFeedback({ weekOf: '2026-01-04', repeatWorthy: 'chicken bowl' })
    await storage.set('logs', [log])
    await storage.set('feedback', [fb])

    const exported = await storage.exportState()
    await storage.resetState()
    const result = await storage.importState(exported)
    assert.equal(result.ok, true, `unexpected errors: ${JSON.stringify(result.errors)}`)
    assert.deepEqual(await storage.get('logs'), [log])
    assert.deepEqual(await storage.get('feedback'), [fb])
  })

  console.log(`\n${passed} checks passed.`)
} catch (err) {
  console.error(`\nFAILED after ${passed} checks:`)
  console.error(err)
  process.exit(1)
}

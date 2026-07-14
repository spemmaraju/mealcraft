// Zero-dependency Node smoke test for Phase 5 (Tracker). Shims localStorage,
// then exercises trackOps.js math, the logs/feedback storage round-trip, and
// gate 3 (feedback flows verbatim into the compiled prompt) — no network.
// Run with:
//   node scripts/smoke-phase5.mjs

import assert from 'node:assert/strict'
import * as schema from '../src/schema.js'
import * as storage from '../src/storage.js'
import * as trackOps from '../src/trackOps.js'
import * as promptCompiler from '../src/promptCompiler.js'

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

  await check('currentWeek: latest weekOf <= date; falls back to latest overall; null when empty', () => {
    const weeks = [schema.createWeekPlan({ weekOf: '2026-01-04' }), schema.createWeekPlan({ weekOf: '2026-01-11' })]
    assert.equal(trackOps.currentWeek(weeks, '2026-01-09').weekOf, '2026-01-04')
    assert.equal(trackOps.currentWeek(weeks, '2026-01-12').weekOf, '2026-01-11')
    assert.equal(trackOps.currentWeek(weeks, '2025-12-01').weekOf, '2026-01-11', 'before any week: falls back to latest')
    assert.equal(trackOps.currentWeek([], '2026-01-09'), null)
  })

  await check('assemblyCardForDate: matches by day, null when no week or no matching card', () => {
    const week = schema.createWeekPlan({
      weekOf: '2026-01-04',
      assembly: [{ day: 'Mon', componentIds: ['c1'], note: '' }],
    })
    assert.deepEqual(trackOps.assemblyCardForDate(week, '2026-01-05'), { day: 'Mon', componentIds: ['c1'], note: '' })
    assert.equal(trackOps.assemblyCardForDate(week, '2026-01-06'), null, 'Tuesday has no card')
    assert.equal(trackOps.assemblyCardForDate(null, '2026-01-05'), null)
  })

  // ==== trackOps.js: logging ====

  await check('buildLogFromCard: defaults meal lunch, portions count 1, validates against LogEntry', () => {
    const entry = trackOps.buildLogFromCard({ componentIds: ['c1', 'c2'] }, '2026-01-05')
    assert.equal(entry.meal, 'lunch')
    assert.deepEqual(entry.portions, [
      { componentId: 'c1', naturalUnitLabel: 'serving', count: 1 },
      { componentId: 'c2', naturalUnitLabel: 'serving', count: 1 },
    ])
    assert.deepEqual(schema.validate(entry, 'LogEntry'), [])

    const other = trackOps.buildLogFromCard({ componentIds: ['c3'] }, '2026-01-05', 'other')
    assert.equal(other.meal, 'other')
    assert.deepEqual(schema.validate(other, 'LogEntry'), [])
  })

  await check('setPortionCount: immutable, clamps below 0', () => {
    const log = trackOps.buildLogFromCard({ componentIds: ['c1'] }, '2026-01-05')
    const next = trackOps.setPortionCount(log, 'c1', 1.5)
    assert.equal(next.portions[0].count, 1.5)
    assert.equal(log.portions[0].count, 1, 'original untouched')
    assert.equal(trackOps.setPortionCount(log, 'c1', -3).portions[0].count, 0)
  })

  await check('upsertLog: lunch replaces same-date entry; other appends', () => {
    let logs = [trackOps.buildLogFromCard({ componentIds: ['c1'] }, '2026-01-05')]
    const replacement = trackOps.buildLogFromCard({ componentIds: ['c1', 'c2'] }, '2026-01-05')
    logs = trackOps.upsertLog(logs, replacement)
    assert.equal(logs.length, 1)
    assert.deepEqual(logs[0], replacement)

    logs = trackOps.upsertLog(logs, trackOps.buildLogFromCard({ componentIds: ['c3'] }, '2026-01-05', 'other'))
    assert.equal(logs.length, 2, 'other meal appends instead of replacing')
  })

  await check('removeLogAt / logFor: index-based remove and date+meal lookup', () => {
    const logs = [
      trackOps.buildLogFromCard({ componentIds: ['c1'] }, '2026-01-05'),
      trackOps.buildLogFromCard({ componentIds: ['c2'] }, '2026-01-06'),
    ]
    const found = trackOps.logFor(logs, '2026-01-06', 'lunch')
    assert.equal(found.index, 1)
    assert.equal(trackOps.logFor(logs, '2026-01-07', 'lunch'), null)
    assert.equal(trackOps.removeLogAt(logs, 0).length, 1)
    assert.equal(trackOps.removeLogAt(logs, 0)[0].date, '2026-01-06')
  })

  await check('logsForWeek: only dates within that week\'s Mon-Fri', () => {
    const logs = [
      trackOps.buildLogFromCard({ componentIds: [] }, '2026-01-05'), // Mon in week
      trackOps.buildLogFromCard({ componentIds: [] }, '2026-01-09'), // Fri in week
      trackOps.buildLogFromCard({ componentIds: [] }, '2026-01-10'), // Sat, out
      trackOps.buildLogFromCard({ componentIds: [] }, '2026-01-12'), // next week
    ]
    assert.equal(trackOps.logsForWeek(logs, '2026-01-04').length, 2)
  })

  // ==== trackOps.js: gauges ====

  const chickenBowl = component({ id: 'chicken', type: 'protein', macrosPerServing: { kcal: 300, protein_g: 30, carbs_g: 5, fat_g: 10 }, macroSource: 'ai_estimate' })
  const riceBase = component({ id: 'rice', type: 'base', macrosPerServing: { kcal: 200, protein_g: 4, carbs_g: 45, fat_g: 1 }, macroSource: 'manual' })
  const veg = component({ id: 'veg', type: 'veg', macrosPerServing: { kcal: 50, protein_g: 2, carbs_g: 10, fat_g: 0 }, macroSource: 'seed_table' })
  const mysteryPaste = component({ id: 'mystery', type: 'sauce', macrosPerServing: null })
  const gaugeComponents = [chickenBowl, riceBase, veg, mysteryPaste]

  await check('logMacros: 1.5x portions sum, unknown-macro portion counts as missing not zero', () => {
    let log = trackOps.buildLogFromCard({ componentIds: ['chicken', 'rice', 'mystery'] }, '2026-01-05')
    log = trackOps.setPortionCount(log, 'chicken', 1.5)
    const macros = trackOps.logMacros(log, gaugeComponents)
    assert.equal(macros.protein_g, 30 * 1.5 + 4 * 1)
    assert.equal(macros.kcal, 300 * 1.5 + 200 * 1)
    assert.equal(macros.missing, 1)
  })

  await check('proteinByDay: per-day totals, logged flag, hasMissing flag', () => {
    let logs = [trackOps.buildLogFromCard({ componentIds: ['chicken', 'mystery'] }, '2026-01-05')]
    const days = trackOps.proteinByDay(logs, gaugeComponents, '2026-01-04')
    assert.equal(days[0].day, 'Mon')
    assert.equal(days[0].protein_g, 30)
    assert.equal(days[0].logged, true)
    assert.equal(days[0].hasMissing, true)
    assert.equal(days[1].logged, false)
    assert.equal(days[1].protein_g, 0)
  })

  await check('plateMix: fractions sum to 1, base->carbs / protein->protein / veg->veg / sauce->other', () => {
    const logs = [trackOps.buildLogFromCard({ componentIds: ['chicken', 'rice', 'veg', 'mystery'] }, '2026-01-05')]
    const mix = trackOps.plateMix(logs, gaugeComponents)
    assert.equal(mix.protein, 0.25)
    assert.equal(mix.carbs, 0.25)
    assert.equal(mix.veg, 0.25)
    assert.equal(mix.other, 0.25)
    assert.equal(mix.protein + mix.carbs + mix.veg + mix.other, 1)
  })

  await check('plateMix: null when no lunch portions logged', () => {
    assert.equal(trackOps.plateMix([], gaugeComponents), null)
    const otherOnly = [trackOps.buildLogFromCard({ componentIds: ['chicken'] }, '2026-01-05', 'other')]
    assert.equal(trackOps.plateMix(otherOnly, gaugeComponents), null)
  })

  await check('lunchStreak: consecutive weekdays, weekend does not break, unlogged today does not break', () => {
    // Mon 1/5 .. Thu 1/8 logged; Fri 1/9 unlogged (today).
    const partialWeek = ['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08'].map((d) =>
      trackOps.buildLogFromCard({ componentIds: ['chicken'] }, d),
    )
    assert.equal(trackOps.lunchStreak(partialWeek, '2026-01-09'), 4, 'unlogged today should not break the streak')

    // Mon 1/5 .. Fri 1/9 all logged; check spans the weekend into the next Monday.
    const fullWeek = ['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09'].map((d) =>
      trackOps.buildLogFromCard({ componentIds: ['chicken'] }, d),
    )
    assert.equal(trackOps.lunchStreak(fullWeek, '2026-01-10'), 5, 'checked on Saturday: weekend does not break it')
    assert.equal(trackOps.lunchStreak(fullWeek, '2026-01-12'), 5, 'checked on next unlogged Monday: still spans the weekend')
  })

  await check('lunchStreak: a missed weekday breaks it', () => {
    const logs = [
      trackOps.buildLogFromCard({ componentIds: ['chicken'] }, '2026-01-05'),
      // 1/6 missed
      trackOps.buildLogFromCard({ componentIds: ['chicken'] }, '2026-01-07'),
      trackOps.buildLogFromCard({ componentIds: ['chicken'] }, '2026-01-08'),
    ]
    assert.equal(trackOps.lunchStreak(logs, '2026-01-08'), 2)
  })

  await check('moneySaved: week vs all-time from lunch count x boughtLunchCost', () => {
    const settings = schema.createSettings({ boughtLunchCost: 12 })
    const logs = [
      trackOps.buildLogFromCard({ componentIds: [] }, '2026-01-05'), // this week
      trackOps.buildLogFromCard({ componentIds: [] }, '2026-01-06'), // this week
      trackOps.buildLogFromCard({ componentIds: [] }, '2025-12-01'), // prior week
    ]
    const result = trackOps.moneySaved(logs, settings, '2026-01-04')
    assert.equal(result.week, 24)
    assert.equal(result.allTime, 36)
  })

  await check('estimateFraction: threshold both sides of 50%, unknown-macro portions excluded', () => {
    const majorityEstimate = [trackOps.buildLogFromCard({ componentIds: ['chicken', 'veg', 'mystery'] }, '2026-01-05')]
    const est = trackOps.estimateFraction(majorityEstimate, gaugeComponents)
    assert.equal(est.fraction, 1, 'both resolvable portions are ai_estimate/seed_table')
    assert.equal(est.showHint, true)

    const minorityEstimate = [trackOps.buildLogFromCard({ componentIds: ['chicken', 'rice'] }, '2026-01-05')]
    const est2 = trackOps.estimateFraction(minorityEstimate, gaugeComponents)
    assert.equal(est2.fraction, 0.5)
    assert.equal(est2.showHint, false, 'exactly 50% does not trigger the hint')
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
    const log = trackOps.buildLogFromCard({ componentIds: ['c1'] }, '2026-01-05')
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

  // ==== gate 3: feedback flows verbatim into the compiled prompt ====

  await check('gate 3: latest weekOf feedback appears verbatim in compileWeekPrompt output', () => {
    const settings = schema.createSettings()
    let feedback = trackOps.upsertFeedback(
      [],
      schema.createWeeklyFeedback({
        weekOf: '2026-01-04',
        repeatWorthy: 'chicken bowl UNIQUE_MARKER_1',
        diedUneaten: 'mystery paste UNIQUE_MARKER_2',
        boredomNotes: 'too much rice UNIQUE_MARKER_3',
      }),
    )
    let prompt = promptCompiler.compileWeekPrompt(
      { pantry: [], components: [], feedback, settings },
      { servings: 5, cook: true, refresh: true, notes: '', weekOf: '2026-01-11' },
    )
    assert.ok(prompt.includes('chicken bowl UNIQUE_MARKER_1'))
    assert.ok(prompt.includes('mystery paste UNIQUE_MARKER_2'))
    assert.ok(prompt.includes('too much rice UNIQUE_MARKER_3'))

    // A newer feedback record must win even if inserted before an older one elsewhere.
    feedback = trackOps.upsertFeedback(
      feedback,
      schema.createWeeklyFeedback({ weekOf: '2026-01-11', repeatWorthy: 'NEWEST_MARKER' }),
    )
    prompt = promptCompiler.compileWeekPrompt(
      { pantry: [], components: [], feedback, settings },
      { servings: 5, cook: true, refresh: true, notes: '', weekOf: '2026-01-18' },
    )
    assert.ok(prompt.includes('NEWEST_MARKER'))
    assert.ok(!prompt.includes('chicken bowl UNIQUE_MARKER_1'), 'only the latest weekOf feedback is embedded')
  })

  console.log(`\n${passed} checks passed.`)
} catch (err) {
  console.error(`\nFAILED after ${passed} checks:`)
  console.error(err)
  process.exit(1)
}

// Zero-dependency Node smoke test for Phase 4 (Planner). Shims localStorage,
// then exercises weekOps.js against the Phase-4 gates plus a storage
// export/import round-trip of an edited week. Run with:
//   node scripts/smoke-phase4.mjs

import assert from 'node:assert/strict'
import * as schema from '../src/schema.js'
import * as storage from '../src/storage.js'
import * as weekOps from '../src/weekOps.js'

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

function goldenWeek() {
  return schema.createWeekPlan({
    weekOf: '2026-07-19',
    componentIds: ['base_1', 'sauce_1', 'protein_1', 'veg_1', 'sauce_2'],
    runSheet: [
      { t: '0:05', station: 'instant_pot', action: 'Start rice', componentId: 'base_1', done: false },
      { t: '0:10', station: 'stovetop', action: 'Sear protein', componentId: 'protein_1', done: false },
      { t: '0:15', station: 'none', action: 'Whisk sauce', componentId: 'sauce_1', done: false },
      { t: '0:20', station: 'stovetop', action: 'Saute veg', componentId: 'veg_1', done: false },
    ],
    assembly: [
      { day: 'Mon', componentIds: ['base_1', 'sauce_1'], note: 'add cucumber' },
      { day: 'Tue', componentIds: ['base_1', 'protein_1'], note: 'extra chili' },
      { day: 'Wed', componentIds: ['veg_1', 'sauce_1'], note: '' },
      { day: 'Thu', componentIds: ['protein_1', 'sauce_2'], note: 'lime wedge' },
      { day: 'Fri', componentIds: ['base_1', 'veg_1'], note: '' },
    ],
    refresh: { day: 'Wed', steps: ['Make a fresh sauce'], componentIds: ['sauce_2'] },
    grocerySuggestions: [
      { name: 'Cucumber', qty: '2', dismissed: false },
      { name: 'Lime', qty: '3', dismissed: false },
    ],
  })
}

try {
  // ==== Gate 1: run sheet ====

  await check('toggleRunSheetStep flips done immutably, leaves other steps untouched', () => {
    const week = goldenWeek()
    const next = weekOps.toggleRunSheetStep(week, 1)
    assert.notEqual(next, week)
    assert.equal(next.runSheet[1].done, true)
    assert.equal(week.runSheet[1].done, false, 'original must be untouched')
    assert.equal(next.runSheet[0].done, false)
    assert.equal(next.runSheet[2].done, false)
  })

  await check('toggle persists across a simulated reload via storage set/get', async () => {
    await storage.resetState()
    const week = goldenWeek()
    await storage.set('weeks', [week])
    let stored = (await storage.get('weeks'))[0]
    const toggled = weekOps.toggleRunSheetStep(stored, 0)
    await storage.set('weeks', weekOps.replaceWeek(await storage.get('weeks'), toggled))
    stored = (await storage.get('weeks'))[0]
    assert.equal(stored.runSheet[0].done, true)
  })

  await check('groupRunSheetByStation keeps within-group order and original indexes', () => {
    const week = goldenWeek()
    const groups = weekOps.groupRunSheetByStation(week.runSheet)
    const stovetop = groups.find((g) => g.station === 'stovetop')
    assert.deepEqual(
      stovetop.steps.map((s) => s.index),
      [1, 3],
    )
    assert.equal(stovetop.steps[0].step.action, 'Sear protein')
    const instantPot = groups.find((g) => g.station === 'instant_pot')
    assert.equal(instantPot.steps[0].index, 0)
  })

  await check('runSheetProgress counts done/total correctly', () => {
    let week = goldenWeek()
    assert.deepEqual(weekOps.runSheetProgress(week), { done: 0, total: 4 })
    week = weekOps.toggleRunSheetStep(week, 0)
    week = weekOps.toggleRunSheetStep(week, 2)
    assert.deepEqual(weekOps.runSheetProgress(week), { done: 2, total: 4 })
  })

  // ==== Gate 2a: swap ====

  await check('swapAssemblyDays exchanges contents+note, day labels/order unchanged', () => {
    const week = goldenWeek()
    const next = weekOps.swapAssemblyDays(week, 'Tue', 'Thu')
    assert.deepEqual(
      next.assembly.map((a) => a.day),
      ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    )
    const tue = next.assembly.find((a) => a.day === 'Tue')
    const thu = next.assembly.find((a) => a.day === 'Thu')
    assert.deepEqual(tue.componentIds, ['protein_1', 'sauce_2'])
    assert.equal(tue.note, 'lime wedge')
    assert.deepEqual(thu.componentIds, ['base_1', 'protein_1'])
    assert.equal(thu.note, 'extra chili')
  })

  await check('double-swap restores the original week', () => {
    const week = goldenWeek()
    const once = weekOps.swapAssemblyDays(week, 'Tue', 'Thu')
    const twice = weekOps.swapAssemblyDays(once, 'Tue', 'Thu')
    assert.deepEqual(twice.assembly, week.assembly)
  })

  await check('swapAssemblyDays with an unknown day is a no-op', () => {
    const week = goldenWeek()
    const next = weekOps.swapAssemblyDays(week, 'Tue', 'Sat')
    assert.deepEqual(next, week)
  })

  // ==== Gate 2b: substitute ====

  await check('substituteComponent replaces on one day only', () => {
    const week = goldenWeek()
    const next = weekOps.substituteComponent(week, 'Mon', 'sauce_1', 'sauce_new')
    const mon = next.assembly.find((a) => a.day === 'Mon')
    const wed = next.assembly.find((a) => a.day === 'Wed')
    assert.deepEqual(mon.componentIds, ['base_1', 'sauce_new'])
    assert.deepEqual(wed.componentIds, ['veg_1', 'sauce_1'], 'other days referencing sauce_1 must be untouched')
  })

  await check('componentIds union drops the old id only when nothing else references it', () => {
    const week = goldenWeek()
    // sauce_1 is referenced by runSheet, Mon, and Wed — substituting Mon only must keep sauce_1 in the union.
    let next = weekOps.substituteComponent(week, 'Mon', 'sauce_1', 'sauce_new')
    assert.ok(next.componentIds.includes('sauce_1'), 'still referenced by Wed and runSheet')
    assert.ok(next.componentIds.includes('sauce_new'))

    // Now substitute it away from Wed too — still referenced by runSheet, so it must survive.
    next = weekOps.substituteComponent(next, 'Wed', 'sauce_1', 'sauce_new')
    assert.ok(next.componentIds.includes('sauce_1'), 'still referenced by runSheet')

    assert.deepEqual(schema.validate(next, 'WeekPlan'), [])
  })

  // ==== add/remove ====

  await check('addComponentToDay appends and dedupes', () => {
    const week = goldenWeek()
    let next = weekOps.addComponentToDay(week, 'Mon', 'finisher_1')
    assert.deepEqual(next.assembly.find((a) => a.day === 'Mon').componentIds, ['base_1', 'sauce_1', 'finisher_1'])
    assert.ok(next.componentIds.includes('finisher_1'))
    const again = weekOps.addComponentToDay(next, 'Mon', 'finisher_1')
    assert.deepEqual(again, next, 'adding an already-present id must be a no-op')
  })

  await check('removeComponentFromDay removes and union stays correct', () => {
    const week = goldenWeek()
    const next = weekOps.removeComponentFromDay(week, 'Thu', 'sauce_2')
    assert.deepEqual(next.assembly.find((a) => a.day === 'Thu').componentIds, ['protein_1'])
    // sauce_2 is still referenced by refresh.componentIds, so it must survive the union.
    assert.ok(next.componentIds.includes('sauce_2'))
    assert.deepEqual(schema.validate(next, 'WeekPlan'), [])
  })

  // ==== Gate 3: grocery ====

  await check('dismissAllGroceries touches only grocerySuggestions[].dismissed', () => {
    const week = goldenWeek()
    const next = weekOps.dismissAllGroceries(week)
    assert.ok(next.grocerySuggestions.every((g) => g.dismissed === true))
    const { grocerySuggestions: nextGroceries, ...nextRest } = next
    const { grocerySuggestions: origGroceries, ...origRest } = week
    assert.deepEqual(nextRest, origRest, 'every other field must be unchanged')
    assert.deepEqual(
      nextGroceries.map((g) => ({ name: g.name, qty: g.qty })),
      origGroceries.map((g) => ({ name: g.name, qty: g.qty })),
    )
  })

  await check('toggleGrocerySuggestion flips a single item and is re-toggleable', () => {
    const week = goldenWeek()
    let next = weekOps.toggleGrocerySuggestion(week, 0)
    assert.equal(next.grocerySuggestions[0].dismissed, true)
    assert.equal(next.grocerySuggestions[1].dismissed, false)
    next = weekOps.toggleGrocerySuggestion(next, 0)
    assert.equal(next.grocerySuggestions[0].dismissed, false)
  })

  // ==== replaceWeek ====

  await check('replaceWeek swaps only the week with the matching weekOf', () => {
    const weekA = goldenWeek()
    const weekB = schema.createWeekPlan({ weekOf: '2026-07-12' })
    const updatedA = weekOps.toggleRunSheetStep(weekA, 0)
    const next = weekOps.replaceWeek([weekB, weekA], updatedA)
    assert.equal(next.length, 2)
    assert.equal(next[1].runSheet[0].done, true)
    assert.equal(next[0], weekB)
  })

  // ==== export/import round-trip ====

  await check('edited week survives export -> wipe -> import round-trip', async () => {
    await storage.resetState()
    const week = goldenWeek()
    await storage.set('weeks', [week])
    let stored = (await storage.get('weeks'))[0]
    let edited = weekOps.toggleRunSheetStep(stored, 0)
    edited = weekOps.swapAssemblyDays(edited, 'Tue', 'Thu')
    edited = weekOps.dismissAllGroceries(edited)
    await storage.set('weeks', weekOps.replaceWeek(await storage.get('weeks'), edited))

    const exported = await storage.exportState()
    await storage.resetState()
    const importResult = await storage.importState(exported)
    assert.equal(importResult.ok, true, `unexpected errors: ${JSON.stringify(importResult.errors)}`)

    const roundTripped = (await storage.get('weeks'))[0]
    assert.equal(roundTripped.runSheet[0].done, true)
    assert.deepEqual(roundTripped.assembly.find((a) => a.day === 'Tue').componentIds, ['protein_1', 'sauce_2'])
    assert.ok(roundTripped.grocerySuggestions.every((g) => g.dismissed === true))
  })

  console.log(`\n${passed} checks passed.`)
} catch (err) {
  console.error(`\nFAILED after ${passed} checks:`)
  console.error(err)
  process.exit(1)
}

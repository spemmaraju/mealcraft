// Zero-dependency Node smoke test for Round 4 ("lightweight plan editing"):
// weekOps.emptyWeek/addComponentToPlan (the "Add dish to plan" flow without
// the AI round trip) and addSheetOps' hasPlanCard flag (the empty "From
// plan" CTA's underlying decision). No DOM. Run with:
//   node scripts/smoke-round4.mjs

import assert from 'node:assert/strict'
import * as schema from '../src/schema.js'
import * as weekOps from '../src/weekOps.js'
import { buildAddSheetData } from '../src/addSheetOps.js'

let passed = 0
async function check(label, fn) {
  await fn()
  passed++
  console.log(`ok - ${label}`)
}

try {
  // ==== weekOps.emptyWeek ====

  await check('emptyWeek: minimal valid WeekPlan, 5 empty Mon-Fri assembly cards', () => {
    const week = weekOps.emptyWeek('2026-07-19')
    assert.deepEqual(week.assembly.map((a) => a.day), ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'])
    assert.ok(week.assembly.every((a) => a.componentIds.length === 0 && a.note === ''))
    assert.deepEqual(week.componentIds, [])
    assert.deepEqual(week.runSheet, [])
    assert.deepEqual(week.grocerySuggestions, [])
    assert.equal(week.weekOf, '2026-07-19')
    assert.deepEqual(schema.validate(week, 'WeekPlan'), [])
  })

  // ==== weekOps.addComponentToPlan ====

  await check('addComponentToPlan: appends to each chosen day and to week.componentIds', () => {
    const week = weekOps.emptyWeek('2026-07-19')
    const next = weekOps.addComponentToPlan(week, 'dish_1', ['Mon', 'Wed'])
    assert.deepEqual(next.assembly.find((a) => a.day === 'Mon').componentIds, ['dish_1'])
    assert.deepEqual(next.assembly.find((a) => a.day === 'Wed').componentIds, ['dish_1'])
    assert.deepEqual(next.assembly.find((a) => a.day === 'Tue').componentIds, [], 'untouched days stay empty')
    assert.deepEqual(next.componentIds, ['dish_1'])
    assert.notEqual(next, week, 'pure — returns a new object')
  })

  await check('addComponentToPlan: dedupes — re-adding the same dish to the same day is a no-op', () => {
    const week = weekOps.emptyWeek('2026-07-19')
    const once = weekOps.addComponentToPlan(week, 'dish_1', ['Mon'])
    const twice = weekOps.addComponentToPlan(once, 'dish_1', ['Mon'])
    assert.deepEqual(twice.assembly.find((a) => a.day === 'Mon').componentIds, ['dish_1'])
    assert.deepEqual(twice.componentIds, ['dish_1'])
  })

  await check('addComponentToPlan: adding to an existing (non-empty) week only touches the chosen days', () => {
    const week = schema.createWeekPlan({
      weekOf: '2026-07-19',
      componentIds: ['base_1'],
      assembly: [
        { day: 'Mon', componentIds: ['base_1'], note: '' },
        { day: 'Tue', componentIds: [], note: '' },
        { day: 'Wed', componentIds: [], note: '' },
        { day: 'Thu', componentIds: [], note: '' },
        { day: 'Fri', componentIds: [], note: '' },
      ],
    })
    const next = weekOps.addComponentToPlan(week, 'dish_new', ['Tue', 'Fri'])
    assert.deepEqual(next.assembly.find((a) => a.day === 'Mon').componentIds, ['base_1'], 'Mon untouched')
    assert.deepEqual(next.assembly.find((a) => a.day === 'Tue').componentIds, ['dish_new'])
    assert.deepEqual(next.assembly.find((a) => a.day === 'Fri').componentIds, ['dish_new'])
    assert.deepEqual(next.componentIds.sort(), ['base_1', 'dish_new'].sort())
  })

  await check('addComponentToPlan: an unknown day is a silent no-op (never throws)', () => {
    const week = weekOps.emptyWeek('2026-07-19')
    const next = weekOps.addComponentToPlan(week, 'dish_1', ['Sat'])
    assert.deepEqual(next.componentIds, [])
  })

  // ==== addSheetOps.buildAddSheetData: hasPlanCard ====

  function logEntry(date, meal, items) {
    return schema.createLogEntry({ date, meal, items })
  }

  await check('buildAddSheetData: hasPlanCard is false with no card at all (no week / no card for today)', () => {
    const { hasPlanCard } = buildAddSheetData({ card: null, components: [], pantry: [], logs: [], today: '2026-07-22', query: '', existingComponentIds: [] })
    assert.equal(hasPlanCard, false)
  })

  await check('buildAddSheetData: hasPlanCard is false when today\'s card has no components yet', () => {
    const card = { day: 'Wed', componentIds: [], note: '' }
    const { hasPlanCard } = buildAddSheetData({ card, components: [], pantry: [], logs: [], today: '2026-07-22', query: '', existingComponentIds: [] })
    assert.equal(hasPlanCard, false)
  })

  await check('buildAddSheetData: hasPlanCard is true once a dish is on today\'s card, regardless of query', () => {
    const components = [schema.createComponent({ id: 'dish_1', name: 'Oat Banana Breakfast', type: 'dish' })]
    const card = { day: 'Wed', componentIds: ['dish_1'], note: '' }
    const withoutQuery = buildAddSheetData({ card, components, pantry: [], logs: [], today: '2026-07-22', query: '', existingComponentIds: [] })
    const withQuery = buildAddSheetData({ card, components, pantry: [], logs: [], today: '2026-07-22', query: 'zzz-no-match', existingComponentIds: [] })
    assert.equal(withoutQuery.hasPlanCard, true)
    assert.equal(withQuery.hasPlanCard, true, 'a non-matching search still leaves hasPlanCard true — only planRows should be filtered')
    assert.equal(withQuery.groups.find((g) => g.key === 'plan').rows.length, 0, 'but the plan GROUP is search-filtered as usual')
  })

  console.log(`\n${passed} checks passed.`)
} catch (err) {
  console.error(`\nFAILED after ${passed} checks:`)
  console.error(err)
  process.exit(1)
}

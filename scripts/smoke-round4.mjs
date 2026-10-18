// Zero-dependency Node smoke test for Round 4: addSheetOps' hasPlanCard flag
// (the empty "From plan" CTA's underlying decision). No DOM. Run with:
//   node scripts/smoke-round4.mjs
// (Phase 17: the weekOps.emptyWeek/addComponentToPlan checks went with
// weekOps.js itself, removed in Plan P1.)

import assert from 'node:assert/strict'
import * as schema from '../src/schema.js'
import { buildAddSheetData } from '../src/addSheetOps.js'

let passed = 0
async function check(label, fn) {
  await fn()
  passed++
  console.log(`ok - ${label}`)
}

try {
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

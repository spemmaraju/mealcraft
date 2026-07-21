// Zero-dependency Node smoke test for Phase 0. Shims localStorage, then
// exercises schema validators and the storage export -> wipe -> import
// round trip. Run with: node scripts/smoke-phase0.mjs

import assert from 'node:assert/strict'
import * as schema from '../src/schema.js'
import * as storage from '../src/storage.js'

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

try {
  // ---- schema.js: factories + validators ----

  await check('createPantryItem() produces a record with no validation errors', () => {
    const item = schema.createPantryItem({ name: 'Tofu', category: 'Proteins' })
    assert.deepEqual(schema.validate(item, 'PantryItem'), [])
  })

  await check('createComponent() produces a record with no validation errors', () => {
    const c = schema.createComponent({ name: 'Chickpea Curry' })
    assert.deepEqual(schema.validate(c, 'Component'), [])
  })

  await check('createWeekPlan / createLogEntry / createWeeklyFeedback / createSettings are all valid', () => {
    assert.deepEqual(schema.validate(schema.createWeekPlan(), 'WeekPlan'), [])
    assert.deepEqual(schema.validate(schema.createLogEntry(), 'LogEntry'), [])
    assert.deepEqual(schema.validate(schema.createWeeklyFeedback(), 'WeeklyFeedback'), [])
    assert.deepEqual(schema.validate(schema.createSettings(), 'Settings'), [])
  })

  await check('validate() names the exact bad field with an actionable message', () => {
    const bad = schema.createPantryItem({ onHand: 'yes' })
    const errors = schema.validate(bad, 'PantryItem')
    assert.equal(errors.length, 1)
    assert.equal(errors[0], 'onHand: expected boolean, got "yes"')
  })

  await check('validate() catches nested NutritionInfo errors on a PantryItem', () => {
    const bad = schema.createPantryItem({ nutrition: { ...schema.createNutritionInfo(), source: 'made_up' } })
    const errors = schema.validate(bad, 'PantryItem')
    assert.ok(errors.some((e) => e.startsWith('nutrition.source:')))
  })

  // ---- storage.js: export -> wipe -> import round trip ----

  await check('export -> wipe -> import restores identical state (deep equal)', async () => {
    await storage.set('pantry', [schema.createPantryItem({ name: 'Paneer', category: 'Dairy', onHand: true })])
    await storage.set('components', [schema.createComponent({ name: 'Basmati Rice' })])
    await storage.set('settings', schema.createSettings({ boughtLunchCost: 14 }))

    const before = await storage.getFullState()
    const exported = await storage.exportState()

    await storage.resetState()
    const wiped = await storage.getFullState()
    assert.notDeepEqual(wiped.pantry, before.pantry)

    const result = await storage.importState(exported)
    assert.equal(result.ok, true)

    const after = await storage.getFullState()
    assert.deepEqual(after, before)
  })

  await check('malformed import is rejected with a field-naming error and leaves state untouched', async () => {
    const before = await storage.getFullState()

    const parsed = JSON.parse(await storage.exportState())
    parsed.pantry[0].onHand = 'yes'
    const result = await storage.importState(JSON.stringify(parsed))

    assert.equal(result.ok, false)
    assert.ok(result.errors.some((e) => e.includes('pantry[0].onHand')))

    const after = await storage.getFullState()
    assert.deepEqual(after, before)
  })

  await check('unparseable JSON is rejected with a human-readable error and leaves state untouched', async () => {
    const before = await storage.getFullState()
    const result = await storage.importState('{ this is not json')
    assert.equal(result.ok, false)
    assert.ok(result.errors[0].includes('could not parse'))
    const after = await storage.getFullState()
    assert.deepEqual(after, before)
  })

  console.log(`\n${passed} checks passed.`)
} catch (err) {
  console.error(`\nFAILED after ${passed} checks:`)
  console.error(err)
  process.exit(1)
}

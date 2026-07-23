// Zero-dependency Node smoke test for Phase 15 (multi-meal flexible
// logging, schema v8). Shims localStorage, same pattern as
// scripts/smoke-phase5.mjs. trackOps.js's day-to-day API (buildLogFromCard,
// setItemCount, logMacros, dayMacros, plateMix, estimateFraction, ...) is
// exercised in the updated scripts/smoke-phase5.mjs; this file focuses on
// what's new here: the v7->v8 migration and the discriminated-union schema.
// Run with:
//   node scripts/smoke-phase15.mjs

import assert from 'node:assert/strict'
import * as schema from '../src/schema.js'
import * as storage from '../src/storage.js'
import * as trackOps from '../src/trackOps.js'
import { findSeedForName } from '../src/nutritionSeeds.js'

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

function v7State(overrides = {}) {
  return {
    schemaVersion: 7,
    categories: ['Legumes'],
    pantry: [],
    components: [],
    weeks: [],
    logs: [],
    feedback: [],
    settings: {
      proteinBand: { low_g: 20, high_g: 35 },
      boughtLunchCost: 12,
      apiMode: 'paste',
      provider: 'anthropic',
      apiKey: null,
      fdcKey: null,
      lastExportAt: null,
      cookDay: 'Sun',
      refreshDay: 'Wed',
    },
    ...overrides,
  }
}

try {
  // ==== v7 -> v8 migration ====

  await check('v7 lunch + two same-date "other" logs merge into one lunch + one merged snack', async () => {
    await storage.resetState()
    const v7 = v7State({
      logs: [
        { date: '2026-01-05', meal: 'lunch', componentIds: ['c1'], portions: [{ componentId: 'c1', naturalUnitLabel: 'serving', count: 1 }], quickRating: 'repeat' },
        { date: '2026-01-05', meal: 'other', componentIds: ['c2'], portions: [{ componentId: 'c2', naturalUnitLabel: 'serving', count: 1 }], quickRating: null },
        { date: '2026-01-05', meal: 'other', componentIds: ['c3'], portions: [{ componentId: 'c3', naturalUnitLabel: 'serving', count: 2 }], quickRating: null },
      ],
    })
    const result = await storage.importState(JSON.stringify(v7))
    assert.equal(result.ok, true, `unexpected errors: ${JSON.stringify(result.errors)}`)

    const logs = await storage.get('logs')
    assert.equal(logs.length, 2, 'lunch + one merged snack, not three entries')

    const lunch = logs.find((l) => l.meal === 'lunch')
    assert.deepEqual(lunch.items, [{ kind: 'component', componentId: 'c1', count: 1 }])
    assert.equal(lunch.quickRating, 'repeat')
    assert.ok(!('componentIds' in lunch) && !('portions' in lunch), 'legacy keys must be gone')

    const snack = logs.find((l) => l.meal === 'snack')
    assert.deepEqual(snack.items, [
      { kind: 'component', componentId: 'c2', count: 1 },
      { kind: 'component', componentId: 'c3', count: 2 },
    ])
    assert.ok(!('componentIds' in snack) && !('portions' in snack), 'legacy keys must be gone')
  })

  await check('proteinBand migration: swaps the exact factory default 20/35 -> 60/90', async () => {
    await storage.resetState()
    const result = await storage.importState(JSON.stringify(v7State()))
    assert.equal(result.ok, true, `unexpected errors: ${JSON.stringify(result.errors)}`)
    const settings = await storage.get('settings')
    assert.deepEqual(settings.proteinBand, { low_g: 60, high_g: 90 })
  })

  await check('proteinBand migration: leaves a non-default band untouched (no UI ever shipped, but be safe)', async () => {
    await storage.resetState()
    const custom = v7State({ settings: { ...v7State().settings, proteinBand: { low_g: 25, high_g: 40 } } })
    const result = await storage.importState(JSON.stringify(custom))
    assert.equal(result.ok, true, `unexpected errors: ${JSON.stringify(result.errors)}`)
    const settings = await storage.get('settings')
    assert.deepEqual(settings.proteinBand, { low_g: 25, high_g: 40 })
  })

  // ==== schema.js: LogEntry discriminated union ====

  await check('validate(LogEntry) accepts all three item kinds and rejects an unknown kind', () => {
    const entry = schema.createLogEntry({
      date: '2026-01-05',
      meal: 'dinner',
      items: [
        { kind: 'component', componentId: 'c1', count: 1 },
        { kind: 'pantry', pantryId: 'p1', measure: '1 cup' },
        {
          kind: 'adhoc',
          name: 'Restaurant bowl',
          measure: '1 serving',
          nutrition: schema.createNutritionInfo({ perServing: { kcal: 400, protein_g: 20, carbs_g: 40, fat_g: 15 } }),
        },
      ],
    })
    assert.deepEqual(schema.validate(entry, 'LogEntry'), [])

    const bad = schema.createLogEntry({ date: '2026-01-05', meal: 'dinner', items: [{ kind: 'takeout', name: 'x' }] })
    const errors = schema.validate(bad, 'LogEntry')
    assert.ok(errors.length > 0)
    assert.ok(errors[0].includes('kind'))
  })

  await check('createSettings() default proteinBand is the new daily 60/90 band', () => {
    assert.deepEqual(schema.createSettings().proteinBand, { low_g: 60, high_g: 90 })
  })

  // ==== upsertLog identity (date, meal) for every meal, not just lunch ====

  await check('upsertLog: breakfast/dinner/snack all replace-on-match too, not just lunch', () => {
    let logs = [trackOps.buildLogFromCard({ componentIds: ['c1'] }, '2026-01-05', 'dinner')]
    logs = trackOps.upsertLog(logs, trackOps.buildLogFromCard({ componentIds: ['c2'] }, '2026-01-05', 'dinner'))
    assert.equal(logs.length, 1)
    assert.deepEqual(
      logs[0].items.map((i) => i.componentId),
      ['c2'],
    )
  })

  // ==== logMacros against a real seeded pantry item (Phase 13 integration) ====

  await check('logMacros: "1 cup" of pantry-seeded cooked toor dal returns the seed macros', () => {
    const toorDal = schema.createPantryItem({ id: 'p-toor', name: 'Toor dal', nutrition: findSeedForName('toor dal') })
    const log = { date: '2026-01-05', meal: 'dinner', items: [{ kind: 'pantry', pantryId: 'p-toor', measure: '1 cup' }], quickRating: null }
    const macros = trackOps.logMacros(log, [], [toorDal])
    assert.equal(macros.kcal, toorDal.nutrition.perServing.kcal)
    assert.equal(macros.missing, 0)
  })

  await check('logMacros: an unresolvable measure increments missing, not the totals', () => {
    const toorDal = schema.createPantryItem({ id: 'p-toor', name: 'Toor dal', nutrition: findSeedForName('toor dal') })
    const log = { date: '2026-01-05', meal: 'dinner', items: [{ kind: 'pantry', pantryId: 'p-toor', measure: 'a handful' }], quickRating: null }
    const macros = trackOps.logMacros(log, [], [toorDal])
    assert.equal(macros.kcal, 0)
    assert.equal(macros.missing, 1)
  })

  // ==== v6 export imports cleanly through the full v6->v7->v8 chain ====

  await check('a v6 export imports cleanly through the v6->v7->v8 chain', async () => {
    await storage.resetState()
    const v6 = {
      schemaVersion: 6,
      categories: ['Legumes'],
      pantry: [schema.createPantryItem({ name: 'Toor dal', nutrition: null })],
      components: [],
      weeks: [],
      logs: [{ date: '2026-01-05', meal: 'lunch', componentIds: [], portions: [], quickRating: null }],
      feedback: [],
      settings: v7State().settings,
    }
    const result = await storage.importState(JSON.stringify(v6))
    assert.equal(result.ok, true, `unexpected errors: ${JSON.stringify(result.errors)}`)
    const state = await storage.getFullState()
    assert.equal(state.schemaVersion, 8)
    assert.equal(state.pantry[0].nutrition.source, 'seed_table', 'v6->v7 seed backfill still ran')
    assert.deepEqual(state.settings.proteinBand, { low_g: 60, high_g: 90 })
  })

  console.log(`\n${passed} checks passed.`)
} catch (err) {
  console.error(`\nFAILED after ${passed} checks:`)
  console.error(err)
  process.exit(1)
}

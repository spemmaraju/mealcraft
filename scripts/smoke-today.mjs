// Zero-dependency Node smoke test for the Today screen (daily targets,
// fibre, hint, whole-day parse; schema v16). Shims localStorage. No network.
// Run with:
//   node scripts/smoke-today.mjs

import assert from 'node:assert/strict'
import * as schema from '../src/schema.js'
import * as storage from '../src/storage.js'
import { SCHEMA_VERSION, migrate } from '../src/storage.js'
import * as parseOps from '../src/parseOps.js'
import * as todayOps from '../src/todayOps.js'
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

const est = (extra = {}) => ({ kcal: 100, protein_g: 5, carbs_g: 10, fat_g: 1, ...extra })
const grainNutrition = schema.createNutritionInfo({ source: 'manual', servingDesc: '100 g', perServing: est({ fiber_g: 4 }) })
const rice = schema.createPantryItem({ id: 'p_rice', name: 'Brown rice', onHand: true, nutrition: grainNutrition })
const bowl = parseOps.estimateNutrition({ measure: '1 bowl', grams: 100, estimate: est({ fiber_g: 5 }) })
const dish = schema.createComponent({ id: 'c_dish', name: 'Curry', macrosPerServing: { kcal: 400, protein_g: 20, carbs_g: 50, fat_g: 10 } })
const pantry = [rice]
const components = [dish]
const DATE = '2026-11-12'

const settings = schema.createSettings({ kcalBand: { low: 1900, high: 2100 }, proteinBand: { low_g: 95, high_g: 120 }, fiberTarget_g: 30 })
const m = (kcal, protein_g) => ({ kcal, protein_g, carbs_g: 0, fat_g: 0, missing: 0 })

try {
  await check('schema v16: settings default the three new fields to null and validate; targets validate', () => {
    assert.equal(SCHEMA_VERSION, 16)
    const s = schema.createSettings()
    assert.equal(s.profile, null)
    assert.equal(s.kcalBand, null)
    assert.equal(s.fiberTarget_g, null)
    assert.deepEqual(schema.validate(s, 'Settings'), [])
    const set = schema.createSettings({
      profile: { sex: null, age: 30, heightCm: 175, weightKg: 75, activity: 'moderate', goal: 'maintain' },
      kcalBand: { low: 2450, high: 2650 },
      fiberTarget_g: 30,
    })
    assert.deepEqual(schema.validate(set, 'Settings'), [])
    assert.ok(schema.validate(schema.createSettings({ kcalBand: { low: 'x', high: 1 } }), 'Settings').length > 0)
  })

  await check('migration v15 -> v16 adds the three null fields, idempotent', () => {
    const { profile, kcalBand, fiberTarget_g, ...old } = schema.createSettings()
    const v15 = { schemaVersion: 15, settings: old }
    const out = migrate(JSON.parse(JSON.stringify(v15)))
    assert.equal(out.schemaVersion, 16)
    assert.equal(out.settings.profile, null)
    assert.equal(out.settings.kcalBand, null)
    assert.equal(out.settings.fiberTarget_g, null)
    assert.deepEqual(schema.validate(out.settings, 'Settings'), [])
    assert.deepEqual(migrate(JSON.parse(JSON.stringify(out))), out)
  })

  await check('a v15 export still imports', async () => {
    await storage.resetState()
    const state = JSON.parse(JSON.stringify(await storage.getFullState()))
    state.schemaVersion = 15
    delete state.settings.profile
    delete state.settings.kcalBand
    delete state.settings.fiberTarget_g
    const result = await storage.importState(JSON.stringify(state))
    assert.equal(result.ok, true, JSON.stringify(result.errors))
    assert.equal((await storage.get('settings')).kcalBand, null)
  })

  await check('computeTargets: exact numbers, floors, protein cap', () => {
    // Male 30y 175cm 75kg moderate maintain: BMR 750 + 1093.75 - 150 + 5 = 1698.75; x1.5 = 2548.125.
    // kcal low 2448.125 -> 2450, high 2648.125 -> 2650. Protein 1.4*75 = 105, 1.8*75 = 135.
    const t = todayOps.computeTargets({ sex: 'male', age: 30, heightCm: 175, weightKg: 75, activity: 'moderate', goal: 'maintain' })
    assert.deepEqual(t, { kcalBand: { low: 2450, high: 2650 }, proteinBand: { low_g: 105, high_g: 135 }, fiberTarget_g: 30 })
    // Female 40y 165cm 60kg low lose: BMR 600 + 1031.25 - 200 - 161 = 1270.25; x1.35 = 1714.84; -400 = 1314.84 (above 1200 floor).
    // low 1214.84 -> 1200, high 1414.84 -> 1400. Protein 84 -> 85, 108 -> 110.
    const f = todayOps.computeTargets({ sex: 'female', age: 40, heightCm: 165, weightKg: 60, activity: 'low', goal: 'lose' })
    assert.deepEqual(f.kcalBand, { low: 1200, high: 1400 })
    assert.deepEqual(f.proteinBand, { low_g: 85, high_g: 110 })
    // Female floor: 50kg 150cm 60y low lose: 500 + 937.5 - 300 - 161 = 976.5; x1.35 - 400 = 918 -> floor 1200 -> 1100..1300.
    const ff = todayOps.computeTargets({ sex: 'female', age: 60, heightCm: 150, weightKg: 50, activity: 'low', goal: 'lose' })
    assert.deepEqual(ff.kcalBand, { low: 1100, high: 1300 })
    // Male / unspecified floor 1500: 500 + 937.5 - 300 - 78 = 1059.5; x1.35 - 400 = 1030 -> floor 1500 -> 1400..1600.
    const nf = todayOps.computeTargets({ sex: null, age: 60, heightCm: 150, weightKg: 50, activity: 'low', goal: 'lose' })
    assert.deepEqual(nf.kcalBand, { low: 1400, high: 1600 })
    // Protein cap: 120 kg -> 1.8*120 = 216 capped to 180; low 1.4*120 = 168 -> 170.
    const big = todayOps.computeTargets({ sex: 'male', age: 30, heightCm: 190, weightKg: 120, activity: 'high', goal: 'maintain' })
    assert.deepEqual(big.proteinBand, { low_g: 170, high_g: 180 })
  })

  await check('dayFiber: pantry + adhoc scaled by measure; dishes and other days contribute 0', () => {
    const logs = [
      schema.createLogEntry({
        date: DATE,
        meal: 'lunch',
        items: [
          { kind: 'pantry', pantryId: 'p_rice', measure: '200 g' }, // 2 servings x 4 = 8
          { kind: 'adhoc', name: 'Salad', measure: '1 bowl', nutrition: bowl }, // 5
          { kind: 'component', componentId: 'c_dish', count: 2 }, // 0
        ],
      }),
      schema.createLogEntry({ date: '2026-11-11', meal: 'lunch', items: [{ kind: 'pantry', pantryId: 'p_rice', measure: '100 g' }] }),
    ]
    assert.equal(todayOps.dayFiber(logs, components, pantry, DATE), 13)
    assert.equal(todayOps.dayFiber([], components, pantry, DATE), 0)
    // dayMacros is untouched: no fiber key leaks into its shape.
    assert.deepEqual(Object.keys(trackOps.dayMacros(logs, components, pantry, DATE)).sort(), ['carbs_g', 'fat_g', 'kcal', 'missing', 'protein_g'])
  })

  await check('todayHint: null band, nothing logged, left, protein-light, over, protein met, fibre late', () => {
    const hint = (macros, fiber_g, hour, s = settings) => todayOps.todayHint({ macros, fiber_g, settings: s, hour })
    assert.equal(hint(m(500, 20), 0, 10, schema.createSettings()), null)
    assert.equal(hint(m(0, 0), 0, 10), 'Nothing logged yet today.')
    assert.equal(hint(m(1500, 40), 20, 10), 'About 600 kcal and 55 g protein left — make your next meal protein-heavy.')
    assert.equal(hint(m(1500, 80), 20, 10), 'About 600 kcal and 15 g protein left.')
    assert.equal(hint(m(2300, 100), 20, 10), "You're about 200 kcal over today — keep the rest light.")
    assert.equal(hint(m(1000, 100), 20, 10), 'About 1,100 kcal left. Protein target met.')
    assert.ok(hint(m(1500, 40), 5, 16).endsWith(' Fibre is low — add veg, dal or fruit.'))
    assert.ok(!hint(m(1500, 40), 5, 10).includes('Fibre'), 'morning: no fibre nag')
    assert.ok(!hint(m(1500, 40), 20, 16).includes('Fibre'), 'fibre at/over half: no nag')
    assert.ok(!hint(m(1500, 40), 5, 16).includes('!'))
  })

  await check('addMealGroups: two groups persist, existing entry merged, where set', () => {
    const existing = schema.createLogEntry({ date: DATE, meal: 'lunch', items: [{ kind: 'pantry', pantryId: 'p_rice', measure: '1 cup' }] })
    const other = schema.createLogEntry({ date: '2026-11-11', meal: 'lunch', items: [] })
    const a = { kind: 'adhoc', name: 'Idli', measure: '1 bowl', nutrition: bowl }
    const b = { kind: 'adhoc', name: 'Burrito', measure: '1 bowl', nutrition: bowl }
    const c = { kind: 'adhoc', name: 'Apple', measure: '1 bowl', nutrition: bowl }
    const logs = [other, existing]
    const out = todayOps.addMealGroups(logs, DATE, [
      { meal: 'breakfast', items: [a] },
      { meal: 'lunch', items: [b], where: 'out' },
      { meal: 'snack', items: [] },
      { meal: 'breakfast', items: [c] },
    ])
    assert.equal(logs.length, 2, 'input not mutated')
    assert.equal(out.length, 3)
    assert.equal(trackOps.logFor(out, DATE, 'breakfast').log.items.length, 2, 'same-meal groups accumulate')
    const lunch = trackOps.logFor(out, DATE, 'lunch').log
    assert.equal(lunch.items.length, 2)
    assert.equal(lunch.where, 'out')
    assert.equal(trackOps.logFor(out, DATE, 'snack'), null, 'empty group adds nothing')
    for (const l of out) assert.deepEqual(schema.validate(l, 'LogEntry'), [])
  })

  await check('groupRowsByMeal: default meal, order, where out', () => {
    const [r1, r2, r3, r4] = parseOps.buildDraftRows(
      ['Dal', 'Burrito', 'Toast', 'Apple'].map((name) => ({ name, measure: '1 bowl', grams: 100, pantryId: null, suggestedMatch: null, estimate: est() })),
      [],
    )
    const rows = [
      { ...r1, meal: 'dinner' },
      { ...r2, meal: 'lunch', ateOut: true },
      { ...r3, meal: 'breakfast' },
      { ...r4, meal: null },
    ]
    const groups = todayOps.groupRowsByMeal(rows, 'snack')
    assert.deepEqual(groups.map((g) => g.meal), ['breakfast', 'lunch', 'dinner', 'snack'])
    assert.equal(groups[1].where, 'out')
    assert.equal(groups[0].where, undefined)
    assert.equal(groups[3].items[0].name, 'Apple')
  })

  await check("day-mode prompt carries the meal / ateOut / fiber_g rules; other modes ask for fiber_g only", () => {
    const day = parseOps.compileParsePrompt({ text: 'idli for breakfast, burrito at Chipotle', pantry: [], mode: 'day' })
    assert.ok(day.includes('several meals across the day'))
    assert.ok(day.includes('"meal"') && day.includes('"ateOut"') && day.includes('"fiber_g"'))
    assert.ok(day.includes('restaurant'))
    const meal = parseOps.compileParsePrompt({ text: 'roti', pantry: [], mode: 'meal' })
    assert.ok(meal.includes('"fiber_g"'))
    assert.ok(!meal.includes('"ateOut": true for'))
    const cook = parseOps.compileParsePrompt({ text: 'dal', pantry: [], mode: 'cook' })
    assert.ok(cook.includes('"fiber_g"') && !cook.includes('"meal":'))
  })

  await check('validateParseReply keeps valid meal / ateOut / fiber_g and tolerates bad ones', () => {
    const reply = (items) => JSON.stringify({ items })
    const base = { name: 'Roti', measure: '2 rotis', grams: 80, pantryMatch: null }
    const ok = parseOps.validateParseReply(reply([{ ...base, meal: 'lunch', ateOut: true, estimate: est({ fiber_g: 4 }) }]), { pantry: [] })
    assert.equal(ok.ok, true)
    assert.equal(ok.items[0].meal, 'lunch')
    assert.equal(ok.items[0].ateOut, true)
    assert.equal(ok.items[0].estimate.fiber_g, 4)
    const bad = parseOps.validateParseReply(reply([{ ...base, meal: 'brunch', ateOut: 'yes', estimate: est({ fiber_g: -2 }) }]), { pantry: [] })
    assert.equal(bad.ok, true)
    assert.equal(bad.items[0].meal, null)
    assert.equal(bad.items[0].ateOut, false)
    assert.ok(!('fiber_g' in bad.items[0].estimate))
    const str = parseOps.validateParseReply(reply([{ ...base, estimate: est({ fiber_g: 'lots' }) }]), { pantry: [] })
    assert.equal(str.ok, true)
    assert.ok(!('fiber_g' in str.items[0].estimate))
    // Rows carry meal / ateOut and the fibre reaches perServing.
    const rows = parseOps.buildDraftRows(ok.items, [])
    assert.equal(rows[0].meal, 'lunch')
    assert.equal(rows[0].ateOut, true)
    assert.equal(rows[0].aiItem.nutrition.perServing.fiber_g, 4)
    assert.deepEqual(schema.validate(schema.createLogEntry({ items: [rows[0].aiItem] }), 'LogEntry'), [])
  })

  await check('meal / cook replies still validate WITHOUT the new fields', () => {
    const plain = JSON.stringify({ items: [{ name: 'Dal', measure: '1 bowl', grams: 200, pantryMatch: null, estimate: est() }], dishName: 'Dal', servings: 4 })
    for (const mode of ['meal', 'cook']) {
      const r = parseOps.validateParseReply(plain, { pantry: [], mode })
      assert.equal(r.ok, true, mode)
      assert.equal(r.items[0].meal, null)
      assert.ok(!('fiber_g' in r.items[0].estimate))
    }
    assert.equal(parseOps.validateParseReply(plain, { pantry: [] }).servings, 4)
  })

  console.log(`\n${passed} checks passed.`)
} catch (err) {
  console.error('\nFAILED:', err)
  process.exit(1)
}

// Zero-dependency Node smoke test for Phase 21 (where meals were eaten +
// the "This week" numbers, schema v15). Shims localStorage. No network.
// Run with:
//   node scripts/smoke-phase21.mjs

import assert from 'node:assert/strict'
import * as schema from '../src/schema.js'
import * as storage from '../src/storage.js'
import { SCHEMA_VERSION, migrate } from '../src/storage.js'
import * as insightsOps from '../src/insightsOps.js'
import * as parseOps from '../src/parseOps.js'
import * as cookOps from '../src/cookOps.js'
import { findSeedForName } from '../src/nutritionOps.js'

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

const dal = schema.createPantryItem({ id: 'p_dal', name: 'Toor dal', onHand: true, nutrition: findSeedForName('toor dal') })
const curry = schema.createComponent({ id: 'c_curry', name: 'Chana curry', macrosPerServing: { kcal: 400, protein_g: 20, carbs_g: 50, fat_g: 10 } })
const pantry = [dal]
const components = [curry]
const burrito = parseOps.estimateNutrition({ measure: '1 bowl', grams: 600, estimate: { kcal: 900, protein_g: 40, carbs_g: 100, fat_g: 30 } })

function log(date, meal, items, where) {
  return schema.createLogEntry({ date, meal, items, ...(where !== undefined ? { where } : {}) })
}
const comp = (count = 1) => ({ kind: 'component', componentId: 'c_curry', count })
const pantryItem = { kind: 'pantry', pantryId: 'p_dal', measure: '1 cup' }
const adhoc = { kind: 'adhoc', name: 'Burrito bowl', measure: '1 bowl', nutrition: burrito }

// 2026-10-18 is a Sunday.
const WEEK = ['2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24']

try {
  await check('schema v15: LogEntry.where + CookSession.doneOn validate; factories default to null', () => {
    assert.ok(SCHEMA_VERSION >= 15)
    assert.equal(schema.createLogEntry().where, null)
    assert.deepEqual(schema.validate(log('2026-10-18', 'lunch', [comp()], 'packed'), 'LogEntry'), [])
    assert.ok(schema.validate(log('2026-10-18', 'lunch', [], 'cafe'), 'LogEntry')[0].startsWith('where:'))
    assert.equal(schema.createCookSession().doneOn, null)
  })

  await check('migration v14 -> current: logs get where null; doneOn from createdAt (local day); money-saved setting dropped', () => {
    const v14 = {
      schemaVersion: 14,
      logs: [{ date: '2026-10-18', meal: 'lunch', items: [], quickRating: null }],
      cookSessions: [
        { id: 'a', status: 'done', createdAt: new Date(2026, 9, 18, 23, 30).toISOString(), name: 'Dal', text: '', rows: [], servingsMade: 4, componentId: 'c' },
        { id: 'b', status: 'draft', createdAt: new Date(2026, 9, 19, 9).toISOString(), name: 'x', text: '', rows: [], servingsMade: null, componentId: null },
      ],
      settings: { ...schema.createSettings(), boughtLunchCost: 12 },
    }
    const out = migrate(JSON.parse(JSON.stringify(v14)))
    assert.equal(out.schemaVersion, SCHEMA_VERSION)
    assert.equal(out.logs[0].where, null)
    assert.equal(out.cookSessions[0].doneOn, '2026-10-18', 'local day, not the UTC day')
    assert.equal(out.cookSessions[1].doneOn, null)
    assert.ok(!('boughtLunchCost' in out.settings), 'money-saved setting dropped')
    assert.deepEqual(migrate(JSON.parse(JSON.stringify(out))), out)
  })

  await check('a v14 export imports cleanly', async () => {
    await storage.resetState()
    const state = JSON.parse(JSON.stringify(await storage.getFullState()))
    state.schemaVersion = 14
    state.logs = [{ date: '2026-10-18', meal: 'lunch', items: [comp()], quickRating: null }]
    const result = await storage.importState(JSON.stringify(state))
    assert.equal(result.ok, true, JSON.stringify(result.errors))
  })

  await check('guessWhere / whereOf: own dishes or pantry -> home; one-offs only -> untagged; a set tag always wins', () => {
    assert.equal(insightsOps.guessWhere(log('d', 'lunch', [comp()])), 'home')
    assert.equal(insightsOps.guessWhere(log('d', 'lunch', [pantryItem, adhoc])), 'home')
    assert.equal(insightsOps.guessWhere(log('d', 'lunch', [adhoc])), null)
    assert.equal(insightsOps.guessWhere(log('d', 'lunch', [])), null)
    assert.equal(insightsOps.whereOf(log('d', 'lunch', [comp()], 'out')), 'out')
    assert.equal(insightsOps.whereOf(log('d', 'lunch', [adhoc])), null)
  })

  await check('nextWhere: one tap cycles home -> packed -> out -> home; untagged starts at home', () => {
    assert.equal(insightsOps.nextWhere(null), 'home')
    assert.equal(insightsOps.nextWhere('home'), 'packed')
    assert.equal(insightsOps.nextWhere('packed'), 'out')
    assert.equal(insightsOps.nextWhere('out'), 'home')
  })

  await check('compileParsePrompt: "ate out" adds the restaurant-portion rule (meal mode only)', () => {
    const out = parseOps.compileParsePrompt({ text: 'Chipotle burrito bowl and a Coke', pantry, ateOut: true })
    assert.ok(out.includes('eaten OUT'))
    assert.ok(!parseOps.compileParsePrompt({ text: 'x', pantry }).includes('eaten OUT'))
    assert.ok(!parseOps.compileParsePrompt({ text: 'x', pantry, mode: 'cook', ateOut: true }).includes('eaten OUT'))
  })

  await check('weekInsights: home/packed/out/untagged counts over this week\'s non-empty meals only', () => {
    const logs = [
      log('2026-10-18', 'breakfast', [pantryItem]), // guessed home
      log('2026-10-19', 'lunch', [comp()], 'packed'),
      log('2026-10-19', 'dinner', [adhoc], 'out'),
      log('2026-10-20', 'snack', [adhoc]), // untagged
      log('2026-10-21', 'lunch', []), // empty: not a meal
      log('2026-10-25', 'dinner', [comp()]), // next week
    ]
    const w = insightsOps.weekInsights({ logs, cookSessions: [], components, pantry, dates: WEEK })
    assert.equal(w.meals, 4)
    assert.deepEqual([w.home, w.packed, w.out, w.untagged], [1, 1, 1, 1])
  })

  await check('weekInsights: cooks counted by doneOn within the week; drafts never count', () => {
    const cookSessions = [
      schema.createCookSession({ status: 'done', doneOn: '2026-10-18' }),
      schema.createCookSession({ status: 'done', doneOn: '2026-10-22' }),
      schema.createCookSession({ status: 'done', doneOn: '2026-10-11' }),
      schema.createCookSession({ status: 'draft', doneOn: null, createdAt: new Date(2026, 9, 19).toISOString() }),
    ]
    assert.equal(insightsOps.weekInsights({ logs: [], cookSessions, components, pantry, dates: WEEK }).cooks, 2)
  })

  await check('weekInsights: average protein per meal type; null where that meal wasn\'t logged', () => {
    const logs = [
      log('2026-10-18', 'lunch', [comp()]), // 20 g
      log('2026-10-19', 'lunch', [comp(2)]), // 40 g
      log('2026-10-19', 'dinner', [adhoc], 'out'), // 40 g
      log('2026-10-20', 'breakfast', [pantryItem]), // 14 g (1 cup cooked toor dal)
    ]
    const { proteinByMeal } = insightsOps.weekInsights({ logs, cookSessions: [], components, pantry, dates: WEEK })
    assert.deepEqual(proteinByMeal, { breakfast: 14, lunch: 30, dinner: 40, snack: null })
  })

  await check('finishCook stamps doneOn = the cook day', () => {
    const rows = [cookOps.rowForPantryItem(dal, '1 cup')]
    const out = cookOps.finishCook({ components: [], logs: [], shelf: [], cookSessions: [] }, { sessionId: null, name: 'Dal', text: '', rows, servingsMade: 2, eatNow: null, today: '2026-10-20', now: 'n', pantry })
    assert.equal(out.cookSessions[0].doneOn, '2026-10-20')
    assert.deepEqual(schema.validate(out.cookSessions[0], 'CookSession'), [])
  })

  console.log(`\n${passed} checks passed.`)
} catch (err) {
  console.error(`\nFAILED after ${passed} checks:`)
  console.error(err)
  process.exit(1)
}

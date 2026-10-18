// Zero-dependency Node smoke test for Phase 19 (cook session + ready-to-eat
// shelf + model picker, schema v13). Shims localStorage. No network.
// Run with:
//   node scripts/smoke-phase19.mjs

import assert from 'node:assert/strict'
import * as schema from '../src/schema.js'
import * as storage from '../src/storage.js'
import { SCHEMA_VERSION, migrate } from '../src/storage.js'
import * as cookOps from '../src/cookOps.js'
import * as shelfOps from '../src/shelfOps.js'
import * as parseOps from '../src/parseOps.js'
import * as nutritionOps from '../src/nutritionOps.js'
import * as aiClient from '../src/aiClient.js'
import * as byok from '../src/byok.js'
import * as trackOps from '../src/trackOps.js'
import { addDaysISO } from '../src/dates.js'
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

const dal = schema.createPantryItem({ id: 'p_dal', name: 'Toor dal', category: 'Legumes', onHand: true, nutrition: findSeedForName('toor dal') })
const ghee = schema.createPantryItem({ id: 'p_ghee', name: 'Ghee', category: 'Oils & Fats', onHand: false, nutrition: findSeedForName('ghee') })
const pantry = [dal, ghee]

function ghiReply() {
  return {
    dishName: 'Dal tadka',
    servings: 4,
    items: [
      { name: 'Toor dal', measure: '2 cups', grams: 404, pantryMatch: 'Toor dal', estimate: { kcal: 400, protein_g: 28, carbs_g: 78, fat_g: 2 } },
      { name: 'Tomato', measure: '2 tomatoes', grams: 240, pantryMatch: null, estimate: { kcal: 44, protein_g: 2, carbs_g: 9, fat_g: 0 } },
      { name: 'Mystery masala', measure: 'some', grams: null, pantryMatch: null, estimate: { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 } },
    ],
  }
}

function emptyState() {
  return { components: [], logs: [], shelf: [], cookSessions: [] }
}

try {
  // ==== schema v13 + migration ====

  await check('schema v13: factories validate; new collections registered', () => {
    assert.ok(SCHEMA_VERSION >= 13)
    assert.deepEqual(schema.validate(schema.createCookSession({ createdAt: '2026-10-18T10:00:00Z' }), 'CookSession'), [])
    assert.deepEqual(schema.validate(schema.createShelfEntry({ componentId: 'c', servingsLeft: 2, cookedOn: '2026-10-18', eatBy: '2026-10-21' }), 'ShelfEntry'), [])
    assert.equal(schema.COLLECTION_SHAPES.cookSessions, 'CookSession')
    assert.equal(schema.COLLECTION_SHAPES.shelf, 'ShelfEntry')
    assert.equal(schema.createSettings().anthropicModel, 'claude-sonnet-5-5')
  })

  await check('migration v12 -> current: empty cookSessions/shelf, default model; idempotent', () => {
    const v12 = { schemaVersion: 12, pantry: [], components: [], logs: [], settings: { ...schema.createSettings(), anthropicModel: undefined } }
    delete v12.settings.anthropicModel
    const once = migrate(v12)
    assert.equal(once.schemaVersion, SCHEMA_VERSION)
    assert.deepEqual(once.cookSessions, [])
    assert.deepEqual(once.shelf, [])
    assert.equal(once.settings.anthropicModel, 'claude-sonnet-5-5')
    const twice = migrate(JSON.parse(JSON.stringify(once)))
    assert.deepEqual(twice, once)
  })

  await check('a v12 export imports through the chain and validates', async () => {
    await storage.resetState()
    const state = await storage.getFullState()
    const v12 = JSON.parse(JSON.stringify(state))
    v12.schemaVersion = 12
    delete v12.cookSessions
    delete v12.shelf
    delete v12.settings.anthropicModel
    const result = await storage.importState(JSON.stringify(v12))
    assert.equal(result.ok, true, JSON.stringify(result.errors))
    assert.equal((await storage.getFullState()).settings.anthropicModel, 'claude-sonnet-5-5')
  })

  await check('cook sessions + shelf survive export -> reset -> import', async () => {
    await storage.resetState()
    const session = schema.createCookSession({ createdAt: 'x', name: 'Dal', rows: [{ name: 'Toor dal', measure: '1 cup', pantryId: 'p_dal', nutrition: null, checked: true }] })
    const entry = schema.createShelfEntry({ componentId: 'c1', servingsLeft: 3, cookedOn: '2026-10-18', eatBy: '2026-10-21' })
    await storage.set('cookSessions', [session])
    await storage.set('shelf', [entry])
    const exported = await storage.exportState()
    await storage.resetState()
    assert.equal((await storage.importState(exported)).ok, true)
    assert.deepEqual(await storage.get('cookSessions'), [session])
    assert.deepEqual(await storage.get('shelf'), [entry])
  })

  // ==== partial derivation with ingredient snapshots ====

  await check('deriveComponentMacros: a snapshot ingredient counts when no pantry item matches; coverage reported', () => {
    const tomato = parseOps.estimateNutrition({ measure: '2 tomatoes', grams: 240, estimate: { kcal: 44, protein_g: 2, carbs_g: 9, fat_g: 0 } })
    const dish = schema.createComponent({
      servings: 2,
      macroSource: 'derived',
      ingredients: [
        { name: 'Toor dal', measure: '1 cup' },
        { name: 'Tomato', measure: '2 tomatoes', nutrition: tomato },
        { name: 'Unknown thing', measure: 'a pinch' },
      ],
    })
    assert.deepEqual(schema.validate(dish, 'Component'), [])
    const result = nutritionOps.deriveComponentMacros(dish, pantry)
    assert.equal(result.ok, true)
    assert.deepEqual(result.coverage, { counted: 2, total: 3 })
    assert.equal(result.macrosPerServing.kcal, Math.round((203 + 44) / 2))
    assert.deepEqual(result.unresolved.map((u) => u.name), ['Unknown thing'])
  })

  await check('resyncDerivedMacros: a dish with an unknown ingredient keeps its macros after a pantry change (the old wipe bug)', () => {
    const dish = schema.createComponent({ servings: 2, macroSource: 'derived', ingredients: [{ name: 'Toor dal', measure: '1 cup' }, { name: 'Saffron', measure: 'a pinch' }] })
    const changedPantry = pantry.map((p) => (p.id === 'p_ghee' ? { ...p, onHand: true } : p))
    const { components } = nutritionOps.resyncDerivedMacros([dish], changedPantry)
    assert.ok(components[0].macrosPerServing, 'not wiped to null')
    assert.equal(components[0].macrosPerServing.kcal, Math.round(203 / 2))
  })

  // ==== parser: cook mode ====

  await check('compileParsePrompt mode cook: ingredient wording + dishName/servings hint; meal mode unchanged', () => {
    const cook = parseOps.compileParsePrompt({ text: 'two cups toor dal', pantry, mode: 'cook' })
    assert.ok(cook.includes('## What goes into the dish'))
    assert.ok(cook.includes('"dishName"'))
    const meal = parseOps.compileParsePrompt({ text: 'an apple', pantry })
    assert.ok(meal.includes('## What was eaten'))
    assert.ok(!meal.includes('"dishName"'))
  })

  await check('validateParseReply: returns optional dishName/servings; malformed meta is ignored, not an error', () => {
    const good = parseOps.validateParseReply(JSON.stringify(ghiReply()), { pantry })
    assert.equal(good.dishName, 'Dal tadka')
    assert.equal(good.servings, 4)
    const odd = parseOps.validateParseReply(JSON.stringify({ ...ghiReply(), dishName: 7, servings: 'lots' }), { pantry })
    assert.equal(odd.ok, true)
    assert.equal(odd.dishName, null)
    assert.equal(odd.servings, null)
  })

  // ==== cook rows + macros ====

  const parsed = parseOps.validateParseReply(JSON.stringify(ghiReply()), { pantry })
  const rows = cookOps.rowsFromParsedItems(parsed.items, pantry)

  await check('rowsFromParsedItems: pantry match -> pantry row; others carry their AI snapshot', () => {
    assert.equal(rows[0].pantryId, 'p_dal')
    assert.equal(rows[0].nutrition, null)
    assert.equal(rows[1].pantryId, null)
    assert.equal(rows[1].nutrition.source, 'ai_estimate')
    assert.ok(rows.every((r) => r.checked && r.key))
  })

  await check('cookMacros: partial per-serving totals over checked rows only', () => {
    const { perServing, counted, total } = cookOps.cookMacros(rows, 4, [], pantry)
    assert.equal(total, 3)
    assert.equal(counted, 3, '"some" with a 0-kcal estimate still resolves via "1 serving"')
    assert.equal(perServing.kcal, Math.round((406 + 44) / 4))
    const unchecked = rows.map((r, i) => (i === 1 ? { ...r, checked: false } : r))
    assert.equal(cookOps.cookMacros(unchecked, 4, [], pantry).total, 2)
    assert.equal(cookOps.cookMacros([], 4, [], pantry).perServing, null)
  })

  // ==== drafts ====

  await check('saveDraft: creates, then updates the same draft on resume; rows stored without UI keys', () => {
    let sessions = cookOps.saveDraft([], { sessionId: null, name: 'Dal', text: 'two cups toor dal', rows, servings: 4, now: '2026-10-18T09:00:00Z' })
    assert.equal(sessions.length, 1)
    assert.deepEqual(schema.validate(sessions[0], 'CookSession'), [])
    assert.ok(!('key' in sessions[0].rows[0]))
    const id = sessions[0].id
    const resumed = cookOps.rowsFromSession(sessions[0])
    assert.ok(resumed[0].key)
    sessions = cookOps.saveDraft(sessions, { sessionId: id, name: 'Dal tadka', text: '', rows: resumed.slice(0, 2), servings: 3, now: 'later' })
    assert.equal(sessions.length, 1)
    assert.equal(sessions[0].name, 'Dal tadka')
    assert.equal(sessions[0].createdAt, '2026-10-18T09:00:00Z', 'createdAt kept on update')
    assert.equal(sessions[0].rows.length, 2)
  })

  // ==== finishing a cook ====

  await check('finishCook: dish + 1 serving logged to dinner + 3 on the shelf; session marked done', () => {
    const drafts = cookOps.saveDraft([], { sessionId: null, name: 'Dal', text: '', rows, servings: 4, now: 'n' })
    const state = { ...emptyState(), cookSessions: drafts }
    const out = cookOps.finishCook(state, {
      sessionId: drafts[0].id,
      name: 'Dal tadka',
      text: '',
      rows,
      servingsMade: 4,
      keepsDays: 4,
      eatNow: { count: 1, meal: 'dinner' },
      today: '2026-10-18',
      now: 'n2',
      pantry,
    })
    assert.deepEqual(schema.validate(out.component, 'Component'), [])
    assert.equal(out.component.servings, 4)
    assert.equal(out.component.shelfLifeDays, 4)
    assert.equal(out.component.ingredients[1].nutrition.source, 'ai_estimate', 'snapshot rides into the dish')
    assert.ok(!('nutrition' in out.component.ingredients[0]), 'pantry ingredients stay plain')

    const log = trackOps.logFor(out.logs, '2026-10-18', 'dinner').log
    assert.deepEqual(log.items, [{ kind: 'component', componentId: out.component.id, count: 1 }])
    assert.deepEqual(schema.validate(log, 'LogEntry'), [])

    assert.equal(out.shelf.length, 1)
    assert.equal(out.shelf[0].servingsLeft, 3)
    assert.equal(out.shelf[0].eatBy, '2026-10-22')
    assert.deepEqual(schema.validate(out.shelf[0], 'ShelfEntry'), [])

    assert.equal(out.cookSessions.length, 1, 'the draft is completed, not duplicated')
    assert.equal(out.cookSessions[0].status, 'done')
    assert.equal(out.cookSessions[0].componentId, out.component.id)
  })

  await check('finishCook: eating nothing now puts every serving on the shelf; eating all leaves none', () => {
    const none = cookOps.finishCook(emptyState(), { sessionId: null, name: 'Rice', text: '', rows, servingsMade: 3, eatNow: null, today: '2026-10-18', now: 'n', pantry })
    assert.equal(none.shelf[0].servingsLeft, 3)
    assert.deepEqual(none.logs, [])
    assert.equal(none.cookSessions.length, 1)
    const all = cookOps.finishCook(emptyState(), { sessionId: null, name: 'Rice', text: '', rows, servingsMade: 2, eatNow: { count: 5, meal: 'lunch' }, today: '2026-10-18', now: 'n', pantry })
    assert.equal(all.shelfEntry, null)
    assert.equal(trackOps.logFor(all.logs, '2026-10-18', 'lunch').log.items[0].count, 2, 'clamped to servings made')
  })

  await check('finishCook: merges into an already-logged meal instead of replacing it', () => {
    const existing = schema.createLogEntry({ date: '2026-10-18', meal: 'dinner', items: [{ kind: 'component', componentId: 'salad', count: 1 }] })
    const out = cookOps.finishCook({ ...emptyState(), logs: [existing] }, { sessionId: null, name: 'Dal', text: '', rows, servingsMade: 4, eatNow: { count: 1, meal: 'dinner' }, today: '2026-10-18', now: 'n', pantry })
    assert.equal(trackOps.logFor(out.logs, '2026-10-18', 'dinner').log.items.length, 2)
  })

  await check('offHandRows: only checked pantry rows that are off hand (for the advisory grocery list)', () => {
    const withGhee = [...rows, cookOps.rowForPantryItem(ghee, '1 tbsp')]
    assert.deepEqual(cookOps.offHandRows(withGhee, pantry).map((r) => r.name), ['Ghee'])
  })

  // ==== shelf ====

  await check('takeServings: decrements; reaching 0 removes the batch (emptied:true)', () => {
    const entry = schema.createShelfEntry({ id: 's1', componentId: 'c1', servingsLeft: 2, cookedOn: '2026-10-18', eatBy: '2026-10-21' })
    let r = shelfOps.takeServings([entry], 's1')
    assert.equal(r.shelf[0].servingsLeft, 1)
    assert.equal(r.emptied, false)
    r = shelfOps.takeServings(r.shelf, 's1')
    assert.deepEqual(r.shelf, [])
    assert.equal(r.emptied, true)
    assert.equal(entry.servingsLeft, 2, 'immutable')
  })

  await check('visibleShelf: soonest eat-by first; batches of deleted dishes hidden', () => {
    const a = schema.createShelfEntry({ componentId: 'c1', eatBy: '2026-10-22' })
    const b = schema.createShelfEntry({ componentId: 'c2', eatBy: '2026-10-19' })
    const orphan = schema.createShelfEntry({ componentId: 'gone', eatBy: '2026-10-18' })
    const visible = shelfOps.visibleShelf([a, b, orphan], [{ id: 'c1' }, { id: 'c2' }])
    assert.deepEqual(visible.map((e) => e.componentId), ['c2', 'c1'])
  })

  await check('eatByLabel: today / tomorrow / weekday / past', () => {
    assert.equal(shelfOps.eatByLabel('2026-10-18', '2026-10-18'), 'eat by today')
    assert.equal(shelfOps.eatByLabel('2026-10-19', '2026-10-18'), 'eat by tomorrow')
    assert.equal(shelfOps.eatByLabel('2026-10-21', '2026-10-18'), 'eat by Wed')
    assert.equal(shelfOps.eatByLabel('2026-10-17', '2026-10-18'), 'past eat-by')
    assert.equal(addDaysISO('2026-12-30', 3), '2027-01-02')
  })

  // ==== model picker ====

  await check('buildAnthropicRequest: model from settings; per-model thinking fields; unknown -> Sonnet', () => {
    const msgs = [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }]
    const sonnet = aiClient.buildAnthropicRequest('k', msgs, 16, 'claude-sonnet-5-5').body
    assert.equal(sonnet.model, 'claude-sonnet-5-5')
    assert.deepEqual(sonnet.thinking, { type: 'between_tools' })
    assert.equal(sonnet.max_tokens, 16)

    const opus = aiClient.buildAnthropicRequest('k', msgs, 16, 'claude-opus-5-5').body
    assert.equal(opus.model, 'claude-opus-5-5')
    assert.ok(!('thinking' in opus), 'Opus 5.5 cannot disable thinking — no thinking field')
    assert.deepEqual(opus.output_config, { effort: 'low' })
    assert.ok(opus.max_tokens >= 4000, 'floor so thinking cannot truncate a 16-token call')

    const haiku = aiClient.buildAnthropicRequest('k', msgs, 500, 'claude-haiku-5-5').body
    assert.deepEqual(haiku.thinking, { type: 'disabled' })

    assert.equal(aiClient.buildAnthropicRequest('k', msgs, 16, 'gpt-9').body.model, 'claude-sonnet-5-5')
    assert.equal(aiClient.buildAnthropicRequest('k', msgs, 16).body.model, 'claude-sonnet-5-5')
  })

  await check('byokCredentials carries the model; BYOK calls pass it to the chat function', async () => {
    const settings = schema.createSettings({ apiMode: 'byok', apiKey: 'sk', anthropicModel: 'claude-haiku-5-5' })
    const creds = byok.byokCredentials(settings)
    assert.deepEqual(creds, { provider: 'anthropic', apiKey: 'sk', model: 'claude-haiku-5-5' })
    assert.equal(byok.byokCredentials({ ...settings, apiMode: 'paste' }), null)
    assert.equal(byok.byokCredentials({ ...settings, apiKey: null }), null)

    let seenModel = null
    await byok.parseTextViaApi({
      ...creds,
      pantry,
      prompt: 'p',
      chatFn: async ({ model }) => {
        seenModel = model
        return { ok: true, text: JSON.stringify(ghiReply()) }
      },
    })
    assert.equal(seenModel, 'claude-haiku-5-5')
  })

  console.log(`\n${passed} checks passed.`)
} catch (err) {
  console.error(`\nFAILED after ${passed} checks:`)
  console.error(err)
  process.exit(1)
}

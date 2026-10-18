// Zero-dependency Node smoke test for Phase 20 (pantry stock + shopping
// haul, schema v14). Shims localStorage. No network. Run with:
//   node scripts/smoke-phase20.mjs

import assert from 'node:assert/strict'
import * as schema from '../src/schema.js'
import * as storage from '../src/storage.js'
import { SCHEMA_VERSION, migrate } from '../src/storage.js'
import * as stockOps from '../src/stockOps.js'
import * as cookOps from '../src/cookOps.js'
import * as parseOps from '../src/parseOps.js'
import * as byok from '../src/byok.js'
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

const categories = ['Vegetables', 'Grains & Bases', 'Dairy', 'Legumes']
const carrots = schema.createPantryItem({ id: 'p_carrot', name: 'Carrots', category: 'Vegetables', onHand: true, roughQty: '4 carrots' })
const spinach = schema.createPantryItem({ id: 'p_spinach', name: 'Spinach', category: 'Vegetables', onHand: false })
const rice = schema.createPantryItem({ id: 'p_rice', name: 'Rice', category: 'Grains & Bases', onHand: true, roughQty: '5 kg', nutrition: findSeedForName('rice') })
const pantry = [carrots, spinach, rice]

try {
  // ==== schema v14 ====

  await check('schema v14: PantryItem.level validates (plenty|some|low|null); bad level named', () => {
    assert.ok(SCHEMA_VERSION >= 14)
    assert.equal(schema.createPantryItem().level, null)
    assert.deepEqual(schema.validate(schema.createPantryItem({ name: 'x', level: 'low' }), 'PantryItem'), [])
    assert.ok(schema.validate(schema.createPantryItem({ name: 'x', level: 'lots' }), 'PantryItem')[0].startsWith('level:'))
  })

  await check('migration v13 -> current: every pantry item gets level null; idempotent; old export imports', async () => {
    const v13 = { schemaVersion: 13, pantry: [{ id: 'a', name: 'A', category: 'Dairy', onHand: true, roughQty: null, nutrition: null }], settings: schema.createSettings() }
    const once = migrate(JSON.parse(JSON.stringify(v13)))
    assert.equal(once.schemaVersion, SCHEMA_VERSION)
    assert.equal(once.pantry[0].level, null)
    assert.deepEqual(migrate(JSON.parse(JSON.stringify(once))), once)

    await storage.resetState()
    const full = await storage.getFullState()
    const old = JSON.parse(JSON.stringify(full))
    old.schemaVersion = 13
    for (const p of old.pantry) delete p.level
    const result = await storage.importState(JSON.stringify(old))
    assert.equal(result.ok, true, JSON.stringify(result.errors))
  })

  // ==== the stated amount ====

  await check('parseAmount: number + unit; no number -> null', () => {
    assert.deepEqual(stockOps.parseAmount('10 carrots'), { qty: 10, tail: 'carrots', unitKey: 'carrot' })
    assert.equal(stockOps.parseAmount('half bag'), null)
    assert.equal(stockOps.parseAmount('some'), null)
    assert.equal(stockOps.parseAmount(null), null)
  })

  await check('addStated: same unit adds up; different unit -> the new statement wins', () => {
    assert.equal(stockOps.addStated('4 carrots', '10 carrots'), '14 carrots')
    assert.equal(stockOps.addStated('1 carrot', '2 carrots'), '3 carrots', 'uses the newest wording')
    assert.equal(stockOps.addStated('a bag', '10 carrots'), '10 carrots')
    assert.equal(stockOps.addStated(null, '2 blocks'), '2 blocks')
  })

  // ==== consume ====

  await check('consume: same unit subtracts ("10 carrots" - "3 carrots" = "7 carrots")', () => {
    const { patch, how } = stockOps.consume({ ...carrots, roughQty: '10 carrots' }, '3 carrots')
    assert.equal(how, 'subtract')
    assert.deepEqual(patch, { roughQty: '7 carrots', level: null, onHand: true })
  })

  await check('consume: using it all (or more) means out — off hand, amount cleared', () => {
    const { patch } = stockOps.consume({ ...carrots, roughQty: '2 carrots' }, '3 carrots')
    assert.deepEqual(patch, { roughQty: null, level: null, onHand: false })
  })

  await check('consume: different units convert through the item\'s nutrition (5 kg rice - 1 cup)', () => {
    const { patch, how } = stockOps.consume(rice, '1 cup')
    assert.equal(how, 'proportional')
    const left = stockOps.parseAmount(patch.roughQty)
    assert.equal(left.unitKey, 'kg')
    assert.ok(left.qty < 5 && left.qty > 4, `got ${patch.roughQty}`)
  })

  await check('consume: no stated amount steps the level down; no level at all is left as is', () => {
    assert.equal(stockOps.consume({ ...spinach, onHand: true, level: 'plenty' }, 'a handful').patch.level, 'some')
    assert.equal(stockOps.consume({ ...spinach, onHand: true, level: 'some' }, 'a handful').patch.level, 'low')
    assert.equal(stockOps.consume({ ...spinach, onHand: true, level: 'low' }, 'a handful').patch.level, 'low', 'never auto-out')
    const unknown = stockOps.consume({ ...spinach, onHand: true, level: null }, 'a handful')
    assert.equal(unknown.how, 'unknown')
    assert.equal(unknown.patch.onHand, true)
  })

  await check('patchForChoice / choiceForPatch: Out clears the amount; levels keep it', () => {
    assert.deepEqual(stockOps.patchForChoice(carrots, 'out'), { roughQty: null, level: null, onHand: false })
    assert.deepEqual(stockOps.patchForChoice(carrots, 'low'), { roughQty: '4 carrots', level: 'low', onHand: true })
    assert.equal(stockOps.choiceForPatch({ onHand: false }), 'out')
    assert.equal(stockOps.choiceForPatch({ onHand: true, level: 'some' }), 'some')
    assert.equal(stockOps.choiceForPatch({ onHand: true, level: null }), null)
  })

  // ==== shopping haul ====

  await check('haul parse: prompt carries pantry + categories; validator clears invented matches/categories', () => {
    const prompt = parseOps.compileHaulPrompt({ text: '10 carrots and a bag of spinach', pantry, categories })
    assert.ok(prompt.includes('- Carrots') && prompt.includes('- Vegetables'))
    const reply = {
      items: [
        { name: 'Carrots', measure: '10 carrots', pantryMatch: 'carrots', category: null },
        { name: 'Spinach', measure: null, pantryMatch: 'Spinach', category: null },
        { name: 'Paneer', measure: '2 blocks', pantryMatch: 'Cottage cheese', category: 'Cheese & Co' },
      ],
    }
    const result = parseOps.validateHaulReply(JSON.stringify(reply), { pantry, categories })
    assert.equal(result.ok, true)
    assert.equal(result.items[0].pantryId, 'p_carrot')
    assert.equal(result.items[2].pantryId, null, 'invented pantry match cleared')
    assert.equal(result.items[2].category, null, 'invented category cleared')
    assert.ok(parseOps.validateHaulReply('{"items":[{"measure":"2"}]}', { pantry, categories }).errors[0].startsWith('items[0].name'))
  })

  await check('applyHaul: "10 carrots, a bag of spinach, 2 blocks paneer" — restock adds up, unstated -> plenty, new item created', () => {
    const rows = parseOps.buildHaulRows(
      [
        { name: 'Carrots', measure: '10 carrots', pantryId: 'p_carrot', category: null },
        { name: 'Spinach', measure: 'a bag', pantryId: 'p_spinach', category: null },
        { name: 'Paneer', measure: '2 blocks', pantryId: null, category: 'Dairy' },
      ],
      pantry,
    )
    const { pantry: next, restockedNames, created } = stockOps.applyHaul(pantry, categories, rows)
    const byName = Object.fromEntries(next.map((p) => [p.name, p]))
    assert.equal(byName.Carrots.roughQty, '14 carrots')
    assert.equal(byName.Spinach.onHand, true)
    assert.equal(byName.Spinach.level, 'plenty', '"a bag" has no number -> level, not an amount')
    assert.equal(byName.Paneer.category, 'Dairy')
    assert.equal(byName.Paneer.roughQty, '2 blocks')
    assert.equal(byName.Paneer.onHand, true)
    assert.equal(byName.Paneer.nutrition?.source, 'seed_table', 'seed nutrition, never an AI guess')
    assert.deepEqual(schema.validate(byName.Paneer, 'PantryItem'), [])
    assert.equal(created.length, 1)
    assert.deepEqual(restockedNames.sort(), ['Carrots', 'Paneer', 'Spinach'])
  })

  await check('buildHaulRows: an exact pantry name counts as a match even when the AI gave none', () => {
    const [row] = parseOps.buildHaulRows([{ name: 'spinach', measure: null, pantryId: null, category: 'Vegetables' }], pantry)
    assert.equal(row.pantryId, 'p_spinach')
    assert.equal(row.name, 'Spinach')
  })

  await check('applyHaul: no category from the AI -> best guess from the name', () => {
    const { created } = stockOps.applyHaul([], categories, [{ name: 'Basmati rice', measure: '', pantryId: null, category: '' }])
    assert.equal(created[0].category, 'Grains & Bases')
  })

  // ==== grocery list ====

  await check('lowStockAdditions: low/out items join the list as "running low"/"ran out"; no duplicates', () => {
    const grocery = [schema.createGroceryItem({ name: 'Ghee', forDish: 'Dal' })]
    const added = stockOps.lowStockAdditions(grocery, [
      { name: 'Carrots', onHand: false, level: null },
      { name: 'Spinach', onHand: true, level: 'low' },
      { name: 'Rice', onHand: true, level: 'some' },
      { name: 'ghee', onHand: false, level: null },
    ])
    assert.deepEqual(added.map((g) => [g.name, g.forDish]), [['Carrots', 'ran out'], ['Spinach', 'running low']])
  })

  await check('removeRestocked: buying something drops it from the list (case-insensitive)', () => {
    const grocery = [schema.createGroceryItem({ name: 'Carrots', forDish: 'ran out' }), schema.createGroceryItem({ name: 'Ghee', forDish: 'Dal' })]
    assert.deepEqual(stockOps.removeRestocked(grocery, ['carrots']).map((g) => g.name), ['Ghee'])
  })

  // ==== cooking runs stock down ====

  await check('stockSuggestions: one entry per used pantry item; an item used twice is consumed twice', () => {
    const rows = [
      cookOps.rowForPantryItem({ ...carrots, roughQty: '10 carrots' }, '3 carrots'),
      cookOps.rowForPantryItem(rice, '1 cup'),
      cookOps.rowForPantryItem(carrots, '2 carrots'),
    ]
    const tenCarrots = pantry.map((p) => (p.id === 'p_carrot' ? { ...p, roughQty: '10 carrots' } : p))
    const s = cookOps.stockSuggestions(rows, tenCarrots)
    assert.deepEqual(s.map((x) => x.name), ['Carrots', 'Rice'])
    assert.equal(s[0].patch.roughQty, '5 carrots')
    const unchecked = rows.map((r) => ({ ...r, checked: false }))
    assert.deepEqual(cookOps.stockSuggestions(unchecked, tenCarrots), [])
  })

  await check('applyStockPatches: applies only patched items and reports what changed', () => {
    const { pantry: next, changed } = cookOps.applyStockPatches(pantry, { p_carrot: { roughQty: null, level: null, onHand: false } })
    assert.equal(next.find((p) => p.id === 'p_carrot').onHand, false)
    assert.equal(next.find((p) => p.id === 'p_rice'), rice, 'untouched items are the same object')
    assert.deepEqual(changed.map((p) => p.name), ['Carrots'])
  })

  await check('end to end: cook uses the last carrots -> off hand -> on the list; a haul restocks and clears it', () => {
    const rows = [cookOps.rowForPantryItem(carrots, '4 carrots')]
    const [suggestion] = cookOps.stockSuggestions(rows, pantry)
    const { pantry: afterCook, changed } = cookOps.applyStockPatches(pantry, { [suggestion.pantryId]: suggestion.patch })
    assert.equal(afterCook.find((p) => p.id === 'p_carrot').onHand, false)
    const grocery = stockOps.lowStockAdditions([], changed)
    assert.deepEqual(grocery.map((g) => g.name), ['Carrots'])

    const { pantry: afterHaul, restockedNames } = stockOps.applyHaul(afterCook, categories, [{ name: 'Carrots', measure: '6 carrots', pantryId: 'p_carrot', category: '' }])
    assert.equal(afterHaul.find((p) => p.id === 'p_carrot').roughQty, '6 carrots')
    assert.deepEqual(stockOps.removeRestocked(grocery, restockedNames), [])
  })

  await check('parseHaulViaApi: retry loop + model passed through', async () => {
    let calls = 0
    let model = null
    const result = await byok.parseHaulViaApi({
      provider: 'anthropic',
      apiKey: 'k',
      model: 'claude-haiku-5-5',
      pantry,
      categories,
      prompt: 'p',
      chatFn: async (args) => {
        calls++
        model = args.model
        return calls === 1 ? { ok: true, text: 'nope' } : { ok: true, text: JSON.stringify({ items: [{ name: 'Carrots', measure: '10 carrots', pantryMatch: 'Carrots' }] }) }
      },
    })
    assert.equal(result.ok, true)
    assert.equal(result.attempts, 2)
    assert.equal(result.items[0].pantryId, 'p_carrot')
    assert.equal(model, 'claude-haiku-5-5')
  })

  console.log(`\n${passed} checks passed.`)
} catch (err) {
  console.error(`\nFAILED after ${passed} checks:`)
  console.error(err)
  process.exit(1)
}

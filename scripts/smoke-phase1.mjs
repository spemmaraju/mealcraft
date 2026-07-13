// Zero-dependency Node smoke test for Phase 1 (Pantry). Shims localStorage,
// then exercises seeds, pantryOps, and storage migration/round-trip.
// Run with: node scripts/smoke-phase1.mjs

import assert from 'node:assert/strict'
import * as schema from '../src/schema.js'
import * as storage from '../src/storage.js'
import * as pantryOps from '../src/pantryOps.js'
import { DEFAULT_CATEGORIES, seedPantryItems } from '../src/seeds.js'

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
  // ---- seeds.js ----

  await check('every seed item passes PantryItem validation', () => {
    const items = seedPantryItems()
    assert.ok(items.length >= 40, `expected >= 40 seed items, got ${items.length}`)
    for (const item of items) {
      assert.deepEqual(schema.validate(item, 'PantryItem'), [], `invalid: ${JSON.stringify(item)}`)
    }
  })

  await check('seed categories are unique and non-empty', () => {
    assert.ok(DEFAULT_CATEGORIES.every((c) => typeof c === 'string' && c.length > 0))
    assert.equal(new Set(DEFAULT_CATEGORIES).size, DEFAULT_CATEGORIES.length)
  })

  // ---- pantryOps.js ----

  await check('renameCategory moves matching items, leaves others untouched', () => {
    const categories = ['Spices', 'Dairy']
    const pantry = [
      schema.createPantryItem({ name: 'Cumin', category: 'Spices' }),
      schema.createPantryItem({ name: 'Milk', category: 'Dairy' }),
    ]
    const result = pantryOps.renameCategory(categories, pantry, 'Spices', 'Herbs & Spices')
    assert.deepEqual(result.categories, ['Herbs & Spices', 'Dairy'])
    assert.equal(result.pantry.find((i) => i.name === 'Cumin').category, 'Herbs & Spices')
    assert.equal(result.pantry.find((i) => i.name === 'Milk').category, 'Dairy')
  })

  await check('deleteCategory refuses when occupied, works when empty', () => {
    const categories = ['Spices', 'Dairy']
    const pantry = [schema.createPantryItem({ name: 'Cumin', category: 'Spices' })]
    const occupied = pantryOps.deleteCategory(categories, pantry, 'Spices')
    assert.ok(occupied.error)
    const empty = pantryOps.deleteCategory(categories, pantry, 'Dairy')
    assert.deepEqual(empty.categories, ['Spices'])
  })

  await check('moveCategory reorders correctly at both boundaries', () => {
    const categories = ['A', 'B', 'C']
    assert.deepEqual(pantryOps.moveCategory(categories, 'A', 'up'), ['A', 'B', 'C'])
    assert.deepEqual(pantryOps.moveCategory(categories, 'C', 'down'), ['A', 'B', 'C'])
    assert.deepEqual(pantryOps.moveCategory(categories, 'A', 'down'), ['B', 'A', 'C'])
    assert.deepEqual(pantryOps.moveCategory(categories, 'C', 'up'), ['A', 'C', 'B'])
  })

  await check('filterItems combines search + role + onHand', () => {
    const pantry = [
      schema.createPantryItem({ name: 'Tofu', role: 'rotating', onHand: true }),
      schema.createPantryItem({ name: 'Toor dal', role: 'staple', onHand: true }),
      schema.createPantryItem({ name: 'Tomatoes', role: 'rotating', onHand: false }),
    ]
    assert.equal(pantryOps.filterItems(pantry, { search: 'to' }).length, 3)
    assert.equal(pantryOps.filterItems(pantry, { search: 'to', role: 'staple' }).length, 1)
    assert.equal(pantryOps.filterItems(pantry, { search: 'to', role: 'rotating', onHandOnly: true }).length, 1)
    assert.equal(pantryOps.filterItems(pantry, { onHandOnly: true }).length, 2)
  })

  // ---- storage.js: v1 -> v2 migration ----

  await check('a hand-built v1 export migrates cleanly to v2 with categories populated', async () => {
    const v1Export = {
      schemaVersion: 1,
      pantry: [
        schema.createPantryItem({ name: 'Cumin', category: 'Spices' }),
        schema.createPantryItem({ name: 'Mystery Sauce', category: 'Homemade Sauces' }),
      ],
      components: [],
      weeks: [],
      logs: [],
      feedback: [],
      settings: schema.createSettings(),
    }

    const preview = await storage.previewImport(JSON.stringify(v1Export))
    assert.equal(preview.ok, true, `preview failed: ${JSON.stringify(preview.errors)}`)

    const result = await storage.importState(JSON.stringify(v1Export))
    assert.equal(result.ok, true, `import failed: ${JSON.stringify(result.errors)}`)

    const state = await storage.getFullState()
    assert.equal(state.schemaVersion, 2)
    assert.ok(state.categories.includes('Homemade Sauces'))
    assert.ok(DEFAULT_CATEGORIES.every((c) => state.categories.includes(c)))
  })

  // ---- storage.js: v2 export -> wipe -> import round trip ----

  await check('v2 export -> wipe -> import round trip stays deep-equal', async () => {
    await storage.resetState()
    await storage.set('pantry', [schema.createPantryItem({ name: 'Paneer', category: 'Dairy', onHand: true })])
    await storage.set('categories', ['Dairy', 'Custom'])

    const before = await storage.getFullState()
    assert.equal(before.schemaVersion, 2)
    const exported = await storage.exportState()

    await storage.resetState()
    const wiped = await storage.getFullState()
    assert.notDeepEqual(wiped.pantry, before.pantry)

    const result = await storage.importState(exported)
    assert.equal(result.ok, true, `import failed: ${JSON.stringify(result.errors)}`)

    const after = await storage.getFullState()
    assert.deepEqual(after, before)
  })

  console.log(`\n${passed} checks passed.`)
} catch (err) {
  console.error(`\nFAILED after ${passed} checks:`)
  console.error(err)
  process.exit(1)
}

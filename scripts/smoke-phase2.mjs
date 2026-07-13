// Zero-dependency Node smoke test for Phase 2 (Library). Shims localStorage,
// then exercises schema validation, componentOps, the fuzzy matcher, and
// storage export/import round-trip with components. Run with:
//   node scripts/smoke-phase2.mjs

import assert from 'node:assert/strict'
import * as schema from '../src/schema.js'
import * as storage from '../src/storage.js'
import * as componentOps from '../src/componentOps.js'

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
  // ---- schema.js: Component ----

  await check('createComponent() passes Component validation', () => {
    assert.deepEqual(schema.validate(schema.createComponent(), 'Component'), [])
  })

  await check('createComponent() with ingredients/steps still validates', () => {
    const c = schema.createComponent({
      name: 'Chickpea coconut curry',
      ingredients: [{ name: 'canned chickpeas', measure: '1 can' }],
      steps: ['Saute onions', 'Add chickpeas'],
    })
    assert.deepEqual(schema.validate(c, 'Component'), [])
  })

  // ---- componentOps.js: upsert/update/delete ----

  await check('upsertComponent appends new, replaces existing by id', () => {
    const a = schema.createComponent({ name: 'A' })
    const b = schema.createComponent({ name: 'B' })
    let components = componentOps.upsertComponent([], a)
    components = componentOps.upsertComponent(components, b)
    assert.equal(components.length, 2)
    const bRenamed = { ...b, name: 'B renamed' }
    components = componentOps.upsertComponent(components, bRenamed)
    assert.equal(components.length, 2)
    assert.equal(components.find((c) => c.id === b.id).name, 'B renamed')
  })

  await check('updateComponent patches by id, leaves others untouched', () => {
    const a = schema.createComponent({ name: 'A', rating: null })
    const b = schema.createComponent({ name: 'B', rating: null })
    const components = componentOps.updateComponent([a, b], a.id, { rating: 'repeat' })
    assert.equal(components.find((c) => c.id === a.id).rating, 'repeat')
    assert.equal(components.find((c) => c.id === b.id).rating, null)
  })

  await check('deleteComponent removes by id only', () => {
    const a = schema.createComponent({ name: 'A' })
    const b = schema.createComponent({ name: 'B' })
    const components = componentOps.deleteComponent([a, b], a.id)
    assert.deepEqual(components.map((c) => c.id), [b.id])
  })

  // ---- componentOps.js: fuzzy matcher truth table ----

  const matchCases = [
    ['canned chickpeas', 'Chickpeas', true, 'token-subset, extra qualifier word'],
    ['Chickpeas', 'canned chickpeas', true, 'token-subset, reversed direction'],
    ['mint', 'mint leaves', true, 'single token subset of multi-token'],
    ['tomatoes', 'tomato', true, 'plural -oes -> singular'],
    ['Tomatoes', 'TOMATO', true, 'case-insensitive'],
    ['chickpeas', 'CANNED Chickpeas', true, 'case-insensitive + subset'],
    ['rice', 'rice vinegar', true, 'accepted MVP looseness'],
    ['paneer', 'peanuts', false, 'similar spelling, no token overlap'],
    ['onion', 'garlic', false, 'unrelated'],
    ['', 'anything', false, 'empty set never matches'],
  ]
  for (const [a, b, expected, desc] of matchCases) {
    await check(`nameMatches("${a}", "${b}") === ${expected} (${desc})`, () => {
      assert.equal(componentOps.nameMatches(a, b), expected)
    })
  }

  // ---- componentOps.js: makeableStatus ----

  await check('makeableStatus near-miss returns exactly the missing ingredient', () => {
    const chutney = schema.createComponent({
      name: 'Mint chutney',
      ingredients: [
        { name: 'mint', measure: 'handful' },
        { name: 'cilantro', measure: 'handful' },
        { name: '', measure: '' }, // blank row ignored
      ],
    })
    const pantry = [
      schema.createPantryItem({ name: 'cilantro leaves', onHand: true }),
      schema.createPantryItem({ name: 'mint', onHand: false }),
    ]
    const status = componentOps.makeableStatus(chutney, pantry)
    assert.equal(status.makeable, false)
    assert.deepEqual(status.missing, ['mint'])
  })

  await check('zero ingredients is vacuously makeable', () => {
    const empty = schema.createComponent({ name: 'Nothing', ingredients: [] })
    assert.deepEqual(componentOps.makeableStatus(empty, []), { makeable: true, missing: [] })
  })

  await check('onHand flip flips makeable (gate-2 logic, pure form)', () => {
    const chutney = schema.createComponent({ name: 'Mint chutney', ingredients: [{ name: 'mint', measure: 'handful' }] })
    let pantry = [schema.createPantryItem({ name: 'mint', onHand: true })]
    assert.equal(componentOps.makeableStatus(chutney, pantry).makeable, true)
    pantry = pantry.map((p) => ({ ...p, onHand: false }))
    assert.equal(componentOps.makeableStatus(chutney, pantry).makeable, false)
    pantry = pantry.map((p) => ({ ...p, onHand: true }))
    assert.equal(componentOps.makeableStatus(chutney, pantry).makeable, true)
  })

  await check('off-hand pantry items never satisfy an ingredient', () => {
    const dish = schema.createComponent({ name: 'D', ingredients: [{ name: 'mint', measure: '1' }] })
    const pantry = [schema.createPantryItem({ name: 'mint', onHand: false })]
    assert.equal(componentOps.makeableStatus(dish, pantry).makeable, false)
  })

  // ---- componentOps.js: filterComponents over a fixture ----

  const curry = schema.createComponent({
    name: 'Chickpea coconut curry',
    type: 'dish',
    cuisineTags: ['Indian'],
    ingredients: [{ name: 'canned chickpeas', measure: '1 can' }],
    rating: 'repeat',
  })
  const chutney = schema.createComponent({
    name: 'Mint chutney',
    type: 'sauce',
    cuisineTags: ['indian'],
    ingredients: [{ name: 'mint', measure: 'handful' }],
    rating: null,
  })
  const archivedDish = schema.createComponent({
    name: 'Old chili',
    type: 'dish',
    cuisineTags: ['Mexican'],
    ingredients: [],
    archived: true,
  })
  const fixture = [curry, chutney, archivedDish]
  const pantryAllOnHand = [
    schema.createPantryItem({ name: 'canned chickpeas', onHand: true }),
    schema.createPantryItem({ name: 'mint', onHand: true }),
  ]
  const makeability = componentOps.makeabilityMap(fixture, pantryAllOnHand)

  await check('filterComponents: search matches by name', () => {
    const result = componentOps.filterComponents(fixture, { search: 'chut' }, makeability)
    assert.deepEqual(result.map((c) => c.name), ['Mint chutney'])
  })

  await check('filterComponents: search also matches ingredient name', () => {
    const result = componentOps.filterComponents(fixture, { search: 'chickpea' }, makeability)
    assert.deepEqual(result.map((c) => c.name), ['Chickpea coconut curry'])
  })

  await check('filterComponents: type isolates', () => {
    const result = componentOps.filterComponents(fixture, { type: 'sauce' }, makeability)
    assert.deepEqual(result.map((c) => c.name), ['Mint chutney'])
  })

  await check('filterComponents: cuisineTag is case-insensitive', () => {
    const result = componentOps.filterComponents(fixture, { cuisineTag: 'INDIAN' }, makeability)
    assert.deepEqual(
      result.map((c) => c.name).sort(),
      ['Chickpea coconut curry', 'Mint chutney'],
    )
  })

  await check('filterComponents: rating filters', () => {
    const result = componentOps.filterComponents(fixture, { rating: 'repeat' }, makeability)
    assert.deepEqual(result.map((c) => c.name), ['Chickpea coconut curry'])
  })

  await check('filterComponents: makeableOnly uses the makeability map', () => {
    const partialMakeability = componentOps.makeabilityMap(fixture, [
      schema.createPantryItem({ name: 'canned chickpeas', onHand: true }),
    ])
    const result = componentOps.filterComponents(fixture, { makeableOnly: true }, partialMakeability)
    assert.deepEqual(result.map((c) => c.name), ['Chickpea coconut curry'])
  })

  await check('filterComponents: archived hidden by default, shown with includeArchived', () => {
    const hidden = componentOps.filterComponents(fixture, {}, makeability)
    assert.ok(!hidden.some((c) => c.archived))
    const shown = componentOps.filterComponents(fixture, { includeArchived: true }, makeability)
    assert.ok(shown.some((c) => c.archived))
  })

  await check('allCuisineTags dedupes case-insensitively and sorts', () => {
    assert.deepEqual(componentOps.allCuisineTags(fixture), ['Indian', 'Mexican'])
  })

  // ---- storage.js: export -> reset -> import round trip with components ----

  await check('components survive export -> reset -> import round trip', async () => {
    await storage.resetState()
    await storage.set('components', [curry, chutney])

    const before = await storage.getFullState()
    const exported = await storage.exportState()

    await storage.resetState()
    const wiped = await storage.getFullState()
    assert.notDeepEqual(wiped.components, before.components)

    const result = await storage.importState(exported)
    assert.equal(result.ok, true, `import failed: ${JSON.stringify(result.errors)}`)

    const after = await storage.getFullState()
    assert.deepEqual(after, before)
  })

  await check('previewImport rejects an invalid component type at components[0].type', async () => {
    await storage.resetState()
    const state = await storage.getFullState()
    const badComponent = { ...schema.createComponent(), type: 'entree' }
    const badExport = { ...state, components: [badComponent] }
    const preview = await storage.previewImport(JSON.stringify(badExport))
    assert.equal(preview.ok, false)
    assert.ok(
      preview.errors.some((e) => e.startsWith('components[0].type')),
      `expected an error at components[0].type, got: ${JSON.stringify(preview.errors)}`,
    )
  })

  console.log(`\n${passed} checks passed.`)
} catch (err) {
  console.error(`\nFAILED after ${passed} checks:`)
  console.error(err)
  process.exit(1)
}

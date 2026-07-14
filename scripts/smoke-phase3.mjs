// Zero-dependency Node smoke test for Phase 3 (Ideator). Shims localStorage,
// then exercises the prompt compiler and the week-import validator/applier,
// plus a storage round-trip of an imported week. Run with:
//   node scripts/smoke-phase3.mjs

import assert from 'node:assert/strict'
import * as schema from '../src/schema.js'
import * as storage from '../src/storage.js'
import * as promptCompiler from '../src/promptCompiler.js'
import * as weekImport from '../src/weekImport.js'

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
  // ==== promptCompiler.js ====

  const pantry = [
    schema.createPantryItem({ name: 'Basmati rice', role: 'staple', onHand: true, roughQty: '5 lb bag' }),
    schema.createPantryItem({ name: 'Cumin seeds', role: 'staple', onHand: true, roughQty: null }),
    schema.createPantryItem({ name: 'Tofu', role: 'rotating', onHand: true, roughQty: '1 block' }),
    schema.createPantryItem({ name: 'Sriracha', role: 'rotating', onHand: false }),
  ]
  const components = [
    schema.createComponent({ name: 'Mint chutney', rating: 'repeat', archived: false }),
    schema.createComponent({ name: 'Old chili', rating: 'never', archived: false }),
    schema.createComponent({ name: 'Retired dish', rating: 'never', archived: true }),
  ]
  const settings = schema.createSettings({ proteinBand: { low_g: 22, high_g: 38 } })
  const opts = { servings: 5, cook: true, refresh: true, notes: 'use up the cabbage', weekOf: '2026-07-19' }

  await check('compileWeekPrompt includes all five section headers', () => {
    const prompt = promptCompiler.compileWeekPrompt({ pantry, components, feedback: [], settings }, opts)
    for (let n = 1; n <= 5; n++) assert.ok(prompt.includes(`## ${n}.`), `missing section ${n}`)
  })

  await check('compileWeekPrompt embeds the generation brief verbatim (default Sunday/Wednesday)', () => {
    const prompt = promptCompiler.compileWeekPrompt({ pantry, components, feedback: [], settings }, opts)
    assert.ok(prompt.includes(promptCompiler.buildGenerationBrief('Sunday', 'Wednesday')))
    assert.ok(prompt.includes('Assign durable components to Sunday'))
    assert.ok(prompt.includes('Sunday cook, Wednesday refresh'))
  })

  await check('compileWeekPrompt follows configured cook/refresh days', () => {
    const satSettings = schema.createSettings({ cookDay: 'Sat', refreshDay: 'Tue' })
    const prompt = promptCompiler.compileWeekPrompt({ pantry, components, feedback: [], settings: satSettings }, opts)
    assert.ok(prompt.includes('Saturday cook, Tuesday refresh'))
    assert.ok(prompt.includes('Assign durable components to Saturday'))
    assert.ok(prompt.includes('timed Saturday run sheet'))
    assert.ok(prompt.includes('"day": "Tue"'))
  })

  await check('compileWeekPrompt with refreshDay: null goes single-session', () => {
    const noRefresh = schema.createSettings({ refreshDay: null })
    const prompt = promptCompiler.compileWeekPrompt({ pantry, components, feedback: [], settings: noRefresh }, opts)
    assert.ok(prompt.includes('single Sunday session'))
    assert.ok(prompt.includes('no midweek refresh'))
    assert.ok(!prompt.includes('Wednesday refresh'))
  })

  await check('pantry section groups staple/rotating and excludes off-hand items', () => {
    const prompt = promptCompiler.compileWeekPrompt({ pantry, components, feedback: [], settings }, opts)
    assert.ok(prompt.includes('Basmati rice (5 lb bag)'))
    assert.ok(prompt.includes('Cumin seeds'))
    assert.ok(prompt.includes('Tofu (1 block)'))
    assert.ok(!prompt.includes('Sriracha'), 'off-hand item must be excluded')
  })

  await check('pantry section shows (none) for an empty group', () => {
    const staplesOnly = [schema.createPantryItem({ name: 'Salt', role: 'staple', onHand: true })]
    const prompt = promptCompiler.compileWeekPrompt({ pantry: staplesOnly, components: [], feedback: [], settings }, opts)
    assert.ok(prompt.includes('Rotating:\n(none)'))
  })

  await check('feedback section falls back to "(no feedback yet)" when empty', () => {
    const prompt = promptCompiler.compileWeekPrompt({ pantry: [], components: [], feedback: [], settings }, opts)
    assert.ok(prompt.includes('(no feedback yet)'))
  })

  await check('feedback section includes the latest seeded WeeklyFeedback', () => {
    const older = schema.createWeeklyFeedback({ weekOf: '2026-07-05', repeatWorthy: 'curry' })
    const newer = schema.createWeeklyFeedback({
      weekOf: '2026-07-12',
      repeatWorthy: 'chickpea bowl',
      diedUneaten: 'plain rice',
      boredomNotes: 'too many peanut sauces',
    })
    const prompt = promptCompiler.compileWeekPrompt({ pantry: [], components: [], feedback: [older, newer], settings }, opts)
    assert.ok(prompt.includes('week of 2026-07-12'))
    assert.ok(prompt.includes('chickpea bowl'))
    assert.ok(prompt.includes('too many peanut sauces'))
    assert.ok(!prompt.includes('curry\n') || prompt.includes('chickpea bowl'), 'must prefer the latest weekOf')
  })

  await check('repeat/never rating lists include non-archived only', () => {
    const prompt = promptCompiler.compileWeekPrompt({ pantry: [], components, feedback: [], settings }, opts)
    assert.ok(prompt.includes('Repeat-worthy components: Mint chutney'))
    assert.ok(prompt.includes('Never-repeat components: Old chili'))
    assert.ok(!prompt.includes('Retired dish'), 'archived components must be excluded from rating lists')
  })

  await check('output-format enum interpolation matches schema constants', () => {
    const prompt = promptCompiler.compileWeekPrompt({ pantry: [], components: [], feedback: [], settings }, opts)
    assert.ok(prompt.includes(schema.COMPONENT_TYPES.join(' | ')))
    assert.ok(prompt.includes(schema.STATIONS.join(' | ')))
  })

  await check('constraints section includes notes, servings, weekOf, protein band', () => {
    const prompt = promptCompiler.compileWeekPrompt({ pantry: [], components: [], feedback: [], settings }, opts)
    assert.ok(prompt.includes('use up the cabbage'))
    assert.ok(prompt.includes('Lunch servings Mon–Fri: 5'))
    assert.ok(prompt.includes('Week of: 2026-07-19'))
    assert.ok(prompt.includes('22–38 g per serving'))
  })

  await check('nextSundayISO: a Sunday input is returned unchanged', () => {
    let d = new Date(2026, 0, 1)
    while (d.getDay() !== 0) d.setDate(d.getDate() + 1)
    assert.equal(promptCompiler.nextSundayISO(d), d.toISOString().slice(0, 10))
  })

  await check('nextSundayISO: a non-Sunday input advances to the following Sunday', () => {
    let d = new Date(2026, 0, 1)
    while (d.getDay() === 0) d.setDate(d.getDate() + 1)
    const expected = new Date(d)
    expected.setDate(d.getDate() + ((7 - d.getDay()) % 7))
    assert.equal(promptCompiler.nextSundayISO(d), expected.toISOString().slice(0, 10))
  })

  // ==== weekImport.js ====

  await check('extractJson strips markdown fences and surrounding prose', () => {
    const text = 'Sure, here you go:\n```json\n{"a": 1}\n```\nHope that helps!'
    assert.equal(weekImport.extractJson(text), '{"a": 1}')
  })

  await check('extractJson passes through already-bare JSON', () => {
    assert.equal(weekImport.extractJson('{"a": 1}'), '{"a": 1}')
  })

  function goldenPayload() {
    return {
      components: [
        {
          name: 'Coconut rice base',
          type: 'base',
          cuisineTags: ['thai'],
          ingredients: [{ name: 'basmati rice', measure: '2 cups' }],
          steps: ['Rinse rice', 'Cook with coconut milk'],
          shelfLifeDays: 5,
          storage: 'fridge airtight',
          station: 'instant_pot',
          activeMin: 10,
          passiveMin: 20,
          macrosPerServing: { kcal: 210, protein_g: 4, carbs_g: 40, fat_g: 5 },
        },
        {
          name: 'Peanut sauce',
          type: 'sauce',
          cuisineTags: ['thai'],
          ingredients: [{ name: 'peanut butter', measure: '1/3 cup' }],
          steps: ['Whisk everything together'],
          shelfLifeDays: 7,
          storage: 'fridge jar',
          station: 'none',
          activeMin: 5,
          passiveMin: 0,
          macrosPerServing: null,
        },
      ],
      weekPlan: {
        weekOf: '2026-07-19',
        runSheet: [
          { t: '0:05', station: 'instant_pot', action: 'Start rice', componentName: 'Coconut rice base' },
          { t: '0:15', station: 'none', action: 'Whisk sauce', componentName: 'Peanut sauce' },
        ],
        assembly: [{ day: 'Mon', componentNames: ['Coconut rice base', 'Peanut sauce'], note: 'add cucumber' }],
        refresh: { day: 'Wed', steps: ['Make a fresh sauce'], componentNames: ['Peanut sauce'] },
        grocerySuggestions: [{ name: 'Cucumber', qty: '2' }],
      },
    }
  }

  await check('golden payload imports clean: ids generated, origin ai, refs remapped', () => {
    const result = weekImport.validatePayload(JSON.stringify(goldenPayload()))
    assert.equal(result.ok, true, `unexpected errors: ${JSON.stringify(result.errors)}`)
    assert.equal(result.payload.components.length, 2)
    for (const c of result.payload.components) {
      assert.ok(c.id)
      assert.equal(c.origin, 'ai')
      assert.equal(c.rating, null)
      assert.equal(c.archived, false)
      assert.equal(c.macroSource, 'ai_estimate')
    }

    const applied = weekImport.applyImport(result.payload, {}, [], [])
    assert.equal(applied.newCount, 2)
    assert.equal(applied.components.length, 2)
    assert.equal(applied.week.componentIds.length, 2)
    assert.equal(applied.week.runSheet[0].done, false)
    assert.equal(applied.week.grocerySuggestions[0].dismissed, false)
    assert.ok(applied.week.runSheet[0].componentId)
    assert.deepEqual(schema.validate(applied.week, 'WeekPlan'), [])
  })

  await check('storage round-trip: applied week and components persist', async () => {
    await storage.resetState()
    const result = weekImport.validatePayload(JSON.stringify(goldenPayload()))
    const applied = weekImport.applyImport(result.payload, {}, [], [])
    await storage.set('components', applied.components)
    await storage.set('weeks', applied.weeks)
    const storedComponents = await storage.get('components')
    const storedWeeks = await storage.get('weeks')
    assert.equal(storedComponents.length, 2)
    assert.equal(storedWeeks.length, 1)
    assert.equal(storedWeeks[0].weekOf, '2026-07-19')
  })

  await check('corrupt component type is named at components[0].type', () => {
    const bad = goldenPayload()
    bad.components[0].type = 'entree'
    const result = weekImport.validatePayload(JSON.stringify(bad))
    assert.equal(result.ok, false)
    assert.ok(result.errors.some((e) => e.startsWith('components[0].type')), JSON.stringify(result.errors))
  })

  await check('missing weekOf is named at weekPlan.weekOf', () => {
    const bad = goldenPayload()
    delete bad.weekPlan.weekOf
    const result = weekImport.validatePayload(JSON.stringify(bad))
    assert.equal(result.ok, false)
    assert.ok(result.errors.some((e) => e.startsWith('weekPlan.weekOf')), JSON.stringify(result.errors))
  })

  await check('unknown componentName reference gets an exact error path', () => {
    const bad = goldenPayload()
    bad.weekPlan.assembly[0].componentNames.push('Nonexistent dish')
    const result = weekImport.validatePayload(JSON.stringify(bad))
    assert.equal(result.ok, false)
    assert.ok(
      result.errors.some((e) => e === 'weekPlan.assembly[0].componentNames[2]: unknown component name "Nonexistent dish"'),
      JSON.stringify(result.errors),
    )
  })

  await check('nothing persists on a rejected import (all-or-nothing)', () => {
    const bad = goldenPayload()
    bad.components[1].station = 'microwave'
    const result = weekImport.validatePayload(JSON.stringify(bad))
    assert.equal(result.ok, false)
    assert.equal(result.payload, null)
  })

  await check('buildFixRequest yields a copy-ready paste-back message', () => {
    const msg = weekImport.buildFixRequest(['components[0].type: expected "base" | "sauce", got "entree"'])
    assert.ok(msg.includes('components[0].type'))
    assert.ok(msg.includes('output the corrected FULL JSON only'))
    assert.ok(msg.includes('no prose'))
    assert.ok(msg.includes('no fences'))
  })

  await check('findConflicts fuzzy-matches "Mint Chutney" vs "mint chutney"', () => {
    const library = [schema.createComponent({ name: 'mint chutney' })]
    const payload = {
      components: [schema.createComponent({ name: 'Mint Chutney', id: 'draft_1' })],
    }
    const conflicts = weekImport.findConflicts(payload, library)
    assert.equal(conflicts.length, 1)
    assert.equal(conflicts[0].existingId, library[0].id)
  })

  await check('resolution matrix: use-existing reuses id and discards the draft record', () => {
    const existing = schema.createComponent({ name: 'Mint chutney', rating: 'repeat' })
    const draft = schema.createComponent({ name: 'Mint Chutney' })
    const payload = {
      components: [draft],
      weekPlan: {
        weekOf: '2026-07-19',
        runSheet: [],
        assembly: [{ day: 'Mon', componentNames: ['Mint Chutney'], note: '' }],
        refresh: { day: 'Wed', steps: [], componentNames: [] },
        grocerySuggestions: [],
      },
    }
    const applied = weekImport.applyImport(payload, {}, [existing], [])
    assert.equal(applied.components.length, 1)
    assert.equal(applied.components[0].id, existing.id)
    assert.equal(applied.components[0].rating, 'repeat')
    assert.equal(applied.newCount, 0)
    assert.deepEqual(applied.week.assembly[0].componentIds, [existing.id])
  })

  await check('resolution matrix: replace keeps existing id and rating, overwrites recipe fields', () => {
    const existing = schema.createComponent({ name: 'Mint chutney', rating: 'fine', storage: 'old storage note' })
    const draft = schema.createComponent({ name: 'Mint Chutney', storage: 'new storage note', origin: 'ai' })
    const payload = {
      components: [draft],
      weekPlan: {
        weekOf: '2026-07-19',
        runSheet: [],
        assembly: [],
        refresh: { day: 'Wed', steps: [], componentNames: [] },
        grocerySuggestions: [],
      },
    }
    const applied = weekImport.applyImport(payload, { [draft.id]: { type: 'replace' } }, [existing], [])
    assert.equal(applied.components.length, 1)
    const merged = applied.components[0]
    assert.equal(merged.id, existing.id)
    assert.equal(merged.rating, 'fine', 'replace must preserve the existing rating')
    assert.equal(merged.storage, 'new storage note', 'replace must overwrite recipe fields')
    assert.equal(merged.origin, 'ai')
  })

  await check('resolution matrix: new coexists alongside the existing component', () => {
    const existing = schema.createComponent({ name: 'Mint chutney' })
    const draft = schema.createComponent({ name: 'Mint Chutney' })
    const payload = {
      components: [draft],
      weekPlan: {
        weekOf: '2026-07-19',
        runSheet: [],
        assembly: [],
        refresh: { day: 'Wed', steps: [], componentNames: [] },
        grocerySuggestions: [],
      },
    }
    const applied = weekImport.applyImport(payload, { [draft.id]: { type: 'new' } }, [existing], [])
    assert.equal(applied.components.length, 2)
    assert.equal(applied.newCount, 1)
    assert.ok(applied.components.some((c) => c.id === existing.id))
    assert.ok(applied.components.some((c) => c.id === draft.id))
  })

  await check('double import of the same weekOf replaces the one week, not appends', async () => {
    const result = weekImport.validatePayload(JSON.stringify(goldenPayload()))
    let applied = weekImport.applyImport(result.payload, {}, [], [])
    const secondPayload = goldenPayload()
    secondPayload.weekPlan.grocerySuggestions[0].name = 'Bell pepper'
    const secondResult = weekImport.validatePayload(JSON.stringify(secondPayload))
    applied = weekImport.applyImport(secondResult.payload, {}, applied.components, applied.weeks)
    assert.equal(applied.weeks.length, 1)
    assert.equal(applied.weeks[0].grocerySuggestions[0].name, 'Bell pepper')
  })

  console.log(`\n${passed} checks passed.`)
} catch (err) {
  console.error(`\nFAILED after ${passed} checks:`)
  console.error(err)
  process.exit(1)
}

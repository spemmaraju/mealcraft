// Zero-dependency Node smoke test for Phase 6 (BYOK + PWA). Shims localStorage,
// then exercises schema v4 + key-safe export/import (Gate 1 subset + Gate 3),
// with more checks appended at later checkpoints (aiClient/byok, PWA statics).
// No network — provider calls are stubbed via injectable chatFn.
// Run with:
//   node scripts/smoke-phase6.mjs

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

function baseV3Settings(overrides = {}) {
  return {
    proteinBand: { low_g: 20, high_g: 35 },
    boughtLunchCost: 12,
    apiMode: 'paste',
    provider: 'anthropic',
    apiKey: null,
    fdcKey: null,
    ...overrides,
  }
}

function v3State(overrides = {}) {
  return {
    schemaVersion: 3,
    categories: ['Produce'],
    pantry: [],
    components: [],
    weeks: [],
    logs: [],
    feedback: [],
    settings: baseV3Settings(),
    ...overrides,
  }
}

try {
  // ==== Gate 1: offline paste mode intact ====

  await check('createSettings() has lastExportAt: null and validates', () => {
    const settings = schema.createSettings()
    assert.equal(settings.lastExportAt, null)
    assert.deepEqual(schema.validate(settings, 'Settings'), [])
  })

  await check('v3->v4 migration of a seeded v3 blob; re-persisted schemaVersion: 4', async () => {
    await storage.resetState()
    const result = await storage.importState(JSON.stringify(v3State()))
    assert.equal(result.ok, true, `unexpected errors: ${JSON.stringify(result.errors)}`)
    const state = await storage.getFullState()
    assert.equal(state.schemaVersion, 4)
    assert.equal(state.settings.lastExportAt, null)
  })

  await check('importState accepts both a v3 export string and a v4 export string', async () => {
    await storage.resetState()
    const v3Result = await storage.importState(JSON.stringify(v3State()))
    assert.equal(v3Result.ok, true, `unexpected errors: ${JSON.stringify(v3Result.errors)}`)

    await storage.resetState()
    const v4Blob = { ...v3State({ schemaVersion: 4 }), settings: schema.createSettings() }
    const v4Result = await storage.importState(JSON.stringify(v4Blob))
    assert.equal(v4Result.ok, true, `unexpected errors: ${JSON.stringify(v4Result.errors)}`)
  })

  await check('regression: compileWeekPrompt 5 sections; validatePayload/applyImport round-trip', () => {
    const pantry = [schema.createPantryItem({ name: 'Basmati rice', role: 'staple', onHand: true })]
    const components = [schema.createComponent({ name: 'Mint chutney', rating: 'repeat', archived: false })]
    const settings = schema.createSettings()
    const opts = { servings: 5, cookSunday: true, wedRefresh: true, notes: '', weekOf: '2026-07-19' }
    const prompt = promptCompiler.compileWeekPrompt({ pantry, components, feedback: [], settings }, opts)
    for (let n = 1; n <= 5; n++) assert.ok(prompt.includes(`## ${n}.`), `missing section ${n}`)

    const payload = {
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
      ],
      weekPlan: {
        weekOf: '2026-07-19',
        componentIds: [],
        runSheet: [],
        assembly: [],
        refresh: { day: 'Wed', steps: [], componentNames: [] },
        grocerySuggestions: [],
      },
    }
    const result = weekImport.validatePayload(JSON.stringify(payload))
    assert.equal(result.ok, true, `unexpected errors: ${JSON.stringify(result.errors)}`)
    const applied = weekImport.applyImport(result.payload, {}, [], [])
    assert.deepEqual(schema.validate(applied.weeks[0], 'WeekPlan'), [])
  })

  // ==== Gate 3: key hygiene ====

  await check('exportState() redacts keys; parsed export has both fields null', async () => {
    await storage.resetState()
    const settings = await storage.get('settings')
    await storage.set('settings', { ...settings, apiKey: 'sk-ant-secret123', fdcKey: 'fdc-secret456' })
    const json = await storage.exportState()
    assert.ok(!json.includes('sk-ant-secret123'))
    assert.ok(!json.includes('fdc-secret456'))
    const parsed = JSON.parse(json)
    assert.equal(parsed.settings.apiKey, null)
    assert.equal(parsed.settings.fdcKey, null)
  })

  await check('import of an old export containing a key: stored key equals device pre-import value', async () => {
    await storage.resetState()
    await storage.set('settings', { ...(await storage.get('settings')), apiKey: 'device-key-1' })

    const incoming = v3State({ settings: baseV3Settings({ apiKey: 'imported-key-should-be-ignored' }) })
    const result = await storage.importState(JSON.stringify(incoming))
    assert.equal(result.ok, true, `unexpected errors: ${JSON.stringify(result.errors)}`)
    const settings = await storage.get('settings')
    assert.equal(settings.apiKey, 'device-key-1', 'import must never plant a key from the file')

    await storage.resetState()
    const noDeviceKey = v3State({ settings: baseV3Settings({ apiKey: 'imported-key-should-be-ignored' }) })
    const result2 = await storage.importState(JSON.stringify(noDeviceKey))
    assert.equal(result2.ok, true)
    assert.equal((await storage.get('settings')).apiKey, null, 'import must never plant a key when device has none')
  })

  await check('after Remove (apiKey: null), full serialized state contains no key substring', async () => {
    await storage.resetState()
    const settings = await storage.get('settings')
    await storage.set('settings', { ...settings, apiKey: 'sk-ant-secret789' })
    await storage.set('settings', { ...(await storage.get('settings')), apiKey: null })
    const state = await storage.getFullState()
    assert.ok(!JSON.stringify(state).includes('sk-ant-secret789'))
  })

  await check('markExported() stamps ISO; survives export->import round trip', async () => {
    await storage.resetState()
    await storage.markExported()
    const stamped = await storage.get('settings')
    assert.ok(typeof stamped.lastExportAt === 'string' && stamped.lastExportAt.length > 0)

    const exported = await storage.exportState()
    await storage.resetState()
    const result = await storage.importState(exported)
    assert.equal(result.ok, true, `unexpected errors: ${JSON.stringify(result.errors)}`)
    assert.equal((await storage.get('settings')).lastExportAt, stamped.lastExportAt)
  })

  console.log(`\n${passed} passed`)
} catch (err) {
  console.error(`\nFAILED after ${passed} passed`)
  console.error(err)
  process.exit(1)
}

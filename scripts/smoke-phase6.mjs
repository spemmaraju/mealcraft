// Zero-dependency Node smoke test for Phase 6 (BYOK + PWA). Shims localStorage,
// then exercises schema v4 + key-safe export/import (Gate 1 subset + Gate 3),
// with more checks appended at later checkpoints (aiClient/byok, PWA statics).
// No network — provider calls are stubbed via injectable chatFn.
// Run with:
//   node scripts/smoke-phase6.mjs

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as schema from '../src/schema.js'
import * as storage from '../src/storage.js'
import { SCHEMA_VERSION } from '../src/storage.js'
import * as promptCompiler from '../src/promptCompiler.js'
import * as aiReplyOps from '../src/aiReplyOps.js'
import * as aiClient from '../src/aiClient.js'
import * as byok from '../src/byok.js'
import * as componentOps from '../src/componentOps.js'
import * as nutritionLookup from '../src/nutritionLookup.js'
import * as backupOps from '../src/backupOps.js'

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

  await check('v3 blob migrates through the chain; re-persisted at current schemaVersion', async () => {
    await storage.resetState()
    const result = await storage.importState(JSON.stringify(v3State()))
    assert.equal(result.ok, true, `unexpected errors: ${JSON.stringify(result.errors)}`)
    const state = await storage.getFullState()
    assert.equal(state.schemaVersion, SCHEMA_VERSION)
    assert.equal(state.settings.lastExportAt, null)
    assert.equal(state.settings.cookDay, 'Sun')
    assert.equal(state.settings.refreshDay, 'Wed')
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

  await check('sw.js static: version string present; all four network-only hostnames listed; precache is BASE-relative (no hardcoded absolute/cross-origin URLs)', () => {
    const swText = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf-8')
    assert.match(swText, /CACHE\s*=\s*['"]mealcraft-shell-v\d+['"]/)
    for (const host of ['world.openfoodfacts.org', 'api.nal.usda.gov', 'api.anthropic.com', 'generativelanguage.googleapis.com']) {
      assert.ok(swText.includes(host), `sw.js must list ${host}`)
    }
    // BASE is computed from this file's own location (works under any deploy
    // subpath, e.g. GitHub Pages) rather than hardcoded — precached filenames
    // are BASE-relative, not absolute root paths.
    assert.ok(swText.includes('self.location'), 'BASE must be derived from self.location, not hardcoded')
    const precacheMatch = swText.match(/PRECACHE_URLS\s*=\s*(\[[^\]]*\])/)
    assert.ok(precacheMatch, 'PRECACHE_URLS not found')
    assert.ok(!/https?:\/\//.test(precacheMatch[1]), 'precache list must not hardcode an absolute/cross-origin URL')
    for (const file of ['index.html', 'manifest.json', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png']) {
      assert.ok(precacheMatch[1].includes(file), `PRECACHE_URLS must include ${file}`)
    }
  })

  // ==== Gate 2: BYOK, zero manual JSON ====

  // Phase 17: the retry-loop checks below originally drove the removed
  // generateWeekViaApi; they now drive regenerateComponentViaApi, which
  // shares the same chatWithOneRetry loop in byok.js.
  function goldenComponentReplyText() {
    const component = {
      name: 'Coconut rice base',
      type: 'base',
      ingredients: [{ name: 'basmati rice', measure: '2 cups' }],
      steps: ['Rinse rice', 'Cook with coconut milk'],
      shelfLifeDays: 5,
      storage: 'fridge airtight',
      station: 'instant_pot',
      activeMin: 10,
      passiveMin: 20,
      macrosPerServing: { kcal: 210, protein_g: 4, carbs_g: 40, fat_g: 5 },
    }
    return 'Here it is:\n```json\n' + JSON.stringify(component) + '\n```\nEnjoy!'
  }

  await check('buildAnthropicRequest: exact URL/headers, model, no temperature/top_p', () => {
    const { url, headers, body } = aiClient.buildAnthropicRequest('sk-test', [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }], 1000)
    assert.equal(url, 'https://api.anthropic.com/v1/messages')
    assert.equal(headers['x-api-key'], 'sk-test')
    assert.equal(headers['anthropic-version'], '2023-06-01')
    assert.equal(headers['anthropic-dangerous-direct-browser-access'], 'true')
    assert.equal(headers['content-type'], 'application/json')
    assert.equal(body.model, 'claude-sonnet-5-5') // Phase 17
    assert.equal(body.max_tokens, 1000)
    assert.deepEqual(body.thinking, { type: 'between_tools' }, 'thinking off so small max_tokens calls never truncate')
    assert.ok(!('temperature' in body))
    assert.ok(!('top_p' in body))
  })

  await check('buildGoogleRequest: URL ends generateContent, key in header not URL', () => {
    const { url, headers, body } = aiClient.buildGoogleRequest('AIza-test', [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }], 1000)
    assert.ok(url.endsWith('gemini-2.5-flash:generateContent'), url)
    assert.ok(!url.includes('AIza-test'), 'key must never appear in the URL')
    assert.equal(headers['x-goog-api-key'], 'AIza-test')
    assert.equal(body.generationConfig.maxOutputTokens, 1000)
  })

  await check('extractAnthropicText: multi-block join; stop_reason max_tokens -> truncation error', () => {
    const ok = aiClient.extractAnthropicText({
      content: [
        { type: 'text', text: 'Hello ' },
        { type: 'text', text: 'world' },
      ],
      stop_reason: 'end_turn',
    })
    assert.equal(ok.ok, true)
    assert.equal(ok.text, 'Hello world')

    const truncated = aiClient.extractAnthropicText({ content: [{ type: 'text', text: 'partial' }], stop_reason: 'max_tokens' })
    assert.equal(truncated.ok, false)
    assert.ok(truncated.error.toLowerCase().includes('cut off'))

    const refused = aiClient.extractAnthropicText({ content: [], stop_reason: 'refusal' })
    assert.equal(refused.ok, false)
    assert.ok(refused.error.toLowerCase().includes('declined'))
  })

  await check('extractGoogleText: Gemini fixture multi-part join', () => {
    const result = aiClient.extractGoogleText({ candidates: [{ content: { parts: [{ text: 'Hello ' }, { text: 'Gemini' }] } }] })
    assert.equal(result.ok, true)
    assert.equal(result.text, 'Hello Gemini')
  })

  await check('image-block mapping: Anthropic base64 source, Google inline_data', () => {
    const messages = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'what is this' },
          { type: 'image', mediaType: 'image/jpeg', data: 'BASE64DATA' },
        ],
      },
    ]
    const anthropic = aiClient.buildAnthropicRequest('key', messages, 500)
    assert.deepEqual(anthropic.body.messages[0].content[1], {
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: 'BASE64DATA' },
    })

    const google = aiClient.buildGoogleRequest('key', messages, 500)
    assert.deepEqual(google.body.contents[0].parts[1], { inline_data: { mime_type: 'image/jpeg', data: 'BASE64DATA' } })
  })

  await check('regenerateComponentViaApi: happy path fenced/prose reply -> ok attempts:1; valid Component', async () => {
    const stubChat = async () => ({ ok: true, text: goldenComponentReplyText() })
    const result = await byok.regenerateComponentViaApi({ provider: 'anthropic', apiKey: 'k', prompt: 'compile...', chatFn: stubChat })
    assert.equal(result.ok, true, `unexpected errors: ${JSON.stringify(result.errors)}`)
    assert.equal(result.attempts, 1)
    assert.deepEqual(schema.validate(result.component, 'Component'), [])
  })

  await check('regenerateComponentViaApi: retry loop rebuilds messages [prompt, assistant garbage, fix-request]; valid second -> attempts:2', async () => {
    let callCount = 0
    let secondMessages = null
    const stubChat = async ({ messages }) => {
      callCount++
      if (callCount === 1) return { ok: true, text: 'not json at all' }
      secondMessages = messages
      return { ok: true, text: goldenComponentReplyText() }
    }
    const result = await byok.regenerateComponentViaApi({ provider: 'anthropic', apiKey: 'k', prompt: 'THE PROMPT', chatFn: stubChat })
    assert.equal(result.ok, true, `unexpected errors: ${JSON.stringify(result.errors)}`)
    assert.equal(result.attempts, 2)
    assert.equal(secondMessages.length, 3)
    assert.equal(secondMessages[0].role, 'user')
    assert.equal(secondMessages[0].content[0].text, 'THE PROMPT')
    assert.equal(secondMessages[1].role, 'assistant')
    assert.equal(secondMessages[1].content[0].text, 'not json at all')
    assert.equal(secondMessages[2].role, 'user')
    assert.ok(secondMessages[2].content[0].text.includes('validation errors'))
  })

  await check('regenerateComponentViaApi: double failure -> errors+rawText; transport failure -> 1 attempt, no retry', async () => {
    let callCount = 0
    const alwaysGarbage = async () => {
      callCount++
      return { ok: true, text: 'still not json' }
    }
    const doubleFail = await byok.regenerateComponentViaApi({ provider: 'anthropic', apiKey: 'k', prompt: 'p', chatFn: alwaysGarbage })
    assert.equal(doubleFail.ok, false)
    assert.equal(doubleFail.attempts, 2)
    assert.ok(Array.isArray(doubleFail.errors) && doubleFail.errors.length > 0)
    assert.equal(doubleFail.rawText, 'still not json')
    assert.equal(callCount, 2)

    callCount = 0
    const transportFail = async () => {
      callCount++
      return { ok: false, error: 'Network request failed — check your connection and try again.' }
    }
    const failResult = await byok.regenerateComponentViaApi({ provider: 'anthropic', apiKey: 'k', prompt: 'p', chatFn: transportFail })
    assert.equal(failResult.ok, false)
    assert.equal(failResult.attempts, 1)
    assert.equal(callCount, 1, 'transport failure must not retry')
  })

  await check('compileComponentPrompt: pantry, component name, instruction, protein band, single-object rules', () => {
    const pantry = [schema.createPantryItem({ name: 'Ginger', role: 'staple', onHand: true })]
    const component = schema.createComponent({ name: 'Peanut sauce' })
    const settings = schema.createSettings({ proteinBand: { low_g: 20, high_g: 35 } })
    const prompt = promptCompiler.compileComponentPrompt(
      { component, pantry, settings },
      { mode: 'regenerate', instruction: 'make it spicier' },
    )
    assert.ok(prompt.includes('Ginger'))
    assert.ok(prompt.includes('Peanut sauce'))
    assert.ok(prompt.includes('make it spicier'))
    assert.ok(prompt.includes('20') && prompt.includes('35'))
    assert.ok(prompt.toLowerCase().includes('one json object'))
  })

  await check('validateComponentReply: good reply -> valid Component ai/ai_estimate; bad fixtures -> named errors', () => {
    const good = {
      name: 'Spicy peanut sauce',
      type: 'sauce',
      cuisineTags: ['thai'],
      ingredients: [{ name: 'peanut butter', measure: '1/3 cup' }],
      steps: ['Whisk'],
      shelfLifeDays: 7,
      storage: 'fridge jar',
      station: 'none',
      activeMin: 5,
      passiveMin: 0,
      macrosPerServing: null,
    }
    const result = aiReplyOps.validateComponentReply('```json\n' + JSON.stringify(good) + '\n```')
    assert.equal(result.ok, true, `unexpected errors: ${JSON.stringify(result.errors)}`)
    assert.equal(result.component.origin, 'ai')
    assert.equal(result.component.macroSource, 'ai_estimate')
    assert.deepEqual(schema.validate(result.component, 'Component'), [])

    const missingName = aiReplyOps.validateComponentReply(JSON.stringify({ type: 'sauce' }))
    assert.equal(missingName.ok, false)
    assert.ok(missingName.errors[0].startsWith('name:'))

    const badType = aiReplyOps.validateComponentReply(JSON.stringify({ ...good, type: 'nonsense' }))
    assert.equal(badType.ok, false)
    assert.ok(badType.errors.some((e) => e.includes('type')))

    const garbage = aiReplyOps.validateComponentReply('not json')
    assert.equal(garbage.ok, false)
    assert.ok(garbage.errors[0].startsWith('(json)'))
  })

  await check('regenerate keeps id+rating through upsertComponent', () => {
    const original = schema.createComponent({ id: 'c-orig', name: 'Old sauce', rating: 'repeat' })
    const newDraft = schema.createComponent({ id: 'c-new-draft', name: 'New sauce', rating: null, origin: 'ai' })
    const replaced = { ...newDraft, id: original.id, rating: original.rating }
    const library = componentOps.upsertComponent([original], replaced)
    assert.equal(library.length, 1)
    assert.equal(library[0].id, 'c-orig')
    assert.equal(library[0].name, 'New sauce')
    assert.equal(library[0].rating, 'repeat')
  })

  // Phase 17: moved here from smoke-phase3.mjs (deleted with weekImport.js);
  // these helpers now live in aiReplyOps.js and serve every paste/BYOK flow.
  await check('extractJson strips markdown fences and surrounding prose', () => {
    const text = 'Sure, here you go:\n```json\n{"a": 1}\n```\nHope that helps!'
    assert.equal(aiReplyOps.extractJson(text), '{"a": 1}')
  })

  await check('extractJson passes through already-bare JSON', () => {
    assert.equal(aiReplyOps.extractJson('{"a": 1}'), '{"a": 1}')
  })

  await check('buildFixRequest yields a copy-ready paste-back message', () => {
    const msg = aiReplyOps.buildFixRequest(['components[0].type: expected "base" | "sauce", got "entree"'])
    assert.ok(msg.includes('components[0].type'))
    assert.ok(msg.includes('output the corrected FULL JSON only'))
    assert.ok(msg.includes('no prose'))
    assert.ok(msg.includes('no fences'))
  })

  await check('mapLabelReply: fenced-JSON -> valid NutritionInfo source:label_photo; garbage -> null', () => {
    const reply =
      'Here:\n```json\n' +
      JSON.stringify({
        servingDesc: '1 cup (245 g)',
        servingsPerContainer: 4,
        perServing: { kcal: 210, protein_g: 8, carbs_g: 30, fat_g: 5, fiber_g: 3 },
      }) +
      '\n```'
    const nutrition = nutritionLookup.mapLabelReply(reply)
    assert.ok(nutrition)
    assert.equal(nutrition.source, 'label_photo')
    assert.deepEqual(schema.validate(nutrition, 'NutritionInfo'), [])

    assert.equal(nutritionLookup.mapLabelReply('not json'), null)
    assert.equal(nutritionLookup.mapLabelReply(JSON.stringify({ servingDesc: 'x' })), null, 'missing perServing -> null')
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

  await check('shouldNudgeBackup: null+no-data false; null+data true; 15d true; 13d false', () => {
    const nowISO = '2026-07-19T00:00:00.000Z'
    assert.equal(backupOps.shouldNudgeBackup({ lastExportAt: null, hasUserData: false, nowISO }), false)
    assert.equal(backupOps.shouldNudgeBackup({ lastExportAt: null, hasUserData: true, nowISO }), true)
    const fifteenDaysAgo = '2026-07-04T00:00:00.000Z'
    assert.equal(backupOps.shouldNudgeBackup({ lastExportAt: fifteenDaysAgo, hasUserData: true, nowISO }), true)
    const thirteenDaysAgo = '2026-07-06T00:00:00.000Z'
    assert.equal(backupOps.shouldNudgeBackup({ lastExportAt: thirteenDaysAgo, hasUserData: true, nowISO }), false)
  })

  // ==== Gate 4: installability, static proxies ====

  await check('manifest.json: parses; name/short_name; standalone; 192+512+maskable icons; PNG magic bytes', () => {
    const manifest = JSON.parse(readFileSync(new URL('../public/manifest.json', import.meta.url), 'utf-8'))
    assert.equal(manifest.name, 'MealCraft')
    assert.equal(manifest.short_name, 'MealCraft')
    assert.equal(manifest.display, 'standalone')
    const sizes = manifest.icons.map((i) => i.sizes)
    assert.ok(sizes.includes('192x192'))
    assert.ok(sizes.includes('512x512'))
    assert.ok(manifest.icons.some((i) => i.purpose === 'maskable'))

    assert.equal(manifest.start_url, '.', 'start_url must be relative so it works under any deploy subpath')
    assert.ok(
      manifest.icons.every((i) => !i.src.startsWith('/')),
      'icon src must be relative (no leading slash) so it works under any deploy subpath',
    )

    const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    for (const icon of manifest.icons) {
      const bytes = readFileSync(new URL(`../public/${icon.src}`, import.meta.url))
      assert.ok(bytes.subarray(0, 8).equals(pngMagic), `${icon.src} is not a valid PNG`)
    }
    const appleTouchIcon = readFileSync(new URL('../public/apple-touch-icon.png', import.meta.url))
    assert.ok(appleTouchIcon.subarray(0, 8).equals(pngMagic), 'apple-touch-icon.png is not a valid PNG')
  })

  await check('index.html: manifest link, theme-color, apple-touch-icon, apple title', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf-8')
    assert.ok(html.includes('rel="manifest"'))
    assert.ok(html.includes('name="theme-color"'))
    assert.ok(html.includes('rel="apple-touch-icon"'))
    assert.ok(html.includes('apple-mobile-web-app-title" content="MealCraft"'))
  })

  await check('main.jsx: registers sw.js (BASE_URL-relative) guarded by import.meta.env.PROD', () => {
    const mainText = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf-8')
    assert.ok(mainText.includes('import.meta.env.PROD'))
    assert.ok(mainText.includes('import.meta.env.BASE_URL'))
    assert.ok(mainText.includes('sw.js'))
  })

  console.log(`\n${passed} passed`)
} catch (err) {
  console.error(`\nFAILED after ${passed} passed`)
  console.error(err)
  process.exit(1)
}

// Zero-dependency Node smoke test for Phase 18 (free-text parser + review
// card, mode 'meal'): prompt compiler, reply validator, draft rows ->
// LogEntry items, and the BYOK retry loop with a stubbed chatFn. No network.
// Run with:
//   node scripts/smoke-phase18.mjs

import assert from 'node:assert/strict'
import * as schema from '../src/schema.js'
import * as parseOps from '../src/parseOps.js'
import * as byok from '../src/byok.js'
import * as trackOps from '../src/trackOps.js'
import { findSeedForName } from '../src/nutritionOps.js'
import * as measures from '../src/measures.js'

let passed = 0
async function check(label, fn) {
  await fn()
  passed++
  console.log(`ok - ${label}`)
}

const toorDal = schema.createPantryItem({
  id: 'p_dal',
  name: 'Toor dal',
  category: 'Legumes',
  onHand: true,
  nutrition: findSeedForName('toor dal'),
})
const atta = schema.createPantryItem({ id: 'p_atta', name: 'Atta', category: 'Grains & Bases', onHand: true, nutrition: null })
const pantry = [toorDal, atta]

const DICTATION = 'so um I had like two rotis with a bowl of toor dal and uh one cup of dal actually and some raita and a handful of almonds'

function goodReply() {
  return {
    items: [
      { name: 'Roti', measure: '2 rotis', grams: 80, pantryMatch: null, estimate: { kcal: 240, protein_g: 8, carbs_g: 44, fat_g: 4 } },
      { name: 'Toor dal', measure: '1 cup', grams: 202, pantryMatch: 'toor dal', estimate: { kcal: 200, protein_g: 13, carbs_g: 38, fat_g: 1 } },
      { name: 'Raita', measure: 'some', grams: null, pantryMatch: null, estimate: { kcal: 60, protein_g: 3, carbs_g: 5, fat_g: 3 } },
      { name: 'Almonds', measure: 'a handful', grams: 28, pantryMatch: 'Almonds (raw)', estimate: { kcal: 164, protein_g: 6, carbs_g: 6, fat_g: 14 } },
    ],
  }
}

function fenced(obj) {
  return 'Here you go:\n```json\n' + JSON.stringify(obj) + '\n```'
}

try {
  // ==== compileParsePrompt ====

  await check('compileParsePrompt: carries the dictated text, every pantry name, and the JSON-only contract', () => {
    const prompt = parseOps.compileParsePrompt({ text: DICTATION, pantry })
    assert.ok(prompt.includes(DICTATION))
    assert.ok(prompt.includes('- Toor dal'))
    assert.ok(prompt.includes('- Atta'))
    assert.ok(prompt.includes('Output ONLY one JSON object'))
    assert.ok(prompt.includes('"pantryMatch"'))
  })

  await check('compileParsePrompt: empty pantry shows (none)', () => {
    assert.ok(parseOps.compileParsePrompt({ text: 'an apple', pantry: [] }).includes('(none)'))
  })

  // ==== validateParseReply ====

  await check('validateParseReply: fenced good reply -> items; case-insensitive pantry match resolves to an id', () => {
    const result = parseOps.validateParseReply(fenced(goodReply()), { pantry })
    assert.equal(result.ok, true, JSON.stringify(result.errors))
    assert.equal(result.items.length, 4)
    assert.equal(result.items[1].pantryId, 'p_dal', '"toor dal" matches pantry "Toor dal"')
    assert.equal(result.items[0].pantryId, null)
  })

  await check('validateParseReply: an invented pantryMatch is cleared (not an error) and kept as suggestedMatch', () => {
    const result = parseOps.validateParseReply(JSON.stringify(goodReply()), { pantry })
    const almonds = result.items[3]
    assert.equal(almonds.pantryId, null)
    assert.equal(almonds.suggestedMatch, 'Almonds (raw)')
  })

  await check('validateParseReply: garbage -> (json) error; wrong root / items -> named errors', () => {
    assert.ok(parseOps.validateParseReply('no json here', { pantry }).errors[0].startsWith('(json)'))
    assert.ok(parseOps.validateParseReply('[1,2]', { pantry }).errors[0].startsWith('(root)'))
    assert.ok(parseOps.validateParseReply('{"items": "x"}', { pantry }).errors[0].startsWith('items:'))
    assert.ok(parseOps.validateParseReply('{"items": []}', { pantry }).errors[0].startsWith('items:'))
  })

  await check('validateParseReply: names the exact bad field (missing measure, bad macro, bad grams)', () => {
    const noMeasure = goodReply()
    delete noMeasure.items[2].measure
    assert.deepEqual(parseOps.validateParseReply(JSON.stringify(noMeasure), { pantry }).errors, [
      'items[2].measure: expected non-empty string, got undefined',
    ])

    const badMacro = goodReply()
    badMacro.items[0].estimate.protein_g = 'lots'
    assert.deepEqual(parseOps.validateParseReply(JSON.stringify(badMacro), { pantry }).errors, [
      'items[0].estimate.protein_g: expected non-negative number, got "lots"',
    ])

    const badGrams = goodReply()
    badGrams.items[1].grams = -5
    assert.ok(parseOps.validateParseReply(JSON.stringify(badGrams), { pantry }).errors[0].startsWith('items[1].grams:'))

    const result = parseOps.validateParseReply(JSON.stringify(badMacro), { pantry })
    assert.equal(result.rawText, JSON.stringify(badMacro), 'raw reply kept for the copy-ready fix request')
  })

  // ==== buildDraftRows / rowsToLogItems ====

  const parsed = parseOps.validateParseReply(JSON.stringify(goodReply()), { pantry }).items
  const rows = parseOps.buildDraftRows(parsed, pantry)

  await check('buildDraftRows: a matched pantry item with convertible measure logs as kind:pantry', () => {
    const dal = rows[1]
    assert.equal(dal.usePantry, true)
    assert.equal(dal.pantryName, 'Toor dal')
    assert.deepEqual(parseOps.rowLogItem(dal), { kind: 'pantry', pantryId: 'p_dal', measure: '1 cup' })
    const macros = trackOps.itemMacros(parseOps.rowLogItem(dal), [], pantry)
    assert.equal(macros.kcal, 203, 'macros come from the PANTRY nutrition, not the AI estimate')
  })

  await check('buildDraftRows: unmatched rows log as adhoc ai_estimate snapshots that resolve to exactly the estimate', () => {
    const roti = parseOps.rowLogItem(rows[0])
    assert.equal(roti.kind, 'adhoc')
    assert.equal(roti.measure, '2 rotis')
    assert.equal(roti.nutrition.source, 'ai_estimate')
    assert.deepEqual(schema.validate(roti.nutrition, 'NutritionInfo'), [])
    assert.equal(trackOps.itemMacros(roti, [], pantry).kcal, 240)

    const almonds = parseOps.rowLogItem(rows[3]) // "a handful" + grams: whole-phrase naturalUnit
    assert.equal(almonds.measure, 'a handful')
    assert.equal(trackOps.itemMacros(almonds, [], pantry).kcal, 164)
  })

  await check('buildDraftRows: no grams + vague measure falls back to "1 serving" and still resolves', () => {
    const raita = parseOps.rowLogItem(rows[2])
    assert.equal(raita.measure, '1 serving')
    assert.equal(raita.nutrition.servingDesc, 'some')
    assert.equal(trackOps.itemMacros(raita, [], pantry).kcal, 60)
  })

  await check('buildDraftRows: notes explain every fallback (invented match, no nutrition, unconvertible measure)', () => {
    assert.ok(rows[3].note.includes('"Almonds (raw)" isn\'t in your pantry'))

    const attaReply = [{ name: 'Atta', measure: '1 cup', grams: 120, pantryId: 'p_atta', suggestedMatch: null, estimate: { kcal: 400, protein_g: 14, carbs_g: 85, fat_g: 2 } }]
    const [attaRow] = parseOps.buildDraftRows(attaReply, pantry)
    assert.equal(attaRow.usePantry, false)
    assert.ok(attaRow.note.includes('no nutrition yet'))

    const bowlReply = [{ name: 'Toor dal', measure: 'a bowl', grams: 250, pantryId: 'p_dal', suggestedMatch: null, estimate: { kcal: 250, protein_g: 17, carbs_g: 48, fat_g: 1 } }]
    const [bowlRow] = parseOps.buildDraftRows(bowlReply, pantry)
    assert.equal(bowlRow.usePantry, false)
    assert.ok(bowlRow.note.includes("doesn't convert"))
    assert.equal(trackOps.itemMacros(parseOps.rowLogItem(bowlRow), [], pantry).kcal, 250)
  })

  await check('setRowMeasure: an edited measure scales the AI estimate ("3 rotis" -> 1.5x) and survives a pantry toggle', () => {
    const edited = parseOps.setRowMeasure(rows[0], '3 rotis')
    assert.equal(trackOps.itemMacros(parseOps.rowLogItem(edited), [], pantry).kcal, 360)
    const gramsEdit = parseOps.setRowMeasure(rows[0], '40 g')
    assert.equal(trackOps.itemMacros(parseOps.rowLogItem(gramsEdit), [], pantry).kcal, 120)

    const dalEdited = parseOps.setRowMeasure(rows[1], '2 cups')
    assert.equal(parseOps.rowLogItem(dalEdited).measure, '2 cups')
    assert.equal(parseOps.rowLogItem({ ...dalEdited, usePantry: false }).measure, '2 cups')
    assert.equal(rows[0].aiItem.measure, '2 rotis', 'original row untouched')
  })

  await check('estimate units are per-one so the amount picker reads "3 [rotis]", not "3 [2 rotis]"', () => {
    const roti = parseOps.rowLogItem(rows[0])
    assert.deepEqual(roti.nutrition.naturalUnits, [{ label: 'rotis', gramsOrFraction: 40 }])
    assert.deepEqual(measures.matchPhrase('3 rotis', measures.resolvableUnitsFor(roti.nutrition).phrases), { label: 'rotis', qty: 3 })
    assert.equal(measures.qtyForUnit(1, 'rotis', roti.nutrition), 2, 'the estimated amount is 2 rotis')
    const almonds = parseOps.rowLogItem(rows[3])
    assert.equal(measures.measureToServings('a handful', almonds.nutrition), 1)
  })

  await check('rowsToLogItems: every item validates inside a LogEntry and merges into an existing meal', () => {
    const items = parseOps.rowsToLogItems(rows)
    const entry = schema.createLogEntry({ date: '2026-10-18', meal: 'dinner', items })
    assert.deepEqual(schema.validate(entry, 'LogEntry'), [])

    const existing = schema.createLogEntry({ date: '2026-10-18', meal: 'dinner', items: [{ kind: 'component', componentId: 'c1', count: 1 }] })
    const merged = trackOps.mergeItems(existing, items)
    assert.equal(merged.items.length, 5, 'added to the meal, never replacing what was logged')
  })

  // ==== byok.parseTextViaApi ====

  await check('parseTextViaApi: happy path -> items, attempts 1', async () => {
    const result = await byok.parseTextViaApi({ provider: 'anthropic', apiKey: 'k', pantry, prompt: 'p', chatFn: async () => ({ ok: true, text: fenced(goodReply()) }) })
    assert.equal(result.ok, true)
    assert.equal(result.attempts, 1)
    assert.equal(result.items.length, 4)
  })

  await check('parseTextViaApi: invalid first reply -> one fix-request retry naming the field -> attempts 2', async () => {
    const bad = goodReply()
    delete bad.items[0].estimate
    let second = null
    let calls = 0
    const chatFn = async ({ messages }) => {
      calls++
      if (calls === 1) return { ok: true, text: JSON.stringify(bad) }
      second = messages
      return { ok: true, text: JSON.stringify(goodReply()) }
    }
    const result = await byok.parseTextViaApi({ provider: 'anthropic', apiKey: 'k', pantry, prompt: 'p', chatFn })
    assert.equal(result.ok, true)
    assert.equal(result.attempts, 2)
    assert.ok(second[2].content[0].text.includes('items[0].estimate'))
  })

  await check('parseTextViaApi: transport failure never retries', async () => {
    let calls = 0
    const result = await byok.parseTextViaApi({
      provider: 'anthropic',
      apiKey: 'k',
      pantry,
      prompt: 'p',
      chatFn: async () => {
        calls++
        return { ok: false, error: 'Network request failed' }
      },
    })
    assert.equal(result.ok, false)
    assert.equal(calls, 1)
  })

  console.log(`\n${passed} checks passed.`)
} catch (err) {
  console.error(`\nFAILED after ${passed} checks:`)
  console.error(err)
  process.exit(1)
}

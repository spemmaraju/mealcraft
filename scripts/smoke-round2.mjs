// Zero-dependency Node smoke test for Round 2 (unified add-log search) and
// its post-review hot-fixes. Covers pure logic only — logSearchOps.js
// (recents derivation, ranking, seed-candidate filtering), pantryOps.js's
// duplicate-guard + deferred-write-plan helpers, measures.js's scalable
// phrase-unit math — plus the nutritionLookup.js honest-error-state
// contract change. No DOM. Run with:
//   node scripts/smoke-round2.mjs

import assert from 'node:assert/strict'
import * as schema from '../src/schema.js'
import * as pantryOps from '../src/pantryOps.js'
import * as logSearchOps from '../src/logSearchOps.js'
import * as measures from '../src/measures.js'
import { findSeedForName } from '../src/nutritionSeeds.js'
import { searchFoods, matchTier, rankSearchResults, dedupeSearchResults } from '../src/nutritionLookup.js'

let passed = 0
async function check(label, fn) {
  await fn()
  passed++
  console.log(`ok - ${label}`)
}

try {
  // ==== logSearchOps.matchesQuery / rankByPrefix ====

  await check('matchesQuery: empty query matches everything, else case-insensitive substring', () => {
    assert.equal(logSearchOps.matchesQuery('Rolled Oats', ''), true)
    assert.equal(logSearchOps.matchesQuery('Rolled Oats', 'oat'), true)
    assert.equal(logSearchOps.matchesQuery('Rolled Oats', 'OATS'), true)
    assert.equal(logSearchOps.matchesQuery('Rolled Oats', 'quinoa'), false)
  })

  await check('rankByPrefix: exact-prefix matches sort before mid-string matches, ties keep original order', () => {
    const items = ['Steel-cut Oats', 'Rolled Oats', 'Oatmeal Cookie']
    const ranked = logSearchOps.rankByPrefix(items, 'oat', (x) => x)
    assert.deepEqual(ranked, ['Oatmeal Cookie', 'Steel-cut Oats', 'Rolled Oats'])
  })

  await check('rankByPrefix: no-op on an empty query (stable, original order)', () => {
    const items = ['b', 'a', 'c']
    assert.deepEqual(logSearchOps.rankByPrefix(items, '', (x) => x), items)
  })

  // ==== logSearchOps.deriveRecents ====

  function logEntry(date, meal, items) {
    return schema.createLogEntry({ date, meal, items })
  }

  await check('deriveRecents: distinct items, most-recent-first, within the day window', () => {
    const logs = [
      logEntry('2026-07-20', 'lunch', [{ kind: 'pantry', pantryId: 'p1', measure: '1 cup' }]),
      logEntry('2026-07-21', 'dinner', [{ kind: 'pantry', pantryId: 'p1', measure: '2 cup' }, { kind: 'component', componentId: 'c1', count: 1 }]),
    ]
    const recents = logSearchOps.deriveRecents(logs, '2026-07-22')
    // p1's most recent occurrence (07-21, "2 cup") wins over the older one.
    assert.deepEqual(
      recents.map((r) => r.key),
      ['pantry:p1', 'component:c1'],
    )
    assert.equal(recents[0].item.measure, '2 cup')
  })

  await check('deriveRecents: entries older than the day window are excluded', () => {
    const logs = [logEntry('2026-07-01', 'lunch', [{ kind: 'pantry', pantryId: 'old', measure: '1 cup' }])]
    const recents = logSearchOps.deriveRecents(logs, '2026-07-22', { days: 14 })
    assert.deepEqual(recents, [])
  })

  await check('deriveRecents: a future-dated log (edge of window math) does not throw and is excluded', () => {
    const logs = [logEntry('2026-07-25', 'lunch', [{ kind: 'pantry', pantryId: 'future', measure: '1 cup' }])]
    const recents = logSearchOps.deriveRecents(logs, '2026-07-22')
    assert.deepEqual(recents, [])
  })

  await check('deriveRecents: caps at the given limit, keeping the most recent distinct items', () => {
    const logs = []
    for (let i = 0; i < 10; i++) {
      logs.push(logEntry('2026-07-2' + (i % 3), 'snack', [{ kind: 'adhoc', name: `food${i}`, measure: '1 serving', nutrition: schema.createNutritionInfo() }]))
    }
    const recents = logSearchOps.deriveRecents(logs, '2026-07-29', { days: 14, limit: 3 })
    assert.equal(recents.length, 3)
  })

  // ==== logSearchOps.lastUsedFor ====

  await check('lastUsedFor: returns the measure for a pantry id, the count for a component id, null otherwise', () => {
    const logs = [
      logEntry('2026-07-21', 'lunch', [
        { kind: 'pantry', pantryId: 'p1', measure: '1/2 cup' },
        { kind: 'component', componentId: 'c1', count: 1.5 },
      ]),
    ]
    const recents = logSearchOps.deriveRecents(logs, '2026-07-22')
    assert.equal(logSearchOps.lastUsedFor(recents, 'pantry', 'p1'), '1/2 cup')
    assert.equal(logSearchOps.lastUsedFor(recents, 'component', 'c1'), 1.5)
    assert.equal(logSearchOps.lastUsedFor(recents, 'pantry', 'unknown'), null)
  })

  await check('lastUsedFor: adhoc keyed by case-insensitive trimmed name', () => {
    const logs = [logEntry('2026-07-21', 'snack', [{ kind: 'adhoc', name: '  Chai  ', measure: '1 cup', nutrition: schema.createNutritionInfo() }])]
    const recents = logSearchOps.deriveRecents(logs, '2026-07-22')
    assert.equal(logSearchOps.lastUsedFor(recents, 'adhoc', 'chai'), '1 cup')
  })

  // ==== logSearchOps.seedFoodCandidates (COMMON FOODS group) ====

  await check('seedFoodCandidates: excludes seeds already resolvable to a pantry item by name/alias', () => {
    const pantry = [schema.createPantryItem({ name: 'Oats' })]
    const candidates = logSearchOps.seedFoodCandidates(pantry)
    assert.ok(!candidates.some((s) => s.name === 'rolled oats'), 'rolled oats (alias "oats") must be excluded once pantry has "Oats"')
    assert.ok(candidates.some((s) => s.name.toLowerCase().includes('broccoli')), 'broccoli must surface when the pantry has no matching item')
  })

  await check('seedFoodCandidates: an empty pantry surfaces every seed entry', () => {
    const candidates = logSearchOps.seedFoodCandidates([])
    assert.ok(candidates.length > 50)
  })

  // ==== pantryOps duplicate-guard helpers (Round 2 §3) ====

  await check('findByExactName: case-insensitive, trimmed, exact match only (stricter than componentOps.nameMatches)', () => {
    const pantry = [schema.createPantryItem({ id: 'p1', name: '  Brown Rice  ' })]
    assert.equal(pantryOps.findByExactName(pantry, 'brown rice')?.id, 'p1')
    assert.equal(pantryOps.findByExactName(pantry, 'Rice'), null, 'must not fuzzy-match "Rice" to "Brown Rice"')
    assert.equal(pantryOps.findByExactName(pantry, ''), null)
  })

  await check('findByBarcode: matches on nutrition.barcode, null when absent/no match', () => {
    const pantry = [schema.createPantryItem({ id: 'p1', name: 'Snack Bar', nutrition: schema.createNutritionInfo({ barcode: '111' }) })]
    assert.equal(pantryOps.findByBarcode(pantry, '111')?.id, 'p1')
    assert.equal(pantryOps.findByBarcode(pantry, '999'), null)
    assert.equal(pantryOps.findByBarcode(pantry, null), null)
  })

  await check('attachNutritionIfMissing: attaches only when the existing item has none — never overwrites', () => {
    const withNone = [schema.createPantryItem({ id: 'p1', name: 'X', nutrition: null })]
    const fresh = schema.createNutritionInfo({ perServing: { kcal: 100, protein_g: 1, carbs_g: 1, fat_g: 1 } })
    const attached = pantryOps.attachNutritionIfMissing(withNone, 'p1', fresh)
    assert.deepEqual(attached[0].nutrition, fresh)

    const existingNutrition = schema.createNutritionInfo({ perServing: { kcal: 999, protein_g: 9, carbs_g: 9, fat_g: 9 } })
    const withSome = [schema.createPantryItem({ id: 'p1', name: 'X', nutrition: existingNutrition })]
    const untouched = pantryOps.attachNutritionIfMissing(withSome, 'p1', fresh)
    assert.deepEqual(untouched[0].nutrition, existingNutrition, 'must not overwrite existing nutrition')
  })

  // ==== nutritionLookup.searchFoods: honest error states (Round 2 §3) ====

  await check('searchFoods: an endpoint responding with 0 mappable hits is ok:true, results:[] — distinct from a failure', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ products: [] }) })
    try {
      const result = await searchFoods('zzznomatch')
      assert.deepEqual(result, { ok: true, results: [] })
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  await check('searchFoods: a 503 (no fdcKey) is reason:"upstream", not lumped in with offline', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () => ({ ok: false, status: 503 })
    try {
      const result = await searchFoods('paneer')
      assert.deepEqual(result, { ok: false, reason: 'upstream' })
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  await check('searchFoods: a 429 is also reason:"upstream"', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () => ({ ok: false, status: 429 })
    try {
      const result = await searchFoods('paneer')
      assert.deepEqual(result, { ok: false, reason: 'upstream' })
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  await check('searchFoods: a TypeError (the real shape a browser fetch throws when offline) is reason:"offline"', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () => {
      throw new TypeError('Failed to fetch')
    }
    try {
      const result = await searchFoods('paneer')
      assert.deepEqual(result, { ok: false, reason: 'offline' })
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  await check('searchFoods: a 400 with no upstream/offline signal still degrades to the safe generic "offline" message', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () => ({ ok: false, status: 400 })
    try {
      const result = await searchFoods('paneer')
      assert.deepEqual(result, { ok: false, reason: 'offline' })
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  // ==== measures.js: scalable naturalUnits phrase units (hot-fix #3) ====
  // Previously a phrase like "1 cup chopped" was offered as a single fixed
  // 1x unit. Now it's just another scalable unit: "1/4 cup chopped" must
  // resolve to 0.25 servings (= 22.75 g-equivalent for broccoli's 91 g/cup).

  await check('stripLeadingQty: strips a parseable leading qty, returns as-is when there is none', () => {
    assert.equal(measures.stripLeadingQty('1 cup chopped'), 'cup chopped')
    assert.equal(measures.stripLeadingQty('1/3 cup drained'), 'cup drained')
    assert.equal(measures.stripLeadingQty('half block'), 'half block')
  })

  await check('isPhraseLabel: true only for an exact naturalUnits label match', () => {
    const broccoli = findSeedForName('broccoli')
    assert.equal(measures.isPhraseLabel('1 cup chopped', broccoli), true)
    assert.equal(measures.isPhraseLabel('cup chopped', broccoli), false)
    assert.equal(measures.isPhraseLabel('g', broccoli), false)
  })

  await check('matchPhrase: "1/4 cup chopped" matches label "1 cup chopped" via its tail, qty extracted', () => {
    const hit = measures.matchPhrase('1/4 cup chopped', ['1 cup chopped'])
    assert.deepEqual(hit, { label: '1 cup chopped', qty: 0.25 })
  })

  await check('matchPhrase: a bare no-leading-qty label ("half block") matches itself at qty 1, and scales with a prefix', () => {
    const phrases = ['1 block', 'half block']
    assert.deepEqual(measures.matchPhrase('half block', phrases), { label: 'half block', qty: 1 })
    assert.deepEqual(measures.matchPhrase('2 half block', phrases), { label: 'half block', qty: 2 })
  })

  await check('matchPhrase: no match returns null (not a phrase measure at all)', () => {
    assert.equal(measures.matchPhrase('2 tbsp', ['1 cup chopped']), null)
    assert.equal(measures.matchPhrase('', ['1 cup chopped']), null)
  })

  await check('HOT-FIX #3: "1/4 cup chopped" resolves broccoli to 0.25 servings = 22.75 g-equivalent, not locked to 1x', () => {
    const broccoli = findSeedForName('broccoli')
    const servings = measures.measureToServings('1/4 cup chopped', broccoli)
    assert.equal(servings, 0.25)
    assert.equal(servings * broccoli.perServing.kcal, 0.25 * 31)
    // 91 g is 1 serving (servingDesc "1 cup chopped (91 g)") -> 22.75 g-equivalent.
    assert.equal(servings * 91, 22.75)
  })

  await check('HOT-FIX #3: qtyForUnit treats a phrase label as "one unit" — 2 servings of tofu -> 4x "half block"', () => {
    const tofu = findSeedForName('tofu') // 1 block = 396 g = 1 serving; half block = 198 g = 0.5 serving
    const qty = measures.qtyForUnit(2, 'half block', tofu)
    assert.equal(qty, 4)
    assert.equal(measures.measureToServings(`${qty} half block`, tofu), 2, 'round-trips back to 2 servings')
  })

  await check('resolvableUnitsFor: Round 3.5 superseded this — "1 cup chopped" is now hidden because "cup" (a scalar unit) covers it with the same honest math; see smoke-round3.5.mjs', () => {
    const broccoli = findSeedForName('broccoli')
    assert.deepEqual(measures.resolvableUnitsFor(broccoli).phrases, [], '"1 cup chopped" is covered by the scalar "cup" unit, so it is hidden, not duplicated')
    assert.ok(measures.resolvableUnitsFor(broccoli).scalar.includes('cup'), 'cup must resolve for broccoli via the descriptor-tolerant volume anchor')
  })

  // ==== pantryOps.planPantrySave (hot-fix #1: no write until Add) ====

  await check('planPantrySave: no existing match -> planKind "create", carries name/category/nutrition, no side effects', () => {
    const pantry = []
    const nutrition = schema.createNutritionInfo()
    const plan = pantryOps.planPantrySave(pantry, ['Spices', 'Vegetables'], 'Broccoli', nutrition)
    assert.deepEqual(plan, { planKind: 'create', name: 'Broccoli', category: 'Vegetables', nutrition }, 'guessCategory should win over categories[0] for a recognized name')
    assert.deepEqual(pantry, [], 'planPantrySave must not mutate or extend the pantry array')
  })

  await check('planPantrySave: an unrecognized name falls back to categories[0] (no plausible guess)', () => {
    const nutrition = schema.createNutritionInfo()
    const plan = pantryOps.planPantrySave([], ['Spices', 'Vegetables'], 'Zzyzzx Snack', nutrition)
    assert.deepEqual(plan, { planKind: 'create', name: 'Zzyzzx Snack', category: 'Spices', nutrition })
  })

  await check('planPantrySave: existing item WITH nutrition -> planKind "existing", its own nutrition wins (never overwritten)', () => {
    const existingNutrition = schema.createNutritionInfo({ perServing: { kcal: 1, protein_g: 1, carbs_g: 1, fat_g: 1 } })
    const pantry = [schema.createPantryItem({ id: 'p1', name: 'Rice', nutrition: existingNutrition })]
    const incoming = schema.createNutritionInfo({ perServing: { kcal: 999, protein_g: 9, carbs_g: 9, fat_g: 9 } })
    const plan = pantryOps.planPantrySave(pantry, [], 'Rice', incoming)
    assert.deepEqual(plan, { planKind: 'existing', pantryId: 'p1', nutrition: existingNutrition })
  })

  await check('planPantrySave: existing item WITHOUT nutrition -> planKind "attach", carries the incoming nutrition to attach later', () => {
    const pantry = [schema.createPantryItem({ id: 'p1', name: 'Oats', nutrition: null })]
    const incoming = schema.createNutritionInfo()
    const plan = pantryOps.planPantrySave(pantry, [], 'Oats', incoming)
    assert.deepEqual(plan, { planKind: 'attach', pantryId: 'p1', nutrition: incoming })
  })

  await check('planPantrySave: a barcode match wins over a name match', () => {
    const pantry = [
      schema.createPantryItem({ id: 'byName', name: 'Snack Bar', nutrition: null }),
      schema.createPantryItem({ id: 'byCode', name: 'Different Name', nutrition: schema.createNutritionInfo({ barcode: '111' }) }),
    ]
    const plan = pantryOps.planPantrySave(pantry, [], 'Snack Bar', schema.createNutritionInfo(), '111')
    assert.equal(plan.pantryId, 'byCode')
  })

  // ==== nutritionLookup.matchTier / rankSearchResults / dedupeSearchResults (Round 2.5 §6) ====

  await check('matchTier: exact < prefix < substring < unrelated, case/whitespace-insensitive', () => {
    assert.equal(matchTier('Rolled Oats', '  rolled oats '), 0)
    assert.equal(matchTier('Rolled Oats Cereal', 'rolled oats'), 1)
    assert.equal(matchTier('Trader Joe\'s Rolled Oats', 'rolled oats'), 2)
    assert.equal(matchTier('Quinoa', 'rolled oats'), 3)
  })

  await check('matchTier: an empty query ranks everything as tier 1 (no-op ordering)', () => {
    assert.equal(matchTier('Anything', ''), 1)
  })

  await check('rankSearchResults: exact -> prefix -> substring -> other, ties keep arrival order', () => {
    const items = [
      { name: 'Cinnamon Rolled Oats' }, // substring
      { name: 'Rolled Oats' }, // exact
      { name: 'Rolled Oats Cereal' }, // prefix
      { name: 'Quinoa' }, // unrelated
    ]
    const ranked = rankSearchResults(items, 'rolled oats')
    assert.deepEqual(
      ranked.map((x) => x.name),
      ['Rolled Oats', 'Rolled Oats Cereal', 'Cinnamon Rolled Oats', 'Quinoa'],
    )
  })

  await check('dedupeSearchResults: drops a later case-insensitive name+brand duplicate, keeps the earlier (higher-ranked) one', () => {
    const first = { name: 'Rolled Oats', brand: "Trader Joe's", source: 'fdc' }
    const dup = { name: 'rolled oats', brand: "trader joe's", source: 'off' }
    const distinct = { name: 'Rolled Oats', brand: 'Quaker', source: 'off' }
    const deduped = dedupeSearchResults([first, dup, distinct])
    assert.deepEqual(deduped, [first, distinct])
  })

  await check('dedupeSearchResults: treats a missing brand consistently (null vs undefined vs "")', () => {
    const a = { name: 'Broccoli', brand: null }
    const b = { name: 'broccoli', brand: '' }
    assert.deepEqual(dedupeSearchResults([a, b]), [a])
  })

  await check('searchFoods: with an fdcKey, FDC results rank above OFF results even when OFF responds first', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async (url) => {
      if (url.includes('openfoodfacts')) {
        return {
          ok: true,
          json: async () => ({
            products: [{ product_name: 'Rolled Oats (generic)', brands: 'GenericBrand', nutriments: { 'energy-kcal_100g': 389, proteins_100g: 17, carbohydrates_100g: 66, fat_100g: 7 } }],
          }),
        }
      }
      return {
        ok: true,
        json: async () => ({
          foods: [{ description: "Trader Joe's Rolled Oats", brandOwner: "Trader Joe's", foodNutrients: [{ nutrientId: 1008, value: 150 }, { nutrientId: 1003, value: 5 }, { nutrientId: 1005, value: 27 }, { nutrientId: 1004, value: 3 }] }],
        }),
      }
    }
    try {
      const result = await searchFoods("trader joe's rolled oats", { fdcKey: 'fake-key' })
      assert.equal(result.ok, true)
      assert.equal(result.results.length, 2, 'both distinct results survive (different name+brand)')
      assert.equal(result.results[0].source, 'fdc', 'FDC must be ranked above OFF when a key is present')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  await check('searchFoods: without an fdcKey, only OFF is queried/returned (unaffected by the new ranking)', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({ products: [{ product_name: 'Oats', brands: null, nutriments: { 'energy-kcal_100g': 389, proteins_100g: 17, carbohydrates_100g: 66, fat_100g: 7 } }] }),
    })
    try {
      const result = await searchFoods('oats')
      assert.equal(result.ok, true)
      assert.deepEqual(result.results.map((r) => r.source), ['off'])
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  console.log(`\n${passed} checks passed.`)
} catch (err) {
  console.error(`\nFAILED after ${passed} checks:`)
  console.error(err)
  process.exit(1)
}

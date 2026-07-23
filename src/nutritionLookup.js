// The only networked module in the app (CLAUDE.md §2): Open Food Facts and
// USDA FoodData Central, and only when the user taps Scan or submits a
// search (nutritionLookup is never called on app load or in the
// background). Pure mappers live in nutritionMappers.js and are
// re-exported here so existing imports (scripts/smoke-phase4.5.mjs,
// NutritionInfoEditor.jsx) keep working unchanged.

import { chat } from './aiClient.js'
import { mapOffProduct, mapOffSearchProduct, mapFdcFood, mapFdcSearchFood, mapLabelReply, LABEL_PROMPT } from './nutritionMappers.js'

export { mapOffProduct, mapOffSearchProduct, mapFdcFood, mapFdcSearchFood, mapLabelReply, LABEL_PROMPT }

/**
 * OFF -> FDC (if fdcKey given) -> {ok:false}. Each step try/caught so
 * offline or a blocked request degrades to the next step, then to manual.
 * @returns {Promise<{ok: true, nutrition: NutritionInfo} | {ok: false}>}
 */
export async function lookupBarcode(code, { fdcKey } = {}) {
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json`)
    if (res.ok) {
      const json = await res.json()
      const mapped = mapOffProduct(json)
      // `name` is additive (Round 2: AddLogItemSheet's cold-start "Scan
      // barcode" has no existing item name to prefill, unlike
      // NutritionInfoEditor's scan-into-an-already-named-item flow) —
      // existing callers destructure {ok, nutrition} and ignore it.
      if (mapped) return { ok: true, nutrition: mapped, name: json.product?.product_name || null }
    }
  } catch {
    // offline or blocked — fall through to FDC
  }

  if (fdcKey) {
    try {
      const url = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(fdcKey)}&query=${encodeURIComponent(code)}&dataType=Branded`
      const res = await fetch(url)
      if (res.ok) {
        const json = await res.json()
        const foods = json.foods || []
        const food = foods.find((f) => f.gtinUpc === code) || foods[0] || null
        const mapped = food ? mapFdcFood(food) : null
        if (mapped) return { ok: true, nutrition: mapped, name: food?.description || null }
      }
    } catch {
      // offline or blocked
    }
  }

  return { ok: false }
}

/** True when `err` looks like a real network failure (offline/DNS/CORS — the shape a browser `fetch` throws), or the browser has told us we're offline outright. Distinguishes "can't reach the internet" from "reached it, got an error" for the honest error states below. */
function isOfflineError(err) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  return err instanceof TypeError
}

// ---- Round 2.5 §6: search ranking + dedupe (pure, exported for smoke tests) --

/** 0 exact, 1 prefix, 2 substring, 3 no textual relation to `query` at all (still worth keeping — the API decided it was relevant). */
export function matchTier(name, query) {
  const n = (name || '').toLowerCase().trim()
  const q = (query || '').toLowerCase().trim()
  if (!q) return 1
  if (n === q) return 0
  if (n.startsWith(q)) return 1
  if (n.includes(q)) return 2
  return 3
}

/** Stable-sorts search results by match tier against `query` (exact -> prefix -> substring -> other), ties keep arrival order. */
export function rankSearchResults(items, query) {
  return items
    .map((item, i) => ({ item, i, tier: matchTier(item.name, query) }))
    .sort((a, b) => a.tier - b.tier || a.i - b.i)
    .map((x) => x.item)
}

/** Case-insensitive trimmed name+brand key — a "Rolled Oats" from OFF and an identically-named/branded FDC hit collapse to one entry. */
function dedupeKey(item) {
  return `${(item.name || '').trim().toLowerCase()}|${(item.brand || '').trim().toLowerCase()}`
}

/** Drops later near-identical (case-insensitive name+brand) entries, keeping whichever occurrence comes first in `items` — callers order higher-ranked/higher-priority-source results first so those survive. */
export function dedupeSearchResults(items) {
  const seen = new Set()
  const out = []
  for (const item of items) {
    const key = dedupeKey(item)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

/**
 * BYOK label-photo lookup, same {ok, nutrition} contract as lookupBarcode.
 * @returns {Promise<{ok:true, nutrition: NutritionInfo} | {ok:false}>}
 */
export async function lookupLabelPhoto({ provider, apiKey, mediaType, data }) {
  const result = await chat({
    provider,
    apiKey,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: LABEL_PROMPT },
          { type: 'image', mediaType, data },
        ],
      },
    ],
    maxTokens: 500,
  })
  if (!result.ok) return { ok: false }
  const nutrition = mapLabelReply(result.text)
  return nutrition ? { ok: true, nutrition } : { ok: false }
}

/**
 * Free-text food search: Open Food Facts (keyless) + USDA FDC (only with a
 * key). Each endpoint individually try/caught so one failing/offline
 * endpoint doesn't block the other. Fires only on explicit submit — no
 * per-keystroke fetches (OFF etiquette + CLAUDE.md §2 user-triggered spirit).
 *
 * Round 2 honest error states: a genuine "0 matches" (an endpoint
 * responded, just found nothing) is `{ok:true, results:[]}`, NOT the same
 * shape as a failure — the caller (FoodSearchSheet) needs to tell "no
 * matches, try fewer words" apart from "you're offline" and "the food
 * database is busy, retry". When every attempted endpoint fails, `reason`
 * is 'upstream' if any of them came back with a 5xx/429, else 'offline'
 * (covers real network failures and the offline flag).
 *
 * Round 2.5 §6 ranking: when an FDC key is present, USDA (generally the
 * more reliable, less duplicate-riddled source for branded US products —
 * the motivating case is a query like "trader joe's rolled oats") is
 * ranked ABOVE Open Food Facts; within each source, results are ordered
 * exact match -> prefix match -> substring match -> other. Near-identical
 * results (same name+brand, case-insensitive) across sources are deduped,
 * keeping whichever occurrence ranked first. Barcode lookups
 * (lookupBarcode) are unaffected — that stays OFF-first, unranked (a
 * barcode has exactly one right answer, not a ranked list).
 * @returns {Promise<{ok: true, results: {name: string, brand: string|null, source: 'off'|'fdc', nutrition: NutritionInfo}[]} | {ok: false, reason: 'offline'|'upstream'}>}
 */
export async function searchFoods(query, { fdcKey } = {}) {
  const offResults = []
  const fdcResults = []
  let sawSuccess = false
  let sawUpstreamError = false
  let sawOfflineError = false

  try {
    const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=8&fields=code,product_name,brands,serving_size,nutriments`
    const res = await fetch(url)
    if (res.ok) {
      sawSuccess = true
      const json = await res.json()
      for (const product of json.products || []) {
        const nutrition = mapOffSearchProduct(product)
        if (nutrition) offResults.push({ name: product.product_name || query, brand: product.brands || null, source: 'off', nutrition })
      }
    } else if (res.status === 429 || res.status >= 500) {
      sawUpstreamError = true
    }
  } catch (err) {
    if (isOfflineError(err)) sawOfflineError = true
  }

  if (fdcKey) {
    try {
      const url = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(fdcKey)}&query=${encodeURIComponent(query)}&dataType=Foundation,SR%20Legacy,Branded&pageSize=8`
      const res = await fetch(url)
      if (res.ok) {
        sawSuccess = true
        const json = await res.json()
        for (const food of json.foods || []) {
          const nutrition = mapFdcSearchFood(food)
          if (nutrition) fdcResults.push({ name: food.description || query, brand: food.brandOwner || null, source: 'fdc', nutrition })
        }
      } else if (res.status === 429 || res.status >= 500) {
        sawUpstreamError = true
      }
    } catch (err) {
      if (isOfflineError(err)) sawOfflineError = true
    }
  }

  const rankedOff = rankSearchResults(offResults, query)
  const rankedFdc = rankSearchResults(fdcResults, query)
  const ordered = fdcKey ? [...rankedFdc, ...rankedOff] : [...rankedOff, ...rankedFdc]
  const results = dedupeSearchResults(ordered)

  if (results.length > 0 || sawSuccess) return { ok: true, results }
  // Prefer 'upstream' only when we're confident it's not simply offline —
  // a busy-server message is misleading if the real problem is no
  // connection at all. Anything else caught (neither flagged) still
  // defaults to the safe generic offline-style advice.
  if (sawUpstreamError && !sawOfflineError) return { ok: false, reason: 'upstream' }
  return { ok: false, reason: 'offline' }
}

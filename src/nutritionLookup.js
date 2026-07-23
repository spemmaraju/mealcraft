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
      if (mapped) return { ok: true, nutrition: mapped }
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
        if (mapped) return { ok: true, nutrition: mapped }
      }
    } catch {
      // offline or blocked
    }
  }

  return { ok: false }
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
 * @returns {Promise<{ok: true, results: {name: string, brand: string|null, source: 'off'|'fdc', nutrition: NutritionInfo}[]} | {ok: false}>}
 */
export async function searchFoods(query, { fdcKey } = {}) {
  const results = []

  try {
    const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=8&fields=code,product_name,brands,serving_size,nutriments`
    const res = await fetch(url)
    if (res.ok) {
      const json = await res.json()
      for (const product of json.products || []) {
        const nutrition = mapOffSearchProduct(product)
        if (nutrition) results.push({ name: product.product_name || query, brand: product.brands || null, source: 'off', nutrition })
      }
    }
  } catch {
    // offline or blocked — OFF results simply don't appear
  }

  if (fdcKey) {
    try {
      const url = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(fdcKey)}&query=${encodeURIComponent(query)}&dataType=Foundation,SR%20Legacy,Branded&pageSize=8`
      const res = await fetch(url)
      if (res.ok) {
        const json = await res.json()
        for (const food of json.foods || []) {
          const nutrition = mapFdcSearchFood(food)
          if (nutrition) results.push({ name: food.description || query, brand: food.brandOwner || null, source: 'fdc', nutrition })
        }
      }
    } catch {
      // offline or blocked
    }
  }

  return results.length > 0 ? { ok: true, results } : { ok: false }
}

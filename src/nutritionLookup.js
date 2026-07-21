// The only networked module in the app (CLAUDE.md §2): Open Food Facts and
// USDA FoodData Central, and only when the user taps Scan (nutritionLookup
// is never called on app load or in the background). Pure mappers below are
// exercised offline in scripts/smoke-phase4.5.mjs with inline fixtures.

import { createNutritionInfo } from './schema.js'
import { extractJson } from './weekImport.js'
import { chat } from './aiClient.js'

function hasAllNumbers(values) {
  return values.every((v) => typeof v === 'number' && !Number.isNaN(v))
}

function coerceNum(v) {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && !Number.isNaN(n) ? n : null
}

/** @param {object} json Open Food Facts /api/v2/product/{code}.json body @returns {NutritionInfo|null} */
export function mapOffProduct(json) {
  const product = json && json.product
  if (!product) return null
  const barcode = json.code || product.code || null
  const n = product.nutriments || {}

  const perServingValues = [n['energy-kcal_serving'], n.proteins_serving, n.carbohydrates_serving, n.fat_serving]
  if (hasAllNumbers(perServingValues)) {
    const [kcal, protein_g, carbs_g, fat_g] = perServingValues
    const perServing = { kcal, protein_g, carbs_g, fat_g }
    if (typeof n.fiber_serving === 'number') perServing.fiber_g = n.fiber_serving
    return createNutritionInfo({
      source: 'barcode',
      servingDesc: product.serving_size || '',
      perServing,
      barcode,
    })
  }

  const per100gValues = [n['energy-kcal_100g'], n.proteins_100g, n.carbohydrates_100g, n.fat_100g]
  if (hasAllNumbers(per100gValues)) {
    const [kcal, protein_g, carbs_g, fat_g] = per100gValues
    const perServing = { kcal, protein_g, carbs_g, fat_g }
    if (typeof n.fiber_100g === 'number') perServing.fiber_g = n.fiber_100g
    return createNutritionInfo({
      source: 'barcode',
      servingDesc: '100 g',
      perServing,
      barcode,
    })
  }

  return null
}

/** @param {object} food a USDA FDC branded-food search result @returns {NutritionInfo|null} */
export function mapFdcFood(food) {
  const ln = food && food.labelNutrients
  if (!ln) return null

  const values = [ln.calories?.value, ln.protein?.value, ln.carbohydrates?.value, ln.fat?.value]
  if (!hasAllNumbers(values)) return null
  const [kcal, protein_g, carbs_g, fat_g] = values
  const perServing = { kcal, protein_g, carbs_g, fat_g }
  if (typeof ln.fiber?.value === 'number') perServing.fiber_g = ln.fiber.value

  const servingDesc = food.servingSize != null && food.servingSizeUnit ? `${food.servingSize} ${food.servingSizeUnit}` : ''

  return createNutritionInfo({
    source: 'barcode',
    servingDesc,
    perServing,
    barcode: food.gtinUpc || null,
  })
}

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

/** Maps a BYOK label-photo reply (fenced or prose JSON) to NutritionInfo, or null if unusable. */
export function mapLabelReply(text) {
  let parsed
  try {
    parsed = JSON.parse(extractJson(text))
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null

  const ps = parsed.perServing
  if (!ps || typeof ps !== 'object') return null
  const kcal = coerceNum(ps.kcal)
  const protein_g = coerceNum(ps.protein_g)
  const carbs_g = coerceNum(ps.carbs_g)
  const fat_g = coerceNum(ps.fat_g)
  if ([kcal, protein_g, carbs_g, fat_g].some((v) => v === null)) return null

  const perServing = { kcal, protein_g, carbs_g, fat_g }
  const fiber_g = coerceNum(ps.fiber_g)
  if (fiber_g !== null) perServing.fiber_g = fiber_g

  return createNutritionInfo({
    source: 'label_photo',
    servingDesc: typeof parsed.servingDesc === 'string' ? parsed.servingDesc : '',
    servingsPerContainer: coerceNum(parsed.servingsPerContainer),
    perServing,
  })
}

export const LABEL_PROMPT =
  'This photo shows a nutrition facts label. Output ONLY one JSON object — no prose, no markdown code fences: ' +
  '{"servingDesc": string, "servingsPerContainer": number|null, "perServing": {"kcal": number, "protein_g": number, ' +
  '"carbs_g": number, "fat_g": number, "fiber_g"?: number}}.'

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

// Pure nutrition-mapping functions, extracted from nutritionLookup.js
// (Phase 16) so that file can stay the ONLY fetch-owning nutrition module
// (CLAUDE.md §2) while these stay easily unit-testable with inline
// fixtures — no network, no DOM. Exercised in scripts/smoke-phase4.5.mjs
// and scripts/smoke-phase16.mjs.

import { createNutritionInfo } from './schema.js'
import { extractJson } from './weekImport.js'
import { parseMeasure } from './measures.js'

function hasAllNumbers(values) {
  return values.every((v) => typeof v === 'number' && !Number.isNaN(v))
}

function coerceNum(v) {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && !Number.isNaN(n) ? n : null
}

/**
 * OFF's `serving_size` is free text like "30 g" or "2 Tbsp (30 g)" — extract
 * the gram figure (parenthetical or bare, mirroring measures.js's
 * servingGrams regexes locally rather than importing a private helper) and
 * pair it with the text stripped of that parenthetical as the naturalUnits
 * label, so e.g. "2 Tbsp (30 g)" -> {label:'2 Tbsp', gramsOrFraction:30}.
 * Returns null when no gram figure is found or the stripped text doesn't
 * parse as a measure (parseMeasure(...).qty == null) — e.g. bare "30 ml"
 * correctly yields no grams and is skipped.
 * @returns {{label: string, gramsOrFraction: number}|null}
 */
function offHouseholdNaturalUnit(servingSizeText) {
  if (typeof servingSizeText !== 'string' || !servingSizeText.trim()) return null
  const paren = servingSizeText.match(/\(([\d.]+)\s*g\)/i)
  const bare = servingSizeText.match(/^([\d.]+)\s*g$/i)
  const grams = paren ? parseFloat(paren[1]) : bare ? parseFloat(bare[1]) : null
  if (grams == null) return null
  const stripped = servingSizeText.replace(/\([^)]*\)/g, '').trim()
  if (parseMeasure(stripped).qty == null) return null
  return { label: stripped, gramsOrFraction: grams }
}

/**
 * FDC search/branded household serving, as a naturalUnits entry — only when
 * `servingSize` is a positive number expressed in grams (servingSizeUnit
 * 'g'/'GRM', case-insensitive; ml and anything else is skipped, since
 * gramsOrFraction here is always grams) AND `householdServingFullText` is a
 * non-empty string that parses as a measure ("1 tsp", "2 Tbsp (30 g)").
 * @returns {{label: string, gramsOrFraction: number}|null}
 */
function fdcHouseholdNaturalUnit(servingSize, servingSizeUnit, householdServingFullText) {
  if (typeof servingSize !== 'number' || !(servingSize > 0)) return null
  const unit = typeof servingSizeUnit === 'string' ? servingSizeUnit.trim().toLowerCase() : ''
  if (unit !== 'g' && unit !== 'grm') return null
  if (typeof householdServingFullText !== 'string' || !householdServingFullText.trim()) return null
  if (parseMeasure(householdServingFullText).qty == null) return null
  return { label: householdServingFullText.trim(), gramsOrFraction: servingSize }
}

/** @param {object} json Open Food Facts /api/v2/product/{code}.json body (or a search-hit wrapped as {product}) @returns {NutritionInfo|null} */
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
    const household = offHouseholdNaturalUnit(product.serving_size)
    return createNutritionInfo({
      source: 'barcode',
      servingDesc: '100 g',
      perServing,
      barcode,
      ...(household ? { naturalUnits: [household] } : {}),
    })
  }

  return null
}

/**
 * Open Food Facts text-search hit (nutritionLookup.searchFoods), mapped via
 * mapOffProduct then re-tagged 'online_search' — mapOffProduct itself stays
 * 'barcode' for the real barcode-scan flow (lookupBarcode).
 * @param {object} product one entry of an OFF /cgi/search.pl `products` array
 * @returns {NutritionInfo|null}
 */
export function mapOffSearchProduct(product) {
  const mapped = mapOffProduct({ product })
  return mapped ? { ...mapped, source: 'online_search' } : null
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
  const household = fdcHouseholdNaturalUnit(food.servingSize, food.servingSizeUnit, food.householdServingFullText)

  return createNutritionInfo({
    source: 'barcode',
    servingDesc,
    perServing,
    barcode: food.gtinUpc || null,
    ...(household ? { naturalUnits: [household] } : {}),
  })
}

const FDC_NUTRIENT_IDS = { kcal: 1008, protein_g: 1003, carbs_g: 1005, fat_g: 1004, fiber_g: 1079 }

/**
 * A USDA FDC /foods/search result. Non-branded hits (Foundation/SR Legacy)
 * carry nutrients as `foodNutrients: [{nutrientId, value}]` per 100 g;
 * branded hits carry `labelNutrients` like a single-food lookup, so those
 * fall through to mapFdcFood with the source overridden.
 * @returns {NutritionInfo|null}
 */
export function mapFdcSearchFood(food) {
  if (!food) return null
  if (!Array.isArray(food.foodNutrients)) {
    const mapped = mapFdcFood(food)
    return mapped ? { ...mapped, source: 'online_search' } : null
  }

  const byId = Object.fromEntries(food.foodNutrients.map((n) => [n.nutrientId, n.value]))
  const values = [byId[FDC_NUTRIENT_IDS.kcal], byId[FDC_NUTRIENT_IDS.protein_g], byId[FDC_NUTRIENT_IDS.carbs_g], byId[FDC_NUTRIENT_IDS.fat_g]]
  if (!hasAllNumbers(values)) return null
  const [kcal, protein_g, carbs_g, fat_g] = values
  const perServing = { kcal, protein_g, carbs_g, fat_g }
  if (typeof byId[FDC_NUTRIENT_IDS.fiber_g] === 'number') perServing.fiber_g = byId[FDC_NUTRIENT_IDS.fiber_g]

  // '100 g' stays first — macros above are per 100 g, and callers (e.g.
  // defaultMeasureFor) take naturalUnits[0]/scalar[0] as "the" serving.
  const naturalUnits = [{ label: '100 g', gramsOrFraction: 100 }]
  const household = fdcHouseholdNaturalUnit(food.servingSize, food.servingSizeUnit, food.householdServingFullText)
  if (household) naturalUnits.push(household)

  return createNutritionInfo({
    source: 'online_search',
    servingDesc: '100 g',
    perServing,
    naturalUnits,
  })
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

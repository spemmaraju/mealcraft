// Pure nutrition-mapping functions, extracted from nutritionLookup.js
// (Phase 16) so that file can stay the ONLY fetch-owning nutrition module
// (CLAUDE.md §2) while these stay easily unit-testable with inline
// fixtures — no network, no DOM. Exercised in scripts/smoke-phase4.5.mjs
// and scripts/smoke-phase16.mjs.

import { createNutritionInfo } from './schema.js'
import { extractJson } from './aiReplyOps.js'
import { parseMeasure } from './measures.js'

function hasAllNumbers(values) {
  return values.every((v) => typeof v === 'number' && !Number.isNaN(v))
}

function coerceNum(v) {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && !Number.isNaN(n) ? n : null
}

/**
 * Household-measure text like OFF's `serving_size` or a label-photo
 * servingDesc is free text in either gram-then-measure order or
 * measure-then-gram order — harvest whichever form carries BOTH a gram
 * figure and a measure-parseable household phrase, as a naturalUnits entry:
 *   "2 Tbsp (30 g)" -> {label:'2 Tbsp', gramsOrFraction:30}  (measure, then grams in parens)
 *   "46 g (3 Tbsp)" -> {label:'3 Tbsp', gramsOrFraction:46}  (grams, then measure in parens — Round A)
 * Returns null when only one form is present — gram-only text ("46 g") or
 * bare volume ("30 ml") has nothing to harvest.
 * @returns {{label: string, gramsOrFraction: number}|null}
 */
function householdUnitFromServingText(text) {
  if (typeof text !== 'string' || !text.trim()) return null
  const trimmed = text.trim()

  const parenGrams = trimmed.match(/\(([\d.]+)\s*g\)/i)
  if (parenGrams) {
    const stripped = trimmed.replace(/\([^)]*\)/g, '').trim()
    if (parseMeasure(stripped).qty != null) return { label: stripped, gramsOrFraction: parseFloat(parenGrams[1]) }
  }

  const outsideGrams = trimmed.replace(/\([^)]*\)/g, '').trim().match(/^([\d.]+)\s*g$/i)
  const parenContents = trimmed.match(/\(([^)]*)\)/)
  if (outsideGrams && parenContents) {
    const contents = parenContents[1].trim()
    if (!/^[\d.]+\s*g$/i.test(contents) && parseMeasure(contents).qty != null) {
      return { label: contents, gramsOrFraction: parseFloat(outsideGrams[1]) }
    }
  }

  return null
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

/**
 * OFF carries container size (`product_quantity`) and serving size
 * (`serving_quantity`) as separate free-standing numeric fields (distinct
 * from the `serving_size` free-text field naturalUnits parses) — dividing
 * one by `basis` (the serving quantity for the per-serving branch, 100 for
 * the per-100g branch) gives servings-per-container. Only trusted when both
 * numbers are finite and positive, and only when neither quantity's unit
 * field disagrees with the other (absent or 'g' on both sides) — an 'ml'
 * container with a gram-based serving (or vice versa) isn't a unit ratio
 * this can honestly compute. Rounded to 1 decimal.
 * @returns {number|null}
 */
function offServingsPerContainer(product, basis) {
  const productQty = Number(product.product_quantity)
  const b = Number(basis)
  if (!Number.isFinite(productQty) || productQty <= 0 || !Number.isFinite(b) || b <= 0) return null
  const unitOk = (u) => u == null || u === '' || u === 'g'
  if (!unitOk(product.product_quantity_unit) || !unitOk(product.serving_quantity_unit)) return null
  return Math.round((productQty / b) * 10) / 10
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
    const household = householdUnitFromServingText(product.serving_size)
    return createNutritionInfo({
      source: 'barcode',
      servingDesc: product.serving_size || '',
      perServing,
      barcode,
      servingsPerContainer: offServingsPerContainer(product, product.serving_quantity),
      ...(household ? { naturalUnits: [household] } : {}),
    })
  }

  const per100gValues = [n['energy-kcal_100g'], n.proteins_100g, n.carbohydrates_100g, n.fat_100g]
  if (hasAllNumbers(per100gValues)) {
    const [kcal, protein_g, carbs_g, fat_g] = per100gValues
    const perServing = { kcal, protein_g, carbs_g, fat_g }
    if (typeof n.fiber_100g === 'number') perServing.fiber_g = n.fiber_100g
    const household = householdUnitFromServingText(product.serving_size)
    return createNutritionInfo({
      source: 'barcode',
      servingDesc: '100 g',
      perServing,
      barcode,
      servingsPerContainer: offServingsPerContainer(product, 100),
      ...(household ? { naturalUnits: [household] } : {}),
    })
  }

  return null
}

/**
 * Appends " — <firstBrand>" to a base name (the first comma-separated entry
 * of a raw brands field, trimmed) — used to disambiguate OFF/FDC results
 * that come back with a generic product_name/description ("Rolled Oats")
 * and a separate brand field. Skipped when there's no brand, or the name
 * already contains it case-insensitively (no "Rolled Oats — Quaker Quaker").
 * Null/blank-safe on both arguments.
 * @returns {string|null}
 */
export function composeNameWithBrand(name, brandsField) {
  if (typeof name !== 'string' || !name.trim()) return typeof name === 'string' ? name : null
  const trimmed = name.trim()
  const firstBrand = typeof brandsField === 'string' ? brandsField.split(',')[0].trim() : ''
  if (!firstBrand || trimmed.toLowerCase().includes(firstBrand.toLowerCase())) return trimmed
  return `${trimmed} — ${firstBrand}`
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

/**
 * Shared perServing/servingDesc/servingsPerContainer/naturalUnits parsing for
 * both label-photo mappers below — `parsed` is already-JSON-parsed model
 * output. naturalUnits is harvested from servingDesc (Round A) so a label
 * that prints both forms ("3 tbsp (46 g)") anchors volume conversion too.
 * Returns null when the required macro fields aren't all numeric.
 * @returns {{servingDesc: string, servingsPerContainer: number|null, perServing: object, naturalUnits?: object[]}|null}
 */
function parseServingFields(parsed) {
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

  const servingDesc = typeof parsed.servingDesc === 'string' ? parsed.servingDesc : ''
  const household = householdUnitFromServingText(servingDesc)

  return {
    servingDesc,
    servingsPerContainer: coerceNum(parsed.servingsPerContainer),
    perServing,
    ...(household ? { naturalUnits: [household] } : {}),
  }
}

/** Maps a BYOK label-photo reply (fenced or prose JSON) to NutritionInfo, or null if unusable. */
export function mapLabelReply(text) {
  let parsed
  try {
    parsed = JSON.parse(extractJson(text))
  } catch {
    return null
  }
  const fields = parseServingFields(parsed)
  if (!fields) return null
  return createNutritionInfo({ source: 'label_photo', ...fields })
}

export const LABEL_PROMPT =
  'This photo shows a nutrition facts label. Output ONLY one JSON object — no prose, no markdown code fences: ' +
  '{"servingDesc": string, "servingsPerContainer": number|null, "perServing": {"kcal": number, "protein_g": number, ' +
  '"carbs_g": number, "fat_g": number, "fiber_g"?: number}}. ' +
  '"servingDesc" must include BOTH the household measure and the weight exactly as printed when the label shows both, e.g. "3 tbsp (46 g)".'

/**
 * Maps a BYOK front+label combined-photo reply to a name + NutritionInfo, or
 * null if the macro fields are unusable (name is optional — a missing/
 * unreadable front photo still yields nutrition with name: null).
 * @returns {{name: string|null, nutrition: NutritionInfo}|null}
 */
export function mapPhotoFoodReply(text) {
  let parsed
  try {
    parsed = JSON.parse(extractJson(text))
  } catch {
    return null
  }
  const fields = parseServingFields(parsed)
  if (!fields) return null
  const name = typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim() : null
  return { name, nutrition: createNutritionInfo({ source: 'label_photo', ...fields }) }
}

export const PHOTO_FOOD_PROMPT =
  'These photos show a packaged food: the nutrition facts label, and optionally the front of the package. ' +
  'Output ONLY one JSON object — no prose, no markdown code fences: ' +
  '{"name": string|null, "servingDesc": string, "servingsPerContainer": number|null, "perServing": {"kcal": number, ' +
  '"protein_g": number, "carbs_g": number, "fat_g": number, "fiber_g"?: number}}. ' +
  '"name" is a concise product name (brand + product, e.g. "Trader Joe\'s Rolled Oats") read from the front-of-package ' +
  'photo if one was provided and the name is visible; null otherwise. ' +
  '"servingDesc" must include BOTH the household measure and the weight exactly as printed when the label shows both, e.g. "3 tbsp (46 g)".'

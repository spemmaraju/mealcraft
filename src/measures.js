// Free-text measure parsing (CLAUDE.md §5: measures are first-class, never
// force unit conversion). Pure functions only — no DOM, no storage imports.

import { normalizeTokens } from './componentOps.js'

const UNICODE_FRACTIONS = {
  '¼': 1 / 4,
  '½': 1 / 2,
  '¾': 3 / 4,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '⅕': 1 / 5,
  '⅖': 2 / 5,
  '⅗': 3 / 5,
  '⅘': 4 / 5,
  '⅙': 1 / 6,
  '⅚': 5 / 6,
  '⅛': 1 / 8,
  '⅜': 3 / 8,
  '⅝': 5 / 8,
  '⅞': 7 / 8,
}
const UNICODE_FRACTION_CHARS = Object.keys(UNICODE_FRACTIONS).join('')

const GRAMS_PER_UNIT = {
  g: 1,
  gram: 1,
  kg: 1000,
  kilogram: 1000,
  oz: 28.3495,
  ounce: 28.3495,
  lb: 453.592,
  lbs: 453.592,
  pound: 453.592,
}

export const VOLUME_ML = {
  tsp: 4.93,
  teaspoon: 4.93,
  tbsp: 14.79,
  tablespoon: 14.79,
  cup: 236.6,
  'fl oz': 29.57,
  ml: 1,
  milliliter: 1,
  l: 1000,
  liter: 1000,
}

/** @param {string} str e.g. "1/3", "1 1/2", "½", "1½", "2" @returns {number|null} */
export function parseQty(str) {
  if (typeof str !== 'string') return null
  const s = str.trim()
  if (!s) return null

  const asciiFraction = s.match(/^(\d+)\s+(\d+)\/(\d+)$|^(\d+)\/(\d+)$/)
  if (asciiFraction) {
    if (asciiFraction[4] !== undefined) {
      const num = parseInt(asciiFraction[4], 10)
      const den = parseInt(asciiFraction[5], 10)
      return den === 0 ? null : num / den
    }
    const whole = parseInt(asciiFraction[1], 10)
    const num = parseInt(asciiFraction[2], 10)
    const den = parseInt(asciiFraction[3], 10)
    if (den === 0) return null
    return whole + num / den
  }

  const unicodeRe = new RegExp(`^(\\d+)?\\s*([${UNICODE_FRACTION_CHARS}])$`)
  const unicodeMatch = s.match(unicodeRe)
  if (unicodeMatch) {
    const whole = unicodeMatch[1] ? parseInt(unicodeMatch[1], 10) : 0
    return whole + UNICODE_FRACTIONS[unicodeMatch[2]]
  }

  if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s)

  return null
}

const QTY_PREFIX_RE = new RegExp(
  `^(\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+\\s*[${UNICODE_FRACTION_CHARS}]|[${UNICODE_FRACTION_CHARS}]|\\d+(?:\\.\\d+)?)`,
)

/** @param {string} measure e.g. "2/3 cup drained" @returns {{qty: number|null, unitTokens: string[]}} */
export function parseMeasure(measure) {
  if (typeof measure !== 'string') return { qty: null, unitTokens: [] }
  const s = measure.trim()
  if (!s) return { qty: null, unitTokens: [] }

  const match = s.match(QTY_PREFIX_RE)
  if (!match) return { qty: null, unitTokens: normalizeTokens(s) }

  const qty = parseQty(match[1])
  const rest = s.slice(match[0].length)
  return { qty, unitTokens: normalizeTokens(rest) }
}

/** Grams for a measure expressed directly in g/kg/oz/lb. @returns {number|null} */
export function gramsFromMeasure(measure) {
  const { qty, unitTokens } = parseMeasure(measure)
  if (qty == null || unitTokens.length !== 1) return null
  const perUnit = GRAMS_PER_UNIT[unitTokens[0]]
  if (perUnit == null) return null
  return qty * perUnit
}

/** Milliliters for a measure expressed directly in tsp/tbsp/cup/fl oz/ml/l. @returns {number|null} */
export function mlFromMeasure(measure) {
  const { qty, unitTokens } = parseMeasure(measure)
  if (qty == null || unitTokens.length === 0) return null
  const perUnit = VOLUME_ML[unitTokens.join(' ')]
  if (perUnit == null) return null
  return qty * perUnit
}

/** Grams represented by one serving of `nutrition`, from servingDesc or naturalUnits. @returns {number|null} */
export function servingGrams(nutrition) {
  if (!nutrition) return null
  const desc = nutrition.servingDesc || ''

  const paren = desc.match(/\(([\d.]+)\s*g\)/i)
  if (paren) return parseFloat(paren[1])

  const bare = desc.match(/^([\d.]+)\s*g$/i)
  if (bare) return parseFloat(bare[1])

  const descTokens = normalizeTokens(desc).join(' ')
  const unit = (nutrition.naturalUnits || []).find((u) => u.label && normalizeTokens(u.label).join(' ') === descTokens)
  if (unit) return unit.gramsOrFraction

  return null
}

function stripParenthetical(desc) {
  return (desc || '').replace(/\([^)]*\)/g, '').trim()
}

/**
 * Convert a free-text ingredient measure into a number of servings of
 * `nutrition`. Returns null rather than guessing ("handful" has no path).
 * @returns {number|null}
 */
export function measureToServings(measure, nutrition) {
  if (!nutrition || typeof measure !== 'string') return null
  const measureText = measure.trim()
  const { qty: measureQty, unitTokens: measureTokens } = parseMeasure(measureText)
  const measureFullTokens = normalizeTokens(measureText).join(' ')

  // (0) "1 serving" / "2 servings" — count IS the servings, no lookup needed.
  if (measureQty != null && measureTokens.length === 1 && measureTokens[0] === 'serving') {
    return measureQty
  }

  // (a) direct servingDesc ratio — same unit words (ignoring any parenthetical
  // gram annotation), no grams involved.
  const serving = parseMeasure(stripParenthetical(nutrition.servingDesc))
  if (
    measureQty != null &&
    serving.qty != null &&
    serving.qty > 0 &&
    measureTokens.length > 0 &&
    measureTokens.join(' ') === serving.unitTokens.join(' ')
  ) {
    return measureQty / serving.qty
  }

  const units = nutrition.naturalUnits || []
  const perServingGrams = servingGrams(nutrition)

  // (b) naturalUnits whole-phrase match, e.g. "half block" against a
  // naturalUnits label of "half block" (no leading number to scale by).
  const wholeMatch = units.find((u) => u.label && normalizeTokens(u.label).join(' ') === measureFullTokens)
  if (wholeMatch && perServingGrams != null && perServingGrams > 0) {
    return wholeMatch.gramsOrFraction / perServingGrams
  }

  if (perServingGrams == null || perServingGrams <= 0) return null

  // (c) grams path — direct unit (g/kg/oz/lb)...
  const directGrams = gramsFromMeasure(measureText)
  if (directGrams != null) return directGrams / perServingGrams

  // ...or a naturalUnits entry scaled by the measure's own leading quantity.
  if (measureQty == null) return null
  const scaledUnit = units.find((u) => {
    const unitParsed = parseMeasure(u.label)
    return unitParsed.unitTokens.length > 0 && unitParsed.unitTokens.join(' ') === measureTokens.join(' ')
  })
  if (scaledUnit) {
    const unitQty = parseMeasure(scaledUnit.label).qty ?? 1
    const grams = scaledUnit.gramsOrFraction * (measureQty / unitQty)
    return grams / perServingGrams
  }

  // (d) volume bridging — the measure's unit is a volume word (tsp/tbsp/cup/
  // fl oz/ml/l) but doesn't literally match any naturalUnits label (unlike
  // path c's scaledUnit); if any naturalUnits label is ALSO a volume word
  // (any volume unit, not just the same one), convert both through ml.
  const measureMl = mlFromMeasure(measureText)
  if (measureMl != null) {
    const anchor = units.find((u) => mlFromMeasure(u.label) != null)
    if (anchor) {
      const anchorMl = mlFromMeasure(anchor.label)
      const grams = anchor.gramsOrFraction * (measureMl / anchorMl)
      return grams / perServingGrams
    }
  }

  return null
}

// ---- Unit-picker support (Round 1 fixes #3/#4) -------------------------
// A logged pantry/adhoc item's unit dropdown must only ever offer units
// that CAN be converted for that item's nutrition data — offering one that
// silently resolves to null (and so drops out of the macro totals as
// "missing") is a correctness bug, not a UX nicety. These helpers restrict
// the picker and rescale the quantity when the unit changes, so switching
// units never silently changes the represented amount (and therefore the
// calories) of what was logged.

/** Fixed units worth testing for resolvability against a given nutrition. */
const SCALAR_UNIT_CANDIDATES = ['serving', 'g', 'kg', 'ml', 'tsp', 'tbsp', 'cup', 'fl oz', 'piece']

/**
 * @param {object} nutrition
 * @returns {{scalar: string[], phrases: string[]}} `scalar` units are freely
 * re-scalable by quantity (g, cup, serving, ...); `phrases` are whole
 * naturalUnits labels (e.g. "1/3 cup drained") that already encode their
 * own fixed quantity and are offered as-is, not scaled.
 */
export function resolvableUnitsFor(nutrition) {
  if (!nutrition) return { scalar: [], phrases: [] }
  const scalar = SCALAR_UNIT_CANDIDATES.filter((u) => u === 'serving' || measureToServings(`1 ${u}`, nutrition) != null)
  const phrases = (nutrition.naturalUnits || [])
    .map((nu) => nu.label)
    .filter((label) => label && measureToServings(label, nutrition) != null)
  return { scalar, phrases }
}

/**
 * The quantity of `unit` that represents the same amount as `servings`
 * servings of `nutrition` — the inverse of measureToServings for scalar
 * (freely re-scalable) units. Used to rescale qty when the user switches
 * units, so the represented amount (and macros) stay constant.
 * @returns {number|null}
 */
export function qtyForUnit(servings, unit, nutrition) {
  if (servings == null || !nutrition) return null
  if (unit === 'serving') return servings
  const perUnitServings = measureToServings(`1 ${unit}`, nutrition)
  if (perUnitServings == null || perUnitServings === 0) return null
  return servings / perUnitServings
}

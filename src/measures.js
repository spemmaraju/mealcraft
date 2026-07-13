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

  return null
}

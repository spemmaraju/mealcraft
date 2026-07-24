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

// Canonical short unit word for each VOLUME_ML key — collapses long forms
// (teaspoon/tablespoon/milliliter/liter) onto the word the scalar picker
// actually offers, so "is this volume word covered by an offered scalar
// unit" can be checked with a plain Set.has().
const VOLUME_CANONICAL = {
  tsp: 'tsp',
  teaspoon: 'tsp',
  tbsp: 'tbsp',
  tablespoon: 'tbsp',
  cup: 'cup',
  'fl oz': 'fl oz',
  ml: 'ml',
  milliliter: 'ml',
  l: 'ml',
  liter: 'ml',
}

/**
 * Descriptor-tolerant volume-unit lookup: finds a volume unit at the START
 * of `tokens`, ignoring any trailing descriptor words — ["cup","dry"] and
 * ["cup","chopped"] both resolve to "cup"; ["fl","oz","measured"] resolves
 * to "fl oz". Returns the literal VOLUME_ML key matched (not canonicalized),
 * or null when no volume unit is found. Round 3.5 root-fix: naturalUnits
 * labels are almost always "<qty> <volume unit> <descriptor>" ("1/2 cup
 * dry"), and the old code required an exact full-string match against
 * VOLUME_ML, so descriptor words silently broke every volume-bridging path.
 */
function volumeKeyFromTokens(tokens) {
  if (tokens.length >= 2 && VOLUME_ML[`${tokens[0]} ${tokens[1]}`] != null) return `${tokens[0]} ${tokens[1]}`
  if (tokens.length >= 1 && VOLUME_ML[tokens[0]] != null) return tokens[0]
  return null
}

/** `volumeKeyFromTokens`, canonicalized to the picker's short unit word (see VOLUME_CANONICAL). */
function canonicalVolumeUnit(tokens) {
  const key = volumeKeyFromTokens(tokens)
  return key ? VOLUME_CANONICAL[key] || key : null
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

/**
 * Milliliters for a measure expressed in tsp/tbsp/cup/fl oz/ml/l — tolerant
 * of trailing descriptor words (see volumeKeyFromTokens), so "1/2 cup dry"
 * and "1 cup chopped" resolve exactly like "1/2 cup" and "1 cup" would.
 * @returns {number|null}
 */
export function mlFromMeasure(measure) {
  const { qty, unitTokens } = parseMeasure(measure)
  if (qty == null || unitTokens.length === 0) return null
  const key = volumeKeyFromTokens(unitTokens)
  if (key == null) return null
  return qty * VOLUME_ML[key]
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
  // mlFromMeasure's descriptor tolerance means a label like "1/2 cup dry"
  // anchors this just as well as a bare "1/2 cup" would (Round 3.5 root-fix
  // — this used to require an exact volume-word match, so a naturalUnits
  // label with any descriptor word never anchored at all). The servingDesc
  // itself (1 serving = perServingGrams) is tried as a fallback anchor for
  // items whose naturalUnits don't happen to carry a volume-based entry.
  const measureMl = mlFromMeasure(measureText)
  if (measureMl != null) {
    const servingAnchor = { label: stripParenthetical(nutrition.servingDesc), gramsOrFraction: perServingGrams }
    const anchor = units.find((u) => mlFromMeasure(u.label) != null) || (mlFromMeasure(servingAnchor.label) != null ? servingAnchor : null)
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

/**
 * Fixed units worth testing for resolvability against a given nutrition.
 * Round 3.5: dropped kg/fl oz from this picker list (parsing still accepts
 * them as free text via gramsFromMeasure/mlFromMeasure — this list only
 * controls what the dropdown OFFERS) and reordered to the kitchen-natural
 * "serving, cup, tbsp, tsp, g, ml, piece" the user actually reaches for.
 */
const SCALAR_UNIT_CANDIDATES = ['serving', 'cup', 'tbsp', 'tsp', 'g', 'ml', 'piece']

/**
 * @param {object} nutrition
 * @returns {{scalar: string[], phrases: string[]}} `scalar` units are freely
 * re-scalable by quantity (g, cup, serving, ...); `phrases` are whole
 * naturalUnits labels (e.g. "half block") that already encode their own
 * fixed quantity and are offered as-is, not scaled. Round 3.5: a phrase
 * whose embedded unit is a volume word already covered by an offered scalar
 * unit ("1/2 cup dry" vs. "cup", "1 cup chopped" vs. "cup") is dropped —
 * the scalar covers it with the same honest math, and showing both is
 * confusing clutter ("serving, g, kg, 1/2 cup dry" was the reported bug).
 * Non-volume phrases with no scalar equivalent ("half block") still show.
 */
export function resolvableUnitsFor(nutrition) {
  if (!nutrition) return { scalar: [], phrases: [] }
  const scalar = SCALAR_UNIT_CANDIDATES.filter((u) => u === 'serving' || measureToServings(`1 ${u}`, nutrition) != null)
  const scalarSet = new Set(scalar)
  const phrases = (nutrition.naturalUnits || [])
    .map((nu) => nu.label)
    .filter((label) => {
      if (!label || measureToServings(label, nutrition) == null) return false
      const volUnit = canonicalVolumeUnit(parseMeasure(label).unitTokens)
      return !(volUnit && scalarSet.has(volUnit))
    })
  return { scalar, phrases }
}

/**
 * Tolerant scalar-unit match for a free-text measure against a list of
 * allowed scalar unit words (g, cup, tbsp, ...): an exact single-token match
 * ("2 g" -> unit "g"), or — for a volume unit specifically — a match that
 * ignores trailing descriptor words ("1 cup chopped" -> unit "cup", qty 1),
 * mirroring the same descriptor tolerance volume bridging uses internally.
 * Lets MeasureInput recognize a legacy/stored measure whose naturalUnits
 * phrase is no longer offered directly (hidden by resolvableUnitsFor above
 * because a scalar unit now covers it) as that scalar unit instead of
 * falling back to an unnecessary raw-text/warning state. Returns null when
 * neither applies, so callers fall back to free-text mode rather than
 * guessing.
 * @returns {{unit: string, qty: number}|null}
 */
export function matchScalarUnit(measure, allowedUnits) {
  const { qty, unitTokens } = parseMeasure(measure)
  if (qty == null || unitTokens.length === 0) return null
  const joined = unitTokens.join(' ')
  if (allowedUnits.includes(joined)) return { unit: joined, qty }
  const volUnit = canonicalVolumeUnit(unitTokens)
  if (volUnit && allowedUnits.includes(volUnit)) return { unit: volUnit, qty }
  return null
}

/**
 * The quantity of `unit` that represents the same amount as `servings`
 * servings of `nutrition` — the inverse of measureToServings for scalar
 * (freely re-scalable) units. Used to rescale qty when the user switches
 * units, so the represented amount (and macros) stay constant. `unit` may
 * also be a whole naturalUnits phrase label ("1 cup chopped", "half
 * block") — see isPhraseLabel below — in which case the phrase itself
 * (not "1 <phrase>") is the "one unit" being scaled.
 * @returns {number|null}
 */
export function qtyForUnit(servings, unit, nutrition) {
  if (servings == null || !nutrition) return null
  if (unit === 'serving') return servings
  const perUnitServings = isPhraseLabel(unit, nutrition) ? measureToServings(unit, nutrition) : measureToServings(`1 ${unit}`, nutrition)
  if (perUnitServings == null || perUnitServings === 0) return null
  return servings / perUnitServings
}

// ---- Scalable phrase units (Round 2 hot-fix #3) ------------------------
// A naturalUnits phrase like "1 cup chopped" or "half block" used to be
// offered as a single fixed, non-scalable unit (exactly 1x) — violating
// CLAUDE.md §5's free-text-measure rule (no unit should be forced to a
// single fixed quantity). measureToServings' existing path (c) "scaledUnit"
// already resolves e.g. "1/4 cup chopped" against the naturalUnits label
// "1 cup chopped" (same tail tokens, different leading qty) — nothing
// needed there. What was missing was the UI/matching layer: recognizing
// that a phrase IS a scalable unit whose "tail" (the words after its own
// leading qty, if it has one) is the reusable unit text.

/** Whether `unit` is a recognized whole-phrase naturalUnits label for this nutrition (e.g. "1 cup chopped", "half block"), as opposed to a plain scalar unit word (g, cup, serving...). */
export function isPhraseLabel(unit, nutrition) {
  return (nutrition?.naturalUnits || []).some((nu) => nu.label === unit)
}

/** The portion of `measure` after its leading quantity (if any), trimmed — e.g. "1 cup chopped" -> "cup chopped", "half block" -> "half block" (no leading digit/fraction to strip, returned as-is). Preserves original wording/casing, unlike parseMeasure's normalized unitTokens. */
export function stripLeadingQty(measure) {
  const s = (measure || '').trim()
  const match = s.match(QTY_PREFIX_RE)
  if (!match) return s
  return s.slice(match[0].length).trim()
}

/**
 * Matches free-typed/composed text against a list of naturalUnits phrase
 * labels, tolerating a scaling qty prefix — e.g. "1/4 cup chopped" against
 * label "1 cup chopped" (tail "cup chopped"), or a bare whole-phrase match
 * like "half block" against itself. Used to recognize a previously-scaled
 * phrase measure on mount/re-render so its dropdown selection and qty box
 * round-trip correctly.
 * @returns {{label: string, qty: number}|null}
 */
export function matchPhrase(raw, phrases) {
  const trimmed = (raw || '').trim()
  if (!trimmed || !phrases || phrases.length === 0) return null
  const key = normalizeTokens(trimmed).join(' ')

  const wholeHit = phrases.find((p) => normalizeTokens(p).join(' ') === key)
  if (wholeHit) return { label: wholeHit, qty: parseMeasure(wholeHit).qty ?? 1 }

  const { qty, unitTokens } = parseMeasure(trimmed)
  if (qty == null || unitTokens.length === 0) return null
  const tailKey = unitTokens.join(' ')
  const tailHit = phrases.find((p) => normalizeTokens(stripLeadingQty(p)).join(' ') === tailKey)
  return tailHit ? { label: tailHit, qty } : null
}

// ---- Kitchen-fraction display (Round 3.5) ------------------------------
// "Who will log 0.667 cups instead of 2/3?" — every place a quantity is
// displayed or auto-filled after a unit switch should show the nearest
// common kitchen fraction, not a raw decimal. Denominators 2/3/4/8 only
// (kitchen measuring spoons/cups don't have sixths or sixteenths); anything
// that doesn't land near one of those falls back to a trimmed 2-decimal
// number rather than guessing wrong ("0.37" stays "0.37", it's not secretly
// 3/8 — that's 0.375, a real difference in a recipe).
const FRACTION_DISPLAY = [
  [1 / 8, '1/8'],
  [1 / 4, '1/4'],
  [1 / 3, '1/3'],
  [3 / 8, '3/8'],
  [1 / 2, '1/2'],
  [5 / 8, '5/8'],
  [2 / 3, '2/3'],
  [3 / 4, '3/4'],
  [7 / 8, '7/8'],
]
const FRACTION_TOLERANCE = 0.004

/**
 * Nearest kitchen fraction for `qty`'s fractional part (denominators
 * 2/3/4/8), rendered as a mixed number when the whole part is nonzero
 * ("1 1/2"); falls back to a decimal trimmed to 2 places when nothing is
 * close enough. @param {number} qty @returns {string}
 */
export function formatQty(qty) {
  if (qty == null || Number.isNaN(qty)) return ''
  if (Number.isInteger(qty)) return String(qty)
  const whole = Math.floor(qty)
  const frac = qty - whole
  const match = FRACTION_DISPLAY.find(([v]) => Math.abs(v - frac) < FRACTION_TOLERANCE)
  if (match) return whole > 0 ? `${whole} ${match[1]}` : match[1]
  return String(Math.round(qty * 100) / 100)
}

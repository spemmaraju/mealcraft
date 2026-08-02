// Pure functions over pantry/component nutrition data. No DOM, no storage
// imports — callers (UI or smoke script) own persistence. Mirrors componentOps.js.

import { nameMatches } from './componentOps.js'
import { measureToServings, servingGrams } from './measures.js'
import { findSeedForName as lookupSeed } from './nutritionSeeds.js'
import { volumeAnchorFor } from './volumeAnchors.js'

/** @param {string} name @returns {NutritionInfo|null} */
export function findSeedForName(name) {
  return lookupSeed(name)
}

/**
 * Appends a curated {label:'1 cup', gramsOrFraction} naturalUnits anchor
 * (volumeAnchors.js) to `nutrition` when it can't yet resolve a volume
 * measure on its own but has known grams-per-serving and its `name` matches
 * a food in the curated cup-weight table — e.g. a barcode-scanned "46 g"
 * egg-whites serving gains a "1 cup" anchor so "1/2 cup" logs convert.
 * Append-only: perServing/servingDesc/source/existing naturalUnits entries
 * are never touched, only appended to. Idempotent: once "1 cup" already
 * resolves (via this anchor or any other path — a seed-table item with its
 * own '1 cup' naturalUnits, a pure-volume servingDesc, ...), a second call
 * is a pure no-op, so callers may run it unconditionally on every save
 * without piling up duplicate anchors. This is the single choke point every
 * pantry-save / adhoc-log-stage / migration call site delegates to.
 * @param {string} name @param {object|null} nutrition
 * @returns {object|null} `nutrition` unchanged, or a shallow copy with the anchor appended
 */
export function enrichWithVolumeAnchor(name, nutrition) {
  if (nutrition == null) return nutrition
  if (measureToServings('1 cup', nutrition) != null) return nutrition
  if (servingGrams(nutrition) == null) return nutrition
  const anchor = volumeAnchorFor(name)
  if (anchor == null) return nutrition
  return { ...nutrition, naturalUnits: [...(nutrition.naturalUnits || []), anchor] }
}

/** @returns {NutritionInfo|null} the cached NutritionInfo of the pantry item already scanned for `code` */
export function findCachedBarcode(pantry, code) {
  if (!code) return null
  const hit = (pantry || []).find((p) => p.nutrition && p.nutrition.barcode === code)
  return hit ? hit.nutrition : null
}

/** @returns {{ok: true, servings: number, perServing: object} | {ok: false, reason: string}} */
export function resolveIngredient(ing, pantry) {
  const match = (pantry || []).find((p) => p.name && nameMatches(ing.name, p.name))
  if (!match || !match.nutrition) return { ok: false, reason: 'no nutrition data' }
  const servings = measureToServings(ing.measure, match.nutrition)
  if (servings == null) return { ok: false, reason: 'unresolvable measure' }
  return { ok: true, servings, perServing: match.nutrition.perServing }
}

function round1(n) {
  return Math.round(n * 10) / 10
}

/**
 * @returns {{ok: true, macrosPerServing: object} | {ok: false, unresolved: {name: string, reason: string}[]}}
 * Never sums partial results — every ingredient must resolve or the whole derivation fails.
 */
export function deriveComponentMacros(component, pantry) {
  if (!component.servings || component.servings <= 0) {
    return { ok: false, unresolved: [{ name: '(servings)', reason: 'batch servings not set' }] }
  }

  const ingredients = (component.ingredients || []).filter((ing) => ing.name && ing.name.trim())
  const unresolved = []
  const totals = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }

  for (const ing of ingredients) {
    const resolved = resolveIngredient(ing, pantry)
    if (!resolved.ok) {
      unresolved.push({ name: ing.name, reason: resolved.reason })
      continue
    }
    const { servings, perServing } = resolved
    totals.kcal += perServing.kcal * servings
    totals.protein_g += perServing.protein_g * servings
    totals.carbs_g += perServing.carbs_g * servings
    totals.fat_g += perServing.fat_g * servings
  }

  if (unresolved.length > 0) return { ok: false, unresolved }

  return {
    ok: true,
    macrosPerServing: {
      kcal: Math.round(totals.kcal / component.servings),
      protein_g: round1(totals.protein_g / component.servings),
      carbs_g: round1(totals.carbs_g / component.servings),
      fat_g: round1(totals.fat_g / component.servings),
    },
  }
}

/**
 * Re-derives every macroSource:'derived' component. A component that fails
 * derivation reverts to macrosPerServing: null (macroSource stays 'derived')
 * rather than keeping stale numbers.
 * @returns {{changed: boolean, components: object[]}}
 */
export function resyncDerivedMacros(components, pantry) {
  let changed = false
  const next = components.map((c) => {
    if (c.macroSource !== 'derived') return c
    const result = deriveComponentMacros(c, pantry)
    const macrosPerServing = result.ok ? result.macrosPerServing : null
    if (JSON.stringify(macrosPerServing) === JSON.stringify(c.macrosPerServing)) return c
    changed = true
    return { ...c, macrosPerServing }
  })
  return { changed, components: next }
}

// Curated "gram weight of 1 cup" table for common foods, used to bridge
// gram-only serving info (e.g. a barcode-scanned "46 g" servingDesc with no
// volume figure at all) to a usable "1 cup" naturalUnits anchor so volume
// measures ("1/2 cup") can convert. Values are directional cup weights
// sourced from USDA household-measure references — good enough for the
// tracking-is-a-mindfulness-habit bar this app holds itself to (CLAUDE.md
// §1), not lab precision. Packing-sensitive foods (flour, brown sugar,
// shredded cheese, ...) are approximate by design: a "cup" of sifted vs.
// scooped flour genuinely differs, and this table picks one reasonable
// number rather than modeling that. Genuinely unstable/ambiguous foods
// (protein powder — scoop size varies by brand; bare "rice", "pasta",
// "cheese", "sugar substitute", "cereal", "granola" — too many different
// densities/aliases hide behind those bare words) are deliberately omitted;
// the teach-UX (manual naturalUnits entry) covers those instead of guessing.
//
// Order matters here: a specific "guard" entry (e.g. "peanut butter") is
// placed before the generic entry it could otherwise be confused with
// (e.g. "butter") so that, all else equal, the more specific reading wins.
import { normalizeTokens } from './componentOps.js'

export const VOLUME_ANCHORS = [
  { names: ['egg whites', 'liquid egg whites', 'egg white'], gramsPerCup: 243 },
  { names: ['peanut butter'], gramsPerCup: 258 },
  { names: ['almond butter'], gramsPerCup: 256 },
  { names: ['coconut milk', 'canned coconut milk'], gramsPerCup: 226 },
  { names: ['almond milk'], gramsPerCup: 240 },
  { names: ['oat milk'], gramsPerCup: 240 },
  { names: ['soy milk', 'soya milk'], gramsPerCup: 240 },
  { names: ['milk', 'whole milk', 'skim milk', '2% milk', 'reduced fat milk', 'low fat milk', 'nonfat milk'], gramsPerCup: 244 },
  { names: ['plain yogurt', 'greek yogurt', 'yogurt', 'yoghurt'], gramsPerCup: 245 },
  { names: ['cottage cheese'], gramsPerCup: 226 },
  { names: ['sour cream'], gramsPerCup: 230 },
  { names: ['heavy cream', 'heavy whipping cream'], gramsPerCup: 238 },
  { names: ['olive oil', 'vegetable oil', 'canola oil', 'cooking oil', 'oil'], gramsPerCup: 216 },
  { names: ['butter', 'unsalted butter', 'salted butter'], gramsPerCup: 227 },
  { names: ['honey'], gramsPerCup: 339 },
  { names: ['maple syrup'], gramsPerCup: 322 },
  { names: ['all purpose flour', 'all-purpose flour', 'flour'], gramsPerCup: 120 },
  { names: ['whole wheat flour'], gramsPerCup: 120 },
  { names: ['brown sugar', 'light brown sugar', 'dark brown sugar', 'packed brown sugar'], gramsPerCup: 220 },
  { names: ['powdered sugar', 'confectioners sugar', "confectioner's sugar", 'icing sugar'], gramsPerCup: 120 },
  { names: ['granulated sugar', 'white sugar', 'sugar'], gramsPerCup: 200 },
  { names: ['rolled oats', 'old fashioned oats', 'oats', 'oatmeal'], gramsPerCup: 81 },
  { names: ['cooked rice', 'cooked white rice', 'white rice'], gramsPerCup: 158 },
  { names: ['cooked brown rice'], gramsPerCup: 195 },
  { names: ['cooked quinoa', 'quinoa'], gramsPerCup: 185 },
  { names: ['shredded cheese', 'shredded cheddar', 'shredded mozzarella'], gramsPerCup: 113 },
  { names: ['grated parmesan', 'parmesan'], gramsPerCup: 100 },
  { names: ['salsa'], gramsPerCup: 260 },
  { names: ['marinara sauce', 'marinara', 'pasta sauce'], gramsPerCup: 250 },
  { names: ['ketchup', 'catsup'], gramsPerCup: 273 },
  { names: ['mayonnaise', 'mayo'], gramsPerCup: 220 },
  { names: ['hummus'], gramsPerCup: 246 },
  { names: ['chicken broth', 'vegetable broth', 'chicken stock', 'vegetable stock', 'broth', 'stock'], gramsPerCup: 240 },
  { names: ['orange juice'], gramsPerCup: 248 },
  { names: ['cocoa powder', 'unsweetened cocoa powder'], gramsPerCup: 86 },
  { names: ['cornstarch', 'corn starch'], gramsPerCup: 128 },
  { names: ['breadcrumbs', 'bread crumbs'], gramsPerCup: 108 },
  { names: ['frozen peas'], gramsPerCup: 134 },
  { names: ['frozen corn'], gramsPerCup: 136 },
]

function tokenKey(tokens) {
  return [...tokens].sort().join(' ')
}

/**
 * Curated "1 cup" naturalUnits anchor for `name`, by food-name match against
 * VOLUME_ANCHORS. Matching (same `normalizeTokens` the seed tables use):
 *   1. Exact normalized-token-set match on any entry name wins outright.
 *   2. Else a one-directional subset match: an entry matches only if ALL of
 *      its name's tokens appear among `name`'s tokens (so "Kirkland Signature
 *      Egg Whites" matches 'egg white', but a bare "milk" item can never
 *      match 'coconut milk' — the reverse would be true, not this). Among
 *      multiple subset candidates, the one with the most matched tokens
 *      wins; ties resolve to whichever entry appears earliest in the array.
 * @param {string} name @returns {{label: '1 cup', gramsOrFraction: number}|null}
 */
export function volumeAnchorFor(name) {
  const itemTokens = normalizeTokens(name)
  if (itemTokens.length === 0) return null
  const itemKey = tokenKey(itemTokens)
  const itemSet = new Set(itemTokens)

  for (const entry of VOLUME_ANCHORS) {
    for (const candidate of entry.names) {
      const nameTokens = normalizeTokens(candidate)
      if (nameTokens.length > 0 && tokenKey(nameTokens) === itemKey) {
        return { label: '1 cup', gramsOrFraction: entry.gramsPerCup }
      }
    }
  }

  let best = null
  for (const entry of VOLUME_ANCHORS) {
    for (const candidate of entry.names) {
      const nameTokens = normalizeTokens(candidate)
      if (nameTokens.length === 0) continue
      if (!nameTokens.every((t) => itemSet.has(t))) continue
      if (!best || nameTokens.length > best.matched) best = { gramsPerCup: entry.gramsPerCup, matched: nameTokens.length }
      break
    }
  }
  return best ? { label: '1 cup', gramsOrFraction: best.gramsPerCup } : null
}

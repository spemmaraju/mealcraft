// Commodity nutrition seed table (CLAUDE.md §3 NutritionInfo, source
// 'seed_table'). Data-only, like seeds.js — no logic beyond the builder and
// the name-match lookup consumed by nutritionOps.js.

import { createNutritionInfo } from './schema.js'
import { nameMatches, normalizeTokens } from './componentOps.js'
import { VEG_SEEDS } from './nutritionSeedsVeg.js'

function seed(name, aliases, servingDesc, macros, naturalUnits = []) {
  const [kcal, protein_g, carbs_g, fat_g, fiber_g] = macros
  const perServing = { kcal, protein_g, carbs_g, fat_g }
  if (fiber_g != null) perServing.fiber_g = fiber_g
  return {
    name,
    aliases,
    build: () =>
      createNutritionInfo({
        source: 'seed_table',
        servingDesc,
        servingsPerContainer: null,
        perServing,
        naturalUnits,
      }),
  }
}

const CORE_SEEDS = [
  seed('canned chickpeas', ['chickpeas (canned)', 'chickpea'], '1/3 cup drained (55 g)', [70, 4, 11, 1, 3], [
    { label: '1/3 cup drained', gramsOrFraction: 55 },
  ]),
  seed('cooked rice', ['rice', 'white rice', 'cooked white rice'], '1 cup (158 g)', [205, 4.3, 45, 0.4, 0.6], [
    { label: '1 cup', gramsOrFraction: 158 },
  ]),
  seed('cooked brown rice', ['brown rice'], '1 cup (195 g)', [216, 5, 45, 1.8, 3.5], [
    { label: '1 cup', gramsOrFraction: 195 },
  ]),
  seed('cooked quinoa', ['quinoa'], '1 cup (185 g)', [222, 8, 39, 3.6, 5], [
    { label: '1 cup', gramsOrFraction: 185 },
  ]),
  seed('rolled oats', ['oats', 'oatmeal'], '1/2 cup dry (40 g)', [150, 5, 27, 3, 4], [
    { label: '1/2 cup dry', gramsOrFraction: 40 },
  ]),
  seed('egg', ['eggs', 'whole egg'], '1 egg (50 g)', [72, 6.3, 0.4, 4.8], [
    { label: '1 egg', gramsOrFraction: 50 },
  ]),
  seed('paneer', [], '100 g', [265, 18, 1.2, 21], [
    { label: '100 g', gramsOrFraction: 100 },
  ]),
  seed('tofu', ['firm tofu', 'tofu block'], '1 block (396 g)', [301, 32, 7.5, 19], [
    { label: '1 block', gramsOrFraction: 396 },
    { label: 'half block', gramsOrFraction: 198 },
  ]),
  seed('cooked masoor dal', ['red lentils', 'masoor dal', 'cooked lentils'], '1 cup (198 g)', [230, 18, 40, 0.8, 16], [
    { label: '1 cup', gramsOrFraction: 198 },
  ]),
  seed('cooked chana dal', ['chana dal', 'split chickpea dal'], '1 cup (206 g)', [269, 15, 45, 4, 13], [
    { label: '1 cup', gramsOrFraction: 206 },
  ]),
  seed('cooked moong dal', ['mung dal', 'moong'], '1 cup (202 g)', [212, 14, 38, 0.8, 8], [
    { label: '1 cup', gramsOrFraction: 202 },
  ]),
  seed('plain yogurt', ['yogurt', 'curd', 'dahi'], '1 cup (245 g)', [149, 8.5, 11, 8], [
    { label: '1 cup', gramsOrFraction: 245 },
  ]),
  seed('milk', ['whole milk'], '1 cup (244 g)', [149, 7.7, 12, 8], [
    { label: '1 cup', gramsOrFraction: 244 },
  ]),
  seed('ghee', ['clarified butter'], '1 tbsp (14 g)', [123, 0, 0, 14], [
    { label: '1 tbsp', gramsOrFraction: 14 },
  ]),
  seed('olive oil', ['oil', 'cooking oil'], '1 tbsp (14 g)', [119, 0, 0, 13.5], [
    { label: '1 tbsp', gramsOrFraction: 14 },
  ]),
  seed('peanut butter', ['pb'], '2 tbsp (32 g)', [188, 8, 6, 16, 2], [
    { label: '2 tbsp', gramsOrFraction: 32 },
    { label: '1 tbsp', gramsOrFraction: 16 },
  ]),
  seed('tahini', ['sesame paste'], '1 tbsp (15 g)', [89, 2.6, 3.2, 8], [
    { label: '1 tbsp', gramsOrFraction: 15 },
  ]),
  seed('frozen peas', ['peas'], '1 cup (145 g)', [117, 7.9, 21, 0.6, 7], [
    { label: '1 cup', gramsOrFraction: 145 },
  ]),
  seed('frozen spinach', [], '1/2 cup cooked (95 g)', [31, 3.8, 5, 0.3, 2.8], [
    { label: '1/2 cup cooked', gramsOrFraction: 95 },
  ]),
  seed('onion', ['onions'], '1 medium (110 g)', [44, 1.2, 10, 0.1, 1.9], [
    { label: '1 medium', gramsOrFraction: 110 },
  ]),
  seed('tomato', ['tomatoes'], '1 medium (123 g)', [22, 1.1, 4.8, 0.2, 1.5], [
    { label: '1 medium', gramsOrFraction: 123 },
  ]),
  seed('almonds', ['almond'], '1/4 cup (36 g)', [207, 7.6, 7.7, 18, 4.4], [
    { label: '1/4 cup', gramsOrFraction: 36 },
  ]),
  seed('walnuts', ['walnut'], '1/4 cup (30 g)', [196, 4.6, 4.1, 19.6, 2], [
    { label: '1/4 cup', gramsOrFraction: 30 },
  ]),
  seed('cashews', ['cashew'], '1/4 cup (34 g)', [197, 5.2, 11, 16, 1], [
    { label: '1/4 cup', gramsOrFraction: 34 },
  ]),
  seed('lemon', ['lemons'], '1 lemon (58 g)', [17, 0.6, 5.4, 0.2, 1.6], [
    { label: '1 lemon', gramsOrFraction: 58 },
  ]),
  seed('cooked black beans', ['black beans'], '1 cup (172 g)', [227, 15, 41, 0.9, 15], [
    { label: '1 cup', gramsOrFraction: 172 },
  ]),
  seed('cooked kidney beans', ['rajma', 'kidney beans'], '1 cup (177 g)', [225, 15, 40, 0.9, 13], [
    { label: '1 cup', gramsOrFraction: 177 },
  ]),
  seed('cooked whole wheat pasta', ['pasta', 'whole wheat pasta'], '1 cup (140 g)', [174, 7.5, 37, 0.8, 6], [
    { label: '1 cup', gramsOrFraction: 140 },
  ]),
  seed('cheddar cheese', ['cheese'], '1 oz (28 g)', [113, 7, 0.4, 9.3], [
    { label: '1 oz', gramsOrFraction: 28 },
  ]),
  seed('banana', ['bananas'], '1 medium (118 g)', [105, 1.3, 27, 0.4, 3.1], [
    { label: '1 medium', gramsOrFraction: 118 },
  ]),
]

// Ordering invariant (Phase 13 D1): findSeedForName takes the FIRST match in
// NUTRITION_SEEDS, and nameMatches is a bidirectional token-subset match — a
// query can match a generic CORE_SEEDS entry (milk, yogurt, cheese, peanut
// butter...) via simple word overlap even when a more specific VEG_SEEDS
// entry (coconut milk, greek yogurt, cottage cheese, peanuts...) is the
// correct hit. Putting VEG_SEEDS first ensures the more specific entries are
// tried before the generics they'd otherwise subset-match. Do not reverse
// this order without re-auditing nutritionSeedsVeg.js's GUARD_SEEDS comment.
export const NUTRITION_SEEDS = [...VEG_SEEDS, ...CORE_SEEDS]

function tokenKey(str) {
  return normalizeTokens(str).join(' ')
}

/** @param {string} name @returns {NutritionInfo|null} fresh copy, never shared */
export function findSeedForName(name) {
  const queryKey = tokenKey(name)
  // An exact name/alias token match always wins over a looser subset match,
  // regardless of array position — this is what lets a generic entry (e.g.
  // CORE_SEEDS 'milk') and a more specific one that contains its words as a
  // substring (e.g. VEG_SEEDS 'coconut milk') both resolve correctly for
  // their own exact queries, even though each also subset-matches the
  // other's query (nameMatches is bidirectional — see D1 in the execution
  // plan). Falls back to the first subset match (nameMatches) when nothing
  // is an exact hit, same as before.
  const exact = NUTRITION_SEEDS.find((s) => tokenKey(s.name) === queryKey || s.aliases.some((a) => tokenKey(a) === queryKey))
  if (exact) return exact.build()

  const entry = NUTRITION_SEEDS.find((s) => nameMatches(name, s.name) || s.aliases.some((a) => nameMatches(name, a)))
  return entry ? entry.build() : null
}

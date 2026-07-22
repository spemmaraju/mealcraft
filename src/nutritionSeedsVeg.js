// Vegetarian protein/legume/vegetable nutrition seed library (Phase 13).
// Same seed() shape as nutritionSeeds.js — kept as a sibling `seed` builder
// here (not imported) to avoid a circular import: nutritionSeeds.js imports
// VEG_SEEDS from this file to build the merged NUTRITION_SEEDS table.
//
// Values sourced from USDA FoodData Central (Foundation/SR Legacy) where an
// FDC analog exists; Indian preparations without one (roti, poha, besan) use
// commonly-published IFCT 2017-derived values. Rounded to 1 decimal.
//
// Cooked-vs-dry note (CLAUDE.md §3 no longer has NutritionInfo.state): dal/
// grain entries below are COOKED weight per naturalUnits cup. A recipe line
// meaning DRY quantity (e.g. "1 cup toor dal" meaning dry lentils) will be
// under-counted ~2.5x against these values. This is a directional signal,
// not a precise score — consistent with the app's tracking philosophy.

import { createNutritionInfo } from './schema.js'

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

// ---- Confusable guards ----------------------------------------------------
// Ordering invariant: NUTRITION_SEEDS = [...VEG_SEEDS, ...CORE_SEEDS] in
// nutritionSeeds.js, so every entry in this file is matched BEFORE any
// CORE_SEEDS entry. These specifically guard against nameMatches'
// bidirectional token-subset matching landing on a generic CORE entry
// ("coconut milk" / "almond milk" would otherwise subset-match "milk").
//
// A bare single-token 'butter' entry was deliberately NOT added here: under
// this ordering it would itself become the false positive, intercepting
// "Peanut butter" queries ahead of CORE_SEEDS' own 'peanut butter' entry
// (any single-token name/alias is a subset of every multi-word query that
// contains it, in either matching direction) — see the 'peanuts' comment
// below for the same trap.
const GUARD_SEEDS = [
  seed('coconut milk', ['canned coconut milk'], '1/4 cup canned (60 g)', [111, 1.1, 1.6, 11.6], [
    { label: '1/4 cup', gramsOrFraction: 60 },
  ]),
  seed('almond milk', ['unsweetened almond milk'], '1 cup (240 g)', [39, 1.5, 3.4, 2.9], [
    { label: '1 cup', gramsOrFraction: 240 },
  ]),
]

// ---- Legumes & vegetarian proteins -----------------------------------------
const PROTEIN_SEEDS = [
  seed('cooked toor dal', ['toor dal', 'arhar dal', 'pigeon peas'], '1 cup cooked (202 g)', [203, 14, 39, 0.7, 11], [
    { label: '1 cup', gramsOrFraction: 202 },
  ]),
  seed('cooked urad dal', ['urad dal', 'black gram'], '1 cup cooked (200 g)', [218, 15, 37, 1, 11], [
    { label: '1 cup', gramsOrFraction: 200 },
  ]),
  seed('cooked chickpeas', ['chole', 'garbanzo', 'chickpeas (dry)'], '1 cup cooked (164 g)', [269, 14.5, 45, 4.2, 12.5], [
    { label: '1 cup', gramsOrFraction: 164 },
  ]),
  seed(
    'cooked black-eyed peas',
    ['lobia', 'chawli', 'black eyed peas'],
    '1 cup cooked (171 g)',
    [198, 13.2, 35.5, 0.9, 11.1],
    [{ label: '1 cup', gramsOrFraction: 171 }],
  ),
  seed(
    'soy chunks',
    ['soya chunks', 'tvp', 'textured vegetable protein'],
    '1/4 cup dry (25 g)',
    [90, 13, 8, 0.5, 4],
    [{ label: '1/4 cup', gramsOrFraction: 25 }],
  ),
  seed('besan', ['gram flour', 'chickpea flour'], '1/4 cup (30 g)', [116, 6.6, 17.4, 2, 3], [
    { label: '1/4 cup', gramsOrFraction: 30 },
  ]),
  seed('edamame', ['shelled edamame'], '1 cup (155 g)', [189, 16.9, 15.8, 8.1, 8.1], [
    { label: '1 cup', gramsOrFraction: 155 },
  ]),
  seed('tempeh', [], '3 oz (85 g)', [162, 15.5, 6.8, 9.9], [{ label: '3 oz', gramsOrFraction: 85 }]),
  seed('greek yogurt', ['greek curd', 'hung curd'], '1 cup (245 g)', [146, 25, 8, 0.9], [
    { label: '1 cup', gramsOrFraction: 245 },
  ]),
  seed('egg whites', ['egg white'], '1 white (33 g)', [17, 3.6, 0.2, 0.1], [{ label: '1 white', gramsOrFraction: 33 }]),
  seed('cottage cheese', ['curd cheese'], '1/2 cup (113 g)', [92, 12.4, 5.1, 2.6], [
    { label: '1/2 cup', gramsOrFraction: 113 },
  ]),
  seed('soy milk', ['unsweetened soy milk'], '1 cup (243 g)', [80, 7, 4, 4], [
    { label: '1 cup', gramsOrFraction: 243 },
  ]),
  seed(
    'moong sprouts',
    ['sprouted moong', 'bean sprouts'],
    '1 cup (104 g)',
    [31, 3, 6, 0.2, 1.9],
    [{ label: '1 cup', gramsOrFraction: 104 }],
  ),
]

// ---- Grains/bases -----------------------------------------------------
const GRAIN_SEEDS = [
  seed('roti', ['chapati', 'phulka'], '1 medium (40 g)', [104, 3, 18, 2.5, 2], [
    { label: '1 medium', gramsOrFraction: 40 },
  ]),
  seed('whole wheat bread', [], '1 slice (28 g)', [69, 3.6, 12, 0.9, 1.9], [
    { label: '1 slice', gramsOrFraction: 28 },
  ]),
  seed('whole wheat flour', ['atta'], '1/4 cup dry (30 g)', [102, 4, 22, 0.6, 3.6], [
    { label: '1/4 cup', gramsOrFraction: 30 },
  ]),
  // No 'flattened rice' alias: the token 'rice' alone would subset-match
  // bare "rice" queries ahead of the CORE_SEEDS 'cooked rice' entry.
  seed('poha', [], '1/2 cup dry (50 g)', [180, 3.5, 40, 0.5, 1], [
    { label: '1/2 cup', gramsOrFraction: 50 },
  ]),
  seed('cooked millet', [], '1 cup cooked (174 g)', [207, 6, 41, 1.7, 2.3], [
    { label: '1 cup', gramsOrFraction: 174 },
  ]),
]

// ---- Vegetables ---------------------------------------------------------
const VEGETABLE_SEEDS = [
  seed('potato', [], '1 medium (173 g)', [161, 4.3, 37, 0.2, 3.8], [{ label: '1 medium', gramsOrFraction: 173 }]),
  seed('sweet potato', [], '1 medium (114 g)', [103, 2.3, 24, 0.2, 3.8], [
    { label: '1 medium', gramsOrFraction: 114 },
  ]),
  seed('carrot', ['carrots'], '1 medium (61 g)', [25, 0.6, 6, 0.1, 1.7], [{ label: '1 medium', gramsOrFraction: 61 }]),
  seed('cauliflower', ['gobi'], '1 cup chopped (107 g)', [27, 2.1, 5.3, 0.3, 2.1], [
    { label: '1 cup chopped', gramsOrFraction: 107 },
  ]),
  seed('broccoli', [], '1 cup chopped (91 g)', [31, 2.5, 6, 0.3, 2.4], [
    { label: '1 cup chopped', gramsOrFraction: 91 },
  ]),
  seed('cabbage', [], '1 cup chopped (89 g)', [22, 1.1, 5.2, 0.1, 2.2], [
    { label: '1 cup chopped', gramsOrFraction: 89 },
  ]),
  seed('bell pepper', ['capsicum'], '1 medium (119 g)', [24, 1, 5.5, 0.2, 1.7], [
    { label: '1 medium', gramsOrFraction: 119 },
  ]),
  seed('green beans', [], '1 cup (100 g)', [31, 1.8, 7, 0.2, 2.7], [{ label: '1 cup', gramsOrFraction: 100 }]),
  seed('okra', ['bhindi'], '1 cup (100 g)', [33, 1.9, 7.5, 0.2, 3.2], [{ label: '1 cup', gramsOrFraction: 100 }]),
  seed('cucumber', [], '1 cup sliced (104 g)', [16, 0.7, 3.8, 0.1, 0.5], [
    { label: '1 cup sliced', gramsOrFraction: 104 },
  ]),
  seed('eggplant', ['brinjal', 'baingan'], '1 cup cubed (82 g)', [20, 0.8, 4.8, 0.2, 2.5], [
    { label: '1 cup cubed', gramsOrFraction: 82 },
  ]),
  seed('mushrooms', ['mushroom'], '1 cup sliced (70 g)', [15, 2.2, 2.3, 0.2, 0.7], [
    { label: '1 cup sliced', gramsOrFraction: 70 },
  ]),
  // No bare 'spinach' alias here: 'frozen spinach' (CORE_SEEDS) also matches
  // any query containing the token 'spinach' via its own two-word name, so a
  // shared bare alias would make match order (not intent) decide which
  // entry a plain "Spinach" query resolves to. Each is reachable only by its
  // own two-word name/qualifier ("Fresh spinach" / "Frozen spinach").
  seed('fresh spinach', [], '1 cup raw (30 g)', [7, 0.9, 1.1, 0.1, 0.7], [
    { label: '1 cup raw', gramsOrFraction: 30 },
  ]),
  seed('bottle gourd', ['lauki', 'dudhi'], '1 cup cubed (100 g)', [15, 0.6, 3.4, 0, 1.2], [
    { label: '1 cup cubed', gramsOrFraction: 100 },
  ]),
]

// ---- Fruits/nuts --------------------------------------------------------
const FRUIT_NUT_SEEDS = [
  seed('avocado', [], '1/2 medium (100 g)', [160, 2, 8.5, 14.7, 6.7], [
    { label: '1/2 medium', gramsOrFraction: 100 },
  ]),
  // Known ordering trade-off (not fully solvable by reordering alone, see
  // D1 in the execution plan): 'peanuts' precedes CORE_SEEDS' 'peanut
  // butter', so a bare "Peanuts" query correctly resolves here (fixing the
  // documented gap), but a "Peanut butter" query ALSO subset-matches this
  // entry's single-token name and would incorrectly resolve here too,
  // ahead of the more specific CORE_SEEDS entry. No ordering fixes both
  // directions at once, since 'peanut' is a literal subset of 'peanut
  // butter' either way. Reachable and correct once the item's own nutrition
  // is directly reviewed/edited in the pantry editor.
  seed('peanuts', ['peanut'], '1/4 cup (36 g)', [207, 9.4, 6, 18, 3], [{ label: '1/4 cup', gramsOrFraction: 36 }]),
  seed('sesame seeds', [], '1 tbsp (9 g)', [52, 1.6, 2.1, 4.5, 1.1], [{ label: '1 tbsp', gramsOrFraction: 9 }]),
]

// ---- Derivation unblockers ------------------------------------------------
// deriveComponentMacros fails a whole component if any ingredient is
// unresolvable — near-zero-macro spice/aromatic lines like "1 tsp turmeric"
// currently kill derivation entirely. These fix the class, not the instance.
const UNBLOCKER_SEEDS = [
  seed('garlic', [], '1 clove (3 g)', [4, 0.2, 1, 0], [{ label: '1 clove', gramsOrFraction: 3 }]),
  seed('ginger', [], '1 tsp grated (2 g)', [2, 0, 0.4, 0], [{ label: '1 tsp', gramsOrFraction: 2 }]),
  seed('green chili', ['green chilli'], '1 piece (5 g)', [2, 0.1, 0.4, 0], [{ label: '1 piece', gramsOrFraction: 5 }]),
  seed('cilantro', ['coriander leaves'], '1 tbsp chopped (4 g)', [1, 0.1, 0.1, 0], [
    { label: '1 tbsp', gramsOrFraction: 4 },
  ]),
  seed(
    'dry ground spices',
    ['turmeric', 'cumin', 'coriander powder', 'garam masala', 'chili powder', 'mustard seeds', 'black pepper', 'hing'],
    '1 tsp (2 g)',
    [7, 0.3, 1.3, 0.3],
    [{ label: '1 tsp', gramsOrFraction: 2 }],
  ),
  seed('salt', [], '1 tsp (6 g)', [0, 0, 0, 0], [{ label: '1 tsp', gramsOrFraction: 6 }]),
  seed('soy sauce', [], '1 tbsp (16 g)', [8, 1.3, 0.8, 0], [{ label: '1 tbsp', gramsOrFraction: 16 }]),
  seed('sugar', [], '1 tsp (4 g)', [16, 0, 4, 0], [{ label: '1 tsp', gramsOrFraction: 4 }]),
]

export const VEG_SEEDS = [
  ...GUARD_SEEDS,
  ...PROTEIN_SEEDS,
  ...GRAIN_SEEDS,
  ...VEGETABLE_SEEDS,
  ...FRUIT_NUT_SEEDS,
  ...UNBLOCKER_SEEDS,
]

// Schema contract for MealCraft (CLAUDE.md §3). Factories build defaulted
// shapes; validate() checks an object against one of the shape names below
// and returns an array of human-readable "path: problem" errors ("" when valid).

export const SHAPE_NAMES = [
  'PantryItem',
  'NutritionInfo',
  'Component',
  'WeekPlan',
  'LogEntry',
  'WeeklyFeedback',
  'Settings',
]

// Maps storage.js collection keys to the shape each record must satisfy.
export const COLLECTION_SHAPES = {
  pantry: 'PantryItem',
  components: 'Component',
  weeks: 'WeekPlan',
  logs: 'LogEntry',
  feedback: 'WeeklyFeedback',
}

export const NUTRITION_SOURCES = ['barcode', 'label_photo', 'seed_table', 'ai_estimate', 'manual']
export const NUTRITION_STATES = ['as_packaged', 'as_prepared']
export const PANTRY_ROLES = ['staple', 'rotating']
export const COMPONENT_TYPES = ['base', 'protein', 'veg', 'sauce', 'finisher', 'dish']
export const STATIONS = ['stovetop', 'oven', 'instant_pot', 'none']
export const MACRO_SOURCES = [...NUTRITION_SOURCES, 'derived']
export const RATINGS = ['repeat', 'fine', 'never']
export const ORIGINS = ['ai', 'manual', 'adapted']
export const MEALS = ['lunch', 'other']
export const API_MODES = ['paste', 'byok']
export const PROVIDERS = ['anthropic', 'google']

function genId(prefix) {
  const rand =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
  return `${prefix}_${rand}`
}

// ---- Factories -------------------------------------------------------

export function createNutritionInfo(overrides = {}) {
  return {
    source: 'manual',
    state: 'as_packaged',
    servingDesc: '',
    servingsPerContainer: null,
    perServing: { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
    naturalUnits: [],
    barcode: null,
    ...overrides,
  }
}

export function createPantryItem(overrides = {}) {
  return {
    id: genId('pantry'),
    name: '',
    category: '',
    role: 'rotating',
    onHand: false,
    roughQty: null,
    nutrition: null,
    ...overrides,
  }
}

export function createComponent(overrides = {}) {
  return {
    id: genId('component'),
    name: '',
    type: 'dish',
    cuisineTags: [],
    ingredients: [],
    steps: [],
    shelfLifeDays: 3,
    storage: '',
    station: 'none',
    activeMin: 0,
    passiveMin: 0,
    servings: null,
    macrosPerServing: null,
    macroSource: 'manual',
    rating: null,
    origin: 'manual',
    archived: false,
    ...overrides,
  }
}

export function createWeekPlan(overrides = {}) {
  return {
    weekOf: '',
    componentIds: [],
    runSheet: [],
    assembly: [],
    refresh: { day: 'Wed', steps: [], componentIds: [] },
    grocerySuggestions: [],
    ...overrides,
  }
}

export function createLogEntry(overrides = {}) {
  return {
    date: '',
    meal: 'lunch',
    componentIds: [],
    portions: [],
    quickRating: null,
    ...overrides,
  }
}

export function createWeeklyFeedback(overrides = {}) {
  return {
    weekOf: '',
    repeatWorthy: '',
    diedUneaten: '',
    boredomNotes: '',
    ...overrides,
  }
}

export function createSettings(overrides = {}) {
  return {
    proteinBand: { low_g: 20, high_g: 35 },
    boughtLunchCost: 12,
    apiMode: 'paste',
    provider: 'anthropic',
    apiKey: null,
    fdcKey: null,
    lastExportAt: null,
    ...overrides,
  }
}

// ---- Declarative validation engine -------------------------------------
// Each field spec is a checker function (value, path, errors) => void.
// T.* build checkers; T.obj composes them into a shape checker.

function describe(v) {
  if (v === undefined) return 'undefined'
  if (v === null) return 'null'
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

function isPlainObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

const T = {
  str:
    (opts = {}) =>
    (v, path, errors) => {
      if (v === null && opts.nullable) return
      if (typeof v !== 'string') errors.push(`${path}: expected string${opts.nullable ? ' | null' : ''}, got ${describe(v)}`)
    },
  num:
    (opts = {}) =>
    (v, path, errors) => {
      if (v === null && opts.nullable) return
      if (typeof v !== 'number' || Number.isNaN(v))
        errors.push(`${path}: expected number${opts.nullable ? ' | null' : ''}, got ${describe(v)}`)
    },
  bool: () => (v, path, errors) => {
    if (typeof v !== 'boolean') errors.push(`${path}: expected boolean, got ${describe(v)}`)
  },
  enumOf:
    (values, opts = {}) =>
    (v, path, errors) => {
      if (v === null && opts.nullable) return
      if (!values.includes(v))
        errors.push(`${path}: expected ${values.map((x) => `"${x}"`).join(' | ')}, got ${describe(v)}`)
    },
  optional: (checker) => (v, path, errors) => {
    if (v !== undefined) checker(v, path, errors)
  },
  strArray: () => (v, path, errors) => T.arrayOf(T.str())(v, path, errors),
  arrayOf: (itemChecker) => (v, path, errors) => {
    if (!Array.isArray(v)) {
      errors.push(`${path}: expected array, got ${describe(v)}`)
      return
    }
    v.forEach((item, i) => itemChecker(item, `${path}[${i}]`, errors))
  },
  obj:
    (fields, opts = {}) =>
    (v, path, errors) => {
      if (v === null && opts.nullable) return
      if (!isPlainObject(v)) {
        errors.push(`${path || '(root)'}: expected object${opts.nullable ? ' | null' : ''}, got ${describe(v)}`)
        return
      }
      for (const [key, checker] of Object.entries(fields)) {
        checker(v[key], path ? `${path}.${key}` : key, errors)
      }
    },
}

// ---- Shape field specs ---------------------------------------------------

const nutritionInfoFields = {
  source: T.enumOf(NUTRITION_SOURCES),
  state: T.enumOf(NUTRITION_STATES),
  servingDesc: T.str(),
  servingsPerContainer: T.num({ nullable: true }),
  perServing: T.obj({
    kcal: T.num(),
    protein_g: T.num(),
    carbs_g: T.num(),
    fat_g: T.num(),
    fiber_g: T.optional(T.num()),
  }),
  naturalUnits: T.arrayOf(T.obj({ label: T.str(), gramsOrFraction: T.num() })),
  barcode: T.optional(T.str({ nullable: true })),
}

const SHAPES = {
  NutritionInfo: nutritionInfoFields,
  PantryItem: {
    id: T.str(),
    name: T.str(),
    category: T.str(),
    role: T.enumOf(PANTRY_ROLES),
    onHand: T.bool(),
    roughQty: T.str({ nullable: true }),
    nutrition: T.obj(nutritionInfoFields, { nullable: true }),
  },
  Component: {
    id: T.str(),
    name: T.str(),
    type: T.enumOf(COMPONENT_TYPES),
    cuisineTags: T.strArray(),
    ingredients: T.arrayOf(T.obj({ name: T.str(), measure: T.str() })),
    steps: T.strArray(),
    shelfLifeDays: T.num(),
    storage: T.str(),
    station: T.enumOf(STATIONS),
    activeMin: T.num(),
    passiveMin: T.num(),
    servings: T.num({ nullable: true }),
    macrosPerServing: T.obj(
      { kcal: T.num(), protein_g: T.num(), carbs_g: T.num(), fat_g: T.num() },
      { nullable: true },
    ),
    macroSource: T.enumOf(MACRO_SOURCES),
    rating: T.enumOf(RATINGS, { nullable: true }),
    origin: T.enumOf(ORIGINS),
    archived: T.bool(),
  },
  WeekPlan: {
    weekOf: T.str(),
    componentIds: T.strArray(),
    runSheet: T.arrayOf(
      T.obj({
        t: T.str(),
        station: T.enumOf(STATIONS),
        action: T.str(),
        componentId: T.optional(T.str()),
        done: T.bool(),
      }),
    ),
    assembly: T.arrayOf(T.obj({ day: T.str(), componentIds: T.strArray(), note: T.str() })),
    refresh: T.obj({ day: T.str(), steps: T.strArray(), componentIds: T.strArray() }),
    grocerySuggestions: T.arrayOf(T.obj({ name: T.str(), qty: T.str(), dismissed: T.bool() })),
  },
  LogEntry: {
    date: T.str(),
    meal: T.enumOf(MEALS),
    componentIds: T.strArray(),
    portions: T.arrayOf(T.obj({ componentId: T.str(), naturalUnitLabel: T.str(), count: T.num() })),
    quickRating: T.enumOf(RATINGS, { nullable: true }),
  },
  WeeklyFeedback: {
    weekOf: T.str(),
    repeatWorthy: T.str(),
    diedUneaten: T.str(),
    boredomNotes: T.str(),
  },
  Settings: {
    proteinBand: T.obj({ low_g: T.num(), high_g: T.num() }),
    boughtLunchCost: T.num(),
    apiMode: T.enumOf(API_MODES),
    provider: T.enumOf(PROVIDERS),
    apiKey: T.str({ nullable: true }),
    fdcKey: T.str({ nullable: true }),
    lastExportAt: T.str({ nullable: true }),
  },
}

/**
 * Validate `obj` against one of SHAPE_NAMES.
 * @param {*} obj
 * @param {string} shapeName
 * @returns {string[]} empty when valid, else actionable "path: problem" strings
 */
export function validate(obj, shapeName) {
  const fields = SHAPES[shapeName]
  if (!fields) throw new Error(`schema.validate: unknown shape "${shapeName}"`)
  const errors = []
  T.obj(fields)(obj, '', errors)
  return errors
}

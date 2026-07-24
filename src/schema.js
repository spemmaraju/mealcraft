// Schema contract for MealCraft (CLAUDE.md §3). Factories build defaulted
// shapes; validate() checks an object against one of the shape names below
// and returns an array of human-readable "path: problem" errors ("" when valid).

import { T } from './schemaTypes.js'

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

export const NUTRITION_SOURCES = ['barcode', 'label_photo', 'seed_table', 'ai_estimate', 'manual', 'online_search']
// Human-readable labels for provenance chips (Pantry tags, Track view, etc.)
// — falls back to the raw source string for anything not listed here.
// Keyed by MACRO_SOURCES (NUTRITION_SOURCES + 'derived') since Component
// macro provenance reuses the same display.
export const NUTRITION_SOURCE_LABELS = {
  barcode: 'barcode scan',
  label_photo: 'label photo',
  seed_table: 'seed data',
  ai_estimate: 'AI estimate',
  manual: 'manual',
  online_search: 'online',
  derived: 'derived',
}

// Round 2.6 retheme: the design bundle defines exactly 4 provenance colors
// (seed=green, online=blue, manual=gray, barcode=purple) — everything that
// isn't a seed/online/barcode source (manual, ai_estimate, label_photo,
// derived) buckets into the neutral "manual" gray badge.
export function provenanceClass(source) {
  if (source === 'seed_table') return 'seed'
  if (source === 'online_search') return 'online'
  if (source === 'barcode') return 'barcode'
  return 'manual'
}
export const COMPONENT_TYPES = ['base', 'protein', 'veg', 'sauce', 'finisher', 'dish']
export const STATIONS = ['stovetop', 'oven', 'instant_pot', 'none']
export const MACRO_SOURCES = [...NUTRITION_SOURCES, 'derived']
export const RATINGS = ['repeat', 'fine', 'never']
// No longer a Component field (removed Phase 7) — kept only for
// ComponentEditor's origin select, which Phase 9 removes entirely.
export const ORIGINS = ['ai', 'manual', 'adapted']
export const MEALS = ['breakfast', 'lunch', 'dinner', 'snack']
// Display labels for MEALS — shared by DayLog (meal-card titles) and
// AddLogItemSheet (the "Add to {Meal} ▾" picker), Round 2.7.
export const MEAL_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' }
export const LOG_ITEM_KINDS = ['component', 'pantry', 'adhoc']
export const API_MODES = ['paste', 'byok']
export const PROVIDERS = ['anthropic', 'google']
export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const REFRESH_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
export const DAY_NAMES = {
  Sun: 'Sunday',
  Mon: 'Monday',
  Tue: 'Tuesday',
  Wed: 'Wednesday',
  Thu: 'Thursday',
  Fri: 'Friday',
  Sat: 'Saturday',
}

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
    items: [],
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
    proteinBand: { low_g: 60, high_g: 90 }, // daily band (Phase 15) — was per-lunch 20/35
    boughtLunchCost: 12,
    apiMode: 'paste',
    provider: 'anthropic',
    apiKey: null,
    fdcKey: null,
    lastExportAt: null,
    cookDay: 'Sun',
    refreshDay: 'Wed', // null = no midweek refresh
    ...overrides,
  }
}

// ---- Shape field specs ---------------------------------------------------

const nutritionInfoFields = {
  source: T.enumOf(NUTRITION_SOURCES),
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
    onHand: T.bool(),
    roughQty: T.str({ nullable: true }),
    nutrition: T.obj(nutritionInfoFields, { nullable: true }),
  },
  Component: {
    id: T.str(),
    name: T.str(),
    type: T.enumOf(COMPONENT_TYPES),
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
    items: T.arrayOf(
      T.discriminated('kind', {
        component: { kind: T.enumOf(['component']), componentId: T.str(), count: T.num() },
        pantry: { kind: T.enumOf(['pantry']), pantryId: T.str(), measure: T.str() },
        adhoc: { kind: T.enumOf(['adhoc']), name: T.str(), measure: T.str(), nutrition: T.obj(nutritionInfoFields) },
      }),
    ),
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
    cookDay: T.enumOf(DAYS),
    refreshDay: T.enumOf(REFRESH_DAYS, { nullable: true }),
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

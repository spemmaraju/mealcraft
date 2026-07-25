// The ONLY module that touches localStorage. Every function is async so a
// future IndexedDB backend can replace the internals without touching callers.

import { validate, createSettings, COLLECTION_SHAPES } from './schema.js'
import { DEFAULT_CATEGORIES, seedPantryItems } from './seeds.js'
import { findSeedForName } from './nutritionOps.js'

const STORAGE_KEY = 'mealcraft.v1'
const SCHEMA_VERSION = 11
const COLLECTIONS = ['pantry', 'components', 'planSlots', 'logs', 'feedback', 'grocery', 'ideas']

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

// Shared by defaultState() (fresh installs) and the v2->v3/v6->v7
// migrations (existing installs) — never overwrites nutrition that's
// already set. Mutates in place.
function backfillPantryNutrition(pantry) {
  for (const item of pantry) {
    if (item.nutrition == null) {
      const seeded = findSeedForName(item.name)
      if (seeded) item.nutrition = seeded
    }
  }
  return pantry
}

function defaultState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    categories: [...DEFAULT_CATEGORIES],
    pantry: backfillPantryNutrition(seedPantryItems()),
    components: [],
    planSlots: [],
    logs: [],
    feedback: [],
    grocery: [],
    ideas: [],
    settings: createSettings(),
  }
}

// v9 -> v10 migration helper: Sunday `weekOf` + a Mon..Fri assembly day ->
// the calendar date it lands on. Self-contained (not imported from
// trackOps.js) so migrate() never depends on anything that could someday
// import storage.js back.
function addDaysISO(dateISO, days) {
  const [y, m, d] = dateISO.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}

// v1 -> v2: adds `categories`, derived from the defaults plus any custom
// category names already referenced by the state's own pantry items
// (default order preserved, extras appended).
// v2 -> v3: adds `Settings.fdcKey`, `Component.servings`, and backfills seed
// nutrition onto pantry items whose `nutrition === null` (never overwrites
// existing nutrition).
// v3 -> v4: adds `Settings.lastExportAt`.
// v4 -> v5: adds `Settings.cookDay` / `Settings.refreshDay` (defaults keep
// the original Sunday cook / Wednesday refresh behavior).
// v5 -> v6: drops the now-unused `role` (pantry items), `origin`/
// `cuisineTags` (components), and `state` (nutrition objects) keys — pure
// storage hygiene, safe no-op if a key is already absent.
// v6 -> v7: re-runs the seed backfill (same guarantee as v2->v3: never
// overwrites existing nutrition) against the Phase 13-expanded seed table,
// so installs that pre-date the expanded library pick up newly-covered
// items (dals, vegetables, etc.) without the user re-adding them. Does NOT
// insert new starter pantry items into existing installs. Mutates and
// returns `state`; chains v1 through v7.
export function migrate(state) {
  if (state.schemaVersion === 1) {
    const pantryItems = Array.isArray(state.pantry) ? state.pantry : []
    const extras = []
    for (const item of pantryItems) {
      const cat = item && item.category
      if (typeof cat === 'string' && cat && !DEFAULT_CATEGORIES.includes(cat) && !extras.includes(cat)) {
        extras.push(cat)
      }
    }
    state.categories = [...DEFAULT_CATEGORIES, ...extras]
    state.schemaVersion = 2
  }
  if (state.schemaVersion === 2) {
    if (state.settings) state.settings.fdcKey ??= null
    for (const component of Array.isArray(state.components) ? state.components : []) {
      component.servings ??= null
    }
    backfillPantryNutrition(Array.isArray(state.pantry) ? state.pantry : [])
    state.schemaVersion = 3
  }
  if (state.schemaVersion === 3) {
    if (state.settings) state.settings.lastExportAt ??= null
    state.schemaVersion = 4
  }
  if (state.schemaVersion === 4) {
    if (state.settings) {
      state.settings.cookDay ??= 'Sun'
      state.settings.refreshDay ??= 'Wed'
    }
    state.schemaVersion = 5
  }
  if (state.schemaVersion === 5) {
    const stripNutritionState = (nutrition) => {
      if (nutrition && typeof nutrition === 'object') delete nutrition.state
    }
    for (const item of Array.isArray(state.pantry) ? state.pantry : []) {
      delete item.role
      stripNutritionState(item.nutrition)
    }
    for (const component of Array.isArray(state.components) ? state.components : []) {
      delete component.origin
      delete component.cuisineTags
      stripNutritionState(component.nutrition)
    }
    state.schemaVersion = 6
  }
  if (state.schemaVersion === 6) {
    backfillPantryNutrition(Array.isArray(state.pantry) ? state.pantry : [])
    state.schemaVersion = 7
  }
  // v7 -> v8: LogEntry moves from {meal:'lunch'|'other', componentIds,
  // portions} to {meal: one of MEALS, items: discriminated union}. Legacy
  // 'other' logs become 'snack'; since 'other' previously APPENDED rather
  // than replaced (Phase 5), multiple same-date 'other' entries must merge
  // into one snack entry rather than colliding on the new (date, meal)
  // identity. proteinBand only flips 20/35 -> 60/90 when it's still
  // EXACTLY the factory default — safe because no Settings UI for it has
  // ever shipped, so every install necessarily still has that default;
  // this rewrites no user-chosen value.
  if (state.schemaVersion === 7) {
    const mealFor = { lunch: 'lunch', other: 'snack' }
    const merged = new Map()
    for (const log of Array.isArray(state.logs) ? state.logs : []) {
      const meal = mealFor[log.meal] ?? 'snack'
      const items = (log.portions ?? []).map((p) => ({ kind: 'component', componentId: p.componentId, count: p.count }))
      const key = `${log.date}|${meal}`
      if (merged.has(key)) merged.get(key).items.push(...items)
      else merged.set(key, { date: log.date, meal, items, quickRating: log.quickRating ?? null })
    }
    state.logs = [...merged.values()]
    const band = state.settings?.proteinBand
    if (band && band.low_g === 20 && band.high_g === 35) state.settings.proteinBand = { low_g: 60, high_g: 90 }
    state.schemaVersion = 8
  }
  // v8 -> v9: NUTRITION_SOURCES gains 'online_search' for items saved from
  // FoodSearchSheet's text search (previously mistagged 'barcode' via
  // mapOffProduct, a Round-1 correctness fix — new saves tag correctly
  // going forward). Existing data can't be retroactively told apart
  // (a genuine scan and a search save both landed as 'barcode'), so there
  // is nothing to rewrite here; this step only bumps the version so older
  // exports keep importing cleanly once the enum accepts the new value.
  if (state.schemaVersion === 8) {
    state.schemaVersion = 9
  }
  // v9 -> v10: Phase P1 replaces the AI full-week generator (WeekPlan: run
  // sheet, assembly cards, week import) with slot-based planning (PlanSlot,
  // identity (date, meal), mirroring LogEntry) plus a standalone advisory
  // `grocery` collection (GroceryItem) — WeekPlan.grocerySuggestions'
  // dismiss-in-place model is gone; a dismissed grocery idea is just
  // deleted. Every old week's Mon..Fri assembly card with >= 1 component
  // becomes a lunch PlanSlot dated off that week's Sunday `weekOf`; a card
  // with no components contributes nothing. Two cards resolving to the same
  // (date, meal) — can't happen from one week's own Mon-Fri days, but can
  // across two differently-anchored weeks in old data — merge by appending
  // items and deduping componentIds rather than one clobbering the other.
  if (state.schemaVersion === 9) {
    const dayOffset = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5 }
    const slotByKey = new Map()
    for (const week of Array.isArray(state.weeks) ? state.weeks : []) {
      for (const card of Array.isArray(week.assembly) ? week.assembly : []) {
        const componentIds = Array.isArray(card.componentIds) ? card.componentIds : []
        const offset = dayOffset[card.day]
        if (componentIds.length === 0 || offset == null) continue
        const date = addDaysISO(week.weekOf, offset)
        const key = `${date}|lunch`
        const slot = slotByKey.get(key) || { date, meal: 'lunch', items: [], seenIds: new Set() }
        for (const componentId of componentIds) {
          if (slot.seenIds.has(componentId)) continue
          slot.seenIds.add(componentId)
          slot.items.push({ kind: 'component', componentId, count: 1 })
        }
        slotByKey.set(key, slot)
      }
    }
    state.planSlots = [...slotByKey.values()].map(({ date, meal, items }) => ({ date, meal, items }))
    state.grocery = []
    delete state.weeks
    state.schemaVersion = 10
  }
  // v10 -> v11: Phase P2 adds `ideas` (AI dish-idea shortlist, Idea shape) —
  // always starts empty; nothing in prior schema versions maps onto it.
  if (state.schemaVersion === 10) {
    state.ideas = []
    state.schemaVersion = 11
  }
  return state
}

function readRaw() {
  const raw = localStorage.getItem(STORAGE_KEY)
  // Persist immediately on first-ever read (not just first write) — every
  // record here (pantry item ids in particular) is freshly, randomly
  // generated by defaultState(), so leaving it unwritten would let two
  // independently mounted screens each read a DIFFERENT fresh set of ids
  // before the first storage.set() call, silently breaking any id captured
  // by the first once the second's write persists its own ids instead.
  if (!raw) {
    const state = defaultState()
    writeRaw(state)
    return state
  }
  try {
    const merged = { ...defaultState(), ...JSON.parse(raw) }
    const wasOld = merged.schemaVersion < SCHEMA_VERSION
    const state = migrate(merged)
    if (wasOld) writeRaw(state)
    return state
  } catch {
    return defaultState()
  }
}

function writeRaw(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

const listeners = new Set()
function notify() {
  listeners.forEach((fn) => fn())
}

/** @param {() => void} listener called after any change. @returns {() => void} unsubscribe */
export function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** @param {string} collection one of pantry|components|planSlots|logs|feedback|grocery|ideas|settings */
export async function get(collection) {
  return readRaw()[collection]
}

/** @param {string} collection @param {*} value replaces the whole collection */
export async function set(collection, value) {
  const state = readRaw()
  state[collection] = value
  writeRaw(state)
  notify()
}

export async function getFullState() {
  return readRaw()
}

export async function exportState() {
  const state = readRaw()
  return JSON.stringify({ ...state, settings: { ...state.settings, apiKey: null, fdcKey: null } }, null, 2)
}

/** Stamps `settings.lastExportAt` to now. Call after a successful export. */
export async function markExported() {
  const state = readRaw()
  state.settings = { ...state.settings, lastExportAt: new Date().toISOString() }
  writeRaw(state)
  notify()
}

export async function resetState() {
  writeRaw(defaultState())
  notify()
}

// Parses + validates without writing. Used both by importState and by the
// Settings screen to render a diff summary before the user confirms.
function parseAndValidate(jsonString) {
  let parsed
  try {
    parsed = JSON.parse(jsonString)
  } catch (e) {
    return { ok: false, errors: [`(json): could not parse — ${e.message}`] }
  }
  if (!isPlainObject(parsed)) {
    return { ok: false, errors: [`(root): expected object, got ${describe(parsed)}`] }
  }
  if (parsed.schemaVersion < SCHEMA_VERSION) migrate(parsed)
  if (parsed.schemaVersion !== SCHEMA_VERSION) {
    return { ok: false, errors: [`schemaVersion: expected ${SCHEMA_VERSION}, got ${describe(parsed.schemaVersion)}`] }
  }

  const errors = []
  for (const collection of COLLECTIONS) {
    const records = parsed[collection]
    if (!Array.isArray(records)) {
      errors.push(`${collection}: expected array, got ${describe(records)}`)
      continue
    }
    records.forEach((record, i) => {
      validate(record, COLLECTION_SHAPES[collection]).forEach((err) => errors.push(`${collection}[${i}].${err}`))
    })
  }
  if (!Array.isArray(parsed.categories)) {
    errors.push(`categories: expected array, got ${describe(parsed.categories)}`)
  } else {
    parsed.categories.forEach((c, i) => {
      if (typeof c !== 'string') errors.push(`categories[${i}]: expected string, got ${describe(c)}`)
    })
  }
  validate(parsed.settings, 'Settings').forEach((err) => errors.push(`settings.${err}`))

  if (errors.length > 0) return { ok: false, errors }

  const summary = Object.fromEntries(COLLECTIONS.map((c) => [c, parsed[c].length]))
  summary.categories = parsed.categories.length
  return { ok: true, parsed, summary }
}

/** Validate-only preview for showing a diff summary before the user confirms. */
export async function previewImport(jsonString) {
  return parseAndValidate(jsonString)
}

/** Validates, and only overwrites state if every record is valid. */
export async function importState(jsonString) {
  const result = parseAndValidate(jsonString)
  if (!result.ok) return result
  const current = readRaw()
  result.parsed.settings = {
    ...result.parsed.settings,
    apiKey: current.settings.apiKey,
    fdcKey: current.settings.fdcKey,
  }
  writeRaw(result.parsed)
  notify()
  return result
}

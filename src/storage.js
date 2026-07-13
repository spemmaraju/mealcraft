// The ONLY module that touches localStorage. Every function is async so a
// future IndexedDB backend can replace the internals without touching callers.

import { validate, createSettings, COLLECTION_SHAPES } from './schema.js'
import { DEFAULT_CATEGORIES, seedPantryItems } from './seeds.js'
import { findSeedForName } from './nutritionOps.js'

const STORAGE_KEY = 'mealcraft.v1'
const SCHEMA_VERSION = 4
const COLLECTIONS = ['pantry', 'components', 'weeks', 'logs', 'feedback']

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

function defaultState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    categories: [...DEFAULT_CATEGORIES],
    pantry: seedPantryItems(),
    components: [],
    weeks: [],
    logs: [],
    feedback: [],
    settings: createSettings(),
  }
}

// v1 -> v2: adds `categories`, derived from the defaults plus any custom
// category names already referenced by the state's own pantry items
// (default order preserved, extras appended).
// v2 -> v3: adds `Settings.fdcKey`, `Component.servings`, and backfills seed
// nutrition onto pantry items whose `nutrition === null` (never overwrites
// existing nutrition).
// v3 -> v4: adds `Settings.lastExportAt`. Mutates and returns `state`; chains
// v1 through v4.
function migrate(state) {
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
    for (const item of Array.isArray(state.pantry) ? state.pantry : []) {
      if (item.nutrition == null) {
        const seeded = findSeedForName(item.name)
        if (seeded) item.nutrition = seeded
      }
    }
    state.schemaVersion = 3
  }
  if (state.schemaVersion === 3) {
    if (state.settings) state.settings.lastExportAt ??= null
    state.schemaVersion = 4
  }
  return state
}

function readRaw() {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return defaultState()
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

/** @param {string} collection one of pantry|components|weeks|logs|feedback|settings */
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

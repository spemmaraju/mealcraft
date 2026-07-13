// The ONLY module that touches localStorage. Every function is async so a
// future IndexedDB backend can replace the internals without touching callers.

import { validate, createSettings, COLLECTION_SHAPES } from './schema.js'

const STORAGE_KEY = 'mealcraft.v1'
const SCHEMA_VERSION = 1
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
    pantry: [],
    components: [],
    weeks: [],
    logs: [],
    feedback: [],
    settings: createSettings(),
  }
}

function readRaw() {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return defaultState()
  try {
    return { ...defaultState(), ...JSON.parse(raw) }
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
  return JSON.stringify(readRaw(), null, 2)
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
  validate(parsed.settings, 'Settings').forEach((err) => errors.push(`settings.${err}`))

  if (errors.length > 0) return { ok: false, errors }

  const summary = Object.fromEntries(COLLECTIONS.map((c) => [c, parsed[c].length]))
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
  writeRaw(result.parsed)
  notify()
  return result
}

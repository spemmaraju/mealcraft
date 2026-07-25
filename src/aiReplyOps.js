// Shared AI-reply JSON parsing/validation that survives outside the (Phase
// P1 removed) full-week generation flow: extractJson is generic fence-
// stripping used by nutritionMappers.js's label-photo mappers, and
// validateComponentReply/buildFixRequest back MicroActionSheet's single-
// component BYOK regenerate/substitute actions (byok.js). Split out of the
// old weekImport.js — which also validated/applied the full WeekPlan AI
// envelope — when that envelope went away with the AI week generator; pure,
// no storage imports, no DOM.

import { createComponent, validate } from './schema.js'

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

/** Strips markdown fences / surrounding prose down to the first {..} block. */
export function extractJson(text) {
  if (typeof text !== 'string') return ''
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) return text.trim()
  return text.slice(start, end + 1)
}

function stripComponentPayload(raw) {
  const { id, rating, archived, macroSource, ...rest } = raw
  return rest
}

/** Copy-ready chat message asking the AI to fix and resend the full JSON. */
export function buildFixRequest(errors) {
  const lines = errors.map((e) => `- ${e}`).join('\n')
  return `The JSON you sent had validation errors:\n\n${lines}\n\nFix these and output the corrected FULL JSON only — no prose, no fences.`
}

/** Validates a single-component AI reply (regenerate/substitute). @returns {{ok, errors, component}} */
export function validateComponentReply(text) {
  let parsed
  try {
    parsed = JSON.parse(extractJson(text))
  } catch (e) {
    return { ok: false, errors: [`(json): could not parse — ${e.message}`], component: null }
  }
  if (!isPlainObject(parsed)) {
    return { ok: false, errors: [`(root): expected object, got ${describe(parsed)}`], component: null }
  }
  if (typeof parsed.name !== 'string' || !parsed.name.trim()) {
    return { ok: false, errors: [`name: expected non-empty string, got ${describe(parsed.name)}`], component: null }
  }
  const full = createComponent({
    ...stripComponentPayload(parsed),
    name: parsed.name.trim(),
    origin: 'ai',
    rating: null,
    archived: false,
    macroSource: 'ai_estimate',
  })
  const errors = validate(full, 'Component')
  if (errors.length > 0) return { ok: false, errors, component: null }
  return { ok: true, errors: [], component: full }
}

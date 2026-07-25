// Shared AI-reply JSON parsing/validation. extractJson is generic fence-
// stripping used by nutritionMappers.js's label-photo mappers;
// validateComponentReply/buildFixRequest back MicroActionSheet's single-
// component BYOK regenerate/substitute actions, and validateIdeasReply backs
// IdeasSection's "What can I make?" flow (byok.js drives both). buildFixRequest
// is generic (just formats an error list as a retry message), so both flows
// share it rather than each growing its own copy. Pure, no storage imports,
// no DOM.

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

// Same on-hand-name resolution rule as ideaOps.prepSeedForIdea (kept
// duplicated rather than imported — this module stays storage/schema-free
// aside from schema.js itself, and ideaOps.js is UI-state-shaped while this
// is reply-parsing-shaped): exact match first, then a contains-match
// fallback (either direction) so "chickpeas" matches "Chickpeas (can)".
function matchesOnHand(name, pantry) {
  const needle = (name || '').trim().toLowerCase()
  if (!needle) return false
  return pantry.some((p) => {
    if (!p.onHand) return false
    const pname = p.name.trim().toLowerCase()
    return pname === needle || pname.includes(needle) || needle.includes(pname)
  })
}

/**
 * Validates a "What can I make?" ideas reply (Phase P2). Structurally
 * malformed entries are hard errors; a structurally valid idea whose `uses`
 * has NO on-hand pantry match is silently dropped (not an error) — the
 * point of `uses` is to prove the idea is groundable in what's actually on
 * hand, so a fully ungroundable idea just isn't worth showing.
 * @returns {{ok:true, ideas} | {ok:false, errors, rawText}}
 */
export function validateIdeasReply(rawText, { pantry }) {
  let parsed
  try {
    parsed = JSON.parse(extractJson(rawText))
  } catch (e) {
    return { ok: false, errors: [`(json): could not parse — ${e.message}`], rawText }
  }
  if (!isPlainObject(parsed)) {
    return { ok: false, errors: [`(root): expected object, got ${describe(parsed)}`], rawText }
  }
  if (!Array.isArray(parsed.ideas)) {
    return { ok: false, errors: [`ideas: expected array, got ${describe(parsed.ideas)}`], rawText }
  }
  if (parsed.ideas.length < 4 || parsed.ideas.length > 20) {
    return { ok: false, errors: [`ideas: expected 4-20 entries (asked for 12), got ${parsed.ideas.length}`], rawText }
  }

  const errors = []
  const ideas = []
  parsed.ideas.forEach((raw, i) => {
    const path = `ideas[${i}]`
    if (!isPlainObject(raw)) {
      errors.push(`${path}: expected object, got ${describe(raw)}`)
      return
    }
    if (typeof raw.name !== 'string' || !raw.name.trim()) {
      errors.push(`${path}.name: expected non-empty string, got ${describe(raw.name)}`)
      return
    }
    if (typeof raw.line !== 'string' || !raw.line.trim()) {
      errors.push(`${path}.line: expected non-empty string, got ${describe(raw.line)}`)
      return
    }
    if (!Array.isArray(raw.uses) || !raw.uses.every((u) => typeof u === 'string')) {
      errors.push(`${path}.uses: expected string array, got ${describe(raw.uses)}`)
      return
    }
    if (!Array.isArray(raw.buy) || !raw.buy.every((b) => typeof b === 'string')) {
      errors.push(`${path}.buy: expected string array, got ${describe(raw.buy)}`)
      return
    }
    const validUses = raw.uses.filter((u) => matchesOnHand(u, pantry))
    if (validUses.length === 0) return // ungroundable — dropped, not an error
    ideas.push({ name: raw.name.trim(), line: raw.line.trim(), uses: validUses, buy: raw.buy.slice(0, 2) })
  })

  if (errors.length > 0) return { ok: false, errors, rawText }
  if (ideas.length === 0) return { ok: false, errors: ['ideas: none had any on-hand pantry matches'], rawText }
  return { ok: true, ideas }
}

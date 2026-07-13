// Validates and applies the AI's pasted JSON reply (Phase 3 Ideator import).
// Pure — no storage imports, no DOM; caller persists. Mirrors componentOps.js.

import { createComponent, createWeekPlan, validate, STATIONS } from './schema.js'
import { nameMatches, upsertComponent } from './componentOps.js'

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

function isStringArray(v) {
  return Array.isArray(v) && v.every((x) => typeof x === 'string')
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
  const { id, rating, archived, origin, macroSource, ...rest } = raw
  return rest
}

/** All-or-nothing validation of the AI's envelope. @returns {{ok, errors, payload}} */
export function validatePayload(text) {
  const errors = []
  let parsed
  try {
    parsed = JSON.parse(extractJson(text))
  } catch (e) {
    return { ok: false, errors: [`(json): could not parse — ${e.message}`], payload: null }
  }
  if (!isPlainObject(parsed)) {
    return { ok: false, errors: [`(root): expected object, got ${describe(parsed)}`], payload: null }
  }
  if (!Array.isArray(parsed.components)) errors.push(`components: expected array, got ${describe(parsed.components)}`)
  if (!isPlainObject(parsed.weekPlan)) errors.push(`weekPlan: expected object, got ${describe(parsed.weekPlan)}`)
  if (errors.length > 0) return { ok: false, errors, payload: null }

  // ---- components ----
  const names = new Set()
  const componentDrafts = []
  parsed.components.forEach((raw, i) => {
    const path = `components[${i}]`
    if (!isPlainObject(raw)) {
      errors.push(`${path}: expected object, got ${describe(raw)}`)
      return
    }
    if (typeof raw.name !== 'string' || !raw.name.trim()) {
      errors.push(`${path}.name: expected non-empty string, got ${describe(raw.name)}`)
      return
    }
    const key = raw.name.trim().toLowerCase()
    if (names.has(key)) {
      errors.push(`${path}.name: duplicate component name ${describe(raw.name)}`)
      return
    }
    names.add(key)
    const full = createComponent({
      ...stripComponentPayload(raw),
      name: raw.name.trim(),
      origin: 'ai',
      rating: null,
      archived: false,
      macroSource: 'ai_estimate',
    })
    validate(full, 'Component').forEach((err) => errors.push(`${path}.${err}`))
    componentDrafts.push(full)
  })

  // ---- weekPlan shape ----
  const wp = parsed.weekPlan
  if (typeof wp.weekOf !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(wp.weekOf)) {
    errors.push(`weekPlan.weekOf: expected YYYY-MM-DD date string, got ${describe(wp.weekOf)}`)
  }

  if (!Array.isArray(wp.runSheet)) {
    errors.push(`weekPlan.runSheet: expected array, got ${describe(wp.runSheet)}`)
  } else {
    wp.runSheet.forEach((row, i) => {
      const path = `weekPlan.runSheet[${i}]`
      if (!isPlainObject(row)) {
        errors.push(`${path}: expected object, got ${describe(row)}`)
        return
      }
      if (typeof row.t !== 'string') errors.push(`${path}.t: expected string, got ${describe(row.t)}`)
      if (!STATIONS.includes(row.station)) {
        errors.push(`${path}.station: expected ${STATIONS.map((s) => `"${s}"`).join(' | ')}, got ${describe(row.station)}`)
      }
      if (typeof row.action !== 'string') errors.push(`${path}.action: expected string, got ${describe(row.action)}`)
      if (row.componentName !== undefined && typeof row.componentName !== 'string') {
        errors.push(`${path}.componentName: expected string, got ${describe(row.componentName)}`)
      } else if (typeof row.componentName === 'string' && !names.has(row.componentName.trim().toLowerCase())) {
        errors.push(`${path}.componentName: unknown component name ${describe(row.componentName)}`)
      }
    })
  }

  if (!Array.isArray(wp.assembly)) {
    errors.push(`weekPlan.assembly: expected array, got ${describe(wp.assembly)}`)
  } else {
    wp.assembly.forEach((row, i) => {
      const path = `weekPlan.assembly[${i}]`
      if (!isPlainObject(row)) {
        errors.push(`${path}: expected object, got ${describe(row)}`)
        return
      }
      if (typeof row.day !== 'string') errors.push(`${path}.day: expected string, got ${describe(row.day)}`)
      if (typeof row.note !== 'string') errors.push(`${path}.note: expected string, got ${describe(row.note)}`)
      if (!isStringArray(row.componentNames)) {
        errors.push(`${path}.componentNames: expected string array, got ${describe(row.componentNames)}`)
      } else {
        row.componentNames.forEach((name, j) => {
          if (!names.has(name.trim().toLowerCase())) {
            errors.push(`${path}.componentNames[${j}]: unknown component name ${describe(name)}`)
          }
        })
      }
    })
  }

  if (!isPlainObject(wp.refresh)) {
    errors.push(`weekPlan.refresh: expected object, got ${describe(wp.refresh)}`)
  } else {
    if (typeof wp.refresh.day !== 'string') errors.push(`weekPlan.refresh.day: expected string, got ${describe(wp.refresh.day)}`)
    if (!isStringArray(wp.refresh.steps)) {
      errors.push(`weekPlan.refresh.steps: expected string array, got ${describe(wp.refresh.steps)}`)
    }
    if (!isStringArray(wp.refresh.componentNames)) {
      errors.push(`weekPlan.refresh.componentNames: expected string array, got ${describe(wp.refresh.componentNames)}`)
    } else {
      wp.refresh.componentNames.forEach((name, j) => {
        if (!names.has(name.trim().toLowerCase())) {
          errors.push(`weekPlan.refresh.componentNames[${j}]: unknown component name ${describe(name)}`)
        }
      })
    }
  }

  if (!Array.isArray(wp.grocerySuggestions)) {
    errors.push(`weekPlan.grocerySuggestions: expected array, got ${describe(wp.grocerySuggestions)}`)
  } else {
    wp.grocerySuggestions.forEach((row, i) => {
      const path = `weekPlan.grocerySuggestions[${i}]`
      if (!isPlainObject(row)) {
        errors.push(`${path}: expected object, got ${describe(row)}`)
        return
      }
      if (typeof row.name !== 'string') errors.push(`${path}.name: expected string, got ${describe(row.name)}`)
      if (typeof row.qty !== 'string') errors.push(`${path}.qty: expected string, got ${describe(row.qty)}`)
    })
  }

  if (errors.length > 0) return { ok: false, errors, payload: null }

  return {
    ok: true,
    errors: [],
    payload: {
      components: componentDrafts,
      weekPlan: {
        weekOf: wp.weekOf,
        runSheet: wp.runSheet,
        assembly: wp.assembly,
        refresh: wp.refresh,
        grocerySuggestions: wp.grocerySuggestions,
      },
    },
  }
}

/** Fuzzy-matches payload component names against the non-archived Library. */
export function findConflicts(payload, library) {
  const nonArchived = library.filter((c) => !c.archived)
  const conflicts = []
  for (const draft of payload.components) {
    const existing = nonArchived.find((c) => nameMatches(draft.name, c.name))
    if (existing) {
      conflicts.push({ draftId: draft.id, draftName: draft.name, existingId: existing.id, existingName: existing.name })
    }
  }
  return conflicts
}

/**
 * Pure: never mutates inputs. `resolutions` is keyed by draftId ->
 * { type: 'use-existing' | 'replace' | 'new' }. Conflicted drafts default to
 * 'use-existing' when absent from `resolutions`; non-conflicted drafts are
 * always 'new'.
 * @returns {{components, weeks, week, newCount}}
 */
export function applyImport(payload, resolutions, library, weeks) {
  const conflictByDraftId = new Map(findConflicts(payload, library).map((c) => [c.draftId, c]))
  const idByName = new Map()
  let nextComponents = [...library]
  let newCount = 0

  for (const draft of payload.components) {
    const conflict = conflictByDraftId.get(draft.id)
    const resolutionType = conflict ? resolutions[draft.id]?.type || 'use-existing' : 'new'
    const key = draft.name.trim().toLowerCase()

    if (resolutionType === 'use-existing') {
      idByName.set(key, conflict.existingId)
    } else if (resolutionType === 'replace') {
      const existing = nextComponents.find((c) => c.id === conflict.existingId)
      const replaced = { ...draft, id: conflict.existingId, rating: existing ? existing.rating : null }
      nextComponents = upsertComponent(nextComponents, replaced)
      idByName.set(key, conflict.existingId)
    } else {
      nextComponents = upsertComponent(nextComponents, draft)
      idByName.set(key, draft.id)
      newCount++
    }
  }

  const resolveId = (name) => idByName.get(name.trim().toLowerCase())

  const week = createWeekPlan({
    weekOf: payload.weekPlan.weekOf,
    componentIds: [...new Set(idByName.values())],
    runSheet: payload.weekPlan.runSheet.map((row) => ({
      t: row.t,
      station: row.station,
      action: row.action,
      ...(row.componentName ? { componentId: resolveId(row.componentName) } : {}),
      done: false,
    })),
    assembly: payload.weekPlan.assembly.map((row) => ({
      day: row.day,
      componentIds: row.componentNames.map(resolveId),
      note: row.note,
    })),
    refresh: {
      day: payload.weekPlan.refresh.day,
      steps: payload.weekPlan.refresh.steps,
      componentIds: payload.weekPlan.refresh.componentNames.map(resolveId),
    },
    grocerySuggestions: payload.weekPlan.grocerySuggestions.map((row) => ({
      name: row.name,
      qty: row.qty,
      dismissed: false,
    })),
  })

  const weekErrors = validate(week, 'WeekPlan')
  if (weekErrors.length > 0) {
    throw new Error(`applyImport: built an invalid WeekPlan — ${weekErrors.join('; ')}`)
  }

  const existingIdx = weeks.findIndex((w) => w.weekOf === week.weekOf)
  const nextWeeks = existingIdx === -1 ? [...weeks, week] : weeks.map((w, i) => (i === existingIdx ? week : w))

  return { components: nextComponents, weeks: nextWeeks, week, newCount }
}

/** Copy-ready chat message asking the AI to fix and resend the full JSON. */
export function buildFixRequest(errors) {
  const lines = errors.map((e) => `- ${e}`).join('\n')
  return `The JSON you sent had validation errors:\n\n${lines}\n\nFix these and output the corrected FULL JSON only — no prose, no fences.`
}

// Pure functions over logs[]/feedback[] (Phase 5 Tracker): local-safe date
// helpers, log build/upsert/remove, and gauge math. No DOM, no storage
// imports — callers (UI or smoke script) own persistence. Mirrors weekOps.js.

import { createLogEntry } from './schema.js'

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
const ESTIMATE_SOURCES = ['ai_estimate', 'seed_table']
const TYPE_BUCKET = { base: 'carbs', protein: 'protein', veg: 'veg' }

// ---- Date helpers (all pure YYYY-MM-DD string math, no timezone shifts) --

/** @param {Date} [now] @returns {string} local YYYY-MM-DD (never UTC — evening logging must land on today) */
export function todayISO(now = new Date()) {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function addDaysISO(dateISO, days) {
  const [y, m, d] = dateISO.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}

function dayOfWeekISO(dateISO) {
  const [y, m, d] = dateISO.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() // 0=Sun ... 6=Sat
}

function isWeekdayISO(dateISO) {
  const dow = dayOfWeekISO(dateISO)
  return dow >= 1 && dow <= 5
}

/** @param {string} weekOf Sunday ISO date @returns {{day:string, date:string}[]} Mon..Fri */
export function weekDates(weekOf) {
  return WEEKDAY_LABELS.map((day, i) => ({ day, date: addDaysISO(weekOf, i + 1) }))
}

/** Sunday on/before `dateISO` — the WeekPlan.weekOf the current calendar week would use. */
export function currentWeekSundayISO(dateISO) {
  return addDaysISO(dateISO, -dayOfWeekISO(dateISO))
}

/** Latest weekOf <= dateISO, else latest overall, else null. */
export function currentWeek(weeks, dateISO) {
  if (weeks.length === 0) return null
  const eligible = weeks.filter((w) => w.weekOf <= dateISO)
  const pool = eligible.length > 0 ? eligible : weeks
  return [...pool].sort((a, b) => (a.weekOf < b.weekOf ? 1 : a.weekOf > b.weekOf ? -1 : 0))[0]
}

/** The assembly card whose day matches `dateISO` within `week`, or null. */
export function assemblyCardForDate(week, dateISO) {
  if (!week) return null
  const match = weekDates(week.weekOf).find((d) => d.date === dateISO)
  if (!match) return null
  return week.assembly.find((a) => a.day === match.day) || null
}

// ---- Logging --------------------------------------------------------------

/** Prefilled LogEntry from a `{componentIds}` card (or a real assembly card); portions default count 1. */
export function buildLogFromCard(card, dateISO, meal = 'lunch') {
  return createLogEntry({
    date: dateISO,
    meal,
    componentIds: [...card.componentIds],
    portions: card.componentIds.map((componentId) => ({ componentId, naturalUnitLabel: 'serving', count: 1 })),
  })
}

/** Immutable, clamped >= 0. */
export function setPortionCount(log, componentId, count) {
  const clamped = Math.max(0, count)
  return {
    ...log,
    portions: log.portions.map((p) => (p.componentId === componentId ? { ...p, count: clamped } : p)),
  }
}

/** lunch: replace the same-date entry (identity is date+meal); other: append. */
export function upsertLog(logs, entry) {
  if (entry.meal === 'lunch') {
    const idx = logs.findIndex((l) => l.date === entry.date && l.meal === 'lunch')
    if (idx === -1) return [...logs, entry]
    return logs.map((l, i) => (i === idx ? entry : l))
  }
  return [...logs, entry]
}

export function removeLogAt(logs, index) {
  return logs.filter((_, i) => i !== index)
}

/** @returns {{log, index}|null} */
export function logFor(logs, dateISO, meal) {
  const index = logs.findIndex((l) => l.date === dateISO && l.meal === meal)
  return index === -1 ? null : { log: logs[index], index }
}

/** Logs whose date falls on the Mon-Fri of `weekOf`. */
export function logsForWeek(logs, weekOf) {
  const dates = new Set(weekDates(weekOf).map((d) => d.date))
  return logs.filter((l) => dates.has(l.date))
}

// ---- Gauges -----------------------------------------------------------
// Portions whose component has no macrosPerServing count toward `missing`,
// never toward totals — no faked precision.

export function logMacros(log, components) {
  const byId = Object.fromEntries(components.map((c) => [c.id, c]))
  const totals = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, missing: 0 }
  for (const portion of log.portions) {
    const macros = byId[portion.componentId]?.macrosPerServing
    if (!macros) {
      totals.missing += 1
      continue
    }
    totals.kcal += macros.kcal * portion.count
    totals.protein_g += macros.protein_g * portion.count
    totals.carbs_g += macros.carbs_g * portion.count
    totals.fat_g += macros.fat_g * portion.count
  }
  return totals
}

export function proteinByDay(logs, components, weekOf) {
  return weekDates(weekOf).map(({ day, date }) => {
    const entry = logFor(logs, date, 'lunch')
    if (!entry) return { day, date, protein_g: 0, logged: false, hasMissing: false }
    const macros = logMacros(entry.log, components)
    return { day, date, protein_g: macros.protein_g, logged: true, hasMissing: macros.missing > 0 }
  })
}

/** @returns {{protein,carbs,veg,other}|null} fractions of logged lunch portions, by component type bucket. */
export function plateMix(logs, components) {
  const byId = Object.fromEntries(components.map((c) => [c.id, c]))
  const totals = { protein: 0, carbs: 0, veg: 0, other: 0 }
  let total = 0
  for (const log of logs) {
    if (log.meal !== 'lunch') continue
    for (const portion of log.portions) {
      const bucket = TYPE_BUCKET[byId[portion.componentId]?.type] || 'other'
      totals[bucket] += portion.count
      total += portion.count
    }
  }
  if (total === 0) return null
  return {
    protein: totals.protein / total,
    carbs: totals.carbs / total,
    veg: totals.veg / total,
    other: totals.other / total,
  }
}

/** Consecutive logged weekdays walking back from today; weekends don't break it; an unlogged today doesn't either. */
export function lunchStreak(logs, today) {
  const loggedDates = new Set(logs.filter((l) => l.meal === 'lunch').map((l) => l.date))
  let cursor = today
  if (isWeekdayISO(cursor) && !loggedDates.has(cursor)) cursor = addDaysISO(cursor, -1)
  let streak = 0
  while (true) {
    if (!isWeekdayISO(cursor)) {
      cursor = addDaysISO(cursor, -1)
      continue
    }
    if (!loggedDates.has(cursor)) break
    streak += 1
    cursor = addDaysISO(cursor, -1)
  }
  return streak
}

/** @returns {{week:number, allTime:number}} lunch count x boughtLunchCost. */
export function moneySaved(logs, settings, weekOf) {
  const allLunches = logs.filter((l) => l.meal === 'lunch').length
  const weekLunches = logsForWeek(logs, weekOf).filter((l) => l.meal === 'lunch').length
  return { week: weekLunches * settings.boughtLunchCost, allTime: allLunches * settings.boughtLunchCost }
}

/** Fraction of logged portions (with known macros) whose component's macroSource is ai_estimate/seed_table. */
export function estimateFraction(logs, components) {
  const byId = Object.fromEntries(components.map((c) => [c.id, c]))
  let estimateCount = 0
  let total = 0
  for (const log of logs) {
    for (const portion of log.portions) {
      const component = byId[portion.componentId]
      if (!component || !component.macrosPerServing) continue
      total += 1
      if (ESTIMATE_SOURCES.includes(component.macroSource)) estimateCount += 1
    }
  }
  const fraction = total === 0 ? 0 : estimateCount / total
  return { fraction, showHint: fraction > 0.5 }
}

// ---- Feedback ---------------------------------------------------------

/** Upsert by weekOf — no duplicates. */
export function upsertFeedback(feedback, entry) {
  const idx = feedback.findIndex((f) => f.weekOf === entry.weekOf)
  if (idx === -1) return [...feedback, entry]
  return feedback.map((f, i) => (i === idx ? entry : f))
}

export function feedbackFor(feedback, weekOf) {
  return feedback.find((f) => f.weekOf === weekOf) || null
}

/** True on Fri/Sat — when the feedback form defaults to expanded. */
export function isFeedbackWindow(dateISO) {
  const dow = dayOfWeekISO(dateISO)
  return dow === 5 || dow === 6
}

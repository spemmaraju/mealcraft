// Pure functions over logs[]/feedback[] (Phase 5 Tracker; reworked Phase 15
// for multi-meal flexible logging): local-safe date helpers, log
// build/upsert/remove, and gauge math. No DOM, no storage imports — callers
// (UI or smoke script) own persistence. Mirrors weekOps.js.

import { createLogEntry, DAYS, DAY_NAMES } from './schema.js'
import { measureToServings } from './measures.js'

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
const FULL_WEEK_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const ESTIMATE_SOURCES = ['ai_estimate', 'seed_table']
const TYPE_BUCKET = { base: 'carbs', protein: 'protein', veg: 'veg' }
const CATEGORY_BUCKET = { Proteins: 'protein', Legumes: 'protein', Dairy: 'protein', 'Grains & Bases': 'carbs', Vegetables: 'veg', Frozen: 'veg' }

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

/** Whole-day difference `laterISO - earlierISO` (positive when later comes after earlier). */
function daysBetweenISO(earlierISO, laterISO) {
  const [ey, em, ed] = earlierISO.split('-').map(Number)
  const [ly, lm, ld] = laterISO.split('-').map(Number)
  return Math.round((Date.UTC(ly, lm - 1, ld) - Date.UTC(ey, em - 1, ed)) / 86400000)
}

/** Full weekday name ("Tuesday") for any calendar date — powers the "Log it again" hint's day reference. */
export function weekdayName(dateISO) {
  return DAY_NAMES[DAYS[dayOfWeekISO(dateISO)]]
}

/** @param {string} weekOf Sunday ISO date @returns {{day:string, date:string}[]} Mon..Fri */
export function weekDates(weekOf) {
  return WEEKDAY_LABELS.map((day, i) => ({ day, date: addDaysISO(weekOf, i + 1) }))
}

/**
 * Round 3.5 design sync: the Track hero's day-strip is Sun-Sat (7 circles),
 * not the Mon-Fri work week `weekDates` returns for plan/run-sheet logic —
 * added as a separate function rather than changing weekDates itself so
 * every existing Mon-Fri caller (assemblyCardForDate, logsForWeek,
 * proteinByDay, WeekPlan/run-sheet UI) is untouched.
 * @param {string} weekOf Sunday ISO date @returns {{day:string, date:string}[]} Sun..Sat
 */
export function weekDatesFull(weekOf) {
  return FULL_WEEK_LABELS.map((day, i) => ({ day, date: addDaysISO(weekOf, i) }))
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

/** Prefilled LogEntry from a `{componentIds}` card (or a real assembly card); items default count 1. */
export function buildLogFromCard(card, dateISO, meal = 'lunch') {
  return createLogEntry({
    date: dateISO,
    meal,
    items: card.componentIds.map((componentId) => ({ kind: 'component', componentId, count: 1 })),
  })
}

/** Identity is (date, meal) for every meal — replaces the matching entry, or appends. */
export function upsertLog(logs, entry) {
  const idx = logs.findIndex((l) => l.date === entry.date && l.meal === entry.meal)
  if (idx === -1) return [...logs, entry]
  return logs.map((l, i) => (i === idx ? entry : l))
}

/** Appends items to an existing log without disturbing what's already there. */
export function mergeItems(log, newItems) {
  return { ...log, items: [...log.items, ...newItems] }
}

/** Immutable, clamped >= 0. Only meaningful for kind:'component' items (the only kind with a count). */
export function setItemCount(log, index, count) {
  const clamped = Math.max(0, count)
  return { ...log, items: log.items.map((item, i) => (i === index ? { ...item, count: clamped } : item)) }
}

/** Immutable measure edit for kind:'pantry'/'adhoc' items. */
export function setItemMeasure(log, index, measure) {
  return { ...log, items: log.items.map((item, i) => (i === index ? { ...item, measure } : item)) }
}

export function removeItemAt(log, index) {
  return { ...log, items: log.items.filter((_, i) => i !== index) }
}

export function removeLogAt(logs, index) {
  return logs.filter((_, i) => i !== index)
}

/** @returns {{log, index}|null} */
export function logFor(logs, dateISO, meal) {
  const index = logs.findIndex((l) => l.date === dateISO && l.meal === meal)
  return index === -1 ? null : { log: logs[index], index }
}

/**
 * Round 3 "Log it again": the most recent non-empty log for `meal` strictly
 * within the 7 days before `dateISO` (today itself and anything older than a
 * week don't count — a week-old repeat is a coincidence, not a habit).
 * @returns {{log: object, daysAgo: number}|null}
 */
export function lastSameMeal(logs, dateISO, meal) {
  const candidates = logs
    .filter((l) => l.meal === meal && l.items.length > 0)
    .map((l) => ({ log: l, daysAgo: daysBetweenISO(l.date, dateISO) }))
    .filter((c) => c.daysAgo > 0 && c.daysAgo <= 7)
    .sort((a, b) => a.daysAgo - b.daysAgo)
  return candidates.length > 0 ? candidates[0] : null
}

/**
 * Round 3 "Log it again": copies a source log's items for re-logging onto
 * another day. Adhoc items are deep-copied (including their nutrition
 * snapshot) so editing the copy's measure/nutrition later never mutates the
 * original day's entry. Component/pantry items are kept as id references —
 * dropped if that id no longer resolves (the component or pantry item was
 * deleted since), counted in `skipped` so the caller can say so.
 * @returns {{items: object[], skipped: number}}
 */
export function copyItemsForRelog(log, components, pantry) {
  const componentIds = new Set((components || []).map((c) => c.id))
  const pantryIds = new Set((pantry || []).map((p) => p.id))
  let skipped = 0
  const items = []
  for (const item of log.items) {
    if (item.kind === 'component') {
      if (componentIds.has(item.componentId)) items.push({ ...item })
      else skipped += 1
    } else if (item.kind === 'pantry') {
      if (pantryIds.has(item.pantryId)) items.push({ ...item })
      else skipped += 1
    } else {
      items.push({
        ...item,
        nutrition: {
          ...item.nutrition,
          perServing: { ...item.nutrition.perServing },
          naturalUnits: (item.nutrition.naturalUnits || []).map((u) => ({ ...u })),
        },
      })
    }
  }
  return { items, skipped }
}

/** Logs whose date falls on the Mon-Fri of `weekOf`. */
export function logsForWeek(logs, weekOf) {
  const dates = new Set(weekDates(weekOf).map((d) => d.date))
  return logs.filter((l) => dates.has(l.date))
}

// ---- Gauges -----------------------------------------------------------
// Items whose macros can't be resolved (missing component macros, no pantry
// nutrition, unresolvable measure) count toward `missing`, never toward
// totals — no faked precision.

function scaleMacros(perServing, servings) {
  return {
    kcal: perServing.kcal * servings,
    protein_g: perServing.protein_g * servings,
    carbs_g: perServing.carbs_g * servings,
    fat_g: perServing.fat_g * servings,
  }
}

/**
 * One LogEntry item's own macro contribution, independent of its siblings
 * (powers per-item macro/provenance display in the Track view).
 * @returns {{kcal, protein_g, carbs_g, fat_g}|null} null when unresolvable
 * (missing component macros, no pantry nutrition, unresolvable measure).
 */
export function itemMacros(item, components, pantry) {
  if (item.kind === 'component') {
    const macros = components.find((c) => c.id === item.componentId)?.macrosPerServing
    return macros ? scaleMacros(macros, item.count) : null
  }
  if (item.kind === 'pantry') {
    const nutrition = pantry.find((p) => p.id === item.pantryId)?.nutrition
    const servings = nutrition ? measureToServings(item.measure, nutrition) : null
    return servings == null ? null : scaleMacros(nutrition.perServing, servings)
  }
  if (item.kind === 'adhoc') {
    const servings = measureToServings(item.measure, item.nutrition)
    return servings == null ? null : scaleMacros(item.nutrition.perServing, servings)
  }
  return null
}

/** Per-kind macro resolution + sum for one LogEntry's items. */
export function logMacros(log, components, pantry) {
  const totals = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, missing: 0 }
  for (const item of log.items) {
    const macros = itemMacros(item, components, pantry || [])
    if (!macros) {
      totals.missing += 1
      continue
    }
    totals.kcal += macros.kcal
    totals.protein_g += macros.protein_g
    totals.carbs_g += macros.carbs_g
    totals.fat_g += macros.fat_g
  }
  return totals
}

/** Sums logMacros across every meal logged on `date`. */
export function dayMacros(logs, components, pantry, date) {
  const totals = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, missing: 0 }
  for (const log of logs.filter((l) => l.date === date)) {
    const m = logMacros(log, components, pantry)
    totals.kcal += m.kcal
    totals.protein_g += m.protein_g
    totals.carbs_g += m.carbs_g
    totals.fat_g += m.fat_g
    totals.missing += m.missing
  }
  return totals
}

export function proteinByDay(logs, components, pantry, weekOf) {
  return weekDates(weekOf).map(({ day, date }) => {
    const loggedToday = logs.some((l) => l.date === date)
    if (!loggedToday) return { day, date, protein_g: 0, logged: false, hasMissing: false }
    const macros = dayMacros(logs, components, pantry, date)
    return { day, date, protein_g: macros.protein_g, logged: true, hasMissing: macros.missing > 0 }
  })
}

/** @returns {{protein,carbs,veg,other}|null} fractions across ALL meals, by component type / pantry category bucket. */
export function plateMix(logs, components, pantry) {
  const compById = Object.fromEntries(components.map((c) => [c.id, c]))
  const pantryById = Object.fromEntries((pantry || []).map((p) => [p.id, p]))
  const totals = { protein: 0, carbs: 0, veg: 0, other: 0 }
  let total = 0

  for (const log of logs) {
    for (const item of log.items) {
      let bucket = 'other'
      let weight = 1
      if (item.kind === 'component') {
        bucket = TYPE_BUCKET[compById[item.componentId]?.type] || 'other'
        weight = item.count
      } else if (item.kind === 'pantry') {
        const pantryItem = pantryById[item.pantryId]
        bucket = CATEGORY_BUCKET[pantryItem?.category] || 'other'
        const servings = pantryItem?.nutrition ? measureToServings(item.measure, pantryItem.nutrition) : null
        weight = servings != null ? servings : 1
      } else if (item.kind === 'adhoc') {
        const servings = measureToServings(item.measure, item.nutrition)
        weight = servings != null ? servings : 1
      }
      totals[bucket] += weight
      total += weight
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

/**
 * Macro-calorie breakdown for the hero donut (Round 2.6): carbs/protein at
 * 4 kcal/g, fat at 9 kcal/g, each expressed as a fraction of their own sum
 * (not of `macros.kcal`, which can disagree slightly with 4/4/9 rounding).
 * @returns {{carbsPct:number, fatPct:number, proteinPct:number, hasData:boolean}}
 * hasData is false for a 0-macro day — callers render a muted empty ring.
 */
export function macroDonut(macros) {
  const carbsKcal = Math.max(0, macros.carbs_g) * 4
  const fatKcal = Math.max(0, macros.fat_g) * 9
  const proteinKcal = Math.max(0, macros.protein_g) * 4
  const total = carbsKcal + fatKcal + proteinKcal
  if (total <= 0) return { carbsPct: 0, fatPct: 0, proteinPct: 0, hasData: false }
  return {
    carbsPct: carbsKcal / total,
    fatPct: fatKcal / total,
    proteinPct: proteinKcal / total,
    hasData: true,
  }
}

/** Time-appropriate meal for the FAB (Round 2.6 spec point 4): breakfast before 11, lunch 11-3, dinner 3-8, snack otherwise. */
export function mealForTime(date = new Date()) {
  const h = date.getHours()
  if (h < 11) return 'breakfast'
  if (h < 15) return 'lunch'
  if (h < 20) return 'dinner'
  return 'snack'
}

/** Consecutive logged weekdays walking back from today; weekends don't break it; an unlogged today doesn't either. Deliberately still lunch-only — measures the packed-lunch habit. */
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

/**
 * Round 3.5: the hero footer's streak is now ANY logged meal, any day of the
 * week (not lunch-only/weekday-only like `lunchStreak`, kept above for its
 * own money-saved-adjacent semantics) — consecutive calendar days ending at
 * today with >= 1 logged item. An unlogged today doesn't break it (today
 * may not be over yet), same convention as lunchStreak.
 */
export function loggingStreak(logs, today) {
  const loggedDates = new Set(logs.filter((l) => l.items.length > 0).map((l) => l.date))
  let cursor = today
  if (!loggedDates.has(cursor)) cursor = addDaysISO(cursor, -1)
  let streak = 0
  while (loggedDates.has(cursor)) {
    streak += 1
    cursor = addDaysISO(cursor, -1)
  }
  return streak
}

/**
 * Short "when" label for a past log date relative to today — "today",
 * "yesterday", else the 3-letter weekday abbreviation. Powers the add
 * sheet's RECENT rows' when-context subline ("Tue, breakfast" / "yesterday,
 * lunch").
 */
export function relativeDayLabel(dateISO, todayISO) {
  const daysAgo = daysBetweenISO(dateISO, todayISO)
  if (daysAgo === 0) return 'today'
  if (daysAgo === 1) return 'yesterday'
  return DAYS[dayOfWeekISO(dateISO)]
}

/** @returns {{week:number, allTime:number}} lunch count x boughtLunchCost. Deliberately still lunch-only. */
export function moneySaved(logs, settings, weekOf) {
  const allLunches = logs.filter((l) => l.meal === 'lunch').length
  const weekLunches = logsForWeek(logs, weekOf).filter((l) => l.meal === 'lunch').length
  return { week: weekLunches * settings.boughtLunchCost, allTime: allLunches * settings.boughtLunchCost }
}

/** Fraction of logged items (with known macros) whose source is ai_estimate/seed_table, across all meals/kinds. */
export function estimateFraction(logs, components, pantry) {
  const compById = Object.fromEntries(components.map((c) => [c.id, c]))
  const pantryById = Object.fromEntries((pantry || []).map((p) => [p.id, p]))
  let estimateCount = 0
  let total = 0
  for (const log of logs) {
    for (const item of log.items) {
      let source = null
      if (item.kind === 'component') {
        const component = compById[item.componentId]
        if (!component || !component.macrosPerServing) continue
        source = component.macroSource
      } else if (item.kind === 'pantry') {
        const pantryItem = pantryById[item.pantryId]
        if (!pantryItem || !pantryItem.nutrition) continue
        source = pantryItem.nutrition.source
      } else if (item.kind === 'adhoc') {
        source = item.nutrition.source
      }
      total += 1
      if (ESTIMATE_SOURCES.includes(source)) estimateCount += 1
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

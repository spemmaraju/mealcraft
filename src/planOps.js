// Pure functions over planSlots[] (Phase P1 slot-based Plan flow — replaces
// the old WeekPlan run-sheet/assembly-card model). No DOM, no storage
// imports — callers (UI or smoke script) own persistence. Mirrors
// trackOps.js. Slot macros need no function here: trackOps' logMacros({
// items }, components, pantry) already works on anything with an `items`
// array, PlanSlot included.

import { DAYS, createPlanSlot } from './schema.js'

function addDaysISO(dateISO, days) {
  const [y, m, d] = dateISO.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}

function dayOfWeekISO(dateISO) {
  const [y, m, d] = dateISO.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() // 0=Sun ... 6=Sat
}

const MEAL_LABEL = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' }

function dayLabel(dateISO, dayOffset) {
  if (dayOffset === 0) return 'Today'
  if (dayOffset === 1) return 'Tomorrow'
  return DAYS[dayOfWeekISO(dateISO)]
}

/**
 * Lunch+dinner slots for the next `days` calendar days, starting today —
 * "Today · Lunch", "Today · Dinner", "Tomorrow · Lunch", ..., then the
 * 3-letter weekday abbreviation ("Sat · Lunch").
 * @param {string} todayISOValue
 * @param {number} [days]
 * @returns {{date: string, meal: 'lunch'|'dinner', label: string}[]}
 */
export function upcomingSlots(todayISOValue, days = 4) {
  const slots = []
  for (let i = 0; i < days; i++) {
    const date = addDaysISO(todayISOValue, i)
    const day = dayLabel(date, i)
    slots.push({ date, meal: 'lunch', label: `${day} · ${MEAL_LABEL.lunch}` })
    slots.push({ date, meal: 'dinner', label: `${day} · ${MEAL_LABEL.dinner}` })
  }
  return slots
}

/** @returns {object|null} */
export function slotFor(slots, date, meal) {
  return slots.find((s) => s.date === date && s.meal === meal) || null
}

/** Identity is (date, meal) — replaces the matching slot, or appends. */
export function upsertSlot(slots, slot) {
  const idx = slots.findIndex((s) => s.date === slot.date && s.meal === slot.meal)
  if (idx === -1) return [...slots, slot]
  return slots.map((s, i) => (i === idx ? slot : s))
}

/** Merges `items` into the existing (date, meal) slot, or creates one. */
export function addItemsToSlot(slots, date, meal, items) {
  const existing = slotFor(slots, date, meal)
  const next = existing ? { ...existing, items: [...existing.items, ...items] } : createPlanSlot({ date, meal, items })
  return upsertSlot(slots, next)
}

/**
 * Removes item `index` from the (date, meal) slot — drops the slot record
 * entirely once its items are empty, mirroring how an empty LogEntry isn't
 * kept around either. @returns {{slots: object[], removed: object|null}}
 * `removed` lets the caller offer undo.
 */
export function removeItemFromSlot(slots, date, meal, index) {
  const existing = slotFor(slots, date, meal)
  if (!existing) return { slots, removed: null }
  const removed = existing.items[index] ?? null
  const items = existing.items.filter((_, i) => i !== index)
  const nextSlots =
    items.length === 0
      ? slots.filter((s) => !(s.date === date && s.meal === meal))
      : upsertSlot(slots, { ...existing, items })
  return { slots: nextSlots, removed }
}

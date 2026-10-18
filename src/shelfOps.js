// Ready-to-eat shelf (Phase 19): cooked batches with servings left and an
// eat-by date. Pure. The shelf is informational — no reminders (the user
// asked for none); a batch past its eat-by just says so.

import { createShelfEntry } from './schema.js'
import { addDaysISO } from './dates.js'

const DEFAULT_SHELF_LIFE_DAYS = 3
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** A new shelf entry for `servingsLeft` servings of a dish cooked on `cookedOn`. */
export function shelfEntryFor(component, servingsLeft, cookedOn) {
  const days = component.shelfLifeDays > 0 ? component.shelfLifeDays : DEFAULT_SHELF_LIFE_DAYS
  return createShelfEntry({ componentId: component.id, servingsLeft, cookedOn, eatBy: addDaysISO(cookedOn, days) })
}

/**
 * Takes `count` servings off an entry. An entry that reaches 0 leaves the
 * shelf. Returns the prior shelf too, so the caller can offer Undo.
 * @returns {{shelf, emptied: boolean}}
 */
export function takeServings(shelf, entryId, count = 1) {
  const entry = shelf.find((e) => e.id === entryId)
  if (!entry) return { shelf, emptied: false }
  const servingsLeft = Math.max(0, entry.servingsLeft - count)
  if (servingsLeft === 0) return { shelf: shelf.filter((e) => e.id !== entryId), emptied: true }
  return { shelf: shelf.map((e) => (e.id === entryId ? { ...e, servingsLeft } : e)), emptied: false }
}

export function removeEntry(shelf, entryId) {
  return shelf.filter((e) => e.id !== entryId)
}

/** Soonest eat-by first; entries whose dish was deleted are dropped. */
export function visibleShelf(shelf, components) {
  const ids = new Set(components.map((c) => c.id))
  return shelf.filter((e) => ids.has(e.componentId)).sort((a, b) => a.eatBy.localeCompare(b.eatBy))
}

function dayDiff(fromISO, toISO) {
  const [y1, m1, d1] = fromISO.split('-').map(Number)
  const [y2, m2, d2] = toISO.split('-').map(Number)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000)
}

/** "eat by Thu" / "eat by today" / "past eat-by" — plain information, no urgency styling beyond a muted tag. */
export function eatByLabel(eatBy, today) {
  const diff = dayDiff(today, eatBy)
  if (diff < 0) return 'past eat-by'
  if (diff === 0) return 'eat by today'
  if (diff === 1) return 'eat by tomorrow'
  const [y, m, d] = eatBy.split('-').map(Number)
  return `eat by ${WEEKDAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}`
}

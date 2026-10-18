// Phase 21: where meals were eaten + the weekly "This week" numbers on
// Track. Pure. Directional only — counts and averages, no targets, no
// nudges (CLAUDE.md §1).

import { MEALS, WHERES } from './schema.js'
import { logMacros } from './trackOps.js'
import { todayISO } from './dates.js'

/**
 * The guess used when the user hasn't tagged a meal: anything built from
 * their own dishes or pantry is home; a meal of only one-off items (online
 * results, barcode snacks, AI estimates) is left untagged rather than guessed.
 */
export function guessWhere(log) {
  if (!log || log.items.length === 0) return null
  return log.items.some((i) => i.kind === 'component' || i.kind === 'pantry') ? 'home' : null
}

/** The user's tag if set, else the guess. @returns {'home'|'packed'|'out'|null} */
export function whereOf(log) {
  return log?.where ?? guessWhere(log)
}

/** One tap on the tag: home -> packed -> out -> home (untagged starts at home). */
export function nextWhere(current) {
  if (!current) return 'home'
  return WHERES[(WHERES.indexOf(current) + 1) % WHERES.length]
}

/**
 * The "This week" card. `dates` is the visible week (Track's Sun–Sat strip).
 * Meals are logs with at least one item. Cooks are finished cook sessions
 * whose doneOn falls in the week. Protein is averaged per meal type over the
 * meals of that type actually logged (null when none).
 */
export function weekInsights({ logs, cookSessions, components, pantry, dates }) {
  const inWeek = new Set(dates)
  const meals = logs.filter((l) => inWeek.has(l.date) && l.items.length > 0)
  const counts = { home: 0, packed: 0, out: 0, untagged: 0 }
  for (const log of meals) counts[whereOf(log) ?? 'untagged'] += 1

  const cooks = (cookSessions || []).filter((s) => s.status === 'done' && inWeek.has(s.doneOn ?? (s.createdAt ? todayISO(new Date(s.createdAt)) : ''))).length

  const proteinByMeal = Object.fromEntries(
    MEALS.map((meal) => {
      const ofMeal = meals.filter((l) => l.meal === meal)
      if (ofMeal.length === 0) return [meal, null]
      const total = ofMeal.reduce((sum, l) => sum + logMacros(l, components, pantry).protein_g, 0)
      return [meal, Math.round(total / ofMeal.length)]
    }),
  )

  return { meals: meals.length, ...counts, cooks, proteinByMeal }
}

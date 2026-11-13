// Pure helpers for the Today screen: daily targets from body details, fibre
// totals, the one-line hint, and writing a whole parsed day into logs[].
// No DOM, no storage — callers own persistence. Directional numbers only.

import { createLogEntry, MEALS } from './schema.js'
import { measureToServings } from './measures.js'
import { mergeItems, upsertLog, logFor } from './trackOps.js'
import { rowLogItem } from './parseOps.js'

const ACTIVITY_FACTOR = { low: 1.35, moderate: 1.5, high: 1.7 }
const roundTo = (n, step) => Math.round(n / step) * step

/** Mifflin-St Jeor targets. Rough and directional, not medical advice. */
export function computeTargets(profile) {
  const { sex, age, heightCm, weightKg, activity, goal } = profile
  const sexTerm = sex === 'male' ? 5 : sex === 'female' ? -161 : -78
  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + sexTerm
  const tdee = bmr * (ACTIVITY_FACTOR[activity] ?? ACTIVITY_FACTOR.moderate)
  const floor = sex === 'female' ? 1200 : 1500
  const centre = Math.max(floor, tdee - (goal === 'lose' ? 400 : 0))
  const high_g = Math.min(180, roundTo(1.8 * weightKg, 5))
  const low_g = Math.min(roundTo(1.4 * weightKg, 5), high_g)
  return {
    kcalBand: { low: roundTo(centre - 100, 50), high: roundTo(centre + 100, 50) },
    proteinBand: { low_g, high_g },
    fiberTarget_g: 30,
  }
}

/** Grams of fibre logged on `date` (pantry + adhoc items only; dishes carry no fibre data). */
export function dayFiber(logs, components, pantry, date) {
  let total = 0
  for (const log of logs.filter((l) => l.date === date)) {
    for (const item of log.items) {
      const nutrition =
        item.kind === 'pantry' ? (pantry || []).find((p) => p.id === item.pantryId)?.nutrition : item.kind === 'adhoc' ? item.nutrition : null
      const fiber = nutrition?.perServing?.fiber_g
      if (typeof fiber !== 'number') continue
      const servings = measureToServings(item.measure, nutrition)
      if (servings != null) total += fiber * servings
    }
  }
  return total
}

/** One short plain-English line for the Today hero, or null when no kcal band is set. */
export function todayHint({ macros, fiber_g = 0, settings, hour = 12 }) {
  const band = settings?.kcalBand
  if (!band) return null
  if (!(macros.kcal > 0) && !(macros.protein_g > 0)) return 'Nothing logged yet today.'
  const fiberLate = hour >= 15 && settings.fiberTarget_g != null && fiber_g < settings.fiberTarget_g / 2 ? ' Fibre is low — add veg, dal or fruit.' : ''
  if (macros.kcal > band.high) {
    const over = Math.max(50, roundTo(macros.kcal - band.high, 50))
    return `You're about ${over.toLocaleString('en-US')} kcal over today — keep the rest light.${fiberLate}`
  }
  const kcalLeft = roundTo(band.high - macros.kcal, 50)
  const proteinRaw = settings.proteinBand.low_g - macros.protein_g
  const proteinLeft = roundTo(proteinRaw, 5)
  const kcalPart = kcalLeft > 0 ? `About ${kcalLeft.toLocaleString('en-US')} kcal` : "You're right around today's target"
  let text
  if (proteinLeft <= 0) {
    text = `${kcalPart}${kcalLeft > 0 ? ' left' : ''}. Protein target met.`
  } else {
    text = `${kcalPart} and ${proteinLeft} g protein left${proteinRaw >= 25 ? ' — make your next meal protein-heavy' : ''}.`
  }
  return text + fiberLate
}

/** Applies each { meal, items, where? } group cumulatively; returns the new logs array. */
export function addMealGroups(logs, dateISO, groups) {
  let next = logs
  for (const g of groups) {
    if (!g.items || g.items.length === 0) continue
    const existing = logFor(next, dateISO, g.meal)?.log
    const merged = existing ? mergeItems(existing, g.items) : createLogEntry({ date: dateISO, meal: g.meal, items: g.items })
    next = upsertLog(next, g.where ? { ...merged, where: g.where } : merged)
  }
  return next
}

/** Review rows -> addMealGroups groups, in breakfast/lunch/dinner/snack order. */
export function groupRowsByMeal(rows, defaultMeal) {
  const byMeal = new Map()
  for (const row of rows) {
    const meal = MEALS.includes(row.meal) ? row.meal : defaultMeal
    const g = byMeal.get(meal) || { meal, items: [] }
    g.items.push(rowLogItem(row))
    if (row.ateOut === true) g.where = 'out'
    byMeal.set(meal, g)
  }
  return MEALS.filter((m) => byMeal.has(m)).map((m) => byMeal.get(m))
}

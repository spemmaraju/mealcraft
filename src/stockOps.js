// Pantry stock (Phase 20). Pure. The STATED amount lives in the existing
// free-text PantryItem.roughQty ("10 carrots", "5 kg", "half bag") — read
// as qty + unit only when arithmetic is needed, written back as text. When
// nothing was stated, the soft PantryItem.level (plenty | some | low) is the
// signal; "out" is onHand:false. CLAUDE.md §1: quantities only when the user
// states them, never ask the user to count.

import { createGroceryItem } from './schema.js'
import { formatQtyForUnit, measureToServings, parseMeasure, stripLeadingQty } from './measures.js'
import { addItem, findByExactName, guessCategory } from './pantryOps.js'
import { findSeedForName, enrichWithVolumeAnchor } from './nutritionOps.js'

const EPSILON = 1e-6
const STEP_DOWN = { plenty: 'some', some: 'low', low: 'low' }

/** Grocery `forDish` values that mean "restock", rendered as-is (no "for …"). */
export const STOCK_REASONS = ['running low', 'ran out']

/** "10 carrots" -> {qty: 10, tail: 'carrots', unitKey: 'carrot'}; null when there's no leading number. */
export function parseAmount(text) {
  if (typeof text !== 'string' || !text.trim()) return null
  const { qty, unitTokens } = parseMeasure(text)
  if (qty == null) return null
  return { qty, tail: stripLeadingQty(text), unitKey: unitTokens.join(' ') }
}

function formatAmount(qty, amount) {
  const n = formatQtyForUnit(qty, amount.unitKey)
  return amount.tail ? `${n} ${amount.tail}` : n
}

/** The amount to store after buying `stated` on top of `current` (same unit adds up, in the newest wording; otherwise the new statement wins). */
export function addStated(current, stated) {
  const now = parseAmount(current)
  const add = parseAmount(stated)
  if (now && add && now.unitKey === add.unitKey) return formatAmount(now.qty + add.qty, add)
  return stated.trim()
}

/**
 * What cooking with `usedMeasure` of `item` leaves, as a patch suggestion:
 *   'subtract'     same unit: "10 carrots" - "3 carrots" -> "7 carrots"
 *   'proportional' both convert via the item's nutrition: "5 kg" - "1 cup" (rice)
 *   'level'        nothing to do arithmetic on: plenty -> some -> low
 *   'unknown'      no stated amount, no level — left as is (the chips can say)
 * Reaching zero means out: onHand false, amount cleared.
 * @returns {{patch: {roughQty, level, onHand}, how: string}}
 */
export function consume(item, usedMeasure) {
  const amount = parseAmount(item.roughQty)
  const used = parseAmount(usedMeasure)
  let left = null
  let how = null
  if (amount && used && amount.unitKey === used.unitKey) {
    left = amount.qty - used.qty
    how = 'subtract'
  } else if (amount && item.nutrition) {
    const have = measureToServings(item.roughQty, item.nutrition)
    const take = measureToServings(usedMeasure, item.nutrition)
    if (have > 0 && take != null) {
      left = amount.qty * (1 - take / have)
      how = 'proportional'
    }
  }
  if (left != null) {
    if (left <= EPSILON) return { patch: { roughQty: null, level: null, onHand: false }, how }
    return { patch: { roughQty: formatAmount(left, amount), level: null, onHand: true }, how }
  }
  if (item.level) return { patch: { roughQty: item.roughQty, level: STEP_DOWN[item.level], onHand: true }, how: 'level' }
  return { patch: { roughQty: item.roughQty, level: item.level, onHand: item.onHand }, how: 'unknown' }
}

/** The patch for a Plenty / Some / Low / Out chip. Out clears the amount. */
export function patchForChoice(item, choice) {
  if (choice === 'out') return { roughQty: null, level: null, onHand: false }
  return { roughQty: item.roughQty, level: choice, onHand: true }
}

/** Which chip a patch corresponds to (for highlighting), or null. */
export function choiceForPatch(patch) {
  if (!patch.onHand) return 'out'
  return patch.level || null
}

/** Short stock text for rows: the stated amount, else the level, else on hand / out. */
export function stockLabel(item) {
  if (!item.onHand) return 'out'
  if (item.roughQty) return item.roughQty
  if (item.level) return item.level
  return 'on hand'
}

/**
 * Applies reviewed haul rows ({name, measure|null, pantryId|null, category})
 * to the pantry. Matched items restock (stated amount adds/replaces, else
 * level plenty); unmatched become new on-hand items in the chosen category,
 * with seed-table nutrition when the name matches one (same as a hand add) —
 * never an AI guess.
 * @returns {{pantry, restockedNames: string[], created: object[]}}
 */
export function applyHaul(pantry, categories, rows) {
  let next = pantry
  const restockedNames = []
  const created = []
  for (const row of rows) {
    const existing = row.pantryId ? next.find((p) => p.id === row.pantryId) : findByExactName(next, row.name)
    const stated = row.measure && parseAmount(row.measure) ? row.measure : null
    if (existing) {
      const patch = stated ? { roughQty: addStated(existing.roughQty, stated), level: null, onHand: true } : { level: 'plenty', onHand: true }
      next = next.map((p) => (p.id === existing.id ? { ...p, ...patch } : p))
      restockedNames.push(existing.name)
    } else {
      const seeded = findSeedForName(row.name)
      const category = row.category && categories.includes(row.category) ? row.category : guessCategory(row.name, categories) || categories[0] || ''
      const { pantry: withItem, item } = addItem(next, {
        name: row.name,
        category,
        onHand: true,
        roughQty: stated,
        level: stated ? null : 'plenty',
        nutrition: seeded ? enrichWithVolumeAnchor(row.name, seeded) : null,
      })
      next = withItem
      created.push(item)
      restockedNames.push(item.name)
    }
  }
  return { pantry: next, restockedNames, created }
}

/** Grocery list after a restock: drops restock-reason items for anything just bought. */
export function removeRestocked(grocery, names) {
  const bought = new Set(names.map((n) => n.trim().toLowerCase()))
  return grocery.filter((g) => !bought.has(g.name.trim().toLowerCase()))
}

/** New advisory grocery items for pantry items that just went low or out (skips names already listed). */
export function lowStockAdditions(grocery, changedItems) {
  const listed = new Set(grocery.map((g) => g.name.trim().toLowerCase()))
  const out = []
  for (const item of changedItems) {
    const reason = !item.onHand ? 'ran out' : item.level === 'low' ? 'running low' : null
    const key = item.name.trim().toLowerCase()
    if (!reason || listed.has(key)) continue
    listed.add(key)
    out.push(createGroceryItem({ name: item.name, forDish: reason }))
  }
  return out
}

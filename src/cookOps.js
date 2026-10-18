// Cook sessions (Phase 19): the pure half of "🍳 Cook" — ingredient rows,
// live macros, saving a draft, and finishing a cook (dish + optional portion
// logged now + the rest on the shelf). No storage, no DOM: PlanScreen owns
// persistence, the smoke suite drives these directly.
//
// A row is { key, pantryId|null, name, measure, nutrition|null, checked }:
// pantry rows resolve against that exact pantry item; rows without a
// pantryId carry their own nutrition snapshot (an AI estimate from the
// parser), which also rides along into the saved dish's ingredients so the
// dish keeps counting it after the session (nutritionOps.resolveIngredient).

import { createComponent, createCookSession, createGroceryItem, createLogEntry } from './schema.js'
import { itemMacros, logFor, mergeItems, upsertLog } from './trackOps.js'
import { buildDraftRows, rowLogItem } from './parseOps.js'
import { shelfEntryFor } from './shelfOps.js'
import { consume } from './stockOps.js'

let rowSeq = 0
function rowKey() {
  rowSeq += 1
  return `cookrow_${Date.now().toString(36)}_${rowSeq}`
}

/** A pantry item added by search/tap. Measure starts empty-or-serving like Prep did. */
export function rowForPantryItem(item, measure) {
  return { key: rowKey(), pantryId: item.id, name: item.name, measure, nutrition: null, checked: true }
}

/** Parser rows (parseOps.buildDraftRows, possibly edited in the review card) -> cook rows. */
export function rowsFromReview(reviewRows) {
  return reviewRows.map((row) => {
    const item = rowLogItem(row)
    if (item.kind === 'pantry') {
      return { key: rowKey(), pantryId: item.pantryId, name: row.pantryName, measure: item.measure, nutrition: null, checked: true }
    }
    return { key: rowKey(), pantryId: null, name: row.name, measure: item.measure, nutrition: item.nutrition, checked: true }
  })
}

/** Convenience for callers holding raw validated parse items. */
export function rowsFromParsedItems(items, pantry) {
  return rowsFromReview(buildDraftRows(items, pantry))
}

/** Macros for one row, or null when it can't resolve (no nutrition / unconvertible measure). */
export function rowMacros(row, components, pantry) {
  if (row.pantryId) return itemMacros({ kind: 'pantry', pantryId: row.pantryId, measure: row.measure }, components, pantry)
  if (row.nutrition) return itemMacros({ kind: 'adhoc', name: row.name, measure: row.measure, nutrition: row.nutrition }, components, pantry)
  return null
}

function round1(n) {
  return Math.round(n * 10) / 10
}

/**
 * Batch totals over CHECKED rows, partial by design: rows that don't
 * resolve are counted in `total` but not `counted` (CLAUDE.md §1 —
 * directional, never precision theater).
 * @returns {{perServing: {kcal, protein_g, carbs_g, fat_g} | null, counted: number, total: number}}
 */
export function cookMacros(rows, servings, components, pantry) {
  const checked = rows.filter((r) => r.checked)
  const totals = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  let counted = 0
  for (const row of checked) {
    const m = rowMacros(row, components, pantry)
    if (!m) continue
    counted += 1
    totals.kcal += m.kcal
    totals.protein_g += m.protein_g
    totals.carbs_g += m.carbs_g
    totals.fat_g += m.fat_g
  }
  const n = servings > 0 ? servings : 1
  const perServing =
    counted > 0
      ? { kcal: Math.round(totals.kcal / n), protein_g: round1(totals.protein_g / n), carbs_g: round1(totals.carbs_g / n), fat_g: round1(totals.fat_g / n) }
      : null
  return { perServing, counted, total: checked.length }
}

/** Saved dish ingredients: pantry rows by name; snapshot rows keep their nutrition. */
export function rowsToIngredients(rows) {
  return rows
    .filter((r) => r.checked && r.name.trim())
    .map((r) => (r.pantryId || !r.nutrition ? { name: r.name, measure: r.measure } : { name: r.name, measure: r.measure, nutrition: r.nutrition }))
}

/** Rows as stored on a CookSession (the schema has no `key`). */
function storedRows(rows) {
  return rows.map(({ pantryId, name, measure, nutrition, checked }) => ({ pantryId: pantryId ?? null, name, measure, nutrition: nutrition ?? null, checked }))
}

/** Rows read back from a stored CookSession, with fresh UI keys. */
export function rowsFromSession(session) {
  return session.rows.map((r) => ({ ...r, key: rowKey() }))
}

/** Upserts a draft: same id when resuming, new otherwise. */
export function saveDraft(cookSessions, { sessionId, name, text, rows, servings, now }) {
  const existing = sessionId ? cookSessions.find((s) => s.id === sessionId) : null
  const draft = createCookSession({
    ...(existing ? { id: existing.id, createdAt: existing.createdAt } : { createdAt: now }),
    status: 'draft',
    name,
    text: text || '',
    rows: storedRows(rows),
    servingsMade: servings,
  })
  return existing ? cookSessions.map((s) => (s.id === draft.id ? draft : s)) : [...cookSessions, draft]
}

function addItemsToLogs(logs, date, meal, items) {
  const hit = logFor(logs, date, meal)
  const log = hit ? mergeItems(hit.log, items) : createLogEntry({ date, meal, items })
  return upsertLog(logs, log)
}

/**
 * Finishing a cook. Creates the dish, logs `eatNow.count` servings to
 * (today, eatNow.meal) if asked, puts whatever's left on the shelf, and
 * marks the session done (keeping it — Phase 21 counts cook sessions).
 * @returns {{component, components, logs, shelf, cookSessions, shelfEntry: object|null}}
 */
export function finishCook(state, { sessionId, name, text, rows, servingsMade, keepsDays, eatNow, today, now, pantry }) {
  const servings = Math.max(1, Math.round(servingsMade))
  const { perServing } = cookMacros(rows, servings, state.components, pantry)
  const component = createComponent({
    name: name.trim() || 'Home-cooked dish',
    type: 'dish',
    ingredients: rowsToIngredients(rows),
    steps: [],
    servings,
    ...(keepsDays > 0 ? { shelfLifeDays: Math.round(keepsDays) } : {}),
    macrosPerServing: perServing,
    macroSource: 'derived',
  })
  const components = [...state.components, component]

  const eaten = eatNow ? Math.min(servings, Math.max(0, eatNow.count)) : 0
  const logs = eaten > 0 ? addItemsToLogs(state.logs, today, eatNow.meal, [{ kind: 'component', componentId: component.id, count: eaten }]) : state.logs

  const left = servings - eaten
  const shelfEntry = left > 0 ? shelfEntryFor(component, left, today) : null
  const shelf = shelfEntry ? [...state.shelf, shelfEntry] : state.shelf

  const withDraft = saveDraft(state.cookSessions, { sessionId, name: component.name, text, rows, servings, now })
  const draftId = sessionId || withDraft[withDraft.length - 1].id
  const cookSessions = withDraft.map((s) => (s.id === draftId ? { ...s, status: 'done', componentId: component.id } : s))

  return { component, components, logs, shelf, cookSessions, shelfEntry }
}

/** Off-hand pantry rows — for the advisory grocery list, same as Prep did. */
export function offHandRows(rows, pantry) {
  return rows.filter((r) => r.checked && r.pantryId && pantry.find((p) => p.id === r.pantryId)?.onHand === false)
}

/**
 * New advisory grocery items for `names` (off-hand ingredients + an idea's
 * `buy` list), skipping names already on the list (case/whitespace
 * insensitive) and duplicates within `names`. Moved here from P1's
 * PlanScreen.handlePrepConfirm unchanged.
 */
export function groceryAdditions(grocery, names, forDish) {
  const existing = new Set(grocery.map((g) => g.name.trim().toLowerCase()))
  const seen = new Set()
  const out = []
  for (const candidate of names) {
    const key = candidate.trim().toLowerCase()
    if (!key || existing.has(key) || seen.has(key)) continue
    seen.add(key)
    out.push(createGroceryItem({ name: candidate, forDish }))
  }
  return out
}

/**
 * Phase 20: what each used pantry item should look like after this cook
 * (stockOps.consume, applied in row order so an item used twice is
 * consumed twice). Only checked pantry rows with an amount count.
 * @returns {{pantryId, name, patch, how}[]}
 */
export function stockSuggestions(rows, pantry) {
  const current = new Map(pantry.map((p) => [p.id, p]))
  const order = []
  const byId = new Map()
  for (const row of rows) {
    if (!row.checked || !row.pantryId || !row.measure.trim()) continue
    const item = current.get(row.pantryId)
    if (!item) continue
    const { patch, how } = consume(item, row.measure)
    current.set(item.id, { ...item, ...patch })
    if (!byId.has(item.id)) order.push(item.id)
    byId.set(item.id, { pantryId: item.id, name: item.name, patch, how })
  }
  return order.map((id) => byId.get(id))
}

/** Pantry with the chosen stock patches applied, plus the items that changed. */
export function applyStockPatches(pantry, patches) {
  const changed = []
  const next = pantry.map((p) => {
    const patch = patches[p.id]
    if (!patch) return p
    const updated = { ...p, ...patch }
    changed.push(updated)
    return updated
  })
  return { pantry: next, changed }
}

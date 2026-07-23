// Pure functions over plain pantry/category state. No DOM, no storage
// imports — callers (UI or smoke script) own persistence.

import { createPantryItem } from './schema.js'

export function addItem(pantry, overrides) {
  const item = createPantryItem(overrides)
  return { pantry: [...pantry, item], item }
}

export function updateItem(pantry, id, patch) {
  return pantry.map((item) => (item.id === id ? { ...item, ...patch } : item))
}

export function deleteItem(pantry, id) {
  return pantry.filter((item) => item.id !== id)
}

export function addCategory(categories, name) {
  const trimmed = (name || '').trim()
  if (!trimmed) return { error: 'Category name cannot be empty.' }
  if (categories.includes(trimmed)) return { error: `Category "${trimmed}" already exists.` }
  return { categories: [...categories, trimmed] }
}

export function renameCategory(categories, pantry, oldName, newName) {
  const trimmed = (newName || '').trim()
  if (!trimmed) return { error: 'Category name cannot be empty.' }
  if (trimmed !== oldName && categories.includes(trimmed)) {
    return { error: `Category "${trimmed}" already exists.` }
  }
  return {
    categories: categories.map((c) => (c === oldName ? trimmed : c)),
    pantry: pantry.map((item) => (item.category === oldName ? { ...item, category: trimmed } : item)),
  }
}

export function moveCategory(categories, name, direction) {
  const index = categories.indexOf(name)
  if (index === -1) return categories
  const target = direction === 'up' ? index - 1 : index + 1
  if (target < 0 || target >= categories.length) return categories
  const next = [...categories]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

export function deleteCategory(categories, pantry, name) {
  const inUse = pantry.some((item) => item.category === name)
  if (inUse) return { error: `Category "${name}" still has items in it.` }
  return { categories: categories.filter((c) => c !== name) }
}

// Keyword -> category-name-pattern rules for guessing a save-to-pantry
// category from a food's name (Round 1 fix: FoodSearchSheet previously
// defaulted to categories[0], which happens to be 'Spices' in the seed
// list — silently wrong for almost everything saved). Matched against the
// USER'S ACTUAL category list at runtime (case-insensitive), since
// categories are user-editable and may not exist/may be renamed. Returns
// '' (no guess) rather than ever picking a category the name doesn't
// plausibly belong to — the caller must show an explicit "pick one" state.
const CATEGORY_GUESS_RULES = [
  { pattern: /dairy/i, keywords: ['milk', 'yogurt', 'yoghurt', 'paneer', 'cheese', 'curd', 'cream'] },
  { pattern: /condiment|sauce/i, keywords: ['syrup', 'sauce', 'ketchup', 'chutney', 'salsa', 'jam'] },
  { pattern: /nut|seed|finisher/i, keywords: ['nut', 'butter', 'seed', 'tahini', 'almond', 'cashew', 'peanut', 'walnut'] },
  { pattern: /grain|base/i, keywords: ['oats', 'oat', 'rice', 'quinoa', 'bread', 'pasta', 'noodle'] },
  // Round 2 addition: same bug pattern Round 1 fixed (an unmatched name
  // silently landing on categories[0]) recurred for produce, since no rule
  // covered it — the flagship "broccoli" example (CLAUDE.md Round 2 spec)
  // would otherwise land in "Spices" via the categories[0] fallback.
  {
    pattern: /vegetable/i,
    keywords: [
      'potato', 'carrot', 'cauliflower', 'gobi', 'broccoli', 'cabbage', 'pepper', 'capsicum', 'beans', 'okra',
      'bhindi', 'cucumber', 'eggplant', 'brinjal', 'baingan', 'mushroom', 'spinach', 'gourd', 'lauki', 'dudhi',
      'tomato', 'onion', 'garlic', 'ginger', 'chili', 'chilli', 'cilantro', 'coriander', 'zucchini', 'beet',
      'radish', 'peas', 'corn', 'pumpkin', 'squash', 'kale', 'lettuce',
    ],
  },
  {
    pattern: /fruit/i,
    keywords: [
      'banana', 'apple', 'mango', 'grape', 'orange', 'lemon', 'lime', 'avocado', 'berry', 'berries', 'melon',
      'papaya', 'guava', 'pineapple', 'pear', 'peach', 'plum', 'kiwi', 'pomegranate',
    ],
  },
]

/** @returns {string} a matching category name from `categories`, or '' if nothing plausible matched */
export function guessCategory(name, categories) {
  const needle = (name || '').toLowerCase()
  if (!needle) return ''
  for (const rule of CATEGORY_GUESS_RULES) {
    if (!rule.keywords.some((kw) => needle.includes(kw))) continue
    const match = (categories || []).find((c) => rule.pattern.test(c))
    if (match) return match
  }
  return ''
}

// ---- Duplicate guard for online/barcode saves (Round 2) -------------------
// nameMatches (componentOps.js) is deliberately fuzzy (bidirectional token
// subset) for ingredient resolution; the duplicate guard needs a stricter
// identity check so "Rice" doesn't collapse into an existing "Brown rice".

/** Exact (case-insensitive, trimmed) name match. @returns {object|null} */
export function findByExactName(pantry, name) {
  const needle = (name || '').trim().toLowerCase()
  if (!needle) return null
  return (pantry || []).find((p) => p.name.trim().toLowerCase() === needle) || null
}

/** Pantry item already carrying this barcode, if any — a stronger identity signal than name for the barcode-scan duplicate guard. @returns {object|null} */
export function findByBarcode(pantry, code) {
  if (!code) return null
  return (pantry || []).find((p) => p.nutrition && p.nutrition.barcode === code) || null
}

/** Attaches `nutrition` to pantry item `id` only if it currently has none — never overwrites existing nutrition (CLAUDE.md §3 invariant). */
export function attachNutritionIfMissing(pantry, id, nutrition) {
  return pantry.map((item) => (item.id === id && !item.nutrition ? { ...item, nutrition } : item))
}

/**
 * Decides what SHOULD happen to the pantry for an online/barcode/seed find
 * — WITHOUT performing any write. Round 2 hot-fix #1: picking a result used
 * to write to the pantry immediately (at pick-time), so backing out of the
 * amount step without pressing Add still permanently created the
 * PantryItem. Callers must hold onto this plan and execute it only when the
 * log is actually committed (see AddLogItemSheet's handleAmountConfirm).
 * @returns {{ planKind: 'existing', pantryId: string, nutrition: object }
 *         | { planKind: 'attach', pantryId: string, nutrition: object }
 *         | { planKind: 'create', name: string, category: string, nutrition: object }}
 */
export function planPantrySave(pantry, categories, name, nutrition, code) {
  const existing = (code && findByBarcode(pantry, code)) || findByExactName(pantry, name)
  if (existing) {
    if (existing.nutrition) return { planKind: 'existing', pantryId: existing.id, nutrition: existing.nutrition }
    return { planKind: 'attach', pantryId: existing.id, nutrition }
  }
  const category = guessCategory(name, categories) || categories[0] || ''
  return { planKind: 'create', name, category, nutrition }
}

export function filterItems(pantry, { search = '', role = null, onHandOnly = false } = {}) {
  const needle = search.trim().toLowerCase()
  return pantry.filter((item) => {
    if (needle && !item.name.toLowerCase().includes(needle)) return false
    if (role && item.role !== role) return false
    if (onHandOnly && !item.onHand) return false
    return true
  })
}

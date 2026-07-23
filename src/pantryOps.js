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

export function filterItems(pantry, { search = '', role = null, onHandOnly = false } = {}) {
  const needle = search.trim().toLowerCase()
  return pantry.filter((item) => {
    if (needle && !item.name.toLowerCase().includes(needle)) return false
    if (role && item.role !== role) return false
    if (onHandOnly && !item.onHand) return false
    return true
  })
}

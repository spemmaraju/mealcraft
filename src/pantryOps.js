// Pure functions over plain pantry/category state. No DOM, no storage
// imports — callers (UI or smoke script) own persistence.

import { createPantryItem } from './schema.js'

export function addItem(pantry, overrides) {
  return [...pantry, createPantryItem(overrides)]
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

export function filterItems(pantry, { search = '', role = null, onHandOnly = false } = {}) {
  const needle = search.trim().toLowerCase()
  return pantry.filter((item) => {
    if (needle && !item.name.toLowerCase().includes(needle)) return false
    if (role && item.role !== role) return false
    if (onHandOnly && !item.onHand) return false
    return true
  })
}

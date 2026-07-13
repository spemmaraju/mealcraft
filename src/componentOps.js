// Pure functions over plain component/pantry state. No DOM, no storage
// imports — callers (UI or smoke script) own persistence. Mirrors pantryOps.js.

export function upsertComponent(components, component) {
  const idx = components.findIndex((c) => c.id === component.id)
  if (idx === -1) return [...components, component]
  const next = [...components]
  next[idx] = component
  return next
}

export function updateComponent(components, id, patch) {
  return components.map((c) => (c.id === id ? { ...c, ...patch } : c))
}

export function deleteComponent(components, id) {
  return components.filter((c) => c.id !== id)
}

// ---- Fuzzy name matcher (dependency-free) ---------------------------------

function singularize(token) {
  if (token.length <= 3) return token
  if (token.endsWith('ies')) return token.slice(0, -3) + 'y'
  if (/(oes|ses|xes|zes|ches|shes)$/.test(token)) return token.slice(0, -2)
  if (token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1)
  return token
}

/** @param {string} name @returns {string[]} lowercase, singularized tokens */
export function normalizeTokens(name) {
  return (name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(singularize)
}

/** Bidirectional token-subset match on Sets; either empty set -> false. */
export function nameMatches(a, b) {
  const setA = new Set(normalizeTokens(a))
  const setB = new Set(normalizeTokens(b))
  if (setA.size === 0 || setB.size === 0) return false
  const aSubsetB = [...setA].every((t) => setB.has(t))
  const bSubsetA = [...setB].every((t) => setA.has(t))
  return aSubsetB || bSubsetA
}

/** @returns {{ makeable: boolean, missing: string[] }} */
export function makeableStatus(component, pantry) {
  const onHandNames = pantry.filter((p) => p.onHand).map((p) => p.name)
  const relevant = (component.ingredients || []).filter((ing) => ing.name && ing.name.trim())
  const missing = relevant
    .filter((ing) => !onHandNames.some((name) => nameMatches(ing.name, name)))
    .map((ing) => ing.name)
  return { makeable: missing.length === 0, missing }
}

/** Derived at render, never stored. @returns {{ [id]: { makeable, missing } }} */
export function makeabilityMap(components, pantry) {
  return Object.fromEntries(components.map((c) => [c.id, makeableStatus(c, pantry)]))
}

/** Unique cuisine tags across components, case-insensitive dedupe, sorted. */
export function allCuisineTags(components) {
  const seen = new Map()
  for (const c of components) {
    for (const tag of c.cuisineTags || []) {
      const key = tag.toLowerCase()
      if (!seen.has(key)) seen.set(key, tag)
    }
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b))
}

/** filters = { search, type, cuisineTag, rating, makeableOnly, includeArchived } */
export function filterComponents(components, filters = {}, makeability = {}) {
  const { search = '', type = null, cuisineTag = null, rating = null, makeableOnly = false, includeArchived = false } = filters
  const needle = search.trim().toLowerCase()
  return components.filter((c) => {
    if (!includeArchived && c.archived) return false
    if (needle) {
      const nameHit = c.name.toLowerCase().includes(needle)
      const ingredientHit = (c.ingredients || []).some((ing) => ing.name.toLowerCase().includes(needle))
      if (!nameHit && !ingredientHit) return false
    }
    if (type && c.type !== type) return false
    if (cuisineTag && !(c.cuisineTags || []).some((t) => t.toLowerCase() === cuisineTag.toLowerCase())) return false
    if (rating && c.rating !== rating) return false
    if (makeableOnly && !(makeability[c.id] && makeability[c.id].makeable)) return false
    return true
  })
}

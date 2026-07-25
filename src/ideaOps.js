// Pure functions over ideas[] (Phase P2 "What can I make?" AI ideation —
// dish IDEAS only, no recipes/steps). No DOM, no storage imports — callers
// (UI or smoke script) own persistence. Mirrors planOps.js.

import { createIdea } from './schema.js'

function normalizeName(name) {
  return (name || '').trim().toLowerCase()
}

/**
 * Keeps every starred idea as-is; replaces all unstarred ones with `fresh`
 * (each stamped via createIdea so it gets a fresh id, starred:false). A
 * fresh idea whose name case-insensitively matches a kept starred idea is
 * dropped — no duplicate cards after a refresh.
 * @param {object[]} ideas current ideas (some may be starred)
 * @param {{name, line, uses, buy}[]} fresh newly generated ideas
 * @returns {object[]} starred ideas first, then the fresh ones, in order.
 */
export function mergeFreshIdeas(ideas, fresh) {
  const starred = ideas.filter((idea) => idea.starred)
  const starredNames = new Set(starred.map((idea) => normalizeName(idea.name)))
  const next = fresh
    .filter((f) => !starredNames.has(normalizeName(f.name)))
    .map((f) => createIdea({ ...f, starred: false }))
  return [...starred, ...next]
}

/** Flips `starred` on the idea with this id; no-op if it's gone. */
export function toggleStar(ideas, id) {
  return ideas.map((idea) => (idea.id === id ? { ...idea, starred: !idea.starred } : idea))
}

// Same rule everywhere an AI-supplied ingredient name needs to resolve
// against the pantry: exact match first, then a contains-match fallback
// (either direction) so "chickpeas" matches a pantry item named
// "Chickpeas (can)" and vice versa.
function findPantryMatch(name, pantry) {
  const needle = normalizeName(name)
  if (!needle) return null
  return (
    pantry.find((p) => {
      const pname = normalizeName(p.name)
      return pname === needle || pname.includes(needle) || needle.includes(pname)
    }) || null
  )
}

/**
 * Resolves idea.uses against the pantry so "Prep →" can pre-seed
 * PrepSheet's ingredient rows. Ingredients that don't resolve are just
 * left out of pantryIds (the user can search-add them) — `unmatched`
 * exists for callers that want to know, but P2's own UI ignores it.
 * @returns {{pantryIds: string[], unmatched: string[]}}
 */
export function prepSeedForIdea(idea, pantry) {
  const pantryIds = []
  const unmatched = []
  for (const use of idea.uses) {
    const match = findPantryMatch(use, pantry)
    if (match) pantryIds.push(match.id)
    else unmatched.push(use)
  }
  return { pantryIds, unmatched }
}

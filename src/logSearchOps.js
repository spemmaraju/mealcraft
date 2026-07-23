// Pure functions for AddLogItemSheet's unified search (Round 2 — replaces
// the old 4-tab picker with one grouped, ranked search box). No DOM, no
// storage imports — the sheet owns rendering and any persistence side
// effects. Mirrors trackOps.js/pantryOps.js/componentOps.js.

import { nameMatches } from './componentOps.js'
import { NUTRITION_SEEDS } from './nutritionSeeds.js'

/** Plain case-insensitive substring match — good enough per the Round 2 spec ("plain includes() is fine"). An empty query matches everything, so callers can reuse this for both "is this a match" and "should this group even filter yet". */
export function matchesQuery(name, query) {
  const needle = (query || '').trim().toLowerCase()
  if (!needle) return true
  return (name || '').toLowerCase().includes(needle)
}

/** Stable-sorts `items` so exact-prefix name matches against `query` come first within the group (spec: "rank exact-prefix matches first within each group"). No-op on an empty query. */
export function rankByPrefix(items, query, nameOf) {
  const needle = (query || '').trim().toLowerCase()
  if (!needle) return items
  return items
    .map((item, i) => ({ item, i, prefix: (nameOf(item) || '').toLowerCase().startsWith(needle) ? 0 : 1 }))
    .sort((a, b) => a.prefix - b.prefix || a.i - b.i)
    .map((x) => x.item)
}

function daysBetween(earlierISO, laterISO) {
  const [ey, em, ed] = earlierISO.split('-').map(Number)
  const [ly, lm, ld] = laterISO.split('-').map(Number)
  const e = Date.UTC(ey, em - 1, ed)
  const l = Date.UTC(ly, lm - 1, ld)
  return Math.round((l - e) / 86400000)
}

function recentItemKey(item) {
  if (item.kind === 'component') return `component:${item.componentId}`
  if (item.kind === 'pantry') return `pantry:${item.pantryId}`
  return `adhoc:${item.name.trim().toLowerCase()}`
}

/**
 * Distinct recently-logged items across every meal/day, most-recent-first,
 * each carrying the exact LogEntry item snapshot so one tap re-adds it
 * verbatim — same kind, same last-used measure/count (spec §1 RECENT).
 * Derived purely from existing logs; no schema change. `todayISO` is an
 * explicit param (not read from Date.now() internally) so this stays
 * deterministic and easy to smoke-test.
 * @returns {{key: string, item: object}[]}
 */
export function deriveRecents(logs, todayISO, { days = 14, limit = 8 } = {}) {
  const inWindow = (logs || []).filter((l) => {
    const age = daysBetween(l.date, todayISO)
    return age >= 0 && age <= days
  })
  const sorted = [...inWindow].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))

  const seen = new Map()
  for (const log of sorted) {
    for (const item of log.items) {
      const key = recentItemKey(item)
      if (!seen.has(key)) seen.set(key, item)
    }
  }
  return [...seen.entries()].slice(0, limit).map(([key, item]) => ({ key, item }))
}

/**
 * The last-used measure (pantry/adhoc) or count (component) for a given
 * identity, if it shows up in `recents` — powers the amount step's default
 * ("the item's last-logged unit if it appears in recents, else '1
 * serving'", spec §2). @returns {string|number|null}
 */
export function lastUsedFor(recents, kind, id) {
  const key = kind === 'component' ? `component:${id}` : kind === 'pantry' ? `pantry:${id}` : `adhoc:${String(id).trim().toLowerCase()}`
  const hit = (recents || []).find((r) => r.key === key)
  if (!hit) return null
  return hit.item.kind === 'component' ? hit.item.count : hit.item.measure
}

/**
 * Seed-table entries (src/nutritionSeeds.js + nutritionSeedsVeg.js) not
 * already resolvable to a pantry item by name/alias — the COMMON FOODS
 * group. Fixes the baseline finding that seed data (e.g. broccoli) was only
 * reachable through a 16-tap manual-entry side door.
 * @returns {{name: string, aliases: string[], build: () => object}[]}
 */
export function seedFoodCandidates(pantry) {
  return NUTRITION_SEEDS.filter(
    (s) => !(pantry || []).some((p) => nameMatches(p.name, s.name) || s.aliases.some((a) => nameMatches(p.name, a))),
  )
}

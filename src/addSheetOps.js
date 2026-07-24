// Pure row/group computation for AddLogItemSheet's unified search — split
// out of the component (Round 2.6) purely to stay under CLAUDE.md §4.7's
// ~300-line component budget. No DOM, no storage imports. Mirrors
// logSearchOps.js/trackOps.js/pantryOps.js.

import * as logSearchOps from './logSearchOps.js'
import * as trackOps from './trackOps.js'
import { filterComponents } from './componentOps.js'

function recentDisplay(item, byId, pantryById) {
  if (item.kind === 'component') return { label: byId[item.componentId]?.name || item.componentId, sublabel: `${item.count} serving${item.count === 1 ? '' : 's'}` }
  if (item.kind === 'pantry') return { label: pantryById[item.pantryId]?.name || item.pantryId, sublabel: item.measure }
  return { label: item.name, sublabel: item.measure }
}

/**
 * Computes the 5 ranked/filtered groups (TODAY'S PLAN, RECENT, PANTRY,
 * COMMON FOODS, MY DISHES) plus the lookups AddLogItemSheet's handlers need
 * (recents, byId, pantryById, seedCandidates).
 */
export function buildAddSheetData({ card, components, pantry, logs, today, query, existingComponentIds }) {
  const { matchesQuery, rankByPrefix } = logSearchOps
  const byId = Object.fromEntries(components.map((c) => [c.id, c]))
  const pantryById = Object.fromEntries(pantry.map((p) => [p.id, p]))
  const excludedComponentIds = new Set(existingComponentIds || [])
  const hasQuery = query.trim().length > 0

  // Recents whose referenced component/pantry item was since deleted are
  // dropped rather than shown with a dangling name.
  const recents = logSearchOps
    .deriveRecents(logs, today)
    .filter((r) => (r.item.kind === 'component' ? byId[r.item.componentId] : r.item.kind === 'pantry' ? pantryById[r.item.pantryId] : true))

  const planRows =
    card && card.componentIds.length > 0
      ? rankByPrefix(
          card.componentIds.filter((id) => byId[id] && matchesQuery(byId[id].name, query)),
          query,
          (id) => byId[id]?.name || '',
        ).map((id) => ({ id, label: byId[id]?.name || id }))
      : []

  // Round 2.5 §5: RECENT rows show last measure AND kcal (itemMacros
  // already handles component/pantry/adhoc uniformly, including adhoc's
  // snapshot nutrition) — null when unresolvable (deleted pantry item,
  // unconvertible measure), same "don't fake it" rule as everywhere else.
  const recentRows = rankByPrefix(
    recents.filter((r) => matchesQuery(recentDisplay(r.item, byId, pantryById).label, query)),
    query,
    (r) => recentDisplay(r.item, byId, pantryById).label,
  ).map((r) => {
    const macro = trackOps.itemMacros(r.item, components, pantry)
    return { id: r.key, ...recentDisplay(r.item, byId, pantryById), kcal: macro ? macro.kcal : null }
  })

  const pantryRows = !hasQuery
    ? []
    : rankByPrefix(
        pantry.filter((p) => p.nutrition && matchesQuery(p.name, query)),
        query,
        (p) => p.name,
      ).map((p) => ({ id: p.id, label: p.name }))

  const seedCandidates = logSearchOps.seedFoodCandidates(pantry)
  const seedRows = !hasQuery
    ? []
    : rankByPrefix(
        seedCandidates.filter((s) => matchesQuery(s.name, query) || s.aliases.some((a) => matchesQuery(a, query))),
        query,
        (s) => s.name,
      ).map((s) => ({ id: s.name, label: s.name }))

  const dishRows = !hasQuery
    ? []
    : rankByPrefix(
        filterComponents(components, { search: query }).filter((c) => !excludedComponentIds.has(c.id)),
        query,
        (c) => c.name,
      ).map((c) => ({ id: c.id, label: c.name }))

  const groups = [
    { key: 'plan', title: "TODAY'S PLAN", rows: planRows },
    { key: 'recent', title: 'RECENT', rows: recentRows },
    { key: 'pantry', title: 'PANTRY', rows: pantryRows },
    { key: 'seed', title: 'COMMON FOODS', rows: seedRows },
    { key: 'dish', title: 'MY DISHES', rows: dishRows },
  ]

  return { groups, recents, byId, pantryById, seedCandidates, hasQuery }
}

/**
 * The measure/count to prefill the amount step with: the item's last-used
 * one if it appears in recents, else '1 serving'. A brand-new pantry item
 * (plan.planKind === 'create') can never appear in recents yet (it doesn't
 * have an id), so it always starts at '1 serving'.
 */
export function initialMeasureForPlan(plan, recents) {
  if (plan.planKind === 'create') return '1 serving'
  return logSearchOps.lastUsedFor(recents, 'pantry', plan.pantryId) ?? '1 serving'
}

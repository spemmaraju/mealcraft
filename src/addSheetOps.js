// Pure row/group computation (+ Round 6: pure "stage" builders) for
// AddLogItemSheet's unified search — split out of the component (Round 2.6,
// extended Round 6) purely to stay under CLAUDE.md §4.7's ~300-line
// component budget. No DOM, no storage imports — pantryOps/nutritionOps are
// themselves pure (no persistence), same convention as this file. Mirrors
// logSearchOps.js/trackOps.js/pantryOps.js.

import * as logSearchOps from './logSearchOps.js'
import * as trackOps from './trackOps.js'
import * as pantryOps from './pantryOps.js'
import * as nutritionOps from './nutritionOps.js'
import { filterComponents } from './componentOps.js'
import { defaultMeasureFor } from './measures.js'

function recentDisplay(item, byId, pantryById) {
  if (item.kind === 'component') return { label: byId[item.componentId]?.name || item.componentId, sublabel: `${item.count} serving${item.count === 1 ? '' : 's'}` }
  if (item.kind === 'pantry') return { label: pantryById[item.pantryId]?.name || item.pantryId, sublabel: item.measure }
  return { label: item.name, sublabel: item.measure }
}

/** "on hand · {roughQty or serving info}" for the add sheet's PANTRY group rows; undefined when the item isn't on hand (no on-hand line to show). */
function pantrySubline(p) {
  if (!p.onHand) return undefined
  const detail = p.roughQty || p.nutrition?.servingDesc || null
  return detail ? `on hand · ${detail}` : 'on hand'
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

  // Round 2.5 §5 / Round 3.5 when-context: RECENT rows show last measure,
  // kcal, AND when/which-meal it was logged ("219 cal · 1/2 cup · Tue,
  // breakfast") — itemMacros already handles component/pantry/adhoc
  // uniformly, including adhoc's snapshot nutrition; null kcal when
  // unresolvable (deleted pantry item, unconvertible measure), same "don't
  // fake it" rule as everywhere else.
  const recentRows = rankByPrefix(
    recents.filter((r) => matchesQuery(recentDisplay(r.item, byId, pantryById).label, query)),
    query,
    (r) => recentDisplay(r.item, byId, pantryById).label,
  ).map((r) => {
    const { label, sublabel: measureText } = recentDisplay(r.item, byId, pantryById)
    const macro = trackOps.itemMacros(r.item, components, pantry)
    const kcalText = macro ? `${Math.round(macro.kcal)} cal` : null
    const when = `${trackOps.relativeDayLabel(r.date, today)}, ${r.meal}`
    return { id: r.key, label, kcal: macro ? macro.kcal : null, sublabel: [kcalText, measureText, when].filter(Boolean).join(' · ') }
  })

  // Round 3.5: a pantry group row's sub-line shows on-hand status + how much
  // ("on hand · 1/2 cup", falling back to the item's own serving
  // description when it has no roughQty note) — off-hand items still
  // surface (searchable, just no "on hand" line).
  const pantryRows = !hasQuery
    ? []
    : rankByPrefix(
        pantry.filter((p) => p.nutrition && matchesQuery(p.name, query)),
        query,
        (p) => p.name,
      ).map((p) => ({ id: p.id, label: p.name, sublabel: pantrySubline(p) }))

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

  // Round 4: whether today actually has an assembly card with dishes on it —
  // independent of `query` (planRows is search-filtered, so it can be empty
  // either because there's genuinely no plan for today, or just because
  // nothing matches the current search). Only the former should show the
  // "no plan yet" CTA (AddSheetResults), so it's surfaced separately here.
  const hasPlanCard = !!(card && card.componentIds.length > 0)

  return { groups, recents, byId, pantryById, seedCandidates, hasQuery, hasPlanCard }
}

/**
 * The measure/count to prefill the amount step with: the item's last-used
 * one if it appears in recents, else one serving expressed in a real unit
 * (measures.js defaultMeasureFor — Round 4.5, 'serving' is no longer an
 * offered unit). A brand-new pantry item (plan.planKind === 'create') can
 * never appear in recents yet (it doesn't have an id), so it always starts
 * at the default.
 */
export function initialMeasureForPlan(plan, recents) {
  if (plan.planKind === 'create') return defaultMeasureFor(plan.nutrition)
  return logSearchOps.lastUsedFor(recents, 'pantry', plan.pantryId) ?? defaultMeasureFor(plan.nutrition)
}

/** Human-readable source tag text for one nutritionLookup.searchFoods result row. */
function onlineSourceLabel(food) {
  if (food.source === 'off') return 'Open Food Facts'
  return food.generic ? 'USDA generic' : 'USDA'
}

/**
 * Round 6: the ONLINE group's rows, from nutritionLookup.searchFoods'
 * results — id is the array index (results aren't otherwise identified),
 * label is the food name, sublabel carries brand + source tag + servingDesc
 * (provenance stays visible per CLAUDE.md §5 even in a plain-text sublabel),
 * kcal is the row's per-serving calories for AddSheetResults' existing
 * {id, label, sublabel, kcal} row shape. Pure — no network, no state; the
 * search itself lives in useOnlineFoodSearch.js.
 */
export function buildOnlineRows(results) {
  return (results || []).map((food, i) => ({
    id: i,
    label: food.name,
    sublabel: [food.brand, onlineSourceLabel(food), food.nutrition?.servingDesc].filter(Boolean).join(' · '),
    kcal: food.nutrition?.perServing?.kcal ?? null,
  }))
}

// ---- Amount-step "stage" builders (Round 6, generalized from AddLogItemSheet) --
// Every non-instant pick (seed, online result, barcode scan, photo capture)
// resolves to the SAME shape: { type: 'pantry'|'adhoc', name, nutrition,
// initialMeasure, plan? } — exactly what AddLogItemSheet.setPending needs.
// Pulling the (still write-free — hot-fix #1) plan-building logic out here
// keeps AddLogItemSheet itself to thin one-line wrappers around setPending.

/** Picking a COMMON FOODS (seed table) row — always a fresh 'create' plan; a seed entry can never already be in the pantry (buildAddSheetData's seedCandidates excludes anything nameMatches already covers). */
export function stageForSeed(name, seedCandidates, categories) {
  const entry = seedCandidates.find((s) => s.name === name)
  if (!entry) return null
  const nutrition = entry.build()
  const category = pantryOps.guessCategory(entry.name, categories) || categories[0] || ''
  const plan = { planKind: 'create', name: entry.name, category, nutrition }
  return { type: 'pantry', name: entry.name, nutrition, initialMeasure: defaultMeasureFor(nutrition), plan }
}

/** Picking an ONLINE search result (or a barcode/photo match) that should save-and-log — the dedupe guard (barcode/name match wins; existing nutrition never overwritten) is pantryOps.planPantrySave's job, resolved here but not yet written (hot-fix #1: the write happens in handleAmountConfirm). `code` is barcode-scan only. */
export function stageForPantrySave(name, nutrition, pantry, categories, recents, code) {
  const plan = pantryOps.planPantrySave(pantry, categories, name, nutrition, code)
  return { type: 'pantry', name, nutrition: plan.nutrition, initialMeasure: initialMeasureForPlan(plan, recents), plan }
}

/** "Log without saving" for an online/manual-entry food — an adhoc snapshot, never touches the pantry. enrichWithVolumeAnchor is a no-op unless the food has gram-only serving info and a curated cup-weight match. */
export function stageForAdhoc(food, recents) {
  const nutrition = nutritionOps.enrichWithVolumeAnchor(food.name, food.nutrition)
  return {
    type: 'adhoc',
    name: food.name,
    nutrition,
    initialMeasure: logSearchOps.lastUsedFor(recents, 'adhoc', food.name) ?? defaultMeasureFor(nutrition),
  }
}

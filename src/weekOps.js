// Pure functions over a single WeekPlan (and the weeks[] array it lives in).
// No DOM, no storage imports — callers (UI or smoke script) own persistence.
// Mirrors pantryOps.js / componentOps.js.

import { STATIONS } from './schema.js'

export function replaceWeek(weeks, nextWeek) {
  return weeks.map((w) => (w.weekOf === nextWeek.weekOf ? nextWeek : w))
}

export function toggleRunSheetStep(week, stepIndex) {
  return {
    ...week,
    runSheet: week.runSheet.map((step, i) => (i === stepIndex ? { ...step, done: !step.done } : step)),
  }
}

export function runSheetProgress(week) {
  const total = week.runSheet.length
  const done = week.runSheet.filter((s) => s.done).length
  return { done, total }
}

export function groupRunSheetByStation(runSheet) {
  const groups = new Map(STATIONS.map((s) => [s, []]))
  runSheet.forEach((step, index) => {
    groups.get(step.station).push({ step, index })
  })
  return STATIONS.map((station) => ({ station, steps: groups.get(station) })).filter((g) => g.steps.length > 0)
}

function findAssemblyDay(week, day) {
  return week.assembly.findIndex((a) => a.day === day)
}

export function swapAssemblyDays(week, dayA, dayB) {
  const idxA = findAssemblyDay(week, dayA)
  const idxB = findAssemblyDay(week, dayB)
  if (idxA === -1 || idxB === -1 || idxA === idxB) return week
  const assembly = [...week.assembly]
  const { componentIds: idsA, note: noteA } = assembly[idxA]
  const { componentIds: idsB, note: noteB } = assembly[idxB]
  assembly[idxA] = { ...assembly[idxA], componentIds: idsB, note: noteB }
  assembly[idxB] = { ...assembly[idxB], componentIds: idsA, note: noteA }
  return recomputeComponentIds({ ...week, assembly })
}

export function substituteComponent(week, day, fromId, toId) {
  const idx = findAssemblyDay(week, day)
  if (idx === -1) return week
  const assembly = [...week.assembly]
  assembly[idx] = {
    ...assembly[idx],
    componentIds: assembly[idx].componentIds.map((id) => (id === fromId ? toId : id)),
  }
  return recomputeComponentIds({ ...week, assembly })
}

export function addComponentToDay(week, day, componentId) {
  const idx = findAssemblyDay(week, day)
  if (idx === -1) return week
  const assembly = [...week.assembly]
  if (assembly[idx].componentIds.includes(componentId)) return week
  assembly[idx] = { ...assembly[idx], componentIds: [...assembly[idx].componentIds, componentId] }
  return recomputeComponentIds({ ...week, assembly })
}

export function removeComponentFromDay(week, day, componentId) {
  const idx = findAssemblyDay(week, day)
  if (idx === -1) return week
  const assembly = [...week.assembly]
  assembly[idx] = { ...assembly[idx], componentIds: assembly[idx].componentIds.filter((id) => id !== componentId) }
  return recomputeComponentIds({ ...week, assembly })
}

export function toggleGrocerySuggestion(week, index) {
  return {
    ...week,
    grocerySuggestions: week.grocerySuggestions.map((g, i) => (i === index ? { ...g, dismissed: !g.dismissed } : g)),
  }
}

export function dismissAllGroceries(week) {
  return {
    ...week,
    grocerySuggestions: week.grocerySuggestions.map((g) => ({ ...g, dismissed: true })),
  }
}

export function recomputeComponentIds(week) {
  const ordered = []
  const seen = new Set()
  function add(id) {
    if (id && !seen.has(id)) {
      seen.add(id)
      ordered.push(id)
    }
  }
  week.runSheet.forEach((s) => add(s.componentId))
  week.assembly.forEach((a) => a.componentIds.forEach(add))
  week.refresh.componentIds.forEach(add)
  return { ...week, componentIds: ordered }
}

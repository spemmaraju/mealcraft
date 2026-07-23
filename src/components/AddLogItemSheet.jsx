import { useState } from 'react'
import * as pantryOps from '../pantryOps.js'
import * as logSearchOps from '../logSearchOps.js'
import { filterComponents } from '../componentOps.js'
import { lookupBarcode } from '../nutritionLookup.js'
import AddSheetResults from './AddSheetResults.jsx'
import AddItemAmountStep from './AddItemAmountStep.jsx'
import FoodSearchSheet from './FoodSearchSheet.jsx'
import BarcodeScanner from './BarcodeScanner.jsx'

// Round 2: one always-focused search box across TODAY'S PLAN, RECENT,
// PANTRY, COMMON FOODS (seed table), and MY DISHES, replacing the old
// 4-tab picker. Every pick except the two fast paths (plan, recent) routes
// through the shared amount step (AddItemAmountStep) before anything is
// logged. onPick's contract (a ready-to-merge LogEntry items[] array) is
// unchanged — see MealSection.jsx.
export default function AddLogItemSheet({
  card,
  components,
  pantry,
  categories,
  fdcKey,
  logs,
  today,
  label,
  existingComponentIds,
  onPick,
  onSaveToPantry,
  onAttachNutrition,
  onClose,
}) {
  const [query, setQuery] = useState('')
  const [showOnline, setShowOnline] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState(null)
  // Staged pick awaiting the shared amount step:
  //   { type: 'component', componentId, name, initialCount }
  //   { type: 'adhoc', name, nutrition, initialMeasure }
  //   { type: 'pantry', name, nutrition, initialMeasure, plan }
  // `plan` (pantry picks only) is pantryOps.planPantrySave's pure decision —
  // hot-fix #1: NO pantry write happens here at pick-time. It's only
  // executed in handleAmountConfirm, when the user actually presses Add, so
  // backing out of the amount step (Back/close) never touches storage.
  const [pending, setPending] = useState(null)

  const byId = Object.fromEntries(components.map((c) => [c.id, c]))
  const pantryById = Object.fromEntries(pantry.map((p) => [p.id, p]))
  const excludedComponentIds = new Set(existingComponentIds || [])
  const hasQuery = query.trim().length > 0
  const { matchesQuery, rankByPrefix } = logSearchOps

  // Recents whose referenced component/pantry item was since deleted are
  // dropped rather than shown with a dangling name.
  const recents = logSearchOps
    .deriveRecents(logs, today)
    .filter((r) => (r.item.kind === 'component' ? byId[r.item.componentId] : r.item.kind === 'pantry' ? pantryById[r.item.pantryId] : true))

  function recentDisplay(item) {
    if (item.kind === 'component') return { label: byId[item.componentId]?.name || item.componentId, sublabel: `${item.count} serving${item.count === 1 ? '' : 's'}` }
    if (item.kind === 'pantry') return { label: pantryById[item.pantryId]?.name || item.pantryId, sublabel: item.measure }
    return { label: item.name, sublabel: item.measure }
  }

  const planRows =
    card && card.componentIds.length > 0
      ? rankByPrefix(
          card.componentIds.filter((id) => byId[id] && matchesQuery(byId[id].name, query)),
          query,
          (id) => byId[id]?.name || '',
        ).map((id) => ({ id, label: byId[id]?.name || id }))
      : []

  const recentRows = rankByPrefix(
    recents.filter((r) => matchesQuery(recentDisplay(r.item).label, query)),
    query,
    (r) => recentDisplay(r.item).label,
  ).map((r) => ({ id: r.key, ...recentDisplay(r.item) }))

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

  // The measure/count to prefill the amount step with: the item's
  // last-used one if it appears in recents, else '1 serving'. A brand-new
  // pantry item (plan.planKind === 'create') can never appear in recents
  // yet (it doesn't have an id), so it always starts at '1 serving'.
  function initialMeasureForPlan(plan) {
    if (plan.planKind === 'create') return '1 serving'
    return logSearchOps.lastUsedFor(recents, 'pantry', plan.pantryId) ?? '1 serving'
  }

  function handleGroupPick(groupKey, id) {
    if (groupKey === 'plan') {
      onPick([{ kind: 'component', componentId: id, count: 1 }])
      return
    }
    if (groupKey === 'recent') {
      const hit = recents.find((r) => r.key === id)
      if (hit) onPick([hit.item])
      return
    }
    if (groupKey === 'pantry') {
      const item = pantryById[id]
      if (!item) return
      // Already a real pantry item with nutrition (PANTRY group is
      // pre-filtered to p.nutrition) — no write is ever needed for this
      // pick, committed or not.
      const plan = { planKind: 'existing', pantryId: item.id, nutrition: item.nutrition }
      setPending({ type: 'pantry', name: item.name, nutrition: item.nutrition, initialMeasure: initialMeasureForPlan(plan), plan })
      return
    }
    if (groupKey === 'seed') {
      handleSeedPick(id)
      return
    }
    if (groupKey === 'dish') {
      const c = byId[id]
      if (!c) return
      setPending({ type: 'component', componentId: c.id, name: c.name, initialCount: logSearchOps.lastUsedFor(recents, 'component', c.id) ?? 1 })
    }
  }

  // Hot-fix #1: this used to call onSaveToPantry immediately (writing a new
  // PantryItem before the user ever pressed Add). Now it only stages a
  // 'create' plan — the write happens in handleAmountConfirm.
  function handleSeedPick(name) {
    const entry = seedCandidates.find((s) => s.name === name)
    if (!entry) return
    const nutrition = entry.build()
    const category = pantryOps.guessCategory(entry.name, categories) || categories[0] || ''
    const plan = { planKind: 'create', name: entry.name, category, nutrition }
    setPending({ type: 'pantry', name: entry.name, nutrition, initialMeasure: '1 serving', plan })
  }

  // Hot-fix #1: planPantrySave is a pure decision (no write) — the
  // duplicate guard (barcode match wins over name match; existing
  // nutrition is never overwritten, only attached when absent) is resolved
  // here, but nothing is persisted until Add is pressed.
  function handleOnlineSaveAndStage(food) {
    const plan = pantryOps.planPantrySave(pantry, categories, food.name, food.nutrition)
    setPending({ type: 'pantry', name: food.name, nutrition: plan.nutrition, initialMeasure: initialMeasureForPlan(plan), plan })
  }

  function handleOnlineAdhocStage(food) {
    setPending({
      type: 'adhoc',
      name: food.name,
      nutrition: food.nutrition,
      initialMeasure: logSearchOps.lastUsedFor(recents, 'adhoc', food.name) ?? '1 serving',
    })
  }

  async function handleScanned(code) {
    setScanning(false)
    const result = await lookupBarcode(code, { fdcKey })
    if (!result.ok) {
      setScanError('Not found online — try Search online, or add nutrition manually from the pantry.')
      return
    }
    setScanError(null)
    const name = result.name || 'Scanned item'
    const plan = pantryOps.planPantrySave(pantry, categories, name, result.nutrition, code)
    setPending({ type: 'pantry', name, nutrition: plan.nutrition, initialMeasure: initialMeasureForPlan(plan), plan })
  }

  // The only place any of this round's pantry writes actually happen —
  // hot-fix #1. `plan.planKind`: 'existing' needs no write at all;
  // 'attach' only attaches nutrition (never overwrites); 'create' creates
  // the PantryItem. All deferred until this exact moment.
  async function handleAmountConfirm(payload) {
    if (!pending) return
    if (pending.type === 'component') {
      onPick([{ kind: 'component', componentId: pending.componentId, count: payload.count }])
    } else if (pending.type === 'adhoc') {
      onPick([{ kind: 'adhoc', name: pending.name, measure: payload.measure, nutrition: pending.nutrition }])
    } else if (pending.type === 'pantry') {
      const { plan } = pending
      let pantryId
      if (plan.planKind === 'existing') pantryId = plan.pantryId
      else if (plan.planKind === 'attach') {
        await onAttachNutrition(plan.pantryId, plan.nutrition)
        pantryId = plan.pantryId
      } else {
        pantryId = await onSaveToPantry(plan.name, plan.category, plan.nutrition)
      }
      onPick([{ kind: 'pantry', pantryId, measure: payload.measure }])
    }
    setPending(null)
  }

  return (
    <div className="sheet-backdrop sheet-backdrop--stacked" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>Add to {(label || 'log').toLowerCase()}</h2>

        {!showOnline ? (
          <>
            <input
              type="text"
              className="library-filters__search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search pantry, common foods, dishes…"
              autoFocus
            />
            <AddSheetResults groups={groups} onPick={handleGroupPick} hasQuery={hasQuery} />
            {scanError && <p className="inline-warning">{scanError}</p>}
            <div className="button-row">
              <button type="button" className="btn" onClick={() => setShowOnline(true)}>
                🌐 Search online
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setScanError(null)
                  setScanning(true)
                }}
              >
                📷 Scan barcode
              </button>
            </div>
            <div className="button-row">
              <button type="button" className="btn" onClick={onClose}>
                Cancel
              </button>
            </div>
          </>
        ) : (
          <FoodSearchSheet
            initialQuery={query}
            fdcKey={fdcKey}
            onSaveAndStage={handleOnlineSaveAndStage}
            onAdhocStage={handleOnlineAdhocStage}
            onBack={() => setShowOnline(false)}
          />
        )}

        {scanning && <BarcodeScanner onCode={handleScanned} onCancel={() => setScanning(false)} />}

        {pending && (
          <AddItemAmountStep
            name={pending.name}
            kind={pending.type}
            nutrition={pending.nutrition}
            initialMeasure={pending.initialMeasure}
            initialCount={pending.initialCount}
            onConfirm={handleAmountConfirm}
            onCancel={() => setPending(null)}
          />
        )}
      </div>
    </div>
  )
}

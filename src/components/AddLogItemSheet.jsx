import { useRef, useState } from 'react'
import * as pantryOps from '../pantryOps.js'
import * as logSearchOps from '../logSearchOps.js'
import { buildAddSheetData, initialMeasureForPlan } from '../addSheetOps.js'
import { lookupBarcode } from '../nutritionLookup.js'
import { CloseIcon, SearchIcon, BarcodeIcon, ManualIcon, PlanIcon } from './Icons.jsx'
import AddSheetResults from './AddSheetResults.jsx'
import AddItemAmountStep from './AddItemAmountStep.jsx'
import FoodSearchSheet from './FoodSearchSheet.jsx'
import BarcodeScanner from './BarcodeScanner.jsx'
import NutritionInfoEditor from './NutritionInfoEditor.jsx'

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
  onGoToSettings,
  onClose,
}) {
  const [query, setQuery] = useState('')
  const [showOnline, setShowOnline] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState(null)
  const [manualEntry, setManualEntry] = useState(false)
  // "From plan" (action grid) scrolls to the TODAY'S PLAN group rather than
  // filtering to it — AddSheetResults registers each group's DOM node here
  // via onGroupRef so this sheet doesn't need to own the group rendering.
  const groupRefs = useRef({})
  // Staged pick awaiting the shared amount step:
  //   { type: 'component', componentId, name, initialCount }
  //   { type: 'adhoc', name, nutrition, initialMeasure }
  //   { type: 'pantry', name, nutrition, initialMeasure, plan }
  // `plan` (pantry picks only) is pantryOps.planPantrySave's pure decision —
  // hot-fix #1: NO pantry write happens here at pick-time. It's only
  // executed in handleAmountConfirm, when the user actually presses Add, so
  // backing out of the amount step (Back/close) never touches storage.
  const [pending, setPending] = useState(null)

  const { groups, recents, byId, pantryById, seedCandidates, hasQuery } = buildAddSheetData({
    card,
    components,
    pantry,
    logs,
    today,
    query,
    existingComponentIds,
  })

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
      setPending({ type: 'pantry', name: item.name, nutrition: item.nutrition, initialMeasure: initialMeasureForPlan(plan, recents), plan })
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
    setPending({ type: 'pantry', name: food.name, nutrition: plan.nutrition, initialMeasure: initialMeasureForPlan(plan, recents), plan })
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
    setPending({ type: 'pantry', name, nutrition: plan.nutrition, initialMeasure: initialMeasureForPlan(plan, recents), plan })
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

  // Enter-manually reuses the existing manual-entry flow (NutritionInfoEditor)
  // exactly as FoodSearchSheet's own fallback does — just reachable directly
  // from the action grid instead of only after an online search comes up
  // empty. A save stages the usual adhoc amount step; onCancel just closes it.
  if (manualEntry) {
    return (
      <div className="sheet-backdrop sheet-backdrop--stacked" onClick={onClose}>
        <div className="sheet" onClick={(e) => e.stopPropagation()}>
          <NutritionInfoEditor
            itemName={query.trim() || 'New food'}
            nutrition={null}
            fdcKey={fdcKey}
            byok={null}
            onSave={(nutrition) => {
              if (nutrition) handleOnlineAdhocStage({ name: query.trim() || 'New food', nutrition })
              setManualEntry(false)
            }}
            onCancel={() => setManualEntry(false)}
          />
        </div>
      </div>
    )
  }

  function handleFromPlan() {
    setQuery('')
    groupRefs.current.plan?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="sheet-backdrop sheet-backdrop--stacked" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <button type="button" className="sheet-head__close" onClick={onClose} aria-label="Close">
            <CloseIcon size={16} />
          </button>
          <span className="sheet-head__title">Add to {label || 'log'} ▾</span>
        </div>

        {!showOnline ? (
          <>
            <label className="searchfield">
              <SearchIcon size={18} />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search pantry, common foods, dishes…"
                autoFocus
              />
            </label>

            <div className="actiongrid">
              <button type="button" className="actionbtn" onClick={() => setShowOnline(true)}>
                <SearchIcon size={20} />
                <span className="actionbtn__label">Search online</span>
              </button>
              <button
                type="button"
                className="actionbtn"
                onClick={() => {
                  setScanError(null)
                  setScanning(true)
                }}
              >
                <BarcodeIcon size={20} />
                <span className="actionbtn__label">Scan barcode</span>
              </button>
              <button type="button" className="actionbtn" onClick={() => setManualEntry(true)}>
                <ManualIcon size={20} />
                <span className="actionbtn__label">Enter manually</span>
              </button>
              <button type="button" className="actionbtn" onClick={handleFromPlan}>
                <PlanIcon size={20} />
                <span className="actionbtn__label">From plan</span>
              </button>
            </div>

            <AddSheetResults groups={groups} query={query} onPick={handleGroupPick} hasQuery={hasQuery} onGroupRef={(key, el) => (groupRefs.current[key] = el)} />
            {scanError && <p className="inline-warning">{scanError}</p>}
          </>
        ) : (
          <FoodSearchSheet
            initialQuery={query}
            fdcKey={fdcKey}
            onSaveAndStage={handleOnlineSaveAndStage}
            onAdhocStage={handleOnlineAdhocStage}
            onGoToSettings={onGoToSettings}
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

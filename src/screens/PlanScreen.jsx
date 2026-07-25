import { useEffect, useRef, useState } from 'react'
import * as storage from '../storage.js'
import * as trackOps from '../trackOps.js'
import * as planOps from '../planOps.js'
import * as componentOps from '../componentOps.js'
import * as pantryOps from '../pantryOps.js'
import { createComponent, createGroceryItem, createLogEntry, MEAL_LABELS } from '../schema.js'
import PlanSlotList from '../components/PlanSlotList.jsx'
import PrepSheet from '../components/PrepSheet.jsx'
import AddDishToPlanSheet from '../components/AddDishToPlanSheet.jsx'
import GroceryCard from '../components/GroceryCard.jsx'
import AddLogItemSheet from '../components/AddLogItemSheet.jsx'

// Phase P1: replaces the AI full-week generator (run sheet / assembly cards
// / week import) with a slot-based flow — prep a dish from pantry
// ingredients, split it across N upcoming meal slots, log any slot
// to Track with one tap. No AI round trip anywhere in this screen anymore.
export default function PlanScreen({ onGoToSettings }) {
  const [pantry, setPantry] = useState([])
  const [components, setComponents] = useState([])
  const [planSlots, setPlanSlots] = useState([])
  const [logs, setLogs] = useState([])
  const [grocery, setGrocery] = useState([])
  const [categories, setCategories] = useState([])
  const [settings, setSettings] = useState(null)

  const [prepOpen, setPrepOpen] = useState(false)
  const [addingSavedDish, setAddingSavedDish] = useState(false)
  // { date, meal } | null — the slot whose "+ Add extra" opened the shared
  // AddLogItemSheet (card: null, per the prep-flow spec — this sheet is
  // reached from Plan, not Track, so there's no "today's plan" group to seed).
  const [extraSheet, setExtraSheet] = useState(null)
  // Round-3-style undo for a removed slot item: { date, meal, priorSlot,
  // removed } — priorSlot is the whole slot as it was before removal (or
  // undefined if the slot itself got dropped), restored verbatim on Undo.
  const [removeUndo, setRemoveUndo] = useState(null)
  const undoTimerRef = useRef(null)
  const [toast, setToast] = useState(null)
  const toastTimerRef = useRef(null)

  async function reload() {
    const [p, c, ps, l, g, cat, s] = await Promise.all([
      storage.get('pantry'),
      storage.get('components'),
      storage.get('planSlots'),
      storage.get('logs'),
      storage.get('grocery'),
      storage.get('categories'),
      storage.get('settings'),
    ])
    setPantry(p)
    setComponents(c)
    setPlanSlots(ps)
    setLogs(l)
    setGrocery(g)
    setCategories(cat)
    setSettings(s)
  }

  useEffect(() => {
    reload()
    return storage.subscribe(reload)
  }, [])
  useEffect(() => () => {
    clearTimeout(undoTimerRef.current)
    clearTimeout(toastTimerRef.current)
  }, [])

  function showToast(text) {
    clearTimeout(toastTimerRef.current)
    setToast(text)
    toastTimerRef.current = setTimeout(() => setToast(null), 2500)
  }

  async function handleRemoveItem(date, meal, index) {
    const priorSlot = planOps.slotFor(planSlots, date, meal)
    const { slots, removed } = planOps.removeItemFromSlot(planSlots, date, meal, index)
    await storage.set('planSlots', slots)
    clearTimeout(undoTimerRef.current)
    setRemoveUndo({ date, meal, priorSlot, removed })
    undoTimerRef.current = setTimeout(() => setRemoveUndo(null), 6000)
  }

  async function handleUndoRemove() {
    if (!removeUndo) return
    clearTimeout(undoTimerRef.current)
    const nextSlots = removeUndo.priorSlot ? planOps.upsertSlot(planSlots, removeUndo.priorSlot) : planSlots
    await storage.set('planSlots', nextSlots)
    setRemoveUndo(null)
  }

  // Same merge-or-create rule as Track's own "Log from plan" (TrackScreen's
  // handleLogFromPlan) — kept in sync deliberately, not shared, since the two
  // screens own different pieces of state.
  async function handleLogToTrack(date, meal) {
    const slot = planOps.slotFor(planSlots, date, meal)
    if (!slot) return
    const { items } = trackOps.copyItemsForRelog(slot, components, pantry)
    if (items.length === 0) return
    const existing = trackOps.logFor(logs, date, meal)
    const log = existing && existing.log.items.length > 0 ? trackOps.mergeItems(existing.log, items) : createLogEntry({ date, meal, items })
    await storage.set('logs', trackOps.upsertLog(logs, log))
    showToast('Logged to Track')
  }

  async function handleAddExtraPick(items) {
    if (!extraSheet) return
    const nextSlots = planOps.addItemsToSlot(planSlots, extraSheet.date, extraSheet.meal, items)
    await storage.set('planSlots', nextSlots)
    setExtraSheet(null)
  }

  // PrepSheet already decided WHAT to persist (ingredients, macros, which
  // slots) — this is the only place any of it is actually written: the new
  // dish Component, its slot placements, and any off-hand ingredients added
  // to the advisory grocery list (existing names skipped, case/whitespace
  // insensitive).
  async function handlePrepConfirm({ name, ingredients, macrosPerServing, servings, offHandIngredients, pickedSlots }) {
    const dish = createComponent({ name, type: 'dish', ingredients, steps: [], servings, macrosPerServing, macroSource: 'derived' })
    await storage.set('components', componentOps.upsertComponent(components, dish))

    let nextSlots = planSlots
    for (const { date, meal } of pickedSlots) {
      nextSlots = planOps.addItemsToSlot(nextSlots, date, meal, [{ kind: 'component', componentId: dish.id, count: 1 }])
    }
    await storage.set('planSlots', nextSlots)

    const existingNames = new Set(grocery.map((g) => g.name.trim().toLowerCase()))
    const newItems = offHandIngredients
      .filter((ing) => !existingNames.has(ing.name.trim().toLowerCase()))
      .map((ing) => createGroceryItem({ name: ing.name, forDish: name }))
    if (newItems.length > 0) await storage.set('grocery', [...grocery, ...newItems])

    setPrepOpen(false)
    showToast(`${name} slotted into your week`)
  }

  async function handleAddSavedDish(componentId, pickedSlots) {
    let nextSlots = planSlots
    for (const { date, meal } of pickedSlots) {
      nextSlots = planOps.addItemsToSlot(nextSlots, date, meal, [{ kind: 'component', componentId, count: 1 }])
    }
    await storage.set('planSlots', nextSlots)
    setAddingSavedDish(false)
  }

  async function handleDismissGrocery(index) {
    await storage.set('grocery', grocery.filter((_, i) => i !== index))
  }

  async function handleSaveToPantry(name, category, nutrition) {
    const { pantry: nextPantry, item } = pantryOps.addItem(pantry, { name, category, onHand: true, nutrition })
    await storage.set('pantry', nextPantry)
    return item.id
  }

  async function handleAttachNutrition(pantryId, nutrition) {
    await storage.set('pantry', pantryOps.attachNutritionIfMissing(pantry, pantryId, nutrition))
  }

  if (!settings) return null

  const byok = settings.apiMode === 'byok' && settings.apiKey ? { provider: settings.provider, apiKey: settings.apiKey } : null
  const today = trackOps.todayISO()
  // Lunch/dinner over the next 4 days (8 slots) for the prep/add pickers;
  // the home list below shows only the first 6 — both per the approved
  // round-2 prototype.
  const upcoming = planOps.upcomingSlots(today, 4)
  const extraSlot = extraSheet ? planOps.slotFor(planSlots, extraSheet.date, extraSheet.meal) : null
  const extraExistingComponentIds = extraSlot ? extraSlot.items.filter((i) => i.kind === 'component').map((i) => i.componentId) : []

  return (
    <div className="screen">
      <h1>Plan</h1>

      {toast && <div className="message message--success">{toast}</div>}

      <div className="button-row">
        <button type="button" className="btn btn--primary" onClick={() => setPrepOpen(true)}>
          ＋ Prep a dish
        </button>
        <button type="button" className="btn" onClick={() => setAddingSavedDish(true)}>
          ＋ Add saved dish
        </button>
      </div>

      <PlanSlotList
        upcoming={upcoming.slice(0, 6)}
        planSlots={planSlots}
        today={today}
        components={components}
        pantry={pantry}
        removeUndo={removeUndo}
        onRemoveItem={handleRemoveItem}
        onUndoRemove={handleUndoRemove}
        onLogToTrack={handleLogToTrack}
        onAddExtra={(date, meal) => setExtraSheet({ date, meal })}
      />

      <GroceryCard grocery={grocery} onDismiss={handleDismissGrocery} />

      {prepOpen && (
        <PrepSheet pantry={pantry} components={components} planSlots={planSlots} upcoming={upcoming} onConfirm={handlePrepConfirm} onClose={() => setPrepOpen(false)} />
      )}

      {addingSavedDish && (
        <AddDishToPlanSheet
          components={components}
          pantry={pantry}
          planSlots={planSlots}
          upcoming={upcoming}
          onConfirm={handleAddSavedDish}
          onClose={() => setAddingSavedDish(false)}
        />
      )}

      {extraSheet && (
        <AddLogItemSheet
          meal={extraSheet.meal}
          label={upcoming.find((u) => u.date === extraSheet.date && u.meal === extraSheet.meal)?.label || MEAL_LABELS[extraSheet.meal]}
          card={null}
          components={components}
          pantry={pantry}
          categories={categories}
          fdcKey={settings.fdcKey}
          byok={byok}
          logs={logs}
          today={today}
          existingComponentIds={extraExistingComponentIds}
          onPick={handleAddExtraPick}
          onSaveToPantry={handleSaveToPantry}
          onAttachNutrition={handleAttachNutrition}
          onGoToSettings={onGoToSettings}
          onClose={() => setExtraSheet(null)}
        />
      )}
    </div>
  )
}

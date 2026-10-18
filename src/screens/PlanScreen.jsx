import { useEffect, useRef, useState } from 'react'
import * as storage from '../storage.js'
import * as trackOps from '../trackOps.js'
import * as planOps from '../planOps.js'
import * as pantryOps from '../pantryOps.js'
import * as ideaOps from '../ideaOps.js'
import { createLogEntry, MEAL_LABELS } from '../schema.js'
import PlanSlotList from '../components/PlanSlotList.jsx'
import CookSheet from '../components/CookSheet.jsx'
import CookDraftList from '../components/CookDraftList.jsx'
import * as cookOps from '../cookOps.js'
import * as stockOps from '../stockOps.js'
import AddDishToPlanSheet from '../components/AddDishToPlanSheet.jsx'
import GroceryCard from '../components/GroceryCard.jsx'
import IdeasSection from '../components/IdeasSection.jsx'
import AddLogItemSheet from '../components/AddLogItemSheet.jsx'
import { byokCredentials } from '../byok.js'

// Phase P1: replaces the AI full-week generator (run sheet / assembly cards
// / week import) with a slot-based flow — log any slot to Track with one
// tap. Phase 19: "🍳 Cook" (drafts, then done -> eat now + shelf) replaces
// P1's prep-and-split-across-slots. Phase P2 adds one small, optional AI round trip
// back: "What can I make?" dish ideas (IdeasSection) — everything else on
// this screen stays AI-free.
export default function PlanScreen({ onGoToSettings }) {
  const [pantry, setPantry] = useState([])
  const [components, setComponents] = useState([])
  const [planSlots, setPlanSlots] = useState([])
  const [logs, setLogs] = useState([])
  const [grocery, setGrocery] = useState([])
  const [ideas, setIdeas] = useState([])
  const [categories, setCategories] = useState([])
  const [settings, setSettings] = useState(null)
  const [cookSessions, setCookSessions] = useState([])
  const [shelf, setShelf] = useState([])

  // null = closed; else CookSheet's `seed`: {} = blank cook; {initialName,
  // initialRows, buy} = from an idea's "Prep →" (buy rides through to
  // handleCookDone's grocery additions); {session} = resuming a draft.
  const [cookSeed, setCookSeed] = useState(null)
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
    const [p, c, ps, l, g, i, cat, s, cs, sh] = await Promise.all([
      storage.get('pantry'),
      storage.get('components'),
      storage.get('planSlots'),
      storage.get('logs'),
      storage.get('grocery'),
      storage.get('ideas'),
      storage.get('categories'),
      storage.get('settings'),
      storage.get('cookSessions'),
      storage.get('shelf'),
    ])
    setPantry(p)
    setComponents(c)
    setPlanSlots(ps)
    setLogs(l)
    setGrocery(g)
    setIdeas(i)
    setCategories(cat)
    setSettings(s)
    setCookSessions(cs)
    setShelf(sh)
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

  // Phase 19: 🍳 Cook replaces P1's slot-filling prep. Drafts persist as
  // cook sessions; finishing writes the dish, the portion eaten now (if
  // any), the rest to the shelf, and off-hand ingredients (+ an idea's
  // `buy` list) to the advisory grocery list. cookOps decides; this writes.
  async function handleSaveDraft({ sessionId, name, text, rows, servings }) {
    await storage.set('cookSessions', cookOps.saveDraft(cookSessions, { sessionId, name, text, rows, servings, now: new Date().toISOString() }))
    setCookSeed(null)
    showToast(`Draft saved${name ? ` — ${name}` : ''}`)
  }

  async function handleCookDone(payload) {
    const out = cookOps.finishCook({ components, logs, shelf, cookSessions }, { ...payload, today: trackOps.todayISO(), now: new Date().toISOString(), pantry })
    await storage.set('components', out.components)
    await storage.set('logs', out.logs)
    await storage.set('shelf', out.shelf)
    await storage.set('cookSessions', out.cookSessions)
    const names = [...cookOps.offHandRows(payload.rows, pantry).map((r) => r.name), ...(cookSeed?.buy || [])]
    const additions = cookOps.groceryAdditions(grocery, names, out.component.name)
    // Phase 20: stock goes down; anything now low/out joins the advisory list.
    const { pantry: nextPantry, changed } = cookOps.applyStockPatches(pantry, payload.stockPatches || {})
    if (changed.length > 0) await storage.set('pantry', nextPantry)
    const lowAdditions = stockOps.lowStockAdditions([...grocery, ...additions], changed)
    if (additions.length + lowAdditions.length > 0) await storage.set('grocery', [...grocery, ...additions, ...lowAdditions])
    setCookSeed(null)
    const eaten = payload.eatNow ? `${payload.eatNow.count} logged to ${MEAL_LABELS[payload.eatNow.meal].toLowerCase()}` : null
    const kept = out.shelfEntry ? `${out.shelfEntry.servingsLeft} on the shelf` : null
    showToast([out.component.name, [eaten, kept].filter(Boolean).join(' · ')].filter(Boolean).join(': '))
  }

  async function handleDeleteDraft(id) {
    await storage.set('cookSessions', cookSessions.filter((s) => s.id !== id))
  }

  // Phase P2 "Prep →" on an idea card: pre-seed the Cook sheet with the
  // idea's name and its `uses` resolved to pantry rows; unmatched uses are
  // just not pre-seeded (search-add covers that). The idea's `buy` list
  // rides along in cookSeed for handleCookDone's grocery additions.
  function handlePrepIdea(idea) {
    const { pantryIds } = ideaOps.prepSeedForIdea(idea, pantry)
    setCookSeed({ initialName: idea.name, initialRows: pantryIds.map((pantryId) => ({ pantryId })), buy: idea.buy })
  }

  async function handleIdeasRefreshed(fresh) {
    await storage.set('ideas', ideaOps.mergeFreshIdeas(ideas, fresh))
  }

  async function handleToggleIdeaStar(id) {
    await storage.set('ideas', ideaOps.toggleStar(ideas, id))
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

  const byok = byokCredentials(settings)
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
        <button type="button" className="btn btn--primary" onClick={() => setCookSeed({})}>
          🍳 Cook
        </button>
        <button type="button" className="btn" onClick={() => setAddingSavedDish(true)}>
          ＋ Add saved dish
        </button>
      </div>

      <CookDraftList drafts={cookSessions.filter((s) => s.status === 'draft')} onResume={(session) => setCookSeed({ session })} onDelete={handleDeleteDraft} />

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

      <IdeasSection
        ideas={ideas}
        pantry={pantry}
        components={components}
        settings={settings}
        onIdeasRefreshed={handleIdeasRefreshed}
        onToggleStar={handleToggleIdeaStar}
        onPrepIdea={handlePrepIdea}
      />

      {cookSeed && (
        <CookSheet
          seed={cookSeed}
          pantry={pantry}
          components={components}
          byok={byok}
          onSaveDraft={handleSaveDraft}
          onDone={handleCookDone}
          onClose={() => setCookSeed(null)}
        />
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

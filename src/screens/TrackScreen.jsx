import { useEffect, useRef, useState } from 'react'
import * as storage from '../storage.js'
import * as trackOps from '../trackOps.js'
import * as planOps from '../planOps.js'
import * as pantryOps from '../pantryOps.js'
import * as componentOps from '../componentOps.js'
import { createLogEntry } from '../schema.js'
import DayLog from '../components/DayLog.jsx'
import TrackHero from '../components/TrackHero.jsx'
import RecentLogsList from '../components/RecentLogsList.jsx'
import ShelfSection from '../components/ShelfSection.jsx'
import WeekInsights from '../components/WeekInsights.jsx'
import { byokCredentials } from '../byok.js'

export default function TrackScreen({ onGoToSettings, onGoToPlan, fabSignal }) {
  const [components, setComponents] = useState([])
  const [pantry, setPantry] = useState([])
  const [categories, setCategories] = useState([])
  const [planSlots, setPlanSlots] = useState([])
  const [logs, setLogs] = useState([])
  const [settings, setSettings] = useState(null)
  const [confirmingRemove, setConfirmingRemove] = useState(null)
  const [selectedDate, setSelectedDate] = useState(trackOps.todayISO())
  // Round 2 "Recent logs re-log" undo: { meal, priorLog, count, skipped } or
  // null. Mirrors DayLog's own "Log it again" undo (same 6s window, same
  // cleanup-on-unmount), but scoped to the Recent-logs list rather than a
  // single meal card since the source row can be any past day.
  const [relogUndo, setRelogUndo] = useState(null)
  const relogUndoTimerRef = useRef(null)

  async function reload() {
    const [c, p, cat, ps, l, s] = await Promise.all([
      storage.get('components'),
      storage.get('pantry'),
      storage.get('categories'),
      storage.get('planSlots'),
      storage.get('logs'),
      storage.get('settings'),
    ])
    setComponents(c)
    setPantry(p)
    setCategories(cat)
    setPlanSlots(ps)
    setLogs(l)
    setSettings(s)
  }

  useEffect(() => {
    reload()
    return storage.subscribe(reload)
  }, [])

  // The FAB always targets "now" — jump back to today so the sheet it opens
  // (via DayLog's fabSignal prop) lands on the meal the user actually meant.
  useEffect(() => {
    if (fabSignal) setSelectedDate(trackOps.todayISO())
  }, [fabSignal])

  useEffect(() => () => clearTimeout(relogUndoTimerRef.current), [])

  function logOrNew(dateISO, meal) {
    const entry = trackOps.logFor(logs, dateISO, meal)
    return entry ? entry.log : null
  }

  // "Log from plan" now works for any meal whose slot has items (previously
  // lunch-only, sourced from the week's single assembly card) — same
  // merge-or-create rule handleAddItems uses.
  async function handleLogFromPlan(dateISO, meal) {
    const slot = planOps.slotFor(planSlots, dateISO, meal)
    if (!slot) return
    const { items } = trackOps.copyItemsForRelog(slot, components, pantry)
    if (items.length === 0) return
    const existing = logOrNew(dateISO, meal)
    const log = existing ? trackOps.mergeItems(existing, items) : createLogEntry({ date: dateISO, meal, items })
    await storage.set('logs', trackOps.upsertLog(logs, log))
  }

  // opts.where (Phase 21): set when the add path knows where it was eaten
  // ("I ate out"); otherwise the meal keeps its tag, or the read-time guess.
  async function handleAddItems(dateISO, meal, items, opts = {}) {
    const existing = logOrNew(dateISO, meal)
    const merged = existing ? trackOps.mergeItems(existing, items) : createLogEntry({ date: dateISO, meal, items })
    const log = opts.where ? { ...merged, where: opts.where } : merged
    await storage.set('logs', trackOps.upsertLog(logs, log))
  }

  async function handleSetWhere(dateISO, meal, where) {
    const log = logOrNew(dateISO, meal)
    if (!log) return
    await storage.set('logs', trackOps.upsertLog(logs, { ...log, where }))
  }

  async function handleSetItemCount(dateISO, meal, index, count) {
    const log = logOrNew(dateISO, meal)
    if (!log) return
    await storage.set('logs', trackOps.upsertLog(logs, trackOps.setItemCount(log, index, count)))
  }

  async function handleSetItemMeasure(dateISO, meal, index, measure) {
    const log = logOrNew(dateISO, meal)
    if (!log) return
    await storage.set('logs', trackOps.upsertLog(logs, trackOps.setItemMeasure(log, index, measure)))
  }

  async function handleRemoveItem(dateISO, meal, index) {
    const log = logOrNew(dateISO, meal)
    if (!log) return
    await storage.set('logs', trackOps.upsertLog(logs, trackOps.removeItemAt(log, index)))
  }

  async function handleRemoveLog(dateISO, meal) {
    const entry = trackOps.logFor(logs, dateISO, meal)
    if (!entry) return
    await storage.set('logs', trackOps.removeLogAt(logs, entry.index))
  }

  // Round 3 "Log it again" / its undo: a generic (date, meal) -> LogEntry|null
  // setter. `log: null` removes whatever entry is there (the undo path when
  // nothing existed before the copy); otherwise upserts it whole, so the
  // undo's captured `priorLog` snapshot restores exactly what was there.
  async function handleSetLog(dateISO, meal, log) {
    if (log === null) {
      const entry = trackOps.logFor(logs, dateISO, meal)
      if (!entry) return
      await storage.set('logs', trackOps.removeLogAt(logs, entry.index))
    } else {
      await storage.set('logs', trackOps.upsertLog(logs, log))
    }
  }

  // Round C "teach a conversion": a taught { label: '1 <unit>', gramsOrFraction }
  // anchor is appended to the item's own nutrition.naturalUnits — pantry
  // items write back to the shared pantry record (so every future log of
  // that item benefits too), adhoc items only update this one log's
  // snapshot. Never overwrites anything else in nutrition (CLAUDE.md §3);
  // teaching is a no-op when the pantry item somehow has no nutrition yet
  // (nothing to anchor onto).
  async function handleTeachMeasure(dateISO, meal, index, entry) {
    const log = logOrNew(dateISO, meal)
    if (!log) return
    const item = log.items[index]
    if (!item) return
    if (item.kind === 'pantry') {
      const pantryItem = pantry.find((p) => p.id === item.pantryId)
      const n = pantryItem?.nutrition
      if (!n) return
      await storage.set(
        'pantry',
        pantryOps.updateItem(pantry, item.pantryId, { nutrition: { ...n, naturalUnits: [...(n.naturalUnits || []), entry] } }),
      )
    } else if (item.kind === 'adhoc') {
      const nutrition = { ...item.nutrition, naturalUnits: [...(item.nutrition.naturalUnits || []), entry] }
      await storage.set('logs', trackOps.setItemNutrition(logs, dateISO, meal, index, nutrition))
    }
  }

  // Round 3 "Save as dish": builds a type:'dish' Component from a logged
  // meal and adds it to the library — it shows up under MY DISHES next time
  // the add sheet is opened (already wired via componentOps/filterComponents).
  async function handleSaveDish(name, log) {
    const dish = componentOps.dishFromMeal(name, log, components, pantry)
    await storage.set('components', componentOps.upsertComponent(components, dish))
  }

  async function handleRemoveAt(index) {
    await storage.set('logs', trackOps.removeLogAt(logs, index))
    setConfirmingRemove(null)
  }

  // Round 2 "Recent logs re-log": one-tap copy of a past meal into TODAY
  // (not the currently-selected date — the whole point is a fast path back
  // to "today" from a past-day row). Mirrors DayLog.handleLogAgain exactly,
  // just retargeted at (today, sourceLog.meal) instead of (selectedDate, meal).
  async function handleLogAgain(sourceLog) {
    const today = trackOps.todayISO()
    const meal = sourceLog.meal
    const priorEntry = trackOps.logFor(logs, today, meal)
    const priorLog = priorEntry ? priorEntry.log : null
    const { items, skipped } = trackOps.copyItemsForRelog(sourceLog, components, pantry)
    if (items.length === 0) return
    const newLog = priorLog ? trackOps.mergeItems(priorLog, items) : createLogEntry({ date: today, meal, items })
    await handleSetLog(today, meal, newLog)
    setSelectedDate(today)

    clearTimeout(relogUndoTimerRef.current)
    setRelogUndo({ meal, priorLog, count: items.length, skipped })
    relogUndoTimerRef.current = setTimeout(() => setRelogUndo(null), 6000)
  }

  async function handleUndoRelog() {
    if (!relogUndo) return
    clearTimeout(relogUndoTimerRef.current)
    await handleSetLog(trackOps.todayISO(), relogUndo.meal, relogUndo.priorLog)
    setRelogUndo(null)
  }

  // Saving a search result to the pantry (Phase 16) makes it resolve
  // offline next time; addItem's synchronously-returned id sidesteps any
  // read-after-write race with the freshly-created pantry item.
  async function handleSaveToPantry(name, category, nutrition) {
    const { pantry: nextPantry, item } = pantryOps.addItem(pantry, { name, category, onHand: true, nutrition })
    await storage.set('pantry', nextPantry)
    return item.id
  }

  // Round 2 duplicate guard (AddLogItemSheet): an online/barcode find that
  // matches an existing pantry item by name/barcode attaches its nutrition
  // only if that item has none yet — never overwrites (CLAUDE.md §3).
  async function handleAttachNutrition(pantryId, nutrition) {
    await storage.set('pantry', pantryOps.attachNutritionIfMissing(pantry, pantryId, nutrition))
  }

  if (!settings) return null

  // Same derivation as PantryScreen: only pass a usable key down, never the
  // raw settings object, and only when BYOK mode is actually configured.
  const byok = byokCredentials(settings)

  const today = trackOps.todayISO()
  const weekOf = trackOps.currentWeekSundayISO(today)
  const compById = Object.fromEntries(components.map((c) => [c.id, c]))
  const pantryById = Object.fromEntries(pantry.map((p) => [p.id, p]))
  const recent = logs
    .map((log, index) => ({ log, index }))
    .filter(({ log }) => log.items.length > 0)
    .sort((a, b) => (a.log.date < b.log.date ? 1 : a.log.date > b.log.date ? -1 : 0))
    .slice(0, 10)

  function itemName(item) {
    if (item.kind === 'component') return compById[item.componentId]?.name || item.componentId
    if (item.kind === 'pantry') return pantryById[item.pantryId]?.name || item.pantryId
    return item.name
  }

  return (
    <div className="screen">
      <h1>Track</h1>

      <TrackHero
        logs={logs}
        components={components}
        pantry={pantry}
        settings={settings}
        today={today}
        weekOf={weekOf}
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
      />

      <WeekInsights logs={logs} components={components} pantry={pantry} dates={trackOps.weekDatesFull(weekOf).map((d) => d.date)} />

      <ShelfSection components={components} />

      <h2 className="track-section-head">Meals</h2>

      <DayLog
        slots={planSlots}
        selectedDate={selectedDate}
        logs={logs}
        components={components}
        pantry={pantry}
        categories={categories}
        fdcKey={settings.fdcKey}
        byok={byok}
        today={today}
        fabSignal={fabSignal}
        onLogFromPlan={handleLogFromPlan}
        onAddItems={handleAddItems}
        onSetLog={handleSetLog}
        onSetWhere={handleSetWhere}
        onSetItemCount={handleSetItemCount}
        onSetItemMeasure={handleSetItemMeasure}
        onRemoveItem={handleRemoveItem}
        onRemoveLog={handleRemoveLog}
        onSaveToPantry={handleSaveToPantry}
        onAttachNutrition={handleAttachNutrition}
        onSaveDish={handleSaveDish}
        onTeachMeasure={handleTeachMeasure}
        onGoToSettings={onGoToSettings}
        onGoToPlan={onGoToPlan}
      />

      <RecentLogsList
        recent={recent}
        itemName={itemName}
        todayISO={today}
        confirmingRemove={confirmingRemove}
        onConfirmRemove={setConfirmingRemove}
        onCancelRemove={() => setConfirmingRemove(null)}
        onRemoveAt={handleRemoveAt}
        onLogAgain={handleLogAgain}
        relogUndo={relogUndo}
        onUndoRelog={handleUndoRelog}
      />
    </div>
  )
}

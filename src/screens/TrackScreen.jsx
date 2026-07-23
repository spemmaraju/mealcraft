import { useEffect, useState } from 'react'
import * as storage from '../storage.js'
import * as trackOps from '../trackOps.js'
import * as pantryOps from '../pantryOps.js'
import { createLogEntry } from '../schema.js'
import DayLog from '../components/DayLog.jsx'
import GaugesPanel from '../components/GaugesPanel.jsx'

export default function TrackScreen() {
  const [components, setComponents] = useState([])
  const [pantry, setPantry] = useState([])
  const [categories, setCategories] = useState([])
  const [weeks, setWeeks] = useState([])
  const [logs, setLogs] = useState([])
  const [settings, setSettings] = useState(null)
  const [confirmingRemove, setConfirmingRemove] = useState(null)

  async function reload() {
    const [c, p, cat, w, l, s] = await Promise.all([
      storage.get('components'),
      storage.get('pantry'),
      storage.get('categories'),
      storage.get('weeks'),
      storage.get('logs'),
      storage.get('settings'),
    ])
    setComponents(c)
    setPantry(p)
    setCategories(cat)
    setWeeks(w)
    setLogs(l)
    setSettings(s)
  }

  useEffect(() => {
    reload()
    return storage.subscribe(reload)
  }, [])

  function logOrNew(dateISO, meal) {
    const entry = trackOps.logFor(logs, dateISO, meal)
    return entry ? entry.log : null
  }

  async function handleLogFromPlan(dateISO) {
    const week = trackOps.currentWeek(weeks, dateISO)
    const card = trackOps.assemblyCardForDate(week, dateISO)
    if (!card) return
    await storage.set('logs', trackOps.upsertLog(logs, trackOps.buildLogFromCard(card, dateISO, 'lunch')))
  }

  async function handleAddItems(dateISO, meal, items) {
    const existing = logOrNew(dateISO, meal)
    const log = existing ? trackOps.mergeItems(existing, items) : createLogEntry({ date: dateISO, meal, items })
    await storage.set('logs', trackOps.upsertLog(logs, log))
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

  async function handleSetRating(dateISO, meal, rating) {
    const log = logOrNew(dateISO, meal)
    if (!log) return
    await storage.set('logs', trackOps.upsertLog(logs, { ...log, quickRating: rating }))
  }

  async function handleRemoveLog(dateISO, meal) {
    const entry = trackOps.logFor(logs, dateISO, meal)
    if (!entry) return
    await storage.set('logs', trackOps.removeLogAt(logs, entry.index))
  }

  async function handleRemoveAt(index) {
    await storage.set('logs', trackOps.removeLogAt(logs, index))
    setConfirmingRemove(null)
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

  const today = trackOps.todayISO()
  const week = trackOps.currentWeek(weeks, today)
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

      <DayLog
        week={week}
        logs={logs}
        components={components}
        pantry={pantry}
        categories={categories}
        fdcKey={settings.fdcKey}
        today={today}
        onLogFromPlan={handleLogFromPlan}
        onAddItems={handleAddItems}
        onSetItemCount={handleSetItemCount}
        onSetItemMeasure={handleSetItemMeasure}
        onRemoveItem={handleRemoveItem}
        onSetRating={handleSetRating}
        onRemoveLog={handleRemoveLog}
        onSaveToPantry={handleSaveToPantry}
        onAttachNutrition={handleAttachNutrition}
      />

      <GaugesPanel logs={logs} components={components} pantry={pantry} week={week} settings={settings} today={today} />

      <div className="plan-section">
        <h2>Recent logs</h2>
        {recent.length === 0 ? (
          <p className="placeholder">Nothing logged yet.</p>
        ) : (
          recent.map(({ log, index }) => (
            <div key={index} className="recent-log-row">
              <div className="recent-log-row__body">
                <span className="recent-log-row__date">
                  {log.date} · {log.meal}
                </span>
                <span className="recent-log-row__components">{log.items.map(itemName).join(', ') || '(none)'}</span>
                {log.quickRating && <span className="chip chip--active recent-log-row__rating">{log.quickRating}</span>}
              </div>
              {confirmingRemove === index ? (
                <span className="recent-log-row__confirm">
                  <button type="button" className="btn btn--danger" onClick={() => handleRemoveAt(index)}>
                    Remove?
                  </button>
                  <button type="button" className="btn" onClick={() => setConfirmingRemove(null)}>
                    Keep
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  className="assembly-card__x"
                  onClick={() => setConfirmingRemove(index)}
                  aria-label={`Remove log for ${log.date}`}
                >
                  ×
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

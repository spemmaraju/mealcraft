import { useEffect, useRef, useState } from 'react'
import * as storage from '../storage.js'
import * as trackOps from '../trackOps.js'
import { createLogEntry, MEAL_LABELS } from '../schema.js'
import { eatByLabel, removeEntry, takeServings, visibleShelf } from '../shelfOps.js'

const UNDO_MS = 6000

/**
 * Phase 19: the ready-to-eat shelf on Track — cooked batches with servings
 * left and an eat-by date. "Eat 1" logs one serving to today's meal-for-now
 * and takes it off the batch; ✕ discards a batch. Both have Undo
 * (CLAUDE.md §5). Self-contained (reads/writes `shelf` and `logs` through
 * storage) so TrackScreen stays under its line budget; hidden when empty.
 * Informational only — no reminders.
 */
export default function ShelfSection({ components }) {
  const [shelf, setShelf] = useState([])
  const [undo, setUndo] = useState(null) // { text, priorShelf, priorLogs | null }
  const timerRef = useRef(null)

  useEffect(() => {
    const load = () => storage.get('shelf').then(setShelf)
    load()
    const unsubscribe = storage.subscribe(load)
    return () => {
      unsubscribe()
      clearTimeout(timerRef.current)
    }
  }, [])

  function offerUndo(next) {
    clearTimeout(timerRef.current)
    setUndo(next)
    timerRef.current = setTimeout(() => setUndo(null), UNDO_MS)
  }

  async function handleEat(entry, name) {
    const today = trackOps.todayISO()
    const meal = trackOps.mealForTime()
    const logs = await storage.get('logs')
    const item = { kind: 'component', componentId: entry.componentId, count: 1 }
    const hit = trackOps.logFor(logs, today, meal)
    const log = hit ? trackOps.mergeItems(hit.log, [item]) : createLogEntry({ date: today, meal, items: [item] })
    const { shelf: nextShelf, emptied } = takeServings(shelf, entry.id)
    await storage.set('logs', trackOps.upsertLog(logs, log))
    await storage.set('shelf', nextShelf)
    offerUndo({ text: `1 ${name} logged to ${MEAL_LABELS[meal].toLowerCase()}${emptied ? ' — that was the last one' : ''}.`, priorShelf: shelf, priorLogs: logs })
  }

  async function handleDiscard(entry, name) {
    await storage.set('shelf', removeEntry(shelf, entry.id))
    offerUndo({ text: `${name} removed from the shelf.`, priorShelf: shelf, priorLogs: null })
  }

  async function handleUndo() {
    if (!undo) return
    clearTimeout(timerRef.current)
    if (undo.priorLogs) await storage.set('logs', undo.priorLogs)
    await storage.set('shelf', undo.priorShelf)
    setUndo(null)
  }

  const entries = visibleShelf(shelf, components)
  if (entries.length === 0 && !undo) return null
  const today = trackOps.todayISO()
  const byId = Object.fromEntries(components.map((c) => [c.id, c]))

  return (
    <section className="shelf">
      <h2 className="track-section-head">Ready to eat</h2>
      {entries.map((entry) => {
        const dish = byId[entry.componentId]
        const label = eatByLabel(entry.eatBy, today)
        const kcal = dish.macrosPerServing ? `${Math.round(dish.macrosPerServing.kcal)} kcal · ` : ''
        return (
          <div key={entry.id} className="shelf__row">
            <div className="shelf__body">
              <span className="shelf__name">{dish.name}</span>
              <span className="field-caption">
                {entry.servingsLeft} serving{entry.servingsLeft === 1 ? '' : 's'} left · {kcal}
                <span className={label === 'past eat-by' ? 'shelf__past' : undefined}>{label}</span>
              </span>
            </div>
            <button type="button" className="btn btn--primary shelf__eat" onClick={() => handleEat(entry, dish.name)}>
              Eat 1
            </button>
            <button type="button" className="itemrow__remove" aria-label={`Remove ${dish.name} from the shelf`} onClick={() => handleDiscard(entry, dish.name)}>
              ✕
            </button>
          </div>
        )
      })}
      {undo && (
        <div className="message message--success shelf__undo">
          <span>{undo.text}</span>
          <button type="button" className="link-btn" onClick={handleUndo}>
            Undo
          </button>
        </div>
      )}
    </section>
  )
}

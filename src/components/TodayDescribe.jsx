import { useEffect, useRef, useState } from 'react'
import * as storage from '../storage.js'
import { mealForTime } from '../trackOps.js'
import { addMealGroups, groupRowsByMeal } from '../todayOps.js'
import { MEAL_LABELS } from '../schema.js'
import FreeTextParseSheet from './FreeTextParseSheet.jsx'

// The big "What did you eat?" entry at the top of Today: one dictated meal or
// a whole day (incl. eating out) -> one review card -> logged into the right
// meals in ONE storage write, with a 6s Undo that restores the prior logs.
export default function TodayDescribe({ logs, components, pantry, byok, dateISO }) {
  const [open, setOpen] = useState(false)
  const [defaultMeal, setDefaultMeal] = useState('lunch')
  const [undo, setUndo] = useState(null) // { prior, count, meals }
  const timerRef = useRef(null)

  useEffect(() => () => clearTimeout(timerRef.current), [])

  function openSheet() {
    setDefaultMeal(mealForTime())
    setOpen(true)
  }

  async function handleConfirm(rows) {
    setOpen(false)
    const groups = groupRowsByMeal(rows, defaultMeal)
    if (groups.length === 0) return
    await storage.set('logs', addMealGroups(logs, dateISO, groups))
    clearTimeout(timerRef.current)
    setUndo({ prior: logs, count: rows.length, meals: groups.map((g) => MEAL_LABELS[g.meal]).join(', ') })
    timerRef.current = setTimeout(() => setUndo(null), 6000)
  }

  async function handleUndo() {
    clearTimeout(timerRef.current)
    await storage.set('logs', undo.prior)
    setUndo(null)
  }

  return (
    <>
      <button type="button" className="today-describe" onClick={openSheet}>
        What did you eat?
        <span>Say or type it — a meal or the whole day</span>
      </button>

      {undo && (
        <div className="today-undo message message--success" role="status">
          <span>
            Logged {undo.count} item{undo.count === 1 ? '' : 's'} to {undo.meals}
          </span>
          <button type="button" className="pill-quiet" onClick={handleUndo}>
            Undo
          </button>
        </div>
      )}

      {open && (
        <FreeTextParseSheet
          mode="day"
          defaultMeal={defaultMeal}
          byok={byok}
          pantry={pantry}
          components={components}
          confirmLabel="Log it"
          onConfirm={handleConfirm}
          onCancel={() => setOpen(false)}
        />
      )}
    </>
  )
}

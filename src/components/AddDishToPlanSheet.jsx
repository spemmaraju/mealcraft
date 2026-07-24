import { useState } from 'react'
import { REFRESH_DAYS } from '../schema.js'
import ComponentPickerSheet from './ComponentPickerSheet.jsx'

// Round 4 ("lightweight plan editing"): "Add dish to plan" without the AI
// round trip. Two steps in one sheet-owning component — pick a component
// (reuses ComponentPickerSheet as-is), then pick which of the 5 Mon-Fri
// assembly days it lands on. Nothing is written until Add — the caller
// (PlanScreen) owns creating an emptyWeek() first if none exists yet and
// applying weekOps.addComponentToPlan.
export default function AddDishToPlanSheet({ components, onConfirm, onClose }) {
  const [componentId, setComponentId] = useState(null)
  const [days, setDays] = useState([])

  if (!componentId) {
    return <ComponentPickerSheet components={components} excludeIds={[]} onPick={setComponentId} onClose={onClose} />
  }

  const component = components.find((c) => c.id === componentId)

  function toggleDay(day) {
    setDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]))
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>Add to which day(s)?</h2>
        <p>
          <strong>{component ? component.name : componentId}</strong>
        </p>

        <div className="library-filters__chips picker-sheet__chips">
          {REFRESH_DAYS.map((day) => (
            <button
              key={day}
              type="button"
              className={`chip${days.includes(day) ? ' chip--active' : ''}`}
              onClick={() => toggleDay(day)}
            >
              {day}
            </button>
          ))}
        </div>

        <div className="button-row">
          <button type="button" className="btn" onClick={() => setComponentId(null)}>
            ← Change dish
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={days.length === 0}
            onClick={() => onConfirm(componentId, days)}
          >
            Add to plan
          </button>
        </div>
        <div className="button-row">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

import { useState } from 'react'
import ComponentPickerSheet from './ComponentPickerSheet.jsx'
import SlotPicker from './SlotPicker.jsx'

// "＋ Add saved dish" (Phase P1): pick a component (reuses ComponentPickerSheet
// as-is), then pick which upcoming meal slots it lands on — any
// number >= 1, no exact-count rule (PrepSheet's step 2 is the one with an
// exact-N requirement, since it's splitting one freshly-cooked batch).
// Nothing is written until Add — the caller (PlanScreen) owns
// planOps.addItemsToSlot for each picked slot.
export default function AddDishToPlanSheet({ components, pantry, planSlots, upcoming, onConfirm, onClose }) {
  const [componentId, setComponentId] = useState(null)
  const [selected, setSelected] = useState([])

  if (!componentId) {
    return <ComponentPickerSheet components={components} excludeIds={[]} onPick={setComponentId} onClose={onClose} />
  }

  const component = components.find((c) => c.id === componentId)

  function toggleSlot(date, meal) {
    const key = `${date}|${meal}`
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
  }

  function handleConfirm() {
    const pickedSlots = selected.map((key) => {
      const [date, meal] = key.split('|')
      return { date, meal }
    })
    onConfirm(componentId, pickedSlots)
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>Add to which meal(s)?</h2>
        <p>
          <strong>{component ? component.name : componentId}</strong>
        </p>

        <SlotPicker upcoming={upcoming} planSlots={planSlots} components={components} pantry={pantry} selected={selected} onToggle={toggleSlot} />

        <div className="button-row">
          <button type="button" className="btn" onClick={() => setComponentId(null)}>
            ← Change dish
          </button>
          <button type="button" className="btn btn--primary" disabled={selected.length === 0} onClick={handleConfirm}>
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

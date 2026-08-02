import { useState } from 'react'
import { parseQty } from '../measures.js'
import { CloseIcon } from './Icons.jsx'

// Round C manual fallback: when a logged pantry/adhoc item's measure can't
// convert (MealSection's itemMeasureWarning), and that measure IS
// volume-based (measures.js volumeUnitOfMeasure), the user can teach the
// conversion once instead of being stuck. A single "1 {unit} = N g" anchor
// is enough — measures.js's volume-bridging path (d) then resolves every
// OTHER volume unit (tbsp/tsp/ml/...) for this item too, not just the one
// taught. Deliberately narrow: only ever emits one naturalUnits entry, never
// touches servingDesc/perServing (CLAUDE.md §3 — nutrition provenance stays
// honest, this just adds a conversion anchor).
export default function TeachMeasureSheet({ name, unit, onTeach, onClose }) {
  const [gramsText, setGramsText] = useState('')

  const grams = parseQty(gramsText.trim())
  const canSave = grams != null && grams > 0

  function handleSave() {
    if (!canSave) return
    onTeach({ label: `1 ${unit}`, gramsOrFraction: grams })
    onClose()
  }

  return (
    <div className="sheet-backdrop sheet-backdrop--stacked" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <button type="button" className="sheet-head__close" onClick={onClose} aria-label="Close">
            <CloseIcon size={16} />
          </button>
          <h2 className="sheet-head__title">Teach "{name}"</h2>
        </div>

        <div className="field">
          <span>1 {unit} =</span>
          <div className="button-row" style={{ alignItems: 'center' }}>
            <input
              type="text"
              inputMode="decimal"
              value={gramsText}
              onChange={(e) => setGramsText(e.target.value)}
              placeholder="grams"
              autoFocus
            />
            <span>g</span>
          </div>
        </div>

        <div className="button-row">
          <button type="button" className="btn btn--primary" onClick={handleSave} disabled={!canSave}>
            Save
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

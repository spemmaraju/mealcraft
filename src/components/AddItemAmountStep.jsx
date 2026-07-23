import { useState } from 'react'
import MeasureInput from './MeasureInput.jsx'

// Shared "how much" step for every AddLogItemSheet pick except the two
// one-tap fast paths (today's plan, recent re-add) — CLAUDE.md Round 2 spec
// point 2. Fixes the baseline complaint that online search's "Log it"
// silently logged 1 serving, requiring a post-hoc edit: pantry, common
// foods, my dishes, online search, and barcode scan all land here before
// anything is actually logged. kind:'component' keeps LogEntry's
// count-servings stepper semantics; pantry/adhoc reuse MeasureInput,
// unit-restricted via `nutrition` (measures.js resolvableUnitsFor). Renders
// as its own stacked sheet, same convention as BarcodeScanner/
// NutritionInfoEditor layering over an already-open sheet.
export default function AddItemAmountStep({ name, kind, nutrition, initialMeasure, initialCount, onConfirm, onCancel }) {
  const [measure, setMeasure] = useState(initialMeasure ?? '1 serving')
  const [count, setCount] = useState(initialCount ?? 1)

  function handleAdd() {
    onConfirm(kind === 'component' ? { count } : { measure: measure.trim() || '1 serving' })
  }

  return (
    <div className="sheet-backdrop sheet-backdrop--stacked" onClick={onCancel}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>{name}</h2>
        <div className="field">
          <span>Amount</span>
          {kind === 'component' ? (
            <div className="stepper">
              <button type="button" className="stepper__btn" onClick={() => setCount((c) => Math.max(0.5, c - 0.5))}>
                −
              </button>
              <span className="stepper__value">{count}</span>
              <button type="button" className="stepper__btn" onClick={() => setCount((c) => c + 0.5)}>
                +
              </button>
            </div>
          ) : (
            <MeasureInput value={measure} onChange={setMeasure} nutrition={nutrition} autoFocus />
          )}
        </div>
        <div className="button-row">
          <button type="button" className="btn btn--primary" onClick={handleAdd}>
            Add
          </button>
          <button type="button" className="btn" onClick={onCancel}>
            Back
          </button>
        </div>
      </div>
    </div>
  )
}

import { useState } from 'react'
import MeasureInput from './MeasureInput.jsx'
import { defaultMeasureFor, measureToServings } from '../measures.js'

function round(n) {
  return Math.round(n)
}

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
//
// Round 6: a live "≈ kcal · protein" preview updates as the stepper/measure
// changes, plus (pantry/adhoc) an always-visible "1 serving = {servingDesc}"
// line — the pairing that makes "serving" a legible logging unit again (see
// measures.js's defaultMeasureFor doc comment). Never fakes a number: a
// component with no macrosPerServing shows nothing, and a measure that can't
// convert shows a quiet "can't estimate" line instead of a guess.
export default function AddItemAmountStep({ name, kind, nutrition, macros, initialMeasure, initialCount, onConfirm, onCancel }) {
  const [measure, setMeasure] = useState(initialMeasure ?? defaultMeasureFor(nutrition))
  const [count, setCount] = useState(initialCount ?? 1)

  function handleAdd() {
    onConfirm(kind === 'component' ? { count } : { measure: measure.trim() || defaultMeasureFor(nutrition) || '1 serving' })
  }

  let preview = null
  let unresolvable = false
  if (kind === 'component') {
    if (macros) preview = { kcal: count * macros.kcal, protein_g: count * macros.protein_g }
  } else if (nutrition) {
    const servings = measureToServings(measure, nutrition)
    if (servings != null) preview = { kcal: servings * nutrition.perServing.kcal, protein_g: servings * nutrition.perServing.protein_g }
    else unresolvable = true
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
          {preview && (
            <p className="field-caption">
              ≈ {round(preview.kcal)} kcal · {round(preview.protein_g)} g protein
            </p>
          )}
          {unresolvable && <p className="field-caption">can't estimate for this measure</p>}
          {kind !== 'component' && nutrition && <p className="field-caption">1 serving = {nutrition.servingDesc}</p>}
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

import { useState } from 'react'
import * as trackOps from '../trackOps.js'
import { defaultMeasureFor } from '../measures.js'
import ProvenanceTag from './ProvenanceTag.jsx'
import MeasureInput from './MeasureInput.jsx'
import SlotPicker from './SlotPicker.jsx'

function round1(n) {
  return Math.round(n * 10) / 10
}

// Sums itemMacros across every CHECKED row via the same synthetic-pantry-item
// shape trackOps.itemMacros already understands — no faked precision: a row
// that can't resolve (no nutrition, or an unconvertible measure) just isn't
// counted, same rule as everywhere else macros are summed.
function computeTotals(rows, components, pantry) {
  const totals = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  let resolvedCount = 0
  for (const row of rows) {
    if (!row.checked) continue
    const macro = trackOps.itemMacros({ kind: 'pantry', pantryId: row.pantryId, measure: row.measure }, components, pantry)
    if (!macro) continue
    resolvedCount += 1
    totals.kcal += macro.kcal
    totals.protein_g += macro.protein_g
    totals.carbs_g += macro.carbs_g
    totals.fat_g += macro.fat_g
  }
  return { totals, resolvedCount }
}

function rowStatusText(pantryItem, macro) {
  if (!pantryItem?.nutrition) return 'no nutrition'
  if (!macro) return "couldn't convert measure"
  return `${Math.round(macro.kcal)} kcal`
}

/**
 * "＋ Prep a dish" (Phase P1's core new flow): pick ingredients from the
 * pantry, see live per-meal macros, then split the resulting dish across N
 * of the upcoming meal slots (lunch/dinner, next 4 days). Nothing is
 * written until step 2's Confirm —
 * PlanScreen owns creating the Component, updating planSlots, and adding any
 * off-hand ingredients to the advisory grocery list.
 */
export default function PrepSheet({ pantry, components, planSlots, upcoming, onConfirm, onClose }) {
  const [step, setStep] = useState(1)
  const [name, setName] = useState('')
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState([])
  const [servings, setServings] = useState(3)
  const [selectedSlots, setSelectedSlots] = useState([])

  const { totals, resolvedCount } = computeTotals(rows, components, pantry)

  const results = search.trim()
    ? [...pantry]
        .filter((p) => !rows.some((r) => r.pantryId === p.id) && p.name.toLowerCase().includes(search.trim().toLowerCase()))
        .sort((a, b) => (b.onHand ? 1 : 0) - (a.onHand ? 1 : 0))
        .slice(0, 8)
    : []

  function addRow(item) {
    setRows((prev) => [
      ...prev,
      { pantryId: item.id, name: item.name, checked: true, measure: item.nutrition ? defaultMeasureFor(item.nutrition) : '' },
    ])
    setSearch('')
  }
  function toggleRow(index) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, checked: !r.checked } : r)))
  }
  function setRowMeasure(index, measure) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, measure } : r)))
  }
  function removeRow(index) {
    setRows((prev) => prev.filter((_, i) => i !== index))
  }

  // Preselects the first N upcoming slots that have no items yet, computed
  // once (at the moment N is locked in) rather than kept live — the user can
  // still hand-pick past it on step 2.
  function goToStep2() {
    const empty = upcoming
      .filter(({ date, meal }) => {
        const existing = planSlots.find((s) => s.date === date && s.meal === meal)
        return !existing || existing.items.length === 0
      })
      .slice(0, servings)
      .map(({ date, meal }) => `${date}|${meal}`)
    setSelectedSlots(empty)
    setStep(2)
  }

  function toggleSlot(date, meal) {
    const key = `${date}|${meal}`
    setSelectedSlots((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
  }

  function handleConfirm() {
    const checkedRows = rows.filter((r) => r.checked)
    const ingredients = checkedRows.map((r) => ({ name: r.name, measure: r.measure }))
    const macrosPerServing =
      resolvedCount > 0
        ? {
            kcal: round1(totals.kcal / servings),
            protein_g: round1(totals.protein_g / servings),
            carbs_g: round1(totals.carbs_g / servings),
            fat_g: round1(totals.fat_g / servings),
          }
        : null
    const offHandIngredients = checkedRows
      .filter((r) => pantry.find((p) => p.id === r.pantryId)?.onHand === false)
      .map((r) => ({ name: r.name }))
    const pickedSlots = selectedSlots.map((key) => {
      const [date, meal] = key.split('|')
      return { date, meal }
    })
    onConfirm({ name: name.trim(), ingredients, macrosPerServing, servings, offHandIngredients, pickedSlots })
  }

  if (step === 2) {
    return (
      <div className="sheet-backdrop" onClick={onClose}>
        <div className="sheet" onClick={(e) => e.stopPropagation()}>
          <h2>Add {name.trim() || 'this dish'} to which meals?</h2>
          <p className="placeholder">
            {selectedSlots.length} of {servings} picked
          </p>
          <SlotPicker upcoming={upcoming} planSlots={planSlots} components={components} pantry={pantry} selected={selectedSlots} onToggle={toggleSlot} />
          <div className="button-row">
            <button type="button" className="btn" onClick={() => setStep(1)}>
              ← Back
            </button>
            <button type="button" className="btn btn--primary" disabled={selectedSlots.length !== servings} onClick={handleConfirm}>
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

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>Prep a dish</h2>

        <div className="field">
          <label htmlFor="prep-name">Dish name</label>
          <input id="prep-name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Chickpea curry" autoFocus />
        </div>

        <div className="field">
          <label htmlFor="prep-search">Ingredients from pantry</label>
          <input id="prep-search" type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search pantry…" />
        </div>
        {results.length > 0 && (
          <div className="picker-sheet__list">
            {results.map((item) => (
              <button key={item.id} type="button" className="picker-sheet__row" onClick={() => addRow(item)}>
                <span className="picker-sheet__name">{item.name}</span>
                {item.onHand && <span className="component-row__badge">on hand</span>}
              </button>
            ))}
          </div>
        )}

        {rows.map((row, index) => {
          const pantryItem = pantry.find((p) => p.id === row.pantryId)
          const macro = trackOps.itemMacros({ kind: 'pantry', pantryId: row.pantryId, measure: row.measure }, components, pantry)
          return (
            <div key={row.pantryId} className="prep-ingredient-row">
              <input type="checkbox" checked={row.checked} onChange={() => toggleRow(index)} aria-label={`Include ${row.name}`} />
              <div className="prep-ingredient-row__body">
                <div className="prep-ingredient-row__name">
                  {row.name}
                  {pantryItem?.nutrition && <ProvenanceTag source={pantryItem.nutrition.source} tiny />}
                </div>
                <MeasureInput value={row.measure} onChange={(measure) => setRowMeasure(index, measure)} nutrition={pantryItem?.nutrition || null} />
                <span className={`prep-ingredient-row__kcal${!macro ? ' prep-ingredient-row__kcal--warn' : ''}`}>
                  {rowStatusText(pantryItem, macro)}
                </span>
              </div>
              <button type="button" className="itemrow__remove" onClick={() => removeRow(index)} aria-label={`Remove ${row.name}`}>
                ✕
              </button>
            </div>
          )
        })}

        <div className="field">
          <label>Covers meals</label>
          <div className="stepper">
            <button type="button" className="stepper__btn" onClick={() => setServings((s) => Math.max(1, s - 1))}>
              −
            </button>
            <span className="stepper__value">{servings}</span>
            <button type="button" className="stepper__btn" onClick={() => setServings((s) => Math.min(6, s + 1))}>
              +
            </button>
          </div>
        </div>

        <div className="prep-summary">
          <div className="prep-summary__hero">
            <span className="prep-summary__kcal">{resolvedCount > 0 ? Math.round(totals.kcal / servings) : '—'}</span>
            <span>kcal / meal</span>
          </div>
          <p className="prep-summary__macros">
            {resolvedCount > 0
              ? `${round1(totals.protein_g / servings)}g protein · ${round1(totals.carbs_g / servings)}g carbs · ${round1(totals.fat_g / servings)}g fat`
              : 'Add ingredients with nutrition to see macros.'}
          </p>
          <p className="prep-summary__batch">Whole batch: {Math.round(totals.kcal)} kcal</p>
        </div>

        <div className="button-row">
          <button type="button" className="btn btn--primary" disabled={!name.trim()} onClick={goToStep2}>
            Continue
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

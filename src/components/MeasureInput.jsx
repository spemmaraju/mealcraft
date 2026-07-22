import { useState } from 'react'
import { parseMeasure } from '../measures.js'

// CLAUDE.md §5: measures stay free text at the schema level. This is a UI
// affordance only — it composes/decomposes canonical strings ("1.5 cup",
// "200 g", "2 piece") and falls back to a raw text input (custom mode) for
// anything it can't parse ("handful", "a splash", "to taste", "1/3 cup
// drained"). Selecting a real unit while in custom mode switches back.
const UNIT_OPTIONS = ['g', 'kg', 'ml', 'tsp', 'tbsp', 'cup', 'fl oz', 'piece', 'serving']

function unitFromTokens(tokens) {
  const joined = tokens.join(' ')
  return UNIT_OPTIONS.includes(joined) ? joined : null
}

const FRACTION_DISPLAY = [
  [1 / 8, '1/8'],
  [1 / 4, '1/4'],
  [1 / 3, '1/3'],
  [3 / 8, '3/8'],
  [1 / 2, '1/2'],
  [5 / 8, '5/8'],
  [2 / 3, '2/3'],
  [3 / 4, '3/4'],
  [7 / 8, '7/8'],
]

function formatQty(qty) {
  if (Number.isInteger(qty)) return String(qty)
  const whole = Math.floor(qty)
  const frac = qty - whole
  const match = FRACTION_DISPLAY.find(([v]) => Math.abs(v - frac) < 0.001)
  if (match) return whole > 0 ? `${whole} ${match[1]}` : match[1]
  return String(Math.round(qty * 100) / 100)
}

function deriveInitial(value) {
  const raw = typeof value === 'string' ? value : ''
  if (!raw.trim()) return { mode: 'structured', qtyText: '', unit: UNIT_OPTIONS[0], custom: '' }
  const { qty, unitTokens } = parseMeasure(raw)
  const unit = unitFromTokens(unitTokens)
  if (qty != null && unit) return { mode: 'structured', qtyText: formatQty(qty), unit, custom: raw }
  return { mode: 'custom', qtyText: '', unit: UNIT_OPTIONS[0], custom: raw }
}

/** @param {{value: string, onChange: (v: string) => void, placeholder?: string}} props */
export default function MeasureInput({ value, onChange, placeholder }) {
  const [state, setState] = useState(() => deriveInitial(value))

  function handleQtyChange(e) {
    const qtyText = e.target.value
    setState((s) => ({ ...s, qtyText }))
    onChange(`${qtyText} ${state.unit}`.trim())
  }

  function handleUnitChange(e) {
    const next = e.target.value
    if (next === 'custom') {
      const composed = state.mode === 'structured' ? `${state.qtyText} ${state.unit}`.trim() : state.custom
      setState((s) => ({ ...s, mode: 'custom', custom: composed }))
      onChange(composed)
      return
    }
    const qtyText = state.qtyText || '1'
    setState((s) => ({ ...s, mode: 'structured', qtyText, unit: next }))
    onChange(`${qtyText} ${next}`.trim())
  }

  function handleCustomChange(e) {
    const custom = e.target.value
    setState((s) => ({ ...s, custom }))
    onChange(custom)
  }

  const unitSelect = (
    <select className="measure-input__unit" value={state.mode === 'custom' ? 'custom' : state.unit} onChange={handleUnitChange}>
      {state.mode !== 'custom' &&
        UNIT_OPTIONS.map((u) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
      {state.mode === 'custom' && (
        <>
          <option value="custom">custom…</option>
          {UNIT_OPTIONS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </>
      )}
    </select>
  )

  if (state.mode === 'custom') {
    return (
      <div className="measure-input">
        <input
          type="text"
          className="ingredient-list__measure measure-input__custom"
          value={state.custom}
          onChange={handleCustomChange}
          placeholder={placeholder || 'Measure (e.g. 1/3 cup)'}
        />
        {unitSelect}
      </div>
    )
  }

  return (
    <div className="measure-input">
      <input
        type="text"
        inputMode="decimal"
        className="measure-input__qty"
        value={state.qtyText}
        onChange={handleQtyChange}
        placeholder="qty"
      />
      {unitSelect}
    </div>
  )
}

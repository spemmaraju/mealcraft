import { useState } from 'react'
import { parseMeasure, measureToServings, qtyForUnit, resolvableUnitsFor } from '../measures.js'

// CLAUDE.md §5: measures stay free text at the schema level. This is a UI
// affordance only — it composes/decomposes canonical strings ("1.5 cup",
// "200 g", "2 piece") and falls back to a raw text input (custom mode) for
// anything it can't parse ("handful", "a splash", "to taste", "1/3 cup
// drained"). Selecting a real unit while in custom mode switches back.
//
// When a `nutrition` object is passed (logged pantry/adhoc items — Round 1
// fixes #3/#4), the unit dropdown is restricted to units that item can
// actually resolve, and switching units rescales the quantity so the
// represented amount (and its macro contribution) stays constant instead of
// silently changing. A stored measure this item can't resolve still shows
// (safety net for legacy data) but as a visible inline warning rather than
// silently dropping out of the macro totals elsewhere in the UI.
const UNIT_OPTIONS = ['g', 'kg', 'ml', 'tsp', 'tbsp', 'cup', 'fl oz', 'piece', 'serving']

function unitFromTokens(tokens, allowed) {
  const joined = tokens.join(' ')
  return allowed.includes(joined) ? joined : null
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

function deriveInitial(value, allowedUnits) {
  const raw = typeof value === 'string' ? value : ''
  const optionPool = allowedUnits ? allowedUnits.scalar : UNIT_OPTIONS
  const defaultUnit = optionPool[0] || 'serving'

  if (!raw.trim()) return { mode: 'structured', qtyText: '', unit: defaultUnit, custom: '', isPhrase: false }

  if (allowedUnits && allowedUnits.phrases.includes(raw.trim())) {
    return { mode: 'structured', qtyText: '', unit: raw.trim(), custom: raw, isPhrase: true }
  }

  const { qty, unitTokens } = parseMeasure(raw)
  const unit = unitFromTokens(unitTokens, optionPool)
  if (qty != null && unit) return { mode: 'structured', qtyText: formatQty(qty), unit, custom: raw, isPhrase: false }
  return { mode: 'custom', qtyText: '', unit: defaultUnit, custom: raw, isPhrase: false }
}

function composedValue(state) {
  if (state.mode !== 'structured') return state.custom
  if (state.isPhrase) return state.unit
  return `${state.qtyText} ${state.unit}`.trim()
}

/** @param {{value: string, onChange: (v: string) => void, placeholder?: string, nutrition?: object|null}} props */
export default function MeasureInput({ value, onChange, placeholder, nutrition }) {
  const allowedUnits = nutrition ? resolvableUnitsFor(nutrition) : null
  const [state, setState] = useState(() => deriveInitial(value, allowedUnits))

  function handleQtyChange(e) {
    const qtyText = e.target.value
    setState((s) => ({ ...s, qtyText }))
    onChange(`${qtyText} ${state.unit}`.trim())
  }

  function handleUnitChange(e) {
    const next = e.target.value

    if (next === 'custom') {
      const composed = composedValue(state)
      setState((s) => ({ ...s, mode: 'custom', custom: composed }))
      onChange(composed)
      return
    }

    if (allowedUnits) {
      if (allowedUnits.phrases.includes(next)) {
        setState({ mode: 'structured', qtyText: '', unit: next, custom: next, isPhrase: true })
        onChange(next)
        return
      }
      // Rescale (fix #3): preserve the represented amount, not the qty
      // digits, when switching units — "1 serving" (= 0.5 cup) switching to
      // "cup" becomes "0.5 cup", never a silently doubled "1 cup".
      const currentServings = measureToServings(composedValue(state), nutrition)
      const rescaledQty = currentServings != null ? qtyForUnit(currentServings, next, nutrition) : null
      const qtyText = rescaledQty != null ? formatQty(rescaledQty) : state.qtyText || '1'
      setState({ mode: 'structured', qtyText, unit: next, custom: `${qtyText} ${next}`.trim(), isPhrase: false })
      onChange(`${qtyText} ${next}`.trim())
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

  const optionPool = allowedUnits ? [...allowedUnits.scalar, ...allowedUnits.phrases] : UNIT_OPTIONS

  const unitSelect = (
    <select className="measure-input__unit" value={state.mode === 'custom' ? 'custom' : state.unit} onChange={handleUnitChange}>
      {state.mode !== 'custom' &&
        optionPool.map((u) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
      {state.mode === 'custom' && (
        <>
          <option value="custom">custom…</option>
          {optionPool.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </>
      )}
    </select>
  )

  if (state.mode === 'custom') {
    const { unitTokens } = parseMeasure(state.custom)
    const failedUnit = unitTokens.length ? unitTokens.join(' ') : state.custom.trim()
    return (
      <div className="measure-input">
        <div className="measure-input__custom-wrap">
          <input
            type="text"
            className="ingredient-list__measure measure-input__custom"
            value={state.custom}
            onChange={handleCustomChange}
            placeholder={placeholder || 'Measure (e.g. 1/3 cup)'}
          />
          {nutrition && failedUnit && (
            <p className="inline-warning">couldn't convert "{failedUnit}" — pick g or serving</p>
          )}
        </div>
        {unitSelect}
      </div>
    )
  }

  return (
    <div className="measure-input">
      {state.isPhrase ? (
        <span className="measure-input__phrase">{state.unit}</span>
      ) : (
        <input
          type="text"
          inputMode="decimal"
          className="measure-input__qty"
          value={state.qtyText}
          onChange={handleQtyChange}
          onFocus={(e) => e.target.select()}
          placeholder="qty"
        />
      )}
      {unitSelect}
    </div>
  )
}

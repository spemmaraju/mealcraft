import { useEffect, useRef, useState } from 'react'
import { parseMeasure, measureToServings, qtyForUnit, resolvableUnitsFor, stripLeadingQty, matchPhrase, matchScalarUnit, formatQty } from '../measures.js'

// CLAUDE.md §5: measures stay free text at the schema level. This is a UI
// affordance only — it composes/decomposes canonical strings ("1.5 cup",
// "200 g", "2 piece") and falls back to a raw text input (custom mode) for
// anything it can't parse ("handful", "a splash", "to taste").
//
// When a `nutrition` object is passed (logged pantry/adhoc items — Round 1
// fixes #3/#4), the unit dropdown is restricted to units that item can
// actually resolve, and switching units rescales the quantity so the
// represented amount (and its macro contribution) stays constant instead of
// silently changing. A stored measure this item can't resolve still shows
// (safety net for legacy data) but as a visible inline warning rather than
// silently dropping out of the macro totals elsewhere in the UI.
//
// Round 2 hot-fix #3: a naturalUnits phrase ("1 cup chopped", "half block")
// used to be offered as a single fixed, non-scalable unit (§5 violation —
// no unit should be locked to exactly 1x). Phrases are now just another
// scalable unit: the qty box stays visible, `unit` holds the phrase's own
// label (so the dropdown selection matches), and the composed/emitted
// measure is "<qty> <phrase tail>" (e.g. "1/4 cup chopped"), which
// measureToServings already resolves via its scaledUnit path.
// Free-text ingredient measures (no `nutrition` prop — e.g. recipe
// ingredients in IngredientListEditor) keep kg/fl oz in the picker and an
// exact (non-descriptor-tolerant) unit match: CLAUDE.md §5 says free-text
// measures are never restructured, so "1 cup chopped onions" must stay
// exactly that, not get quietly reduced to "1 cup". The tolerant match
// (measures.js matchScalarUnit) is only used on the nutrition-aware path
// below, where the descriptor really is safe to drop (the scalar unit
// already covers the same honest math — see resolvableUnitsFor).
const UNIT_OPTIONS = ['g', 'kg', 'ml', 'tsp', 'tbsp', 'cup', 'fl oz', 'piece', 'serving']

function unitFromTokens(tokens, allowed) {
  const joined = tokens.join(' ')
  return allowed.includes(joined) ? joined : null
}

/** unit text to compose into the emitted measure string: the phrase's own tail when isPhraseUnit, else the plain unit token as-is. */
function unitTextFor(state) {
  return state.isPhraseUnit ? stripLeadingQty(state.unit) : state.unit
}

function deriveInitial(value, allowedUnits) {
  const raw = typeof value === 'string' ? value : ''
  const optionPool = allowedUnits ? allowedUnits.scalar : UNIT_OPTIONS
  const defaultUnit = optionPool[0] || 'serving'

  if (!raw.trim()) return { mode: 'structured', qtyText: '', unit: defaultUnit, custom: '', isPhraseUnit: false }

  if (allowedUnits) {
    const phrase = matchPhrase(raw, allowedUnits.phrases)
    if (phrase) return { mode: 'structured', qtyText: formatQty(phrase.qty), unit: phrase.label, custom: raw, isPhraseUnit: true }
    // Round 3.5: a stored/legacy measure whose naturalUnits phrase is no
    // longer offered directly (hidden by resolvableUnitsFor because a
    // scalar unit now covers it, e.g. "1 cup chopped") still round-trips —
    // just as the scalar unit ("cup") + qty it's honestly equivalent to,
    // instead of falling through to an unnecessary custom/warning state.
    const scalarHit = matchScalarUnit(raw, allowedUnits.scalar)
    if (scalarHit) return { mode: 'structured', qtyText: formatQty(scalarHit.qty), unit: scalarHit.unit, custom: raw, isPhraseUnit: false }
    return { mode: 'custom', qtyText: '', unit: defaultUnit, custom: raw, isPhraseUnit: false }
  }

  const { qty, unitTokens } = parseMeasure(raw)
  const unit = unitFromTokens(unitTokens, optionPool)
  if (qty != null && unit) return { mode: 'structured', qtyText: formatQty(qty), unit, custom: raw, isPhraseUnit: false }
  return { mode: 'custom', qtyText: '', unit: defaultUnit, custom: raw, isPhraseUnit: false }
}

function composedValue(state) {
  if (state.mode !== 'structured') return state.custom
  return `${state.qtyText} ${unitTextFor(state)}`.trim()
}

/** @param {{value: string, onChange: (v: string) => void, placeholder?: string, nutrition?: object|null, autoFocus?: boolean}} props */
export default function MeasureInput({ value, onChange, placeholder, nutrition, autoFocus = false }) {
  const allowedUnits = nutrition ? resolvableUnitsFor(nutrition) : null
  const [state, setState] = useState(() => deriveInitial(value, allowedUnits))
  const qtyRef = useRef(null)

  // Round 2 hot-fix #2: focus+select together, in the same effect, rather
  // than relying on the native `autoFocus` attribute racing a separate
  // `onFocus` handler — the two firing out of order let a keystroke land
  // before the value was selected (typing "50" into a pre-filled "1" gave
  // "150" instead of replacing it). Runs once on mount; later manual
  // (re-)focuses are still handled by the onFocus handler below.
  useEffect(() => {
    if (autoFocus && qtyRef.current) {
      qtyRef.current.focus()
      qtyRef.current.select()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleQtyChange(e) {
    const qtyText = e.target.value
    setState((s) => ({ ...s, qtyText }))
    onChange(`${qtyText} ${unitTextFor(state)}`.trim())
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
      const nextIsPhrase = allowedUnits.phrases.includes(next)
      // Rescale (fix #3 from Round 1, extended to phrases): preserve the
      // represented amount, not the qty digits, when switching units —
      // "1 serving" (= 0.5 cup) switching to "cup" becomes "0.5 cup", never
      // a silently doubled "1 cup". A phrase unit rescales the same way:
      // qtyForUnit treats the whole phrase label as "one unit".
      const currentServings = measureToServings(composedValue(state), nutrition)
      const rescaledQty = currentServings != null ? qtyForUnit(currentServings, next, nutrition) : null
      let qtyText
      if (rescaledQty != null) qtyText = formatQty(rescaledQty)
      else if (nextIsPhrase) qtyText = formatQty(parseMeasure(next).qty ?? 1)
      else qtyText = state.qtyText || '1'
      const nextState = { mode: 'structured', qtyText, unit: next, isPhraseUnit: nextIsPhrase }
      setState({ ...nextState, custom: `${qtyText} ${unitTextFor(nextState)}`.trim() })
      onChange(`${qtyText} ${unitTextFor(nextState)}`.trim())
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
    // Round 3.5: "custom mode" no longer implies "unconvertible" — kg/fl oz
    // (still valid via free text, just not in the picker) and other
    // measures the picker doesn't happen to recognize can still resolve via
    // measureToServings. Only show the warning when it genuinely can't.
    const trulyUnresolvable = nutrition ? measureToServings(state.custom, nutrition) == null : false
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
          {nutrition && failedUnit && trulyUnresolvable && (
            <p className="inline-warning">couldn't convert "{failedUnit}" — pick g or serving</p>
          )}
        </div>
        {unitSelect}
      </div>
    )
  }

  return (
    <div className="measure-input">
      <input
        ref={qtyRef}
        type="text"
        inputMode="decimal"
        className="measure-input__qty"
        value={state.qtyText}
        onChange={handleQtyChange}
        onFocus={(e) => e.target.select()}
        onMouseUp={(e) => {
          // Round 2 hot-fix #2 (part 2): clicking into a field that's
          // ALREADY focused (e.g. the user tapped it again after switching
          // units) fires no new "focus" event at all, so onFocus's
          // select() never re-runs — the click just repositions the
          // caret, and the next keystroke inserts there instead of
          // replacing the prefilled value. preventDefault stops the
          // browser's default caret-placement-on-mouseup so select() wins
          // regardless of whether this click is a first focus or a
          // click-while-already-focused.
          e.preventDefault()
          e.target.select()
        }}
        placeholder="qty"
      />
      {unitSelect}
    </div>
  )
}

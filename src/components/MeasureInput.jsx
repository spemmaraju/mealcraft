import { useEffect, useRef, useState } from 'react'
import { parseMeasure, measureToServings, qtyForUnit, resolvableUnitsFor, stripLeadingQty, matchPhrase, matchScalarUnit, formatQty, formatQtyForUnit, METRIC_UNITS } from '../measures.js'

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
// Round 4.5: 'serving' removed from both pickers — meaningless without
// knowing the serving size. Stored "N serving" measures still parse
// (measures.js keeps the conversion path) and are re-expressed as the first
// real unit on load (deriveInitial below).
const UNIT_OPTIONS = ['g', 'kg', 'ml', 'tsp', 'tbsp', 'cup', 'fl oz', 'piece']

// Quick-fraction chips shown above the qty box while it's focused: the iOS
// decimal keypad has no "/" key, so fractions were untypable there. Tapping
// a chip replaces the qty (or appends to a plain whole number: "1" + ½ ->
// "1 1/2"); parseQty already understands the emitted ascii form.
const FRACTION_CHIPS = [
  ['¼', '1/4'],
  ['⅓', '1/3'],
  ['½', '1/2'],
  ['⅔', '2/3'],
  ['¾', '3/4'],
]

// METRIC_UNITS lives in measures.js (shared with formatQtyForUnit) — metric
// units are always typed as decimals (nobody measures "1/3 kg" of anything),
// and the fracbar exists solely to work around the iOS decimal keypad
// missing a "/" key for kitchen units like cup/tbsp/piece, so it's
// meaningless (and clutters the qty box) for g/kg/ml.

/** Whether the currently-selected unit is one kitchen fractions make sense for. */
function isFractionFriendlyUnit(state) {
  return state.isPhraseUnit || !METRIC_UNITS.has(state.unit)
}

function unitFromTokens(tokens, allowed) {
  const joined = tokens.join(' ')
  return allowed.includes(joined) ? joined : null
}

/** unit text to compose into the emitted measure string: the phrase's own tail when isPhraseUnit, else the plain unit token as-is. */
function unitTextFor(state) {
  return state.isPhraseUnit ? stripLeadingQty(state.unit) : state.unit
}

function deriveInitial(value, allowedUnits, nutrition) {
  const raw = typeof value === 'string' ? value : ''
  const optionPool = allowedUnits ? allowedUnits.scalar : UNIT_OPTIONS
  const defaultUnit = optionPool[0] || 'g'

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
    if (scalarHit) return { mode: 'structured', qtyText: formatQtyForUnit(scalarHit.qty, scalarHit.unit), unit: scalarHit.unit, custom: raw, isPhraseUnit: false }
    // Round 4.5: legacy/stored "N serving(s)" with 'serving' no longer
    // offered — re-express as the equivalent amount of the first offered
    // unit ("1 serving" -> "1/3 cup") instead of dropping to raw-text mode.
    const parsed = parseMeasure(raw)
    if (parsed.qty != null && /^servings?$/.test(parsed.unitTokens.join(' '))) {
      const unit = allowedUnits.scalar[0] || allowedUnits.phrases[0]
      const rescaled = unit ? qtyForUnit(parsed.qty, unit, nutrition) : null
      if (rescaled != null) {
        return { mode: 'structured', qtyText: formatQtyForUnit(rescaled, unit), unit, custom: raw, isPhraseUnit: allowedUnits.phrases.includes(unit) }
      }
    }
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
  const [state, setState] = useState(() => deriveInitial(value, allowedUnits, nutrition))
  const [qtyFocused, setQtyFocused] = useState(false)
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

  function applyFraction(frac) {
    const el = qtyRef.current
    const v = state.qtyText
    // Mirror typing semantics: if the whole value is selected (the
    // focus/select() behavior above), the chip replaces it; a plain whole
    // number gets the fraction appended ("1" + ½ -> "1 1/2"); anything else
    // (an existing fraction/decimal) is replaced.
    const allSelected = el != null && v.length > 0 && el.selectionStart === 0 && el.selectionEnd === v.length
    const trimmed = v.trim()
    const next = !trimmed || allSelected ? frac : /^\d+$/.test(trimmed) ? `${trimmed} ${frac}` : frac
    setState((s) => ({ ...s, qtyText: next }))
    onChange(`${next} ${unitTextFor(state)}`.trim())
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
      if (rescaledQty != null) qtyText = formatQtyForUnit(rescaledQty, next)
      else if (nextIsPhrase) qtyText = formatQtyForUnit(parseMeasure(next).qty ?? 1, next)
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
            <p className="inline-warning">couldn't convert "{failedUnit}" — try g</p>
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
        onFocus={(e) => {
          setQtyFocused(true)
          e.target.select()
        }}
        onBlur={() => setQtyFocused(false)}
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
      {qtyFocused && isFractionFriendlyUnit(state) && (
        // preventDefault on pointerdown keeps the qty input focused (no blur,
        // keyboard stays up, selection intact) so onClick still fires after.
        <div className="measure-input__fracbar" onPointerDown={(e) => e.preventDefault()}>
          {FRACTION_CHIPS.map(([glyph, ascii]) => (
            <button key={ascii} type="button" onClick={() => applyFraction(ascii)}>
              {glyph}
            </button>
          ))}
        </div>
      )}
      {unitSelect}
    </div>
  )
}

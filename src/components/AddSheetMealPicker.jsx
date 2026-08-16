import { useState } from 'react'
import { MEALS, MEAL_LABELS } from '../schema.js'

// Round 2.7 bugfix: the sheet header's "Add to {Meal} ▾" caret used to be
// decorative — this IS the real dropdown it opens, switching which meal
// AddLogItemSheet.onPick lands a commit in without closing/reopening the
// sheet (DayLog keeps one sheet instance mounted across the switch). Split
// out of AddLogItemSheet (Round 6) purely to stay under CLAUDE.md §4.7's
// ~300-line component budget — this owns nothing but its own open/closed
// toggle.
//
// No `onMealChange` → the target meal is fixed by the caller (Plan's
// per-slot "+ Add extra" — retargeting there could file items into a
// breakfast/snack slot the Plan screen never displays), so the header is a
// plain title instead of a picker.
export default function AddSheetMealPicker({ meal, label, onMealChange }) {
  const [pickerOpen, setPickerOpen] = useState(false)

  return (
    <div className="sheet-head__mealpicker">
      {onMealChange ? (
        <button
          type="button"
          className="sheet-head__title sheet-head__title--picker"
          onClick={() => setPickerOpen((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={pickerOpen}
        >
          Add to {label || 'log'} <span className="sheet-head__caret" aria-hidden="true">▾</span>
        </button>
      ) : (
        <span className="sheet-head__title">Add to {label || 'log'}</span>
      )}
      {onMealChange && pickerOpen && (
        <>
          {/* Covers just the sheet (its ancestor stops backdrop clicks) so
              tapping anywhere else closes the picker without also firing
              whatever's underneath. */}
          <div className="sheet-head__mealscrim" onClick={() => setPickerOpen(false)} />
          <div className="sheet-head__mealmenu" role="listbox" aria-label="Choose meal">
            {MEALS.map((m) => (
              <button
                key={m}
                type="button"
                role="option"
                aria-selected={m === meal}
                className={`sheet-head__mealoption${m === meal ? ' sheet-head__mealoption--active' : ''}`}
                onClick={() => {
                  onMealChange(m)
                  setPickerOpen(false)
                }}
              >
                {MEAL_LABELS[m]}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

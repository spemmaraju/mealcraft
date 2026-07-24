import { useState } from 'react'
import * as trackOps from '../trackOps.js'
import * as componentOps from '../componentOps.js'
import { CloseIcon } from './Icons.jsx'
import ProvenanceTag from './ProvenanceTag.jsx'

// Round 3 "Save as dish": a small confirm sheet over a ≥2-item logged meal.
// Name is editable (prefilled "{Meal} {date}"); the item list underneath is
// read-only preview, not an editor — componentOps.dishFromMeal does the
// actual build once the user confirms. No auto-prompt: this only opens when
// MealSection's "Save as dish" text action is tapped (CLAUDE.md — the app
// proposes, never forces).
export default function SaveAsDishSheet({ log, mealLabel, dateISO, components, pantry, onSave, onClose }) {
  const [name, setName] = useState(`${mealLabel} ${dateISO}`)

  const ingredients = componentOps.ingredientsFromMeal(log, components, pantry)
  const macros = trackOps.logMacros(log, components, pantry)
  const hasFullMacros = macros.missing === 0

  return (
    <div className="sheet-backdrop sheet-backdrop--stacked" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <button type="button" className="sheet-head__close" onClick={onClose} aria-label="Close">
            <CloseIcon size={16} />
          </button>
          <h2 className="sheet-head__title">Save as dish</h2>
        </div>

        <label className="field">
          <span>Name</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>

        <div className="component-detail__section">
          <h2>Includes</h2>
          {ingredients.map((ing, i) => (
            <div className="component-detail__ingredient" key={i}>
              <span>{ing.name}</span>
              <span>{ing.measure}</span>
            </div>
          ))}
        </div>

        {hasFullMacros ? (
          <p className="meal-section__subtotal">
            {Math.round(macros.kcal)} kcal per serving <ProvenanceTag source="derived" tiny />
          </p>
        ) : (
          <p className="inline-warning">Some items couldn't be counted — macros left blank, not guessed.</p>
        )}

        <div className="button-row">
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => onSave(name.trim() || `${mealLabel} ${dateISO}`)}
            disabled={ingredients.length === 0}
          >
            Save dish
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

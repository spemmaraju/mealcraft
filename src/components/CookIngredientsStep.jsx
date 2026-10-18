import { useState } from 'react'
import { defaultMeasureFor } from '../measures.js'
import { cookMacros, rowForPantryItem, rowMacros } from '../cookOps.js'
import ProvenanceTag from './ProvenanceTag.jsx'
import MeasureInput from './MeasureInput.jsx'

const MAX_SERVINGS = 12

function rowStatusText(row, pantryItem, macro) {
  if (row.pantryId && !pantryItem?.nutrition) return 'no nutrition'
  if (!macro) return "couldn't convert measure"
  return `${Math.round(macro.kcal)} kcal`
}

/**
 * 🍳 Cook, step 1 (Phase 19; grew out of P1's "Prep a dish" step 1): the
 * ingredient list. Rows come from pantry search, from "✎ Describe
 * ingredients" (parser, cook mode — rows without a pantryId carry an AI
 * snapshot), or from a resumed draft. Macros are partial: rows that don't
 * resolve are shown and excluded, never guessed.
 */
export default function CookIngredientsStep({ name, rows, servings, pantry, components, onName, onRows, onServings, onDescribe, onSaveDraft, onDone, onClose }) {
  const [search, setSearch] = useState('')
  const { perServing, counted, total } = cookMacros(rows, servings, components, pantry)
  const results = search.trim()
    ? [...pantry]
        .filter((p) => !rows.some((r) => r.pantryId === p.id) && p.name.toLowerCase().includes(search.trim().toLowerCase()))
        .sort((a, b) => (b.onHand ? 1 : 0) - (a.onHand ? 1 : 0))
        .slice(0, 8)
    : []

  function update(index, patch) {
    onRows(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  return (
    <>
      <h2>🍳 Cook</h2>
      <div className="field">
        <label htmlFor="cook-name">Dish name</label>
        <input id="cook-name" type="text" value={name} onChange={(e) => onName(e.target.value)} placeholder="e.g. Dal tadka" />
      </div>

      <div className="button-row">
        <button type="button" className="btn" onClick={onDescribe}>
          ✎ Describe ingredients
        </button>
      </div>

      <div className="field">
        <label htmlFor="cook-search">Or add from pantry</label>
        <input id="cook-search" type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search pantry…" />
      </div>
      {results.length > 0 && (
        <div className="picker-sheet__list">
          {results.map((item) => (
            <button
              key={item.id}
              type="button"
              className="picker-sheet__row"
              onClick={() => {
                onRows([...rows, rowForPantryItem(item, item.nutrition ? defaultMeasureFor(item.nutrition) : '')])
                setSearch('')
              }}
            >
              <span className="picker-sheet__name">{item.name}</span>
              {item.onHand && <span className="component-row__badge">on hand</span>}
            </button>
          ))}
        </div>
      )}

      {rows.map((row, index) => {
        const pantryItem = row.pantryId ? pantry.find((p) => p.id === row.pantryId) : null
        const nutrition = pantryItem ? pantryItem.nutrition : row.nutrition
        const macro = rowMacros(row, components, pantry)
        return (
          <div key={row.key} className="prep-ingredient-row">
            <input type="checkbox" checked={row.checked} onChange={() => update(index, { checked: !row.checked })} aria-label={`Include ${row.name}`} />
            <div className="prep-ingredient-row__body">
              <div className="prep-ingredient-row__name">
                {row.name}
                {nutrition && <ProvenanceTag source={nutrition.source} tiny />}
              </div>
              <MeasureInput value={row.measure} onChange={(measure) => update(index, { measure })} nutrition={nutrition || null} />
              <span className={`prep-ingredient-row__kcal${!macro ? ' prep-ingredient-row__kcal--warn' : ''}`}>{rowStatusText(row, pantryItem, macro)}</span>
            </div>
            <button type="button" className="itemrow__remove" onClick={() => onRows(rows.filter((_, i) => i !== index))} aria-label={`Remove ${row.name}`}>
              ✕
            </button>
          </div>
        )
      })}

      <div className="field">
        <label>Makes</label>
        <div className="stepper">
          <button type="button" className="stepper__btn" onClick={() => onServings(Math.max(1, servings - 1))} aria-label="Fewer servings">
            −
          </button>
          <span className="stepper__value">{servings}</span>
          <button type="button" className="stepper__btn" onClick={() => onServings(Math.min(MAX_SERVINGS, servings + 1))} aria-label="More servings">
            +
          </button>
          <span className="field-caption">servings</span>
        </div>
      </div>

      <div className="prep-summary">
        <div className="prep-summary__hero">
          <span className="prep-summary__kcal">{perServing ? perServing.kcal : '—'}</span>
          <span>kcal / serving</span>
        </div>
        <p className="prep-summary__macros">
          {perServing ? `${perServing.protein_g}g protein · ${perServing.carbs_g}g carbs · ${perServing.fat_g}g fat` : 'Add ingredients with nutrition to see macros.'}
        </p>
        {total > 0 && counted < total && <p className="prep-summary__batch">Counted {counted} of {total} ingredients — the rest have no nutrition or amount we can convert.</p>}
      </div>

      <div className="button-row">
        <button type="button" className="btn btn--primary" disabled={!name.trim() || rows.length === 0} onClick={onDone}>
          Done cooking →
        </button>
        <button type="button" className="btn" disabled={!name.trim() && rows.length === 0} onClick={onSaveDraft}>
          Save draft
        </button>
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
      </div>
    </>
  )
}

import { useState } from 'react'
import ProvenanceTag from './ProvenanceTag.jsx'
import NutritionInfoEditor from './NutritionInfoEditor.jsx'
import { STOCK_LEVELS, STOCK_LEVEL_LABELS } from '../schema.js'

export default function PantryItemEditor({ item, categories, fdcKey, byok, onSave, onDelete, onSaveNutrition, onCancel }) {
  const [name, setName] = useState(item.name)
  const [category, setCategory] = useState(item.category)
  const [onHand, setOnHand] = useState(item.onHand)
  const [roughQty, setRoughQty] = useState(item.roughQty ?? '')
  const [level, setLevel] = useState(item.level ?? null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [editingNutrition, setEditingNutrition] = useState(false)

  // newName is set only when NutritionInfoEditor's online lookup found a
  // name the user explicitly accepted ("Use as item name") — never a
  // silent overwrite (CLAUDE.md — propose, user drives).
  function handleSaveNutrition(nutrition, newName) {
    onSaveNutrition(item.id, nutrition, newName)
    if (newName) setName(newName)
    setEditingNutrition(false)
  }

  function handleSave() {
    const trimmedName = name.trim()
    if (!trimmedName) return
    onSave(item.id, {
      name: trimmedName,
      category,
      onHand,
      roughQty: roughQty.trim() ? roughQty.trim() : null,
      level,
    })
  }

  return (
    <div className="sheet-backdrop" onClick={onCancel}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>Edit item</h2>

        <div className="field">
          <label htmlFor="item-name">Name</label>
          <input id="item-name" type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>

        <div className="field">
          <label htmlFor="item-category">Category</label>
          <select id="item-category" value={category} onChange={(e) => setCategory(e.target.value)}>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
            {!categories.includes(category) && category && <option value={category}>{category} (unlisted)</option>}
          </select>
        </div>

        <div className="field">
          <label className="checkbox-field">
            <input type="checkbox" checked={onHand} onChange={(e) => setOnHand(e.target.checked)} />
            On hand
          </label>
        </div>

        <div className="field">
          <label htmlFor="item-qty">How much</label>
          <input
            id="item-qty"
            type="text"
            value={roughQty}
            onChange={(e) => setRoughQty(e.target.value)}
            placeholder="e.g. 10 carrots, 2 blocks, half bag"
          />
          <p className="field-caption">A number here (“10 carrots”) goes down as you cook with it. Optional.</p>
        </div>

        <div className="field">
          <span>Level</span>
          <div className="segmented">
            {STOCK_LEVELS.map((lv) => (
              <button key={lv} type="button" className={`chip${level === lv ? ' chip--active' : ''}`} aria-pressed={level === lv} onClick={() => setLevel(level === lv ? null : lv)}>
                {STOCK_LEVEL_LABELS[lv]}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span>Nutrition</span>
          {item.nutrition ? (
            <div className="nutrition-summary">
              <ProvenanceTag source={item.nutrition.source} />
              <span>
                {item.nutrition.perServing.kcal} kcal — {item.nutrition.servingDesc || 'per serving'}
              </span>
            </div>
          ) : (
            <p className="placeholder">No nutrition data yet.</p>
          )}
          <button type="button" className="btn" onClick={() => setEditingNutrition(true)}>
            {item.nutrition ? 'Edit nutrition' : 'Add nutrition'}
          </button>
        </div>

        <div className="button-row">
          <button type="button" className="btn btn--primary" onClick={handleSave} disabled={!name.trim()}>
            Save
          </button>
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
        </div>

        <div className="button-row sheet__danger-row">
          {!confirmingDelete ? (
            <button type="button" className="btn btn--danger" onClick={() => setConfirmingDelete(true)}>
              Delete
            </button>
          ) : (
            <>
              <span className="sheet__confirm-text">Really delete?</span>
              <button type="button" className="btn btn--danger" onClick={() => onDelete(item.id)}>
                Really delete
              </button>
              <button type="button" className="btn" onClick={() => setConfirmingDelete(false)}>
                Keep it
              </button>
            </>
          )}
        </div>

        {editingNutrition && (
          <NutritionInfoEditor
            itemName={item.name}
            nutrition={item.nutrition}
            fdcKey={fdcKey}
            byok={byok}
            onSave={handleSaveNutrition}
            onCancel={() => setEditingNutrition(false)}
          />
        )}
      </div>
    </div>
  )
}

import { useState } from 'react'

export default function PantryItemEditor({ item, categories, onSave, onDelete, onCancel }) {
  const [name, setName] = useState(item.name)
  const [category, setCategory] = useState(item.category)
  const [role, setRole] = useState(item.role)
  const [onHand, setOnHand] = useState(item.onHand)
  const [roughQty, setRoughQty] = useState(item.roughQty ?? '')
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  function handleSave() {
    const trimmedName = name.trim()
    if (!trimmedName) return
    onSave(item.id, {
      name: trimmedName,
      category,
      role,
      onHand,
      roughQty: roughQty.trim() ? roughQty.trim() : null,
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
          <span>Role</span>
          <div className="button-row">
            <button
              type="button"
              className={`btn${role === 'staple' ? ' btn--primary' : ''}`}
              onClick={() => setRole('staple')}
            >
              Staple
            </button>
            <button
              type="button"
              className={`btn${role === 'rotating' ? ' btn--primary' : ''}`}
              onClick={() => setRole('rotating')}
            >
              Rotating
            </button>
          </div>
        </div>

        <div className="field">
          <label className="checkbox-field">
            <input type="checkbox" checked={onHand} onChange={(e) => setOnHand(e.target.checked)} />
            On hand
          </label>
        </div>

        <div className="field">
          <label htmlFor="item-qty">Rough quantity</label>
          <input
            id="item-qty"
            type="text"
            value={roughQty}
            onChange={(e) => setRoughQty(e.target.value)}
            placeholder="e.g. half bag, 2 blocks"
          />
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
      </div>
    </div>
  )
}

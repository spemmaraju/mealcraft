import { useState } from 'react'
import * as pantryOps from '../pantryOps.js'

export default function CategoryManager({ categories, pantry, onChange, onClose }) {
  const [renamingName, setRenamingName] = useState(null)
  const [renameText, setRenameText] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(null)
  const [newCategory, setNewCategory] = useState('')
  const [error, setError] = useState(null)

  function countFor(name) {
    return pantry.filter((item) => item.category === name).length
  }

  function startRename(name) {
    setRenamingName(name)
    setRenameText(name)
    setError(null)
  }

  function commitRename() {
    const result = pantryOps.renameCategory(categories, pantry, renamingName, renameText)
    if (result.error) {
      setError(result.error)
      return
    }
    onChange(result.categories, result.pantry)
    setRenamingName(null)
    setError(null)
  }

  function move(name, direction) {
    onChange(pantryOps.moveCategory(categories, name, direction), pantry)
  }

  function handleDelete(name) {
    const result = pantryOps.deleteCategory(categories, pantry, name)
    if (result.error) {
      setError(result.error)
      return
    }
    onChange(result.categories, pantry)
    setConfirmingDelete(null)
    setError(null)
  }

  function handleAdd() {
    const result = pantryOps.addCategory(categories, newCategory)
    if (result.error) {
      setError(result.error)
      return
    }
    onChange(result.categories, pantry)
    setNewCategory('')
    setError(null)
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>Edit categories</h2>

        <ul className="category-list">
          {categories.map((name, i) => {
            const count = countFor(name)
            return (
              <li key={name} className="category-list__row">
                {renamingName === name ? (
                  <>
                    <input
                      type="text"
                      value={renameText}
                      onChange={(e) => setRenameText(e.target.value)}
                      autoFocus
                    />
                    <button type="button" className="btn btn--primary" onClick={commitRename}>
                      Save
                    </button>
                    <button type="button" className="btn" onClick={() => setRenamingName(null)}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <span className="category-list__name" onClick={() => startRename(name)}>
                      {name}
                    </span>
                    <button
                      type="button"
                      className="btn category-list__move"
                      onClick={() => move(name, 'up')}
                      disabled={i === 0}
                      aria-label={`Move ${name} up`}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="btn category-list__move"
                      onClick={() => move(name, 'down')}
                      disabled={i === categories.length - 1}
                      aria-label={`Move ${name} down`}
                    >
                      ↓
                    </button>
                    {confirmingDelete === name ? (
                      <button type="button" className="btn btn--danger" onClick={() => handleDelete(name)}>
                        Really delete?
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn--danger"
                        onClick={() => (count > 0 ? setError(`Category "${name}" still has items in it.`) : setConfirmingDelete(name))}
                        disabled={count > 0}
                        title={count > 0 ? `${count} item(s) in this category` : 'Delete'}
                      >
                        {count > 0 ? `Delete (${count})` : 'Delete'}
                      </button>
                    )}
                  </>
                )}
              </li>
            )
          })}
        </ul>

        {error && <div className="message message--error">{error}</div>}

        <div className="field">
          <label htmlFor="new-category">Add category</label>
          <div className="button-row">
            <input
              id="new-category"
              type="text"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="New category name"
            />
            <button type="button" className="btn btn--primary" onClick={handleAdd} disabled={!newCategory.trim()}>
              Add
            </button>
          </div>
        </div>

        <div className="button-row">
          <button type="button" className="btn" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

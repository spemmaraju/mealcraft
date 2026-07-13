import { useState } from 'react'
import { COMPONENT_TYPES } from '../schema.js'
import { filterComponents } from '../componentOps.js'

export default function ComponentPickerSheet({ components, excludeIds, initialType, onPick, onClose }) {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState(initialType || null)

  const excluded = new Set(excludeIds)
  const filtered = filterComponents(components, { search, type: typeFilter }).filter((c) => !excluded.has(c.id))

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>Pick a component</h2>

        <div className="field">
          <input
            type="text"
            className="library-filters__search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or ingredient"
            autoFocus
          />
        </div>

        <div className="library-filters__chips picker-sheet__chips">
          {COMPONENT_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              className={`chip${typeFilter === t ? ' chip--active' : ''}`}
              onClick={() => setTypeFilter(typeFilter === t ? null : t)}
            >
              {t}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <p className="library-empty">No matching components.</p>
        ) : (
          <div className="picker-sheet__list">
            {filtered.map((c) => (
              <button key={c.id} type="button" className="picker-sheet__row" onClick={() => onPick(c.id)}>
                <span className="picker-sheet__name">{c.name}</span>
                <span className="component-row__badge">{c.type}</span>
              </button>
            ))}
          </div>
        )}

        <div className="button-row">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

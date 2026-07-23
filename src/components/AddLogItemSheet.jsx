import { useState } from 'react'
import { COMPONENT_TYPES } from '../schema.js'
import { filterComponents } from '../componentOps.js'
import MeasureInput from './MeasureInput.jsx'
import FoodSearchSheet from './FoodSearchSheet.jsx'

const TABS = [
  { key: 'plan', label: "Today's plan" },
  { key: 'library', label: 'Library' },
  { key: 'pantry', label: 'Pantry' },
  { key: 'search', label: 'Search online' },
]

// Source chooser for adding an item to any meal: today's assembly card
// (any meal, not just lunch), the component library, a pantry item with an
// amount, or (Phase 16) online search. onPick receives a ready-to-merge
// items[] array (see LogEntry.items in CLAUDE.md §3).
export default function AddLogItemSheet({ card, components, pantry, categories, fdcKey, existingComponentIds, onPick, onSaveToPantry, onClose }) {
  const [tab, setTab] = useState(card && card.componentIds.length > 0 ? 'plan' : 'pantry')
  const [pantrySearch, setPantrySearch] = useState('')
  const [pantryPickId, setPantryPickId] = useState(null)
  const [pantryMeasure, setPantryMeasure] = useState('1 serving')
  const [librarySearch, setLibrarySearch] = useState('')
  const [libraryType, setLibraryType] = useState(null)

  const byId = Object.fromEntries(components.map((c) => [c.id, c]))
  const pantryFiltered = (pantry || [])
    .filter((p) => p.nutrition)
    .filter((p) => p.name.toLowerCase().includes(pantrySearch.trim().toLowerCase()))
  const excludedComponentIds = new Set(existingComponentIds || [])
  const libraryFiltered = filterComponents(components, { search: librarySearch, type: libraryType }).filter(
    (c) => !excludedComponentIds.has(c.id),
  )

  function pickComponent(componentId) {
    onPick([{ kind: 'component', componentId, count: 1 }])
  }

  function confirmPantryPick() {
    if (!pantryPickId) return
    onPick([{ kind: 'pantry', pantryId: pantryPickId, measure: pantryMeasure.trim() || '1 serving' }])
  }

  async function handleSaveToPantry(name, category, nutrition) {
    const pantryId = await onSaveToPantry(name, category, nutrition)
    onPick([{ kind: 'pantry', pantryId, measure: '1 serving' }])
  }

  return (
    <div className="sheet-backdrop sheet-backdrop--stacked" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>Add to log</h2>

        <div className="chip-row">
          {TABS.map((t) => (
            <button key={t.key} type="button" className={`chip${tab === t.key ? ' chip--active' : ''}`} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'plan' &&
          (!card || card.componentIds.length === 0 ? (
            <p className="library-empty">No plan for today.</p>
          ) : (
            <div className="picker-sheet__list">
              {card.componentIds.map((id) => (
                <button key={id} type="button" className="picker-sheet__row" onClick={() => pickComponent(id)}>
                  <span className="picker-sheet__name">{byId[id]?.name || id}</span>
                </button>
              ))}
            </div>
          ))}

        {tab === 'library' && (
          <>
            <input
              type="text"
              className="library-filters__search"
              value={librarySearch}
              onChange={(e) => setLibrarySearch(e.target.value)}
              placeholder="Search by name or ingredient"
              autoFocus
            />
            <div className="library-filters__chips picker-sheet__chips">
              {COMPONENT_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`chip${libraryType === t ? ' chip--active' : ''}`}
                  onClick={() => setLibraryType(libraryType === t ? null : t)}
                >
                  {t}
                </button>
              ))}
            </div>
            {libraryFiltered.length === 0 ? (
              <p className="library-empty">No matching components.</p>
            ) : (
              <div className="picker-sheet__list">
                {libraryFiltered.map((c) => (
                  <button key={c.id} type="button" className="picker-sheet__row" onClick={() => pickComponent(c.id)}>
                    <span className="picker-sheet__name">{c.name}</span>
                    <span className="component-row__badge">{c.type}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'pantry' && (
          <>
            <input
              type="text"
              className="library-filters__search"
              value={pantrySearch}
              onChange={(e) => setPantrySearch(e.target.value)}
              placeholder="Search pantry"
              autoFocus
            />
            {pantryFiltered.length === 0 ? (
              <p className="library-empty">No pantry items with nutrition data yet.</p>
            ) : (
              <div className="picker-sheet__list">
                {pantryFiltered.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`picker-sheet__row${pantryPickId === p.id ? ' picker-sheet__row--selected' : ''}`}
                    onClick={() => setPantryPickId(p.id)}
                  >
                    <span className="picker-sheet__name">{p.name}</span>
                  </button>
                ))}
              </div>
            )}
            {pantryPickId && (
              <div className="field">
                <span>Amount</span>
                <MeasureInput
                  key={pantryPickId}
                  value={pantryMeasure}
                  onChange={setPantryMeasure}
                  nutrition={pantry.find((p) => p.id === pantryPickId)?.nutrition}
                />
                <button type="button" className="btn btn--primary" onClick={confirmPantryPick}>
                  Add
                </button>
              </div>
            )}
          </>
        )}

        {tab === 'search' && (
          <FoodSearchSheet
            categories={categories}
            fdcKey={fdcKey}
            onLogAdhoc={(item) => onPick([item])}
            onSaveToPantry={handleSaveToPantry}
          />
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

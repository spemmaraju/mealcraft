import { useState } from 'react'
import ComponentPickerSheet from './ComponentPickerSheet.jsx'
import MeasureInput from './MeasureInput.jsx'

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
export default function AddLogItemSheet({ card, components, pantry, existingComponentIds, onPick, onClose }) {
  const [tab, setTab] = useState(card && card.componentIds.length > 0 ? 'plan' : 'library')
  const [pantrySearch, setPantrySearch] = useState('')
  const [pantryPickId, setPantryPickId] = useState(null)
  const [pantryMeasure, setPantryMeasure] = useState('1 serving')

  const byId = Object.fromEntries(components.map((c) => [c.id, c]))
  const pantryFiltered = (pantry || [])
    .filter((p) => p.nutrition)
    .filter((p) => p.name.toLowerCase().includes(pantrySearch.trim().toLowerCase()))

  function pickComponent(componentId) {
    onPick([{ kind: 'component', componentId, count: 1 }])
  }

  function confirmPantryPick() {
    if (!pantryPickId) return
    onPick([{ kind: 'pantry', pantryId: pantryPickId, measure: pantryMeasure.trim() || '1 serving' }])
  }

  if (tab === 'library') {
    return (
      <ComponentPickerSheet
        components={components}
        excludeIds={existingComponentIds || []}
        onPick={pickComponent}
        onClose={() => setTab('pantry')}
      />
    )
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
                <MeasureInput value={pantryMeasure} onChange={setPantryMeasure} />
                <button type="button" className="btn btn--primary" onClick={confirmPantryPick}>
                  Add
                </button>
              </div>
            )}
          </>
        )}

        {tab === 'search' && (
          <p className="placeholder">
            Online search is coming in a future update — add it from the Pantry tab, or the Library if it's a saved
            recipe.
          </p>
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

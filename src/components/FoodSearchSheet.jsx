import { useState } from 'react'
import { searchFoods } from '../nutritionLookup.js'
import { guessCategory } from '../pantryOps.js'
import NutritionInfoEditor from './NutritionInfoEditor.jsx'

// Text search against Open Food Facts (keyless) + USDA FDC (with a key),
// wired into AddLogItemSheet's "Search online" tab. Results are loggable as
// one-off ad-hoc items (embedding a NutritionInfo snapshot so the log never
// dangles) or saved to the pantry first (so the same food resolves offline
// next time). Degrades to a manual-entry fallback when offline/no results.
export default function FoodSearchSheet({ categories, fdcKey, onLogAdhoc, onSaveToPantry }) {
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState(null)
  const [failed, setFailed] = useState(false)
  const [savingIndex, setSavingIndex] = useState(null)
  const [saveCategory, setSaveCategory] = useState('')
  const [manualEntry, setManualEntry] = useState(false)

  async function handleSearch() {
    const q = query.trim()
    if (!q) return
    setSearching(true)
    setFailed(false)
    setResults(null)
    const result = await searchFoods(q, { fdcKey })
    setSearching(false)
    if (result.ok) setResults(result.results)
    else setFailed(true)
  }

  function handleLogIt(food) {
    onLogAdhoc({ kind: 'adhoc', name: food.name, measure: '1 serving', nutrition: food.nutrition })
  }

  async function handleConfirmSaveToPantry(food) {
    await onSaveToPantry(food.name, saveCategory, food.nutrition)
    setSavingIndex(null)
  }

  if (manualEntry) {
    return (
      <NutritionInfoEditor
        itemName={query.trim() || 'New food'}
        nutrition={null}
        fdcKey={fdcKey}
        byok={null}
        onSave={(nutrition) => {
          if (nutrition) onLogAdhoc({ kind: 'adhoc', name: query.trim() || 'New food', measure: '1 serving', nutrition })
          setManualEntry(false)
        }}
        onCancel={() => setManualEntry(false)}
      />
    )
  }

  return (
    <div className="field">
      <div className="button-row">
        <input
          type="text"
          className="library-filters__search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="Search for a food"
          autoFocus
        />
        <button type="button" className="btn btn--primary" onClick={handleSearch} disabled={!query.trim() || searching}>
          {searching ? 'Searching…' : 'Search'}
        </button>
      </div>

      {!fdcKey && <p className="field-caption">Add an FDC key in Settings for USDA results — Open Food Facts works keyless.</p>}

      {failed && (
        <>
          <p className="placeholder">Search needs a connection — add from the pantry or enter it manually.</p>
          <button type="button" className="btn" onClick={() => setManualEntry(true)}>
            Manual entry
          </button>
        </>
      )}

      {results && results.length === 0 && <p className="library-empty">No results.</p>}

      {results && results.length > 0 && (
        <div className="picker-sheet__list">
          {results.map((food, i) => (
            <div key={i} className="meal-section__item-row">
              <div className="picker-sheet__name">
                <span>{food.name}</span>
                {food.brand && <span className="field-caption"> — {food.brand}</span>}
                <div>
                  <span className="provenance-tag">{food.source === 'off' ? 'Open Food Facts' : 'USDA FDC'}</span>{' '}
                  {Math.round(food.nutrition.perServing.kcal)} kcal / {food.nutrition.servingDesc}
                </div>
              </div>
              <div className="button-row">
                <button type="button" className="btn btn--primary" onClick={() => handleLogIt(food)}>
                  Log it
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    if (savingIndex === i) {
                      setSavingIndex(null)
                    } else {
                      setSavingIndex(i)
                      setSaveCategory(guessCategory(food.name, categories))
                    }
                  }}
                >
                  Save to pantry
                </button>
              </div>
              {savingIndex === i && (
                <div className="button-row">
                  <select value={saveCategory} onChange={(e) => setSaveCategory(e.target.value)}>
                    <option value="">Pick a category…</option>
                    {(categories || []).map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn btn--primary"
                    onClick={() => handleConfirmSaveToPantry(food)}
                    disabled={!saveCategory}
                  >
                    Confirm
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { searchFoods } from '../nutritionLookup.js'
import { splitMatch } from '../textMatch.js'
import { SearchIcon } from './Icons.jsx'
import NutritionInfoEditor from './NutritionInfoEditor.jsx'

const ERROR_TEXT = {
  offline: "You're offline — add from pantry or enter manually.",
  upstream: 'Food database is busy — tap to retry.',
  unreachable: "Couldn't reach the food databases — a busy server or a network filter can cause this. Retry usually works.",
  empty: 'No matches — try fewer words or enter manually.',
}

// Online text search (Open Food Facts keyless + USDA FDC with a key),
// embedded in AddLogItemSheet's "Search online" step (Round 2 — no longer a
// tab, and no longer its own category-picker save flow: the duplicate guard
// and category guess now live in AddLogItemSheet so every result routes
// through the SAME amount step as every other group). "Add" is the
// log-and-save default (onSaveAndStage); "Log without saving" keeps the
// one-off path for a food you won't repeat (onAdhocStage). Degrades to a
// manual-entry fallback offline/on 0 results, with honest, distinct error
// states instead of one collapsed "needs a connection" message.
//
// Round 2.5 §6: results are already ranked/deduped by nutritionLookup's
// searchFoods (FDC above OFF when a key is set); this component just
// reports the source mix ("12 results · USDA + Open Food Facts") and, when
// no key is set, nudges toward Settings — never logging the query or key.
//
// Round 4.7: the query the user already typed into AddLogItemSheet's search
// box arrives as `initialQuery` and fires automatically on mount — no more
// double-tapping "Search". The box and Search button below are now purely
// for editing that query and re-searching (fixing a typo, trying fewer
// words after an 'empty' result, retrying after 'upstream'/'unreachable').
//
// Fix 4: an optional `onPick(food)` prop turns this into a plain picker —
// used by NutritionInfoEditor's "Search online" (no pantry/log write of its
// own; the caller decides what to do with the picked result). Each result
// row then renders a single "Use this" button instead of the Add/"Log
// without saving" pair, and the pantry-saving caption + manual-entry
// fallback (both meaningless without a save/log flow behind them) are
// hidden.
export default function FoodSearchSheet({ initialQuery, fdcKey, onSaveAndStage, onAdhocStage, onGoToSettings, onBack, onPick }) {
  const [query, setQuery] = useState(initialQuery || '')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState(null)
  const [error, setError] = useState(null)
  const [manualEntry, setManualEntry] = useState(false)
  // Stale-response guard: each handleSearch call claims the next sequence
  // number before awaiting; only the invocation still holding the current
  // number gets to write its result. Without this, firing a search while
  // one is already in flight (auto-search racing a fast manual Retry, or
  // two taps) lets a slow/rate-limited response land after a faster later
  // one and clobber its results/error.
  const seqRef = useRef(0)
  // One-shot mount guard for the auto-search effect below — React.StrictMode
  // (main.jsx) double-invokes effects in dev, and firing the query twice at
  // Open Food Facts is both wasteful and asking for the rate limit.
  const autoSearchedRef = useRef(false)

  async function handleSearch(q = query) {
    q = q.trim()
    if (!q) return
    const seq = ++seqRef.current
    setSearching(true)
    setError(null)
    setResults(null)
    const result = await searchFoods(q, { fdcKey })
    if (seq !== seqRef.current) return // superseded by a newer search — drop this response
    setSearching(false)
    if (result.ok) {
      setResults(result.results)
      if (result.results.length === 0) setError('empty')
    } else {
      setError(result.reason || 'offline')
    }
  }

  // Fires the search once on arrival, using whatever the user already
  // typed before tapping "Search online" — matches MeasureInput.jsx's
  // mount-only focus effect (Round 2 hot-fix #2) in shape.
  useEffect(() => {
    if (autoSearchedRef.current) return
    autoSearchedRef.current = true
    if (initialQuery && initialQuery.trim()) handleSearch(initialQuery)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (manualEntry && !onPick) {
    return (
      <NutritionInfoEditor
        itemName={query.trim() || 'New food'}
        nutrition={null}
        fdcKey={fdcKey}
        byok={null}
        onSave={(nutrition) => {
          if (nutrition) onAdhocStage({ name: query.trim() || 'New food', nutrition })
          setManualEntry(false)
        }}
        onCancel={() => setManualEntry(false)}
      />
    )
  }

  return (
    <div className="field">
      <div className="button-row">
        <label className="searchfield" style={{ flex: 1 }}>
          <SearchIcon size={18} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Search for a food"
            autoFocus
          />
        </label>
        <button type="button" className="btn btn--primary" onClick={() => handleSearch()} disabled={!query.trim() || searching}>
          {searching ? 'Searching…' : 'Search'}
        </button>
      </div>

      {!fdcKey && (
        <p className="field-caption">
          Add a free USDA key for better US results
          {onGoToSettings ? (
            <>
              {' — '}
              <button type="button" className="link-btn" onClick={onGoToSettings}>
                Settings
              </button>
            </>
          ) : (
            '.'
          )}
        </p>
      )}

      {error && (
        <>
          <p className="placeholder">{ERROR_TEXT[error] || ERROR_TEXT.offline}</p>
          <div className="button-row">
            {(error === 'upstream' || error === 'unreachable') && (
              <button type="button" className="btn" onClick={() => handleSearch()}>
                Retry
              </button>
            )}
            {!onPick && (
              <button type="button" className="btn" onClick={() => setManualEntry(true)}>
                Enter manually
              </button>
            )}
          </div>
        </>
      )}

      {results && results.length > 0 && (
        <>
          <p className="food-search__count">
            {results.length} result{results.length === 1 ? '' : 's'} ·{' '}
            {results.some((f) => f.source === 'fdc') && results.some((f) => f.source === 'off')
              ? 'USDA + Open Food Facts'
              : results.some((f) => f.source === 'fdc')
                ? 'USDA'
                : 'Open Food Facts'}
          </p>
          {!onPick && (
            <p className="field-caption">
              “Add” also saves the food to your pantry for quick logging next time. “Log without saving” logs it just this once.
            </p>
          )}
          <div className="picker-sheet__list">
            {results.map((food, i) => (
              <div key={i} className="row2 food-search__row">
                <span className="row2__main">
                  <span className="row2__name">
                    {splitMatch(food.name, query).map((seg, i) =>
                      seg.match ? (
                        <span key={i} className="match-highlight">
                          {seg.text}
                        </span>
                      ) : (
                        <span key={i}>{seg.text}</span>
                      ),
                    )}
                  </span>
                  <span className="row2__sub">
                    {food.brand && <span>{food.brand} · </span>}
                    <span className="provenance-tag provenance-tag--tiny">{food.source === 'off' ? 'Open Food Facts' : 'USDA FDC'}</span>
                    <span> · {food.nutrition.servingDesc}</span>
                  </span>
                  <div className="button-row food-search__actions">
                    {onPick ? (
                      <button type="button" className="btn btn--primary" onClick={() => onPick(food)}>
                        Use this
                      </button>
                    ) : (
                      <>
                        <button type="button" className="btn btn--primary" onClick={() => onSaveAndStage(food)}>
                          Add
                        </button>
                        <button type="button" className="btn" onClick={() => onAdhocStage(food)}>
                          Log without saving
                        </button>
                      </>
                    )}
                  </div>
                </span>
                <span className="row2__side">
                  <span className="row2__num">{Math.round(food.nutrition.perServing.kcal)}</span>
                  <span className="row2__submeta">kcal</span>
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="button-row">
        <button type="button" className="btn" onClick={onBack}>
          Back
        </button>
      </div>
    </div>
  )
}

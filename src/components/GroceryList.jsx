import { useState } from 'react'

export default function GroceryList({ week, onToggle, onDismissAll }) {
  const [confirming, setConfirming] = useState(false)
  const [forceShow, setForceShow] = useState(false)

  const items = week.grocerySuggestions
  const allDismissed = items.length > 0 && items.every((g) => g.dismissed)

  if (items.length === 0) {
    return (
      <div className="plan-section">
        <h2>Grocery suggestions</h2>
        <p className="placeholder">No grocery suggestions for this week.</p>
      </div>
    )
  }

  if (allDismissed && !forceShow) {
    return (
      <div className="plan-section">
        <h2>Grocery suggestions</h2>
        <p className="placeholder">
          All {items.length} dismissed.{' '}
          <button type="button" className="link-btn" onClick={() => setForceShow(true)}>
            Show
          </button>
        </p>
      </div>
    )
  }

  return (
    <div className="plan-section">
      <h2>Grocery suggestions</h2>
      <p className="placeholder">Advisory only — dismiss freely.</p>

      {items.map((g, i) => (
        <div key={i} className="grocery-row">
          <button
            type="button"
            className={`grocery-row__check${g.dismissed ? ' grocery-row__check--active' : ''}`}
            onClick={() => onToggle(i)}
            aria-pressed={g.dismissed}
          >
            {g.dismissed ? '✓' : ''}
          </button>
          <span className={`grocery-row__label${g.dismissed ? ' grocery-row__label--dismissed' : ''}`}>
            {g.name}
            {g.qty ? ` — ${g.qty}` : ''}
          </span>
        </div>
      ))}

      {allDismissed && forceShow && (
        <button type="button" className="link-btn" onClick={() => setForceShow(false)}>
          Hide
        </button>
      )}

      <div className="button-row">
        {!confirming ? (
          <button
            type="button"
            className="btn btn--danger"
            onClick={() => setConfirming(true)}
            disabled={allDismissed}
          >
            Dismiss all
          </button>
        ) : (
          <>
            <span className="sheet__confirm-text">Dismiss all {items.length}?</span>
            <button
              type="button"
              className="btn btn--danger"
              onClick={() => {
                onDismissAll()
                setConfirming(false)
              }}
            >
              Confirm
            </button>
            <button type="button" className="btn" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  )
}

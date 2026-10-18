import { useState } from 'react'

/**
 * Phase 19: saved cook drafts at the top of Plan. Resume reopens the Cook
 * sheet; delete is a two-tap confirm (CLAUDE.md §5). Hidden when empty.
 */
export default function CookDraftList({ drafts, onResume, onDelete }) {
  const [confirmingId, setConfirmingId] = useState(null)
  if (drafts.length === 0) return null

  return (
    <div className="plan-section">
      <h2>🍳 Cooking drafts</h2>
      <ul className="cook-drafts">
        {drafts.map((d) => (
          <li key={d.id} className="cook-drafts__row">
            <button type="button" className="cook-drafts__open" onClick={() => onResume(d)}>
              <span className="cook-drafts__name">{d.name || 'Untitled dish'}</span>
              <span className="field-caption">
                {d.rows.length} ingredient{d.rows.length === 1 ? '' : 's'} · tap to resume
              </span>
            </button>
            {confirmingId === d.id ? (
              <span className="button-row">
                <button type="button" className="btn btn--danger" onClick={() => onDelete(d.id)}>
                  Delete
                </button>
                <button type="button" className="btn" onClick={() => setConfirmingId(null)}>
                  Keep
                </button>
              </span>
            ) : (
              <button type="button" className="itemrow__remove" aria-label={`Delete draft ${d.name || 'Untitled dish'}`} onClick={() => setConfirmingId(d.id)}>
                ✕
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

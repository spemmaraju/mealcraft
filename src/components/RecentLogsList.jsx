import * as trackOps from '../trackOps.js'
import { MEAL_LABELS } from '../schema.js'

// Round 2 (open-on-Track / one-tap relog): the Recent-logs section,
// extracted out of TrackScreen to keep that file under the ~300-line budget
// (CLAUDE.md §4.7). Purely presentational — TrackScreen owns every piece of
// state (confirm-remove index, relog undo snapshot) and every handler; this
// component just renders rows plus the existing delete/confirm behavior and
// the new "Log again" button + its undo banner.
export default function RecentLogsList({
  recent,
  itemName,
  todayISO,
  confirmingRemove,
  onConfirmRemove,
  onCancelRemove,
  onRemoveAt,
  onLogAgain,
  relogUndo,
  onUndoRelog,
}) {
  return (
    <div className="plan-section">
      <h2>Recent logs</h2>

      {relogUndo && (
        <p className="meal-section__subtotal">
          Logged {relogUndo.count} item{relogUndo.count === 1 ? '' : 's'} to {MEAL_LABELS[relogUndo.meal]}
          {relogUndo.skipped > 0 ? ` (${relogUndo.skipped} skipped)` : ''}
          {' · '}
          <button type="button" className="link-btn" onClick={onUndoRelog}>
            Undo
          </button>
        </p>
      )}

      {recent.length === 0 ? (
        <p className="placeholder">Nothing logged yet.</p>
      ) : (
        recent.map(({ log, index }) => (
          <div key={index} className="recent-log-row">
            <div className="recent-log-row__body">
              <span className="recent-log-row__date">
                {log.date} · {log.meal}
              </span>
              <span className="recent-log-row__components">{log.items.map(itemName).join(', ') || '(none)'}</span>
            </div>
            <div className="recent-log-row__actions">
              {trackOps.canRelogTo(log, todayISO) && (
                <button type="button" className="pill-quiet" onClick={() => onLogAgain(log)}>
                  Log again
                </button>
              )}
              {confirmingRemove === index ? (
                <span className="recent-log-row__confirm">
                  <button type="button" className="btn btn--danger" onClick={() => onRemoveAt(index)}>
                    Remove?
                  </button>
                  <button type="button" className="btn" onClick={onCancelRemove}>
                    Keep
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  className="assembly-card__x"
                  onClick={() => onConfirmRemove(index)}
                  aria-label={`Remove log for ${log.date}`}
                >
                  ×
                </button>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  )
}

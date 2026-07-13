import { useState } from 'react'
import { findConflicts, applyImport } from '../weekImport.js'

const RESOLUTION_OPTIONS = [
  { label: 'Use existing', value: 'use-existing' },
  { label: 'Replace', value: 'replace' },
  { label: 'Import as new', value: 'new' },
]

// Shared review/confirm UI for a validated import payload — used by both the
// paste flow (WeekImportBox) and the BYOK one-tap flow (PlanScreen).
export default function ImportReview({ payload, components, weeks, onConfirm, onCancel }) {
  const [conflicts] = useState(() => findConflicts(payload, components))
  const [resolutions, setResolutions] = useState(() => Object.fromEntries(conflicts.map((c) => [c.draftId, 'use-existing'])))

  function handleConfirm() {
    const resolutionMap = Object.fromEntries(Object.entries(resolutions).map(([id, type]) => [id, { type }]))
    onConfirm(applyImport(payload, resolutionMap, components, weeks))
  }

  const conflictIds = new Set(conflicts.map((c) => c.draftId))
  const newCount = payload.components.filter((c) => !conflictIds.has(c.id) || resolutions[c.id] === 'new').length
  const replacesExisting = weeks.some((w) => w.weekOf === payload.weekPlan.weekOf)

  return (
    <>
      <div className="diff-summary">
        {newCount} new component{newCount === 1 ? '' : 's'}, {conflicts.length} conflict
        {conflicts.length === 1 ? '' : 's'}, plan for week of {payload.weekPlan.weekOf}
        {replacesExisting ? ' — replaces existing plan' : ''}.
      </div>

      {conflicts.map((c) => (
        <div key={c.draftId} className="conflict-row">
          <div className="conflict-row__names">
            <strong>{c.draftName}</strong> looks like existing{' '}
            <span className="conflict-row__existing">{c.existingName}</span>
          </div>
          <div className="segmented">
            {RESOLUTION_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`chip${resolutions[c.draftId] === opt.value ? ' chip--active' : ''}`}
                onClick={() => setResolutions((r) => ({ ...r, [c.draftId]: opt.value }))}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      ))}

      <div className="button-row">
        <button type="button" className="btn btn--primary" onClick={handleConfirm}>
          Confirm import
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </>
  )
}

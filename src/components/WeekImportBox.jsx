import { useState } from 'react'
import { validatePayload, findConflicts, applyImport, buildFixRequest } from '../weekImport.js'

const RESOLUTION_OPTIONS = [
  { label: 'Use existing', value: 'use-existing' },
  { label: 'Replace', value: 'replace' },
  { label: 'Import as new', value: 'new' },
]

export default function WeekImportBox({ components, weeks, onImported }) {
  const [text, setText] = useState('')
  const [result, setResult] = useState(null)
  const [conflicts, setConflicts] = useState([])
  const [resolutions, setResolutions] = useState({})
  const [fixCopyMsg, setFixCopyMsg] = useState(null)

  function handleValidate() {
    setFixCopyMsg(null)
    const r = validatePayload(text)
    setResult(r)
    if (r.ok) {
      const found = findConflicts(r.payload, components)
      setConflicts(found)
      setResolutions(Object.fromEntries(found.map((c) => [c.draftId, 'use-existing'])))
    } else {
      setConflicts([])
      setResolutions({})
    }
  }

  function handleConfirm() {
    const resolutionMap = Object.fromEntries(Object.entries(resolutions).map(([id, type]) => [id, { type }]))
    const applied = applyImport(result.payload, resolutionMap, components, weeks)
    onImported(applied)
    setText('')
    setResult(null)
    setConflicts([])
    setResolutions({})
  }

  function handleCancel() {
    setResult(null)
    setConflicts([])
    setResolutions({})
  }

  async function handleCopyFix() {
    const msg = buildFixRequest(result.errors)
    try {
      await navigator.clipboard.writeText(msg)
      setFixCopyMsg({ type: 'success', text: 'Fix request copied.' })
    } catch {
      setFixCopyMsg({ type: 'error', text: 'Clipboard unavailable — select and copy the message manually.' })
    }
  }

  const conflictIds = new Set(conflicts.map((c) => c.draftId))
  const newCount = result?.ok
    ? result.payload.components.filter((c) => !conflictIds.has(c.id) || resolutions[c.id] === 'new').length
    : 0
  const replacesExisting = result?.ok && weeks.some((w) => w.weekOf === result.payload.weekPlan.weekOf)

  return (
    <div className="plan-section">
      <h2>Import a generated week</h2>
      <p className="placeholder">Paste the AI's JSON reply here.</p>

      <div className="field">
        <label htmlFor="week-import-textarea">Paste JSON</label>
        <textarea
          id="week-import-textarea"
          rows={8}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setResult(null)
            setFixCopyMsg(null)
          }}
          placeholder="Paste the reply from your AI chat here"
        />
      </div>

      <div className="button-row">
        <button type="button" className="btn" onClick={handleValidate} disabled={!text.trim()}>
          Validate
        </button>
      </div>

      {result && !result.ok && (
        <>
          <div className="message message--error">
            {result.errors.map((err) => (
              <div key={err}>{err}</div>
            ))}
          </div>
          <div className="button-row">
            <button type="button" className="btn" onClick={handleCopyFix}>
              Copy fix request
            </button>
          </div>
          {fixCopyMsg && <div className={`message message--${fixCopyMsg.type}`}>{fixCopyMsg.text}</div>}
        </>
      )}

      {result && result.ok && (
        <>
          <div className="diff-summary">
            {newCount} new component{newCount === 1 ? '' : 's'}, {conflicts.length} conflict
            {conflicts.length === 1 ? '' : 's'}, plan for week of {result.payload.weekPlan.weekOf}
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
            <button type="button" className="btn" onClick={handleCancel}>
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  )
}

import { useState } from 'react'
import { validatePayload, buildFixRequest } from '../weekImport.js'
import ImportReview from './ImportReview.jsx'

export default function WeekImportBox({ components, weeks, onImported }) {
  const [text, setText] = useState('')
  const [result, setResult] = useState(null)
  const [fixCopyMsg, setFixCopyMsg] = useState(null)

  function handleValidate() {
    setFixCopyMsg(null)
    setResult(validatePayload(text))
  }

  function handleConfirm(applied) {
    onImported(applied)
    setText('')
    setResult(null)
  }

  function handleCancel() {
    setResult(null)
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

  return (
    <>
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
        <ImportReview payload={result.payload} components={components} weeks={weeks} onConfirm={handleConfirm} onCancel={handleCancel} />
      )}
    </>
  )
}

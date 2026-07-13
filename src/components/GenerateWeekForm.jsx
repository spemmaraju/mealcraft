import { useState } from 'react'
import { compileWeekPrompt, nextSundayISO } from '../promptCompiler.js'

export default function GenerateWeekForm({ state }) {
  const [servings, setServings] = useState(5)
  const [cookSunday, setCookSunday] = useState(true)
  const [wedRefresh, setWedRefresh] = useState(true)
  const [weekOf, setWeekOf] = useState(nextSundayISO())
  const [notes, setNotes] = useState('')
  const [prompt, setPrompt] = useState(null)
  const [copyMsg, setCopyMsg] = useState(null)
  const [showFallback, setShowFallback] = useState(false)

  async function handleCopy() {
    const text = compileWeekPrompt(state, { servings, cookSunday, wedRefresh, notes, weekOf })
    setPrompt(text)
    try {
      await navigator.clipboard.writeText(text)
      setCopyMsg({ type: 'success', text: 'Prompt copied to clipboard.' })
      setShowFallback(false)
    } catch {
      setCopyMsg({ type: 'error', text: 'Clipboard unavailable — copy from the box below.' })
      setShowFallback(true)
    }
  }

  return (
    <div className="plan-section">
      <h2>Generate a week</h2>

      <div className="field">
        <span>Lunch servings (Mon–Fri)</span>
        <div className="stepper">
          <button type="button" className="stepper__btn" onClick={() => setServings((s) => Math.max(1, s - 1))}>
            −
          </button>
          <span className="stepper__value">{servings}</span>
          <button type="button" className="stepper__btn" onClick={() => setServings((s) => Math.min(10, s + 1))}>
            +
          </button>
        </div>
      </div>

      <div className="field">
        <span>Cook events</span>
        <div className="segmented">
          <button
            type="button"
            className={`chip${cookSunday ? ' chip--active' : ''}`}
            onClick={() => setCookSunday((v) => !v)}
          >
            Sunday cook
          </button>
          <button
            type="button"
            className={`chip${wedRefresh ? ' chip--active' : ''}`}
            onClick={() => setWedRefresh((v) => !v)}
          >
            Wednesday refresh
          </button>
        </div>
      </div>

      <div className="field">
        <label htmlFor="plan-weekof">Week of</label>
        <input id="plan-weekof" type="date" value={weekOf} onChange={(e) => setWeekOf(e.target.value)} />
      </div>

      <div className="field">
        <label htmlFor="plan-notes">Notes</label>
        <textarea
          id="plan-notes"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. no repeats of last week's sauces, use up the cabbage"
        />
      </div>

      <div className="button-row">
        <button type="button" className="btn btn--primary" onClick={handleCopy}>
          Copy prompt
        </button>
      </div>

      {copyMsg && <div className={`message message--${copyMsg.type}`}>{copyMsg.text}</div>}

      {showFallback && prompt && (
        <textarea
          className="prompt-fallback"
          readOnly
          value={prompt}
          onFocus={(e) => e.target.select()}
        />
      )}
    </div>
  )
}

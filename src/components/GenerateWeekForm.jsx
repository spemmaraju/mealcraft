import { useState } from 'react'
import { compileWeekPrompt, nextSundayISO } from '../promptCompiler.js'
import { DAY_NAMES } from '../schema.js'
import { generateWeekViaApi } from '../byok.js'

const BUSY_ASKING = 'Asking Claude… this can take a minute'
const BUSY_RETRYING = 'Reply had validation issues — asking for a fix…'

export default function GenerateWeekForm({ state, onGenerated }) {
  const [servings, setServings] = useState(5)
  const [cookEnabled, setCookEnabled] = useState(true)
  const [refreshEnabled, setRefreshEnabled] = useState(true)
  const [weekOf, setWeekOf] = useState(nextSundayISO())
  const [notes, setNotes] = useState('')
  const [prompt, setPrompt] = useState(null)
  const [copyMsg, setCopyMsg] = useState(null)
  const [showFallback, setShowFallback] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [busyMsg, setBusyMsg] = useState(BUSY_ASKING)

  const byokActive = state.settings.apiMode === 'byok' && !!state.settings.apiKey
  const cookName = DAY_NAMES[state.settings.cookDay] ?? 'Sunday'
  const refreshName = state.settings.refreshDay ? DAY_NAMES[state.settings.refreshDay] : null

  async function handleCopy() {
    const text = compileWeekPrompt(state, { servings, cook: cookEnabled, refresh: refreshEnabled, notes, weekOf })
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

  async function handleGenerate() {
    const text = compileWeekPrompt(state, { servings, cook: cookEnabled, refresh: refreshEnabled, notes, weekOf })
    setGenerating(true)
    setBusyMsg(BUSY_ASKING)
    const result = await generateWeekViaApi({
      provider: state.settings.provider,
      apiKey: state.settings.apiKey,
      prompt: text,
      onProgress: (stage) => {
        if (stage === 'retrying') setBusyMsg(BUSY_RETRYING)
      },
    })
    setGenerating(false)
    onGenerated?.(result)
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
            className={`chip${cookEnabled ? ' chip--active' : ''}`}
            onClick={() => setCookEnabled((v) => !v)}
          >
            {cookName} cook
          </button>
          {refreshName && (
            <button
              type="button"
              className={`chip${refreshEnabled ? ' chip--active' : ''}`}
              onClick={() => setRefreshEnabled((v) => !v)}
            >
              {refreshName} refresh
            </button>
          )}
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
        {byokActive && (
          <button type="button" className="btn btn--primary" onClick={handleGenerate} disabled={generating}>
            {generating ? busyMsg : 'Generate week'}
          </button>
        )}
        <button type="button" className={`btn${byokActive ? '' : ' btn--primary'}`} onClick={handleCopy} disabled={generating}>
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

import { useEffect, useState } from 'react'
import * as storage from '../storage.js'
import * as weekOps from '../weekOps.js'
import GenerateWeekForm from '../components/GenerateWeekForm.jsx'
import WeekImportBox from '../components/WeekImportBox.jsx'
import WeekView from '../components/WeekView.jsx'
import ImportReview from '../components/ImportReview.jsx'

export default function PlanScreen() {
  const [pantry, setPantry] = useState([])
  const [components, setComponents] = useState([])
  const [weeks, setWeeks] = useState([])
  const [feedback, setFeedback] = useState([])
  const [settings, setSettings] = useState(null)
  const [showGenerate, setShowGenerate] = useState(false)
  const [generateResult, setGenerateResult] = useState(null)

  async function reload() {
    const [p, c, w, f, s] = await Promise.all([
      storage.get('pantry'),
      storage.get('components'),
      storage.get('weeks'),
      storage.get('feedback'),
      storage.get('settings'),
    ])
    setPantry(p)
    setComponents(c)
    setWeeks(w)
    setFeedback(f)
    setSettings(s)
  }

  useEffect(() => {
    reload()
    return storage.subscribe(reload)
  }, [])

  async function handleImported(applied) {
    await storage.set('components', applied.components)
    await storage.set('weeks', applied.weeks)
    setShowGenerate(false)
    setGenerateResult(null)
  }

  async function handleCommitWeek(nextWeek) {
    await storage.set('weeks', weekOps.replaceWeek(weeks, nextWeek))
  }

  async function handleCopyRawResponse() {
    try {
      await navigator.clipboard.writeText(generateResult.rawText)
    } catch {
      // clipboard unavailable — the raw response is still selectable in the textarea
    }
  }

  if (!settings) return null

  const latestWeek = weeks.length > 0 ? [...weeks].sort((a, b) => (a.weekOf < b.weekOf ? 1 : -1))[0] : null

  return (
    <div className="screen">
      <h1>Plan</h1>

      {latestWeek && !showGenerate ? (
        <WeekView week={latestWeek} components={components} onCommit={handleCommitWeek} onGenerateNew={() => setShowGenerate(true)} />
      ) : (
        <>
          {weeks.length === 0 && (
            <div className="plan-section plan-empty-state">
              <p>
                <strong>No week planned yet.</strong> MealCraft works with any AI chat — no API key needed.
              </p>
              <ol>
                <li>Set options below and Copy prompt.</li>
                <li>Paste into Claude/Gemini.</li>
                <li>Paste the JSON reply into the import box.</li>
              </ol>
              <p>Your week — run sheet, daily lunches, grocery suggestions — appears here, fully editable.</p>
            </div>
          )}
          {latestWeek && (
            <div className="button-row">
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setShowGenerate(false)
                  setGenerateResult(null)
                }}
              >
                ← Back to this week
              </button>
            </div>
          )}
          <GenerateWeekForm state={{ pantry, components, feedback, settings }} onGenerated={setGenerateResult} />

          {generateResult && generateResult.ok && (
            <div className="plan-section">
              <h2>Review generated week</h2>
              <ImportReview
                payload={generateResult.payload}
                components={components}
                weeks={weeks}
                onConfirm={handleImported}
                onCancel={() => setGenerateResult(null)}
              />
            </div>
          )}

          {generateResult && !generateResult.ok && (
            <div className="plan-section">
              <div className="message message--error">
                {generateResult.errors.map((err) => (
                  <div key={err}>{err}</div>
                ))}
              </div>
              {generateResult.rawText && (
                <details>
                  <summary>Raw response</summary>
                  <textarea className="prompt-fallback" readOnly value={generateResult.rawText} onFocus={(e) => e.target.select()} />
                  <div className="button-row">
                    <button type="button" className="btn" onClick={handleCopyRawResponse}>
                      Copy raw response
                    </button>
                  </div>
                </details>
              )}
              <div className="button-row">
                <button type="button" className="btn" onClick={() => setGenerateResult(null)}>
                  Dismiss
                </button>
              </div>
            </div>
          )}

          <WeekImportBox components={components} weeks={weeks} onImported={handleImported} />
        </>
      )}
    </div>
  )
}

import { useState } from 'react'
import * as trackOps from '../trackOps.js'

export default function WeeklyFeedbackForm({ feedback, weekOf, today, onSave }) {
  const existing = trackOps.feedbackFor(feedback, weekOf)
  const [expanded, setExpanded] = useState(trackOps.isFeedbackWindow(today))
  const [repeatWorthy, setRepeatWorthy] = useState(existing?.repeatWorthy ?? '')
  const [diedUneaten, setDiedUneaten] = useState(existing?.diedUneaten ?? '')
  const [boredomNotes, setBoredomNotes] = useState(existing?.boredomNotes ?? '')
  const [saved, setSaved] = useState(false)

  function handleSave() {
    onSave({ weekOf, repeatWorthy, diedUneaten, boredomNotes })
    setSaved(true)
  }

  if (!expanded) {
    return (
      <button type="button" className="feedback-link" onClick={() => setExpanded(true)}>
        {existing ? 'Edit this week’s feedback' : 'Add this week’s feedback'}
      </button>
    )
  }

  return (
    <div className="plan-section">
      <h2>Weekly feedback</h2>
      <div className="field">
        <label htmlFor="feedback-repeat">Repeat-worthy</label>
        <textarea
          id="feedback-repeat"
          value={repeatWorthy}
          onChange={(e) => {
            setRepeatWorthy(e.target.value)
            setSaved(false)
          }}
        />
      </div>
      <div className="field">
        <label htmlFor="feedback-died">Died uneaten</label>
        <textarea
          id="feedback-died"
          value={diedUneaten}
          onChange={(e) => {
            setDiedUneaten(e.target.value)
            setSaved(false)
          }}
        />
      </div>
      <div className="field">
        <label htmlFor="feedback-boredom">Boredom notes</label>
        <textarea
          id="feedback-boredom"
          value={boredomNotes}
          onChange={(e) => {
            setBoredomNotes(e.target.value)
            setSaved(false)
          }}
        />
      </div>
      <div className="button-row">
        <button type="button" className="btn btn--primary" onClick={handleSave}>
          Save feedback
        </button>
        <button type="button" className="btn" onClick={() => setExpanded(false)}>
          Collapse
        </button>
      </div>
      {saved && <p className="message message--success">Saved — will flow into next week's prompt.</p>}
    </div>
  )
}

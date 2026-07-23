import { useEffect, useState } from 'react'
import * as storage from '../storage.js'

// Extracted from SettingsScreen.jsx (Phase 15): the protein band's meaning
// changed from per-lunch to daily (the migration only rewrites the exact
// factory default, since no UI for it existed before this), so the user
// needs to be able to see and tune it.
export default function TrackingSettings() {
  const [lowDraft, setLowDraft] = useState('')
  const [highDraft, setHighDraft] = useState('')
  const [costDraft, setCostDraft] = useState('')
  const [saved, setSaved] = useState({ low_g: 60, high_g: 90, boughtLunchCost: 12 })
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    storage.get('settings').then((settings) => {
      setLowDraft(String(settings.proteinBand.low_g))
      setHighDraft(String(settings.proteinBand.high_g))
      setCostDraft(String(settings.boughtLunchCost))
      setSaved({ low_g: settings.proteinBand.low_g, high_g: settings.proteinBand.high_g, boughtLunchCost: settings.boughtLunchCost })
    })
  }, [])

  function toNum(text, fallback) {
    const n = parseFloat(text)
    return Number.isNaN(n) ? fallback : n
  }

  async function handleSave() {
    const low_g = toNum(lowDraft, saved.low_g)
    const high_g = toNum(highDraft, saved.high_g)
    const boughtLunchCost = toNum(costDraft, saved.boughtLunchCost)
    const settings = await storage.get('settings')
    await storage.set('settings', { ...settings, proteinBand: { low_g, high_g }, boughtLunchCost })
    setSaved({ low_g, high_g, boughtLunchCost })
    setMsg({ type: 'success', text: 'Tracking settings saved.' })
  }

  const dirty =
    toNum(lowDraft, saved.low_g) !== saved.low_g ||
    toNum(highDraft, saved.high_g) !== saved.high_g ||
    toNum(costDraft, saved.boughtLunchCost) !== saved.boughtLunchCost

  return (
    <section className="settings-section">
      <h2>Tracking</h2>
      <p className="placeholder">
        Protein band is a daily target across all logged meals, not per lunch — a directional signal, not a hard goal.
      </p>

      <div className="field">
        <span>Daily protein band (g)</span>
        <div className="button-row">
          <div className="field">
            <label htmlFor="protein-low">Low</label>
            <input id="protein-low" type="text" inputMode="decimal" value={lowDraft} onChange={(e) => setLowDraft(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="protein-high">High</label>
            <input id="protein-high" type="text" inputMode="decimal" value={highDraft} onChange={(e) => setHighDraft(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="field">
        <label htmlFor="bought-lunch-cost">Bought-lunch cost ($, for the money-saved gauge)</label>
        <input
          id="bought-lunch-cost"
          type="text"
          inputMode="decimal"
          value={costDraft}
          onChange={(e) => setCostDraft(e.target.value)}
        />
      </div>

      <div className="button-row">
        <button type="button" className="btn btn--primary" onClick={handleSave} disabled={!dirty}>
          Save
        </button>
      </div>

      {msg && <div className={`message message--${msg.type}`}>{msg.text}</div>}
    </section>
  )
}

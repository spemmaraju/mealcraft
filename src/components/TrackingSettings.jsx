import { useEffect, useState } from 'react'
import * as storage from '../storage.js'
import TargetsSheet from './TargetsSheet.jsx'

// Extracted from SettingsScreen.jsx (Phase 15): the protein band's meaning
// changed from per-lunch to daily. Today screen (v16) adds the kcal band and
// fibre target beside it, plus "Set from my details" (TargetsSheet).
const text = (n) => (n == null ? '' : String(n))
const toNum = (t, fallback) => {
  const n = parseFloat(t)
  return Number.isNaN(n) ? fallback : n
}
const toNullable = (t) => {
  const n = parseFloat(t)
  return Number.isNaN(n) ? null : n
}

export default function TrackingSettings() {
  const [settings, setSettings] = useState(null)
  const [lowDraft, setLowDraft] = useState('')
  const [highDraft, setHighDraft] = useState('')
  const [kcalLowDraft, setKcalLowDraft] = useState('')
  const [kcalHighDraft, setKcalHighDraft] = useState('')
  const [fiberDraft, setFiberDraft] = useState('')
  const [targetsOpen, setTargetsOpen] = useState(false)
  const [msg, setMsg] = useState(null)

  // Re-sync whenever settings change (the targets sheet writes them too).
  useEffect(() => {
    function load() {
      storage.get('settings').then((s) => {
        setSettings(s)
        setLowDraft(text(s.proteinBand.low_g))
        setHighDraft(text(s.proteinBand.high_g))
        setKcalLowDraft(text(s.kcalBand?.low))
        setKcalHighDraft(text(s.kcalBand?.high))
        setFiberDraft(text(s.fiberTarget_g))
      })
    }
    load()
    return storage.subscribe(load)
  }, [])

  if (!settings) return null
  const saved = settings.proteinBand
  const savedKcal = settings.kcalBand
  const kcalLow = toNullable(kcalLowDraft)
  const kcalHigh = toNullable(kcalHighDraft)
  const nextKcal = kcalLow != null && kcalHigh != null ? { low: kcalLow, high: kcalHigh } : null
  const nextFiber = toNullable(fiberDraft)

  async function handleSave() {
    const fresh = await storage.get('settings')
    await storage.set('settings', {
      ...fresh,
      proteinBand: { low_g: toNum(lowDraft, saved.low_g), high_g: toNum(highDraft, saved.high_g) },
      kcalBand: nextKcal,
      fiberTarget_g: nextFiber,
    })
    setMsg({ type: 'success', text: 'Tracking settings saved.' })
  }

  const dirty =
    toNum(lowDraft, saved.low_g) !== saved.low_g ||
    toNum(highDraft, saved.high_g) !== saved.high_g ||
    nextKcal?.low !== savedKcal?.low ||
    nextKcal?.high !== savedKcal?.high ||
    nextFiber !== (settings.fiberTarget_g ?? null)

  return (
    <section className="settings-section">
      <h2>Tracking</h2>
      <p className="placeholder">
        Daily targets across all logged meals — a directional signal, not a hard goal. Leave calories or fibre empty to turn them off.
      </p>

      <div className="button-row">
        <button type="button" className="btn" onClick={() => setTargetsOpen(true)}>
          Set from my details
        </button>
      </div>

      <div className="field">
        <span>Daily calorie band (kcal)</span>
        <div className="button-row">
          <div className="field">
            <label htmlFor="kcal-low">Low</label>
            <input id="kcal-low" type="text" inputMode="decimal" value={kcalLowDraft} onChange={(e) => setKcalLowDraft(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="kcal-high">High</label>
            <input id="kcal-high" type="text" inputMode="decimal" value={kcalHighDraft} onChange={(e) => setKcalHighDraft(e.target.value)} />
          </div>
        </div>
      </div>

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
        <label htmlFor="fiber-target">Daily fibre target (g)</label>
        <input id="fiber-target" type="text" inputMode="decimal" value={fiberDraft} onChange={(e) => setFiberDraft(e.target.value)} />
      </div>

      <div className="button-row">
        <button type="button" className="btn btn--primary" onClick={handleSave} disabled={!dirty}>
          Save
        </button>
      </div>

      {msg && <div className={`message message--${msg.type}`}>{msg.text}</div>}
      {targetsOpen && <TargetsSheet settings={settings} onClose={() => setTargetsOpen(false)} />}
    </section>
  )
}

import { useEffect, useRef, useState } from 'react'
import * as storage from '../storage.js'
import { DAYS, REFRESH_DAYS, DAY_NAMES } from '../schema.js'
import ByokSettings from '../components/ByokSettings.jsx'
import TrackingSettings from '../components/TrackingSettings.jsx'

function todayStamp() {
  return new Date().toISOString().slice(0, 10)
}

const SUMMARY_LABELS = {
  pantry: 'pantry items',
  components: 'components',
  weeks: 'weeks',
  logs: 'logs',
  feedback: 'feedback entries',
  categories: 'categories',
}

function summaryLine(summary) {
  return Object.entries(summary)
    .map(([key, count]) => `${count} ${SUMMARY_LABELS[key]}`)
    .join(', ')
}

export default function SettingsScreen() {
  const [exportMsg, setExportMsg] = useState(null)
  const [importText, setImportText] = useState('')
  const [preview, setPreview] = useState(null)
  const [importMsg, setImportMsg] = useState(null)
  const fileInputRef = useRef(null)
  const [fdcKey, setFdcKey] = useState('')
  const [fdcKeyDraft, setFdcKeyDraft] = useState('')
  const [fdcMsg, setFdcMsg] = useState(null)
  const [cookDay, setCookDay] = useState('Sun')
  const [refreshDay, setRefreshDay] = useState('Wed')

  useEffect(() => {
    storage.get('settings').then((settings) => {
      setFdcKey(settings.fdcKey ?? '')
      setFdcKeyDraft(settings.fdcKey ?? '')
      setCookDay(settings.cookDay ?? 'Sun')
      setRefreshDay(settings.refreshDay ?? null)
    })
  }, [])

  async function handleScheduleChange(patch) {
    if ('cookDay' in patch) setCookDay(patch.cookDay)
    if ('refreshDay' in patch) setRefreshDay(patch.refreshDay)
    const settings = await storage.get('settings')
    await storage.set('settings', { ...settings, ...patch })
  }

  async function handleSaveFdcKey() {
    const trimmed = fdcKeyDraft.trim()
    const settings = await storage.get('settings')
    await storage.set('settings', { ...settings, fdcKey: trimmed || null })
    setFdcKey(trimmed)
    setFdcMsg({ type: 'success', text: trimmed ? 'FDC key saved.' : 'FDC key removed.' })
  }

  async function handleRemoveFdcKey() {
    const settings = await storage.get('settings')
    await storage.set('settings', { ...settings, fdcKey: null })
    setFdcKey('')
    setFdcKeyDraft('')
    setFdcMsg({ type: 'success', text: 'FDC key removed.' })
  }

  async function handleExportDownload() {
    const json = await storage.exportState()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `mealcraft-export-${todayStamp()}.json`
    a.click()
    URL.revokeObjectURL(url)
    await storage.markExported()
    setExportMsg({ type: 'success', text: 'Export downloaded.' })
  }

  async function handleExportCopy() {
    const json = await storage.exportState()
    try {
      await navigator.clipboard.writeText(json)
      await storage.markExported()
      setExportMsg({ type: 'success', text: 'Export copied to clipboard.' })
    } catch {
      setExportMsg({ type: 'error', text: 'Clipboard unavailable — use Download instead.' })
    }
  }

  function handleFilePick(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setImportText(String(reader.result ?? ''))
      setPreview(null)
      setImportMsg(null)
    }
    reader.readAsText(file)
  }

  async function handleValidate() {
    setImportMsg(null)
    const result = await storage.previewImport(importText)
    setPreview(result)
    if (!result.ok) {
      setImportMsg({ type: 'error', text: 'Import rejected — nothing was changed.' })
    }
  }

  async function handleConfirm() {
    const result = await storage.importState(importText)
    if (result.ok) {
      setImportMsg({ type: 'success', text: `Import complete: ${summaryLine(result.summary)}.` })
      setPreview(null)
      setImportText('')
      if (fileInputRef.current) fileInputRef.current.value = ''
    } else {
      setImportMsg({ type: 'error', text: 'Import rejected — nothing was changed.' })
      setPreview(result)
    }
  }

  function handleCancelPreview() {
    setPreview(null)
    setImportMsg(null)
  }

  return (
    <div className="screen">
      <h1>Settings</h1>

      <section className="settings-section">
        <h2>Export</h2>
        <p className="placeholder">Full-state backup as JSON. This is your only backup and cross-device sync.</p>
        <div className="button-row">
          <button className="btn btn--primary" onClick={handleExportDownload}>
            Download
          </button>
          <button className="btn" onClick={handleExportCopy}>
            Copy to clipboard
          </button>
        </div>
        {exportMsg && <div className={`message message--${exportMsg.type}`}>{exportMsg.text}</div>}
      </section>

      <section className="settings-section">
        <h2>Import</h2>
        <p className="placeholder">Paste an export or pick a file. Nothing is overwritten until you confirm.</p>

        <div className="field">
          <label htmlFor="import-textarea">Paste JSON</label>
          <textarea
            id="import-textarea"
            rows={6}
            value={importText}
            onChange={(e) => {
              setImportText(e.target.value)
              setPreview(null)
              setImportMsg(null)
            }}
            placeholder="Paste a mealcraft-export-*.json here"
          />
        </div>

        <div className="field">
          <label htmlFor="import-file">Or choose a file</label>
          <input id="import-file" type="file" accept="application/json" ref={fileInputRef} onChange={handleFilePick} />
        </div>

        <div className="button-row">
          <button className="btn" onClick={handleValidate} disabled={!importText.trim()}>
            Validate
          </button>
        </div>

        {preview && preview.ok && (
          <>
            <div className="diff-summary">This will replace your current data with: {summaryLine(preview.summary)}.</div>
            <div className="button-row">
              <button className="btn btn--danger" onClick={handleConfirm}>
                Confirm import
              </button>
              <button className="btn" onClick={handleCancelPreview}>
                Cancel
              </button>
            </div>
          </>
        )}

        {preview && !preview.ok && (
          <div className="message message--error">
            {preview.errors.map((err) => (
              <div key={err}>{err}</div>
            ))}
          </div>
        )}

        {importMsg && !preview && <div className={`message message--${importMsg.type}`}>{importMsg.text}</div>}
      </section>

      <details className="settings-advanced">
        <summary>Advanced</summary>

        <section className="settings-section">
          <h2>Week schedule</h2>
          <p className="placeholder">
            Which day you cook and when the midweek refresh happens. Applies to newly generated weeks — saved plans
            keep their own days.
          </p>

          <div className="field">
            <label htmlFor="cook-day">Cook day</label>
            <select id="cook-day" value={cookDay} onChange={(e) => handleScheduleChange({ cookDay: e.target.value })}>
              {DAYS.map((day) => (
                <option key={day} value={day}>
                  {DAY_NAMES[day]}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="refresh-day">Refresh day</label>
            <select
              id="refresh-day"
              value={refreshDay ?? 'none'}
              onChange={(e) => handleScheduleChange({ refreshDay: e.target.value === 'none' ? null : e.target.value })}
            >
              {REFRESH_DAYS.map((day) => (
                <option key={day} value={day}>
                  {DAY_NAMES[day]}
                </option>
              ))}
              <option value="none">None</option>
            </select>
          </div>

          <p className="placeholder">
            Cooking on {DAY_NAMES[cookDay]}
            {refreshDay ? `, refresh on ${DAY_NAMES[refreshDay]}` : ', no midweek refresh'}. Lunches stay Monday–Friday.
          </p>
        </section>

        <TrackingSettings />

        <ByokSettings />

        <section className="settings-section">
          <h2>Nutrition lookups</h2>
          <p className="placeholder">
            Paste your free USDA FoodData Central API key to use it as a fallback when Open Food Facts has no match.
            Lookups only run when you tap Scan in the pantry — never in the background.
          </p>

          <div className="field">
            <label htmlFor="fdc-key">FDC API key</label>
            <input
              id="fdc-key"
              type="password"
              value={fdcKeyDraft}
              onChange={(e) => setFdcKeyDraft(e.target.value)}
              placeholder={fdcKey ? '••••••••' : 'paste key'}
            />
          </div>

          <div className="button-row">
            <button className="btn btn--primary" onClick={handleSaveFdcKey} disabled={fdcKeyDraft.trim() === fdcKey}>
              Save
            </button>
            {fdcKey && (
              <button className="btn btn--danger" onClick={handleRemoveFdcKey}>
                Remove
              </button>
            )}
          </div>

          {fdcMsg && <div className={`message message--${fdcMsg.type}`}>{fdcMsg.text}</div>}
        </section>
      </details>
    </div>
  )
}

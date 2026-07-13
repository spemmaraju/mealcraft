import { useRef, useState } from 'react'
import * as storage from '../storage.js'

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

  async function handleExportDownload() {
    const json = await storage.exportState()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `mealcraft-export-${todayStamp()}.json`
    a.click()
    URL.revokeObjectURL(url)
    setExportMsg({ type: 'success', text: 'Export downloaded.' })
  }

  async function handleExportCopy() {
    const json = await storage.exportState()
    try {
      await navigator.clipboard.writeText(json)
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
    </div>
  )
}

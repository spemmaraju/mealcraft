import { useEffect, useState } from 'react'
import * as storage from '../storage.js'
import { shouldNudgeBackup, daysSinceExport } from '../backupOps.js'

// Dismiss is in-memory only — it reappears next launch, same as the app's
// other non-destructive confirms are re-askable rather than permanently silenced.
export default function BackupNudge({ onGoSettings }) {
  const [settings, setSettings] = useState(null)
  const [hasUserData, setHasUserData] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  async function reload() {
    const [components, weeks, logs, s] = await Promise.all([
      storage.get('components'),
      storage.get('weeks'),
      storage.get('logs'),
      storage.get('settings'),
    ])
    setHasUserData(components.length > 0 || weeks.length > 0 || logs.length > 0)
    setSettings(s)
  }

  useEffect(() => {
    reload()
    return storage.subscribe(reload)
  }, [])

  if (!settings || dismissed) return null

  const nowISO = new Date().toISOString()
  if (!shouldNudgeBackup({ lastExportAt: settings.lastExportAt, hasUserData, nowISO })) return null

  const days = daysSinceExport({ lastExportAt: settings.lastExportAt, nowISO })
  const text = days == null ? 'No backup yet' : `No backup in ${days} days`

  return (
    <div className="banner">
      <span>{text} — your data lives only on this device.</span>
      <div className="banner__actions">
        <button type="button" className="btn" onClick={onGoSettings}>
          Go to Settings
        </button>
        <button type="button" className="btn banner__dismiss" onClick={() => setDismissed(true)}>
          Dismiss
        </button>
      </div>
    </div>
  )
}

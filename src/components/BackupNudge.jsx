import { useEffect, useState } from 'react'
import * as storage from '../storage.js'
import { shouldNudgeBackup, daysSinceExport } from '../backupOps.js'

// Round 2.6 §5: no longer a dismissible top banner nagging every screen —
// it's a quiet card at the bottom of Settings (App.jsx puts the "overdue"
// signal on the Settings tab icon instead). `onExport` is SettingsScreen's
// own download handler, so tapping the card's button does a real export
// right there rather than a "go find the button above" redirect.
export default function BackupNudge({ onExport }) {
  const [settings, setSettings] = useState(null)
  const [hasUserData, setHasUserData] = useState(false)

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

  if (!settings) return null

  const nowISO = new Date().toISOString()
  const overdue = shouldNudgeBackup({ lastExportAt: settings.lastExportAt, hasUserData, nowISO })
  if (!overdue) return null

  const days = daysSinceExport({ lastExportAt: settings.lastExportAt, nowISO })
  const text = days == null ? "You haven't backed up yet." : `It's been ${days} days since your last backup.`

  return (
    <section className="backup-card backup-card--overdue">
      <h2>Backup</h2>
      <p className="placeholder">{text} Your data lives only on this device — export is the only backup.</p>
      <button type="button" className="btn btn--primary" onClick={onExport}>
        Export now
      </button>
    </section>
  )
}

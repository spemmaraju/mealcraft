import { useEffect, useState } from 'react'
import * as storage from '../storage.js'

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  return `${Math.round(bytes / 1024)} KB`
}

function summaryLine(summary) {
  if (!summary) return ''
  const total = Object.values(summary).reduce((sum, n) => sum + n, 0)
  return `${total} items`
}

// Round 5 Fix 5: one automatic full-state snapshot per day (captured on app
// boot by storage.captureSnapshotIfNeeded — see App.jsx), kept as a safety
// net against a bad write or corruption bug. It's NOT a replacement for the
// user's real export/backup above — just a local undo-of-last-resort.
// Restore is destructive, so it uses the app's usual two-step inline
// confirm (see ComponentEditor/PantryItemEditor's "Really delete?" pattern).
export default function SnapshotsPanel() {
  const [snapshots, setSnapshots] = useState([])
  const [confirmingDate, setConfirmingDate] = useState(null)
  const [msg, setMsg] = useState(null)
  const [persisted, setPersisted] = useState(null)

  async function reload() {
    setSnapshots(await storage.listSnapshots())
  }

  useEffect(() => {
    reload()
    navigator.storage
      ?.persisted?.()
      .then(setPersisted)
      .catch(() => setPersisted(null))
    return storage.subscribe(reload)
  }, [])

  async function handleRestore(date) {
    const result = await storage.restoreSnapshot(date)
    setConfirmingDate(null)
    if (result.ok) {
      setMsg({ type: 'success', text: `Restored the ${date} snapshot.` })
    } else {
      setMsg({ type: 'error', text: 'Restore failed — nothing was changed.' })
    }
  }

  return (
    <section className="settings-section">
      <h2>Snapshots</h2>
      <p className="placeholder">
        A safety net, not a backup — one automatic snapshot a day, on this device only. Export (above) is still your
        real backup.
        {persisted === true && ' Persistent storage is on for this site.'}
        {persisted === false && " This site's storage may be cleared if the device runs low on space."}
      </p>

      {snapshots.length === 0 && (
        <p className="placeholder">No snapshots yet — one is captured next time you open the app.</p>
      )}

      {snapshots.map((snap) => (
        <div key={snap.date} className="snapshot-row">
          <span className="placeholder">
            {snap.date} · {formatSize(snap.size)} · {summaryLine(snap.summary)}
          </span>
          {confirmingDate !== snap.date ? (
            <button type="button" className="btn" onClick={() => setConfirmingDate(snap.date)}>
              Restore
            </button>
          ) : (
            <span className="button-row">
              <span className="sheet__confirm-text">Replace current data?</span>
              <button type="button" className="btn btn--danger" onClick={() => handleRestore(snap.date)}>
                Really restore
              </button>
              <button type="button" className="btn" onClick={() => setConfirmingDate(null)}>
                Cancel
              </button>
            </span>
          )}
        </div>
      ))}

      {msg && <div className={`message message--${msg.type}`}>{msg.text}</div>}
    </section>
  )
}

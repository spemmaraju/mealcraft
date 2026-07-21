import { useEffect, useState } from 'react'
import * as storage from '../storage.js'
import * as trackOps from '../trackOps.js'
import LogMealCard from '../components/LogMealCard.jsx'
import GaugesPanel from '../components/GaugesPanel.jsx'

export default function TrackScreen() {
  const [components, setComponents] = useState([])
  const [weeks, setWeeks] = useState([])
  const [logs, setLogs] = useState([])
  const [settings, setSettings] = useState(null)
  const [confirmingRemove, setConfirmingRemove] = useState(null)

  async function reload() {
    const [c, w, l, s] = await Promise.all([
      storage.get('components'),
      storage.get('weeks'),
      storage.get('logs'),
      storage.get('settings'),
    ])
    setComponents(c)
    setWeeks(w)
    setLogs(l)
    setSettings(s)
  }

  useEffect(() => {
    reload()
    return storage.subscribe(reload)
  }, [])

  async function handleLogLunch(card, dateISO) {
    await storage.set('logs', trackOps.upsertLog(logs, trackOps.buildLogFromCard(card, dateISO)))
  }

  async function handleUpdatePortion(dateISO, componentId, count) {
    const entry = trackOps.logFor(logs, dateISO, 'lunch')
    if (!entry) return
    await storage.set('logs', trackOps.upsertLog(logs, trackOps.setPortionCount(entry.log, componentId, count)))
  }

  async function handleSetRating(dateISO, rating) {
    const entry = trackOps.logFor(logs, dateISO, 'lunch')
    if (!entry) return
    await storage.set('logs', trackOps.upsertLog(logs, { ...entry.log, quickRating: rating }))
  }

  async function handleRemoveLog(dateISO) {
    const entry = trackOps.logFor(logs, dateISO, 'lunch')
    if (!entry) return
    await storage.set('logs', trackOps.removeLogAt(logs, entry.index))
  }

  async function handleLogOther(dateISO, componentIds) {
    if (componentIds.length === 0) return
    await storage.set('logs', trackOps.upsertLog(logs, trackOps.buildLogFromCard({ componentIds }, dateISO, 'other')))
  }

  async function handleRemoveAt(index) {
    await storage.set('logs', trackOps.removeLogAt(logs, index))
    setConfirmingRemove(null)
  }

  if (!settings) return null

  const today = trackOps.todayISO()
  const week = trackOps.currentWeek(weeks, today)
  const byId = Object.fromEntries(components.map((c) => [c.id, c]))
  const recent = logs
    .map((log, index) => ({ log, index }))
    .sort((a, b) => (a.log.date < b.log.date ? 1 : a.log.date > b.log.date ? -1 : 0))
    .slice(0, 10)

  return (
    <div className="screen">
      <h1>Track</h1>

      <LogMealCard
        week={week}
        logs={logs}
        components={components}
        today={today}
        onLogLunch={handleLogLunch}
        onUpdatePortion={handleUpdatePortion}
        onSetRating={handleSetRating}
        onRemoveLog={handleRemoveLog}
        onLogOther={handleLogOther}
      />

      <GaugesPanel logs={logs} components={components} week={week} settings={settings} today={today} />

      <div className="plan-section">
        <h2>Recent logs</h2>
        {recent.length === 0 ? (
          <p className="placeholder">Nothing logged yet.</p>
        ) : (
          recent.map(({ log, index }) => (
            <div key={index} className="recent-log-row">
              <div className="recent-log-row__body">
                <span className="recent-log-row__date">
                  {log.date} · {log.meal}
                </span>
                <span className="recent-log-row__components">
                  {log.componentIds.map((id) => byId[id]?.name || id).join(', ') || '(none)'}
                </span>
                {log.quickRating && <span className="chip chip--active recent-log-row__rating">{log.quickRating}</span>}
              </div>
              {confirmingRemove === index ? (
                <span className="recent-log-row__confirm">
                  <button type="button" className="btn btn--danger" onClick={() => handleRemoveAt(index)}>
                    Remove?
                  </button>
                  <button type="button" className="btn" onClick={() => setConfirmingRemove(null)}>
                    Keep
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  className="assembly-card__x"
                  onClick={() => setConfirmingRemove(index)}
                  aria-label={`Remove log for ${log.date}`}
                >
                  ×
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

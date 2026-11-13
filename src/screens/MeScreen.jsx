import { useEffect, useState } from 'react'
import * as storage from '../storage.js'
import * as trackOps from '../trackOps.js'
import WeekInsights from '../components/WeekInsights.jsx'
import SettingsScreen from './SettingsScreen.jsx'

// Three-tab layout: "This week" insights (moved off Today) plus Settings.
export default function MeScreen() {
  const [logs, setLogs] = useState([])
  const [components, setComponents] = useState([])
  const [pantry, setPantry] = useState([])

  useEffect(() => {
    function load() {
      Promise.all([storage.get('logs'), storage.get('components'), storage.get('pantry')]).then(([l, c, p]) => {
        setLogs(l)
        setComponents(c)
        setPantry(p)
      })
    }
    load()
    return storage.subscribe(load)
  }, [])

  const weekOf = trackOps.currentWeekSundayISO(trackOps.todayISO())
  const dates = trackOps.weekDatesFull(weekOf).map((d) => d.date)

  return (
    <div className="screen">
      <h1>Me</h1>
      <WeekInsights logs={logs} components={components} pantry={pantry} dates={dates} />
      <SettingsScreen embedded />
    </div>
  )
}

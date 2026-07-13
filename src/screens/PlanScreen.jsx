import { useEffect, useState } from 'react'
import * as storage from '../storage.js'
import GenerateWeekForm from '../components/GenerateWeekForm.jsx'
import WeekImportBox from '../components/WeekImportBox.jsx'
import WeekSummaryCard from '../components/WeekSummaryCard.jsx'

export default function PlanScreen() {
  const [pantry, setPantry] = useState([])
  const [components, setComponents] = useState([])
  const [weeks, setWeeks] = useState([])
  const [feedback, setFeedback] = useState([])
  const [settings, setSettings] = useState(null)
  const [showGenerate, setShowGenerate] = useState(false)

  async function reload() {
    const [p, c, w, f, s] = await Promise.all([
      storage.get('pantry'),
      storage.get('components'),
      storage.get('weeks'),
      storage.get('feedback'),
      storage.get('settings'),
    ])
    setPantry(p)
    setComponents(c)
    setWeeks(w)
    setFeedback(f)
    setSettings(s)
  }

  useEffect(() => {
    reload()
    return storage.subscribe(reload)
  }, [])

  async function handleImported(applied) {
    await storage.set('components', applied.components)
    await storage.set('weeks', applied.weeks)
    setShowGenerate(false)
  }

  if (!settings) return null

  const latestWeek = weeks.length > 0 ? [...weeks].sort((a, b) => (a.weekOf < b.weekOf ? 1 : -1))[0] : null

  return (
    <div className="screen">
      <h1>Plan</h1>

      {latestWeek && !showGenerate ? (
        <WeekSummaryCard week={latestWeek} components={components} onGenerateNew={() => setShowGenerate(true)} />
      ) : (
        <>
          <GenerateWeekForm state={{ pantry, components, feedback, settings }} />
          <WeekImportBox components={components} weeks={weeks} onImported={handleImported} />
        </>
      )}
    </div>
  )
}

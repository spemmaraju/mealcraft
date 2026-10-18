import { useEffect, useState } from 'react'
import * as storage from '../storage.js'
import { MEALS, MEAL_LABELS } from '../schema.js'
import { weekInsights } from '../insightsOps.js'

/**
 * Phase 21 "This week" card on Track: home vs out, how many times you
 * cooked, and average protein per meal type — directional, no targets.
 * Reads cookSessions itself (like ShelfSection) so TrackScreen doesn't grow.
 * Hidden until something is logged this week.
 */
export default function WeekInsights({ logs, components, pantry, dates }) {
  const [cookSessions, setCookSessions] = useState([])

  useEffect(() => {
    const load = () => storage.get('cookSessions').then(setCookSessions)
    load()
    return storage.subscribe(load)
  }, [])

  const w = weekInsights({ logs, cookSessions, components, pantry, dates })
  if (w.meals === 0 && w.cooks === 0) return null

  const where = [
    `${w.home} of ${w.meals} meal${w.meals === 1 ? '' : 's'} at home`,
    w.packed > 0 && `${w.packed} packed`,
    w.out > 0 && `${w.out} out`,
    w.untagged > 0 && `${w.untagged} untagged`,
  ].filter(Boolean)
  const protein = MEALS.filter((m) => w.proteinByMeal[m] != null).map((m) => `${MEAL_LABELS[m]} ${w.proteinByMeal[m]} g`)

  return (
    <section className="week-insights">
      <h2 className="track-section-head">This week</h2>
      <div className="week-insights__card">
        <p className="week-insights__line">{where.join(' · ')}</p>
        <p className="week-insights__line">
          Cooked {w.cooks} time{w.cooks === 1 ? '' : 's'}
        </p>
        {protein.length > 0 && <p className="week-insights__line week-insights__muted">Avg protein — {protein.join(' · ')}</p>}
      </div>
    </section>
  )
}

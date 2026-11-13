import { useState } from 'react'
import * as trackOps from '../trackOps.js'
import { dayFiber, todayHint } from '../todayOps.js'
import TargetsSheet from './TargetsSheet.jsx'
import { CheckIcon, StreakIcon } from './Icons.jsx'

// Today hero card: day-strip + three eaten-vs-target bars (kcal, protein,
// fibre) + one hint line + one quiet footer line. Replaces GaugesPanel's weekly bar-chart
// layout — reuses its pure math (trackOps.dayMacros/estimateFraction/
// lunchStreak; money-saved was dropped in Phase 21) but the visual is the approved bundle's, not the
// old per-weekday bars.
//
// Round 3.5 design sync: the day-strip is now the full Sun-Sat 7 days
// (trackOps.weekDatesFull) — logging isn't a Mon-Fri-only concept even
// though WeekPlan/run-sheet logic still is, so weekDates itself (Mon-Fri)
// stays untouched for those callers. The strip still only controls which
// day's meal cards show below, never the hero's own stats (those are
// always "today", exactly like the GaugesPanel it replaces).
//
// Also deliberately dropped: the old plate-mix (protein/carbs/veg/other)
// bar. It's a different axis (food-group mix) than the donut (macro-kcal
// split) and doesn't fit the footer either — CLAUDE.md §4.5 says report and
// drop rather than force a fit.
const fmt = (n) => Math.round(n).toLocaleString('en-US')

// One bar: shaded target zone (optional) + fill + marker, scaled so the zone
// sits in the left ~75% of the track. Directional, never a pass/fail.
function Bar({ label, eaten, text, low, high, target, caption }) {
  const zoneHigh = high ?? target
  const scaleMax = Math.max(zoneHigh * 1.3, eaten, 1)
  const fill = Math.min(100, (eaten / scaleMax) * 100)
  return (
    <div className="track-hero__bandwrap">
      <div className="track-hero__bandhead">
        <span>{label}</span>
        <b>{text}</b>
      </div>
      <div className="track-hero__bandtrack">
        {low != null && <div className="track-hero__bandzone" style={{ left: `${(low / scaleMax) * 100}%`, width: `${((high - low) / scaleMax) * 100}%` }} />}
        <div className="track-hero__bandfill" style={{ width: `${fill}%` }} />
        <div className="track-hero__bandmarker" style={{ left: `${fill}%` }} />
      </div>
      {caption && <p className="track-hero__bandcaption">{caption}</p>}
    </div>
  )
}

export default function TrackHero({ logs, components, pantry, settings, today, weekOf, selectedDate, onSelectDate }) {
  const [targetsOpen, setTargetsOpen] = useState(false)
  const macros = trackOps.dayMacros(logs, components, pantry, today)
  const fiber = dayFiber(logs, components, pantry, today)
  const { low_g, high_g } = settings.proteinBand
  const { kcalBand, fiberTarget_g } = settings
  const hint = todayHint({ macros, fiber_g: fiber, settings, hour: new Date().getHours() })

  const weekLogs = trackOps.logsForWeek(logs, weekOf)
  const estimate = trackOps.estimateFraction(weekLogs, components, pantry)
  const streak = trackOps.loggingStreak(logs, today)

  return (
    <div className="track-hero">
      <div className="track-hero__daystrip">
        {trackOps.weekDatesFull(weekOf).map(({ day, date }) => {
          const logged = logs.some((l) => l.date === date && l.items.length > 0)
          const isSelected = date === selectedDate
          const isToday = date === today
          return (
            <button
              key={date}
              type="button"
              className="track-hero__day"
              onClick={() => onSelectDate(date)}
              aria-current={isSelected ? 'date' : undefined}
              aria-label={`${day}${logged ? ', logged' : ''}${isToday ? ', today' : ''}`}
            >
              <span className="track-hero__daylabel">{day[0]}</span>
              <span
                className={`track-hero__circle${isSelected ? ' track-hero__circle--selected' : ''}${isToday && !isSelected ? ' track-hero__circle--today' : ''}`}
              >
                {logged && <CheckIcon size={14} />}
              </span>
            </button>
          )
        })}
      </div>

      {kcalBand && (
        <Bar label="Calories" eaten={macros.kcal} text={`${fmt(macros.kcal)} of ${fmt(kcalBand.low)}–${fmt(kcalBand.high)} kcal`} low={kcalBand.low} high={kcalBand.high} />
      )}
      <Bar
        label="Protein"
        eaten={macros.protein_g}
        text={`${fmt(macros.protein_g)} of ${low_g}–${high_g} g`}
        low={low_g}
        high={high_g}
        caption={kcalBand ? null : 'Shaded zone is your target band, not a number to hit exactly.'}
      />
      {kcalBand && fiberTarget_g != null && (
        <Bar label="Fibre" eaten={fiber} text={`${fmt(fiber)} of ${fmt(fiberTarget_g)} g`} target={fiberTarget_g} caption="counted where fibre is known" />
      )}

      {hint && <p className="track-hero__hint">{hint}</p>}
      {kcalBand ? (
        <p className="track-hero__quiet">
          Carbs {fmt(macros.carbs_g)} g · Fat {fmt(macros.fat_g)} g ·{' '}
          <button type="button" className="track-hero__link" onClick={() => setTargetsOpen(true)}>
            Edit targets
          </button>
        </p>
      ) : (
        <button type="button" className="targets-cta" onClick={() => setTargetsOpen(true)}>
          <b>Set your daily targets</b>
          <span>A rough calorie, protein and fibre goal from your details</span>
        </button>
      )}
      {estimate.showHint && <p className="track-hero__estimate-hint">Mostly estimates — treat as directional.</p>}
      {targetsOpen && <TargetsSheet settings={settings} onClose={() => setTargetsOpen(false)} />}

      <div className="track-hero__footerline">
        <StreakIcon size={15} />
        {streak > 0 ? `${streak}-day logging streak` : 'No logging streak yet'}
      </div>
    </div>
  )
}

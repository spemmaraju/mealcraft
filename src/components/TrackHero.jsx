import * as trackOps from '../trackOps.js'
import { CheckIcon, StreakIcon } from './Icons.jsx'

const DONUT_R = 15.5
const DONUT_C = 2 * Math.PI * DONUT_R

// Track hero card (screens/track.html): day-strip + macro donut + protein
// band + one quiet footer line. Replaces GaugesPanel's weekly bar-chart
// layout — reuses its pure math (trackOps.dayMacros/estimateFraction/
// lunchStreak/moneySaved) but the visual is the approved bundle's, not the
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
export default function TrackHero({ logs, components, pantry, settings, today, weekOf, selectedDate, onSelectDate }) {
  const macros = trackOps.dayMacros(logs, components, pantry, today)
  const donut = trackOps.macroDonut(macros)
  const { low_g, high_g } = settings.proteinBand
  const proteinG = macros.protein_g
  const scaleMax = Math.max(high_g * 1.3, proteinG, 1)
  const bandZoneLeft = (low_g / scaleMax) * 100
  const bandZoneWidth = ((high_g - low_g) / scaleMax) * 100
  const bandFillWidth = Math.min(100, (proteinG / scaleMax) * 100)

  const weekLogs = trackOps.logsForWeek(logs, weekOf)
  const estimate = trackOps.estimateFraction(weekLogs, components, pantry)
  const streak = trackOps.loggingStreak(logs, today)
  const money = trackOps.moneySaved(logs, settings, weekOf)

  const carbsArc = donut.carbsPct * DONUT_C
  const fatArc = donut.fatPct * DONUT_C
  const proteinArc = donut.proteinPct * DONUT_C

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

      <div className="track-hero__herotop">
        <svg className="track-hero__donut" viewBox="0 0 36 36">
          <circle cx="18" cy="18" r={DONUT_R} fill="none" stroke="var(--surface-3)" strokeWidth="4" />
          {donut.hasData && (
            <>
              <circle
                cx="18"
                cy="18"
                r={DONUT_R}
                fill="none"
                stroke="var(--donut-carbs)"
                strokeWidth="4"
                strokeDasharray={`${carbsArc} ${DONUT_C}`}
                strokeLinecap="round"
                transform="rotate(-90 18 18)"
              />
              <circle
                cx="18"
                cy="18"
                r={DONUT_R}
                fill="none"
                stroke="var(--donut-fat)"
                strokeWidth="4"
                strokeDasharray={`${fatArc} ${DONUT_C}`}
                strokeDashoffset={-carbsArc}
                strokeLinecap="round"
                transform="rotate(-90 18 18)"
              />
              <circle
                cx="18"
                cy="18"
                r={DONUT_R}
                fill="none"
                stroke="var(--donut-protein)"
                strokeWidth="4"
                strokeDasharray={`${proteinArc} ${DONUT_C}`}
                strokeDashoffset={-(carbsArc + fatArc)}
                strokeLinecap="round"
                transform="rotate(-90 18 18)"
              />
            </>
          )}
          <text x="18" y="16.5" textAnchor="middle" fontSize="8" fontWeight="700" fill="var(--text)">
            {Math.round(macros.kcal)}
          </text>
          <text x="18" y="23" textAnchor="middle" fontSize="4.2" fill="var(--text-muted)">
            kcal
          </text>
        </svg>
        <div className="track-hero__macros">
          <div className="track-hero__macro">
            <div className="track-hero__macro-pct" style={{ color: 'var(--donut-carbs)' }}>
              {Math.round(donut.carbsPct * 100)}%
            </div>
            <div className="track-hero__macro-g">{Math.round(macros.carbs_g)}g</div>
            <div className="track-hero__macro-lbl">Carbs</div>
          </div>
          <div className="track-hero__macro">
            <div className="track-hero__macro-pct" style={{ color: 'var(--donut-fat)' }}>
              {Math.round(donut.fatPct * 100)}%
            </div>
            <div className="track-hero__macro-g">{Math.round(macros.fat_g)}g</div>
            <div className="track-hero__macro-lbl">Fat</div>
          </div>
          <div className="track-hero__macro">
            <div className="track-hero__macro-pct" style={{ color: 'var(--donut-protein)' }}>
              {Math.round(donut.proteinPct * 100)}%
            </div>
            <div className="track-hero__macro-g">{Math.round(macros.protein_g)}g</div>
            <div className="track-hero__macro-lbl">Protein</div>
          </div>
        </div>
      </div>

      {estimate.showHint && <p className="track-hero__estimate-hint">Mostly estimates — treat as directional.</p>}

      <div className="track-hero__bandwrap">
        <div className="track-hero__bandhead">
          <span>Protein today</span>
          <b>{Math.round(proteinG)}g logged</b>
        </div>
        <div className="track-hero__bandtrack">
          <div className="track-hero__bandzone" style={{ left: `${bandZoneLeft}%`, width: `${bandZoneWidth}%` }} />
          <div className="track-hero__bandfill" style={{ width: `${bandFillWidth}%` }} />
          <div className="track-hero__bandmarker" style={{ left: `${bandFillWidth}%` }} />
        </div>
        <p className="track-hero__bandcaption">Shaded zone is your target band, not a number to hit exactly.</p>
      </div>

      <div className="track-hero__footerline">
        <StreakIcon size={15} />
        {streak > 0 ? `${streak}-day logging streak` : 'No logging streak yet'} · ${money.allTime.toFixed(2)} saved vs.
        bought lunch
      </div>
    </div>
  )
}

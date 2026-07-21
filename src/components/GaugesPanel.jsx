import * as trackOps from '../trackOps.js'

const MIX_SEGMENTS = [
  { key: 'protein', label: 'Protein' },
  { key: 'carbs', label: 'Carbs' },
  { key: 'veg', label: 'Veg' },
  { key: 'other', label: 'Other' },
]

export default function GaugesPanel({ logs, components, week, settings, today }) {
  const weekOf = week ? week.weekOf : trackOps.currentWeekSundayISO(today)
  const weekLogs = trackOps.logsForWeek(logs, weekOf)
  const proteinDays = trackOps.proteinByDay(logs, components, weekOf)
  const mix = trackOps.plateMix(weekLogs, components)
  const streak = trackOps.lunchStreak(logs, today)
  const money = trackOps.moneySaved(logs, settings, weekOf)
  const estimate = trackOps.estimateFraction(weekLogs, components)

  const { low_g, high_g } = settings.proteinBand
  const maxLogged = Math.max(0, ...proteinDays.map((d) => d.protein_g))
  const scaleMax = Math.max(high_g * 1.3, maxLogged, 1)
  const bandBottom = (low_g / scaleMax) * 100
  const bandHeight = ((high_g - low_g) / scaleMax) * 100

  return (
    <div className="plan-section gauges-panel">
      <h2>Gauges</h2>
      {estimate.showHint && <span className="provenance-tag">mostly estimates — treat as directional</span>}

      <div className="protein-chart">
        <div className="protein-chart__band" style={{ bottom: `${bandBottom}%`, height: `${bandHeight}%` }} />
        <div className="protein-chart__bars">
          {proteinDays.map((d) => {
            const inBand = d.protein_g >= low_g && d.protein_g <= high_g
            const barHeight = Math.min(100, (d.protein_g / scaleMax) * 100)
            return (
              <div key={d.date} className="protein-chart__bar-col">
                {d.logged ? (
                  <div
                    className={`protein-chart__bar${inBand ? ' protein-chart__bar--in-band' : ''}${d.hasMissing ? ' protein-chart__bar--partial' : ''}`}
                    style={{ height: `${barHeight}%` }}
                    title={`${Math.round(d.protein_g)}g protein${d.hasMissing ? ' (partial — some macros unknown)' : ''}`}
                  />
                ) : (
                  <div className="protein-chart__dot" title="not logged" />
                )}
                <span className="protein-chart__day-label">{d.day}</span>
              </div>
            )
          })}
        </div>
      </div>

      {mix ? (
        <>
          <div className="plate-mix__legend">
            {MIX_SEGMENTS.map((s) => (
              <span key={s.key} className="plate-mix__legend-item">
                <span className={`plate-mix__legend-dot plate-mix__legend-dot--${s.key}`} />
                {s.label}
              </span>
            ))}
          </div>
          <div className="plate-mix__bar">
            {MIX_SEGMENTS.map((s) => (
              <span key={s.key} className={`plate-mix__segment plate-mix__segment--${s.key}`} style={{ width: `${mix[s.key] * 100}%` }} />
            ))}
          </div>
        </>
      ) : (
        <p className="placeholder">Log a few lunches to see your plate mix.</p>
      )}

      <p className="gauges-panel__streak">
        {streak > 0 ? `${streak}-weekday lunch streak` : 'No streak yet — log a lunch to start one.'}
      </p>
      <p className="gauges-panel__money">
        This week: ${money.week.toFixed(2)} · All-time: ${money.allTime.toFixed(2)} (directional estimate)
      </p>
    </div>
  )
}

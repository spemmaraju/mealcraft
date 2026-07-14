import { groupRunSheetByStation, runSheetProgress } from '../weekOps.js'
import { DAY_NAMES } from '../schema.js'

const STATION_LABELS = { stovetop: 'Stovetop', oven: 'Oven', instant_pot: 'Instant Pot', none: 'Other' }

export default function RunSheet({ week, components, settings, onToggleStep }) {
  const byId = Object.fromEntries(components.map((c) => [c.id, c]))
  const { done, total } = runSheetProgress(week)
  const groups = groupRunSheetByStation(week.runSheet)
  const title = `${DAY_NAMES[settings?.cookDay] ?? 'Sunday'} run sheet`

  if (total === 0) {
    return (
      <div className="plan-section">
        <h2>{title}</h2>
        <p className="placeholder">No run-sheet steps in this week.</p>
      </div>
    )
  }

  return (
    <div className="plan-section">
      <h2>{title}</h2>
      <div className="run-sheet__progress">
        {done} of {total} done
      </div>
      <div className="run-sheet__bar">
        <div className="run-sheet__bar-fill" style={{ width: `${total === 0 ? 0 : (done / total) * 100}%` }} />
      </div>

      {groups.map((group) => (
        <div key={group.station} className="run-sheet__group">
          <h3 className="run-sheet__station">{STATION_LABELS[group.station]}</h3>
          {group.steps.map(({ step, index }) => (
            <div key={index} className={`run-sheet__row${step.done ? ' run-sheet__row--done' : ''}`}>
              <button
                type="button"
                className={`run-sheet__check${step.done ? ' run-sheet__check--active' : ''}`}
                onClick={() => onToggleStep(index)}
                aria-pressed={step.done}
              >
                {step.done ? '✓' : ''}
              </button>
              <span className="run-sheet__time">{step.t}</span>
              <span className="run-sheet__action">
                {step.action}
                {step.componentId && byId[step.componentId] && (
                  <span className="run-sheet__component"> — {byId[step.componentId].name}</span>
                )}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

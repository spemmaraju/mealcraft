import { useState } from 'react'
import { RATINGS } from '../schema.js'
import * as trackOps from '../trackOps.js'

export default function LogMealCard({ week, logs, components, today, onLogLunch, onUpdatePortion, onSetRating, onRemoveLog, onLogOther }) {
  const byId = Object.fromEntries(components.map((c) => [c.id, c]))
  const weekOf = week ? week.weekOf : trackOps.currentWeekSundayISO(today)

  const [selectedDate, setSelectedDate] = useState(today)
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  const [showOther, setShowOther] = useState(false)
  const [otherSelected, setOtherSelected] = useState([])

  function selectDate(date) {
    setSelectedDate(date)
    setConfirmingRemove(false)
  }

  function toggleOther(componentId) {
    setOtherSelected((prev) => (prev.includes(componentId) ? prev.filter((id) => id !== componentId) : [...prev, componentId]))
  }

  function handleSaveOther() {
    onLogOther(selectedDate, otherSelected)
    setOtherSelected([])
    setShowOther(false)
  }

  const card = week ? trackOps.assemblyCardForDate(week, selectedDate) : null
  const entry = trackOps.logFor(logs, selectedDate, 'lunch')

  return (
    <div className="plan-section log-meal-card">
      <h2>Lunch</h2>

      <div className="day-strip">
        {trackOps.weekDates(weekOf).map(({ day, date }) => {
          const logged = trackOps.logFor(logs, date, 'lunch') !== null
          return (
            <button
              key={date}
              type="button"
              className={`day-strip__day${date === selectedDate ? ' day-strip__day--selected' : ''}${logged ? ' day-strip__day--logged' : ''}`}
              onClick={() => selectDate(date)}
            >
              {day}
            </button>
          )
        })}
      </div>

      {!card ? (
        <p className="placeholder">No plan for {selectedDate === today ? 'today' : selectedDate} — log something else or plan a week.</p>
      ) : !entry ? (
        <>
          <p className="log-meal-card__preview">
            {card.componentIds.length > 0 ? card.componentIds.map((id) => byId[id]?.name || id).join(', ') : 'No components yet.'}
          </p>
          <button type="button" className="btn btn--primary log-meal-card__log-btn" onClick={() => onLogLunch(card, selectedDate)}>
            Log lunch
          </button>
        </>
      ) : (
        <>
          {entry.log.portions.map((portion) => (
            <div key={portion.componentId} className="log-meal-card__portion">
              <span className="log-meal-card__portion-name">{byId[portion.componentId]?.name || portion.componentId}</span>
              <div className="stepper">
                <button
                  type="button"
                  className="stepper__btn"
                  onClick={() => onUpdatePortion(selectedDate, portion.componentId, portion.count - 0.5)}
                >
                  −
                </button>
                <span className="stepper__value">{portion.count}</span>
                <button
                  type="button"
                  className="stepper__btn"
                  onClick={() => onUpdatePortion(selectedDate, portion.componentId, portion.count + 0.5)}
                >
                  +
                </button>
              </div>
            </div>
          ))}

          <div className="chip-row">
            {RATINGS.map((r) => (
              <button
                key={r}
                type="button"
                className={`chip${entry.log.quickRating === r ? ' chip--active' : ''}`}
                onClick={() => onSetRating(selectedDate, entry.log.quickRating === r ? null : r)}
              >
                {r}
              </button>
            ))}
          </div>

          {confirmingRemove ? (
            <div className="button-row">
              <button
                type="button"
                className="btn btn--danger"
                onClick={() => {
                  onRemoveLog(selectedDate)
                  setConfirmingRemove(false)
                }}
              >
                Remove?
              </button>
              <button type="button" className="btn" onClick={() => setConfirmingRemove(false)}>
                Keep
              </button>
            </div>
          ) : (
            <button type="button" className="btn" onClick={() => setConfirmingRemove(true)}>
              Remove log
            </button>
          )}
        </>
      )}

      {showOther ? (
        <div className="log-meal-card__other">
          <p>Select components:</p>
          <div className="log-meal-card__other-list">
            {components
              .filter((c) => !c.archived)
              .map((c) => (
                <label key={c.id} className="log-meal-card__other-row">
                  <input type="checkbox" checked={otherSelected.includes(c.id)} onChange={() => toggleOther(c.id)} />
                  {c.name}
                </label>
              ))}
          </div>
          <div className="button-row">
            <button type="button" className="btn btn--primary" disabled={otherSelected.length === 0} onClick={handleSaveOther}>
              Save
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setShowOther(false)
                setOtherSelected([])
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="list-add-btn" onClick={() => setShowOther(true)}>
          ＋ Log something else
        </button>
      )}
    </div>
  )
}

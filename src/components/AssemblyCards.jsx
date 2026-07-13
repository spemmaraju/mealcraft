import { useState } from 'react'

export default function AssemblyCards({ week, components, onSwap, onRemove, onRequestPicker }) {
  const byId = Object.fromEntries(components.map((c) => [c.id, c]))
  const [swapping, setSwapping] = useState(null)
  const [confirmingRemove, setConfirmingRemove] = useState(null)

  function handleSwapClick(day) {
    if (swapping === day) {
      setSwapping(null)
    } else if (swapping) {
      onSwap(swapping, day)
      setSwapping(null)
    } else {
      setSwapping(day)
    }
  }

  function handleRemoveClick(day, componentId) {
    const key = `${day}:${componentId}`
    if (confirmingRemove === key) {
      onRemove(day, componentId)
      setConfirmingRemove(null)
    } else {
      setConfirmingRemove(key)
    }
  }

  function renderComponentRow(day, componentId, { removable }) {
    const component = byId[componentId]
    const key = `${day}:${componentId}`
    const isConfirming = confirmingRemove === key
    return (
      <div key={componentId} className="assembly-card__row">
        {removable ? (
          <button
            type="button"
            className="assembly-card__component"
            onClick={() => onRequestPicker({ day, mode: 'substitute', fromId: componentId, type: component?.type })}
          >
            {component ? component.name : componentId}
          </button>
        ) : (
          <span className="assembly-card__component assembly-card__component--static">
            {component ? component.name : componentId}
          </span>
        )}
        {removable &&
          (isConfirming ? (
            <span className="assembly-card__remove-confirm">
              <button type="button" className="btn btn--danger" onClick={() => handleRemoveClick(day, componentId)}>
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
              onClick={() => handleRemoveClick(day, componentId)}
              aria-label={`Remove ${component ? component.name : componentId}`}
            >
              ×
            </button>
          ))}
      </div>
    )
  }

  const refreshIndex = week.assembly.findIndex((a) => a.day === week.refresh.day)
  const cards = []
  week.assembly.forEach((a, i) => {
    cards.push(
      <div key={a.day} className={`assembly-card${swapping === a.day ? ' assembly-card--selected' : ''}${swapping && swapping !== a.day ? ' assembly-card--swap-target' : ''}`}>
        <div className="assembly-card__header">
          <h3>{a.day}</h3>
          <button type="button" className="btn assembly-card__swap-btn" onClick={() => handleSwapClick(a.day)}>
            {swapping === a.day ? 'Cancel' : swapping ? `Swap with ${swapping}` : 'Swap'}
          </button>
        </div>

        {a.componentIds.length === 0 ? (
          <p className="placeholder assembly-card__empty">No components yet.</p>
        ) : (
          a.componentIds.map((id) => renderComponentRow(a.day, id, { removable: true }))
        )}

        {a.note && <p className="assembly-card__note">{a.note}</p>}

        <button type="button" className="list-add-btn" onClick={() => onRequestPicker({ day: a.day, mode: 'add' })}>
          ＋ Add component
        </button>
      </div>,
    )
    if (i === refreshIndex) {
      cards.push(
        <div key="refresh" className="assembly-card assembly-card--refresh">
          <div className="assembly-card__header">
            <h3>{week.refresh.day} refresh</h3>
          </div>
          {week.refresh.componentIds.length === 0 ? (
            <p className="placeholder assembly-card__empty">No refresh components.</p>
          ) : (
            week.refresh.componentIds.map((id) => renderComponentRow(`refresh:${week.refresh.day}`, id, { removable: false }))
          )}
          {week.refresh.steps.length > 0 && (
            <ul className="assembly-card__steps">
              {week.refresh.steps.map((s, idx) => (
                <li key={idx}>{s}</li>
              ))}
            </ul>
          )}
        </div>,
      )
    }
  })

  return (
    <div className="plan-section">
      <h2>Assembly</h2>
      {week.assembly.length === 0 ? (
        <p className="placeholder">No assembly days in this week.</p>
      ) : (
        cards
      )}
    </div>
  )
}

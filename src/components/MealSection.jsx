import { useState } from 'react'
import { RATINGS } from '../schema.js'
import * as trackOps from '../trackOps.js'
import MeasureInput from './MeasureInput.jsx'
import AddLogItemSheet from './AddLogItemSheet.jsx'

function itemLabel(item, components, pantry) {
  if (item.kind === 'component') return components.find((c) => c.id === item.componentId)?.name || item.componentId
  if (item.kind === 'pantry') return pantry.find((p) => p.id === item.pantryId)?.name || item.pantryId
  return item.name
}

// One meal within DayLog: summary + item rows (component -> ±0.5 stepper;
// pantry/adhoc -> MeasureInput), quickRating chips, remove-item/remove-log,
// and the "+ Add" entry point into AddLogItemSheet. Lunch keeps the
// existing one-tap "Log lunch from plan" flow when an assembly card exists
// and nothing's logged yet for the day.
export default function MealSection({
  meal,
  label,
  log,
  components,
  pantry,
  categories,
  fdcKey,
  card,
  onLogFromPlan,
  onAddItems,
  onSetItemCount,
  onSetItemMeasure,
  onRemoveItem,
  onSetRating,
  onRemoveLog,
  onSaveToPantry,
}) {
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  const [adding, setAdding] = useState(false)

  const showLogFromPlan = meal === 'lunch' && card && !log
  const hasItems = log && log.items.length > 0
  const macros = hasItems ? trackOps.logMacros(log, components, pantry) : null
  const existingComponentIds = log ? log.items.filter((i) => i.kind === 'component').map((i) => i.componentId) : []

  function handlePick(items) {
    onAddItems(items)
    setAdding(false)
  }

  return (
    <div className="meal-section">
      <h3 className="meal-section__title">{label}</h3>

      {showLogFromPlan ? (
        <>
          <p className="meal-section__preview">
            {card.componentIds.length > 0
              ? card.componentIds.map((id) => components.find((c) => c.id === id)?.name || id).join(', ')
              : 'No components yet.'}
          </p>
          <button type="button" className="btn btn--primary" onClick={onLogFromPlan}>
            Log lunch from plan
          </button>
        </>
      ) : !hasItems ? (
        <p className="placeholder">Nothing logged.</p>
      ) : (
        <>
          <p className="meal-section__summary">
            {log.items.map((item, i) => (
              <span key={i}>
                {i > 0 && ', '}
                {itemLabel(item, components, pantry)}
              </span>
            ))}
            {macros && (
              <span className="meal-section__subtotal">
                {' — '}
                {Math.round(macros.kcal)} kcal, {Math.round(macros.protein_g)}g protein
                {macros.missing > 0 && <span className="provenance-tag"> partial</span>}
              </span>
            )}
          </p>

          {log.items.map((item, index) => (
            <div key={index} className="meal-section__item-row">
              <span className="meal-section__item-name">{itemLabel(item, components, pantry)}</span>
              {item.kind === 'component' ? (
                <div className="stepper">
                  <button type="button" className="stepper__btn" onClick={() => onSetItemCount(index, item.count - 0.5)}>
                    −
                  </button>
                  <span className="stepper__value">{item.count}</span>
                  <button type="button" className="stepper__btn" onClick={() => onSetItemCount(index, item.count + 0.5)}>
                    +
                  </button>
                </div>
              ) : (
                <MeasureInput value={item.measure} onChange={(measure) => onSetItemMeasure(index, measure)} />
              )}
              <button
                type="button"
                className="btn list-row__remove"
                onClick={() => onRemoveItem(index)}
                aria-label={`Remove ${itemLabel(item, components, pantry)}`}
              >
                ✕
              </button>
            </div>
          ))}

          <div className="chip-row">
            {RATINGS.map((r) => (
              <button
                key={r}
                type="button"
                className={`chip${log.quickRating === r ? ' chip--active' : ''}`}
                onClick={() => onSetRating(log.quickRating === r ? null : r)}
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
                  onRemoveLog()
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

      {!showLogFromPlan && (
        <button type="button" className="list-add-btn" onClick={() => setAdding(true)}>
          ＋ Add
        </button>
      )}

      {adding && (
        <AddLogItemSheet
          card={card}
          components={components}
          pantry={pantry}
          categories={categories}
          fdcKey={fdcKey}
          existingComponentIds={existingComponentIds}
          onPick={handlePick}
          onSaveToPantry={onSaveToPantry}
          onClose={() => setAdding(false)}
        />
      )}
    </div>
  )
}

import { useState } from 'react'
import { RATINGS, NUTRITION_SOURCE_LABELS } from '../schema.js'
import * as trackOps from '../trackOps.js'
import { measureToServings, parseMeasure } from '../measures.js'
import MeasureInput from './MeasureInput.jsx'
import AddLogItemSheet from './AddLogItemSheet.jsx'

function itemLabel(item, components, pantry) {
  if (item.kind === 'component') return components.find((c) => c.id === item.componentId)?.name || item.componentId
  if (item.kind === 'pantry') return pantry.find((p) => p.id === item.pantryId)?.name || item.pantryId
  return item.name
}

function itemNutrition(item, pantry) {
  if (item.kind === 'pantry') return pantry.find((p) => p.id === item.pantryId)?.nutrition || null
  if (item.kind === 'adhoc') return item.nutrition
  return null
}

// Provenance label for one item's macro line: 'derived' for a component with
// derived macros, its nutrition source (human-labeled) otherwise. Reuses the
// Pantry tag styling (CLAUDE.md §5: provenance must be visible wherever a
// macro number is shown).
function itemProvenance(item, components, pantry) {
  if (item.kind === 'component') {
    const c = components.find((x) => x.id === item.componentId)
    if (!c || !c.macrosPerServing) return null
    return c.macroSource === 'derived' ? 'derived' : NUTRITION_SOURCE_LABELS[c.macroSource] || c.macroSource
  }
  const nutrition = itemNutrition(item, pantry)
  return nutrition ? NUTRITION_SOURCE_LABELS[nutrition.source] || nutrition.source : null
}

// Safety-net warning for a pantry/adhoc item whose stored free-text measure
// this item's nutrition data can't actually convert (legacy data, or typed
// directly rather than through the restricted unit picker) — surfaced
// inline instead of silently dropping the item from the meal's macro totals.
function itemMeasureWarning(item, pantry) {
  if (item.kind !== 'pantry' && item.kind !== 'adhoc') return null
  const nutrition = itemNutrition(item, pantry)
  if (!nutrition) return null
  if (measureToServings(item.measure, nutrition) != null) return null
  const { unitTokens } = parseMeasure(item.measure)
  const failedUnit = unitTokens.length ? unitTokens.join(' ') : (item.measure || '').trim()
  return `couldn't convert "${failedUnit}" — pick g or serving`
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
                {macros.missing > 0 && (
                  <span className="provenance-tag">
                    {' '}
                    {macros.missing} item{macros.missing > 1 ? 's' : ''} not counted — see below
                  </span>
                )}
              </span>
            )}
          </p>

          {log.items.map((item, index) => {
            const itemMacro = trackOps.itemMacros(item, components, pantry)
            const provenance = itemProvenance(item, components, pantry)
            const warning = itemMeasureWarning(item, pantry)
            return (
              <div key={index} className="meal-section__item-block">
                <div className="meal-section__item-row">
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
                    <MeasureInput
                      value={item.measure}
                      onChange={(measure) => onSetItemMeasure(index, measure)}
                      nutrition={itemNutrition(item, pantry)}
                    />
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
                <p className="meal-section__item-meta">
                  {itemMacro ? `${Math.round(itemMacro.kcal)} kcal` : '—'}
                  {provenance && <span className="provenance-tag provenance-tag--tiny">{provenance}</span>}
                </p>
                {warning && <p className="inline-warning">{warning}</p>}
              </div>
            )
          })}

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

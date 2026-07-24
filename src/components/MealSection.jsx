import { useEffect, useState } from 'react'
import * as trackOps from '../trackOps.js'
import { measureToServings, parseMeasure } from '../measures.js'
import { MEAL_ICONS } from './Icons.jsx'
import ProvenanceTag from './ProvenanceTag.jsx'
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

// Provenance source for one item's macro line: null for a component with no
// macros; 'derived' isn't a NUTRITION_SOURCES value so ProvenanceTag treats
// it (and any other non-4-bucket source) as the neutral gray badge.
function itemProvenanceSource(item, components, pantry) {
  if (item.kind === 'component') {
    const c = components.find((x) => x.id === item.componentId)
    if (!c || !c.macrosPerServing) return null
    return c.macroSource
  }
  return itemNutrition(item, pantry)?.source || null
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

// One meal card (components/cards.html / screens/track.html): icon + name +
// kcal header, divider, item rows (component -> ±0.5 stepper; pantry/adhoc
// -> MeasureInput), remove-item/remove-log, and the "Log"/"+ Add more" pill
// into AddLogItemSheet. Lunch keeps the existing one-tap "Log lunch from
// plan" flow when an assembly card exists and nothing's logged yet for the
// day. `fabSignal` ({meal, nonce}) auto-opens this card's sheet when the FAB
// (App.jsx) targets this exact meal.
export default function MealSection({
  meal,
  label,
  log,
  logs,
  today,
  components,
  pantry,
  categories,
  fdcKey,
  card,
  fabSignal,
  onLogFromPlan,
  onAddItems,
  onSetItemCount,
  onSetItemMeasure,
  onRemoveItem,
  onRemoveLog,
  onSaveToPantry,
  onAttachNutrition,
  onGoToSettings,
}) {
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    if (fabSignal && fabSignal.meal === meal) setAdding(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fabSignal?.nonce])

  const showLogFromPlan = meal === 'lunch' && card && !log
  const hasItems = log && log.items.length > 0
  const macros = hasItems ? trackOps.logMacros(log, components, pantry) : null
  const existingComponentIds = log ? log.items.filter((i) => i.kind === 'component').map((i) => i.componentId) : []
  const Icon = MEAL_ICONS[meal]

  function handlePick(items) {
    onAddItems(items)
    setAdding(false)
  }

  return (
    <div className="meal-section">
      <div className="meal-section__header">
        <Icon className="meal-section__icon" size={22} strokeWidth={1.8} />
        <h3 className="meal-section__title">{label}</h3>
        <span className={`meal-section__kcal${macros && macros.kcal > 0 ? '' : ' meal-section__kcal--empty'}`}>
          {macros && macros.kcal > 0 ? Math.round(macros.kcal) : '—'}
          <span>kcal</span>
        </span>
      </div>
      <div className="meal-section__divider" />

      {showLogFromPlan ? (
        <>
          <p className="meal-section__preview">
            {card.componentIds.length > 0
              ? card.componentIds.map((id) => components.find((c) => c.id === id)?.name || id).join(', ')
              : 'No components yet.'}
          </p>
          <button type="button" className="pill-primary" onClick={onLogFromPlan}>
            Log lunch from plan
          </button>
        </>
      ) : !hasItems ? (
        <p className="meal-section__empty-line">Nothing yet</p>
      ) : (
        <>
          {macros && macros.missing > 0 && (
            <p className="meal-section__subtotal">
              {macros.missing} item{macros.missing > 1 ? 's' : ''} not counted — see below
            </p>
          )}

          {log.items.map((item, index) => {
            const itemMacro = trackOps.itemMacros(item, components, pantry)
            const provenanceSource = itemProvenanceSource(item, components, pantry)
            const warning = itemMeasureWarning(item, pantry)
            return (
              <div key={index} className="itemrow">
                <div className="itemrow__main">
                  <div className="itemrow__name">
                    {itemLabel(item, components, pantry)}
                    {provenanceSource && <ProvenanceTag source={provenanceSource} tiny />}
                  </div>
                  <div className="itemrow__sub">
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
                  {warning && <p className="inline-warning">{warning}</p>}
                </div>
                <span className="itemrow__kcal">{itemMacro ? Math.round(itemMacro.kcal) : '—'}</span>
              </div>
            )
          })}

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
        <button type="button" className="pill-quiet" onClick={() => setAdding(true)}>
          {hasItems ? '+ Add more' : 'Log'}
        </button>
      )}

      {adding && (
        <AddLogItemSheet
          card={card}
          components={components}
          pantry={pantry}
          categories={categories}
          fdcKey={fdcKey}
          logs={logs}
          today={today}
          label={label}
          existingComponentIds={existingComponentIds}
          onPick={handlePick}
          onSaveToPantry={onSaveToPantry}
          onAttachNutrition={onAttachNutrition}
          onGoToSettings={onGoToSettings}
          onClose={() => setAdding(false)}
        />
      )}
    </div>
  )
}

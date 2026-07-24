import { useState } from 'react'
import * as trackOps from '../trackOps.js'
import { measureToServings, parseMeasure } from '../measures.js'
import { MEAL_ICONS } from './Icons.jsx'
import ProvenanceTag from './ProvenanceTag.jsx'
import MeasureInput from './MeasureInput.jsx'

function itemLabel(item, components, pantry) {
  if (item.kind === 'component') return components.find((c) => c.id === item.componentId)?.name || item.componentId
  if (item.kind === 'pantry') return pantry.find((p) => p.id === item.pantryId)?.name || item.pantryId
  return item.name
}

// "Log it again" hint copy (Round 3): "{first item name}" alone, or
// "{first item name} and N more" once there's more than one.
function hintSummary(hintLog, components, pantry) {
  const names = hintLog.items.map((item) => itemLabel(item, components, pantry))
  if (names.length <= 1) return names[0] || ''
  return `${names[0]} and ${names.length - 1} more`
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
// which requests the (single, DayLog-owned) add sheet via onOpenAdd. Lunch
// keeps the existing one-tap "Log lunch from plan" flow when an assembly
// card exists and nothing's logged yet for the day.
//
// Round 2.7: the add sheet itself moved up to DayLog so its header can
// retarget which meal a commit lands in (bugfix: the FAB used to lock the
// user into whatever meal it guessed) — this component no longer renders
// AddLogItemSheet or reacts to fabSignal directly.
export default function MealSection({
  meal,
  label,
  log,
  components,
  pantry,
  card,
  sameMealHint,
  undo,
  onLogFromPlan,
  onLogAgain,
  onUndo,
  onSetItemCount,
  onSetItemMeasure,
  onRemoveItem,
  onRemoveLog,
  onOpenAdd,
  onOpenSaveDish,
}) {
  const [confirmingRemove, setConfirmingRemove] = useState(false)

  const showLogFromPlan = meal === 'lunch' && card && !log
  const hasItems = log && log.items.length > 0
  const macros = hasItems ? trackOps.logMacros(log, components, pantry) : null
  const Icon = MEAL_ICONS[meal]

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
        <>
          <p className="meal-section__empty-line">Nothing yet</p>
          {sameMealHint && (
            <button type="button" className="meal-section__hint" onClick={onLogAgain}>
              <span>
                Log {trackOps.weekdayName(sameMealHint.log.date)}'s {label.toLowerCase()} again — {hintSummary(sameMealHint.log, components, pantry)}
              </span>
              <span className="meal-section__hint-arrow" aria-hidden="true">›</span>
            </button>
          )}
        </>
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

          {undo && (
            <p className="meal-section__subtotal">
              Logged {undo.count} item{undo.count === 1 ? '' : 's'}
              {undo.skipped > 0 ? ` (${undo.skipped} skipped — no longer available)` : ''}
              {' · '}
              <button type="button" className="link-btn" onClick={onUndo}>
                Undo
              </button>
            </p>
          )}

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
        <div className="meal-section__actions">
          <button type="button" className="pill-quiet" onClick={onOpenAdd}>
            {hasItems ? '+ Add more' : 'Log'}
          </button>
          {hasItems && log.items.length >= 2 && (
            <button type="button" className="link-btn" onClick={onOpenSaveDish}>
              Save as dish
            </button>
          )}
        </div>
      )}
    </div>
  )
}

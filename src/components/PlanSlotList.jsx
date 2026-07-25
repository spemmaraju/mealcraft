import * as trackOps from '../trackOps.js'
import * as planOps from '../planOps.js'
import ProvenanceTag from './ProvenanceTag.jsx'

function itemName(item, components, pantry) {
  if (item.kind === 'component') return components.find((c) => c.id === item.componentId)?.name || item.componentId
  if (item.kind === 'pantry') return pantry.find((p) => p.id === item.pantryId)?.name || item.pantryId
  return item.name
}

// Provenance source for one item's macro line — same rule MealSection uses:
// null for a component with no macros, else its macroSource/nutrition source.
function itemProvenance(item, components, pantry) {
  if (item.kind === 'component') {
    const c = components.find((x) => x.id === item.componentId)
    return c && c.macrosPerServing ? c.macroSource : null
  }
  if (item.kind === 'pantry') return pantry.find((p) => p.id === item.pantryId)?.nutrition?.source || null
  return item.nutrition?.source || null
}

/**
 * "Your next meals" (Phase P1) — upcoming lunch/dinner slot cards (the
 * caller passes the first 6 of the 4-day horizon).
 * Extracted from PlanScreen to stay under CLAUDE.md §4.7's ~300-line budget.
 * Slot macros reuse trackOps.logMacros/itemMacros directly — they already
 * work on anything with an `items` array, PlanSlot included.
 */
export default function PlanSlotList({
  upcoming,
  planSlots,
  today,
  components,
  pantry,
  removeUndo,
  onRemoveItem,
  onUndoRemove,
  onLogToTrack,
  onAddExtra,
}) {
  return (
    <div className="plan-section">
      <h2>Your next meals</h2>
      {upcoming.map(({ date, meal, label }) => {
        const slot = planOps.slotFor(planSlots, date, meal)
        const items = slot ? slot.items : []
        const macros = items.length > 0 ? trackOps.logMacros({ items }, components, pantry) : null
        const mealUndo = removeUndo && removeUndo.date === date && removeUndo.meal === meal ? removeUndo : null

        return (
          <div key={`${date}|${meal}`} className="plan-slot-card">
            <div className="plan-slot-card__header">
              <h3>{label}</h3>
              {macros && macros.kcal > 0 && <span className="plan-slot-card__kcal">{Math.round(macros.kcal)} kcal</span>}
            </div>

            {items.length === 0 ? (
              <p className="meal-section__empty-line">Nothing planned yet</p>
            ) : (
              items.map((item, index) => {
                const itemMacro = trackOps.itemMacros(item, components, pantry)
                const source = itemProvenance(item, components, pantry)
                return (
                  <div key={index} className="itemrow">
                    <div className="itemrow__main">
                      <div className="itemrow__name">
                        {itemName(item, components, pantry)}
                        {source && <ProvenanceTag source={source} tiny />}
                      </div>
                      <div className="itemrow__sub">{itemMacro ? `${Math.round(itemMacro.kcal)} kcal` : '—'}</div>
                    </div>
                    <button
                      type="button"
                      className="itemrow__remove"
                      onClick={() => onRemoveItem(date, meal, index)}
                      aria-label={`Remove ${itemName(item, components, pantry)}`}
                    >
                      ✕
                    </button>
                  </div>
                )
              })
            )}

            {mealUndo && (
              <p className="meal-section__subtotal">
                Removed {itemName(mealUndo.removed, components, pantry)}
                {' · '}
                <button type="button" className="link-btn" onClick={onUndoRemove}>
                  Undo
                </button>
              </p>
            )}

            <div className="meal-section__actions">
              {date === today && items.length > 0 && (
                <button type="button" className="pill-primary" onClick={() => onLogToTrack(date, meal)}>
                  ✓ Log to Track
                </button>
              )}
              <button type="button" className="pill-quiet" onClick={() => onAddExtra(date, meal)}>
                ＋ Add extra
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

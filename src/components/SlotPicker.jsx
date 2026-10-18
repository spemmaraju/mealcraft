import * as planOps from '../planOps.js'

function itemName(item, components, pantry) {
  if (item.kind === 'component') return components.find((c) => c.id === item.componentId)?.name || item.componentId
  if (item.kind === 'pantry') return pantry.find((p) => p.id === item.pantryId)?.name || item.pantryId
  return item.name
}

/**
 * Chip picker over the upcoming meal slots (Phase P1) — shared by
 * AddDishToPlanSheet's slot step (any-count picker; P1's PrepSheet exact-count
 * step was replaced by Phase 19's shelf). Purely presentational: `selected`/`onToggle` and any
 * count rule are owned by the caller. A chip whose real planSlot already has
 * items shows what's there as a second line; selecting it anyway is allowed,
 * with an inline warning that the meal will be shared.
 */
export default function SlotPicker({ upcoming, planSlots, components, pantry, selected, onToggle }) {
  return (
    <div className="slot-picker">
      {upcoming.map(({ date, meal, label }) => {
        const key = `${date}|${meal}`
        const existing = planOps.slotFor(planSlots, date, meal)
        const hasContents = !!(existing && existing.items.length > 0)
        const isSelected = selected.includes(key)
        const names = hasContents ? existing.items.map((i) => itemName(i, components, pantry)).join(', ') : ''
        return (
          <div key={key} className="slot-picker__item">
            <button
              type="button"
              className={`chip slot-picker__chip${isSelected ? ' chip--active' : ''}`}
              onClick={() => onToggle(date, meal)}
            >
              <span>{label}</span>
              {hasContents && <span className="slot-picker__has">has {names}</span>}
            </button>
            {isSelected && hasContents && (
              <p className="inline-warning">
                ⚠ {label} already has {names} — both will share that meal.
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}

import { NUTRITION_SOURCE_LABELS } from '../schema.js'

export default function PantryItemRow({ item, onToggleOnHand, onOpenEditor }) {
  return (
    <div className="pantry-row">
      <button
        type="button"
        className={`pantry-row__onhand${item.onHand ? ' pantry-row__onhand--active' : ''}`}
        onClick={() => onToggleOnHand(item.id, !item.onHand)}
        aria-pressed={item.onHand}
        aria-label={item.onHand ? `${item.name} on hand, tap to mark out` : `${item.name} out, tap to mark on hand`}
      >
        {item.onHand ? '✓' : ''}
      </button>
      <button type="button" className="pantry-row__body" onClick={() => onOpenEditor(item.id)}>
        <span className="row2__main">
          <span className="row2__name">{item.name}</span>
          {(item.roughQty || item.nutrition) && (
            <span className="row2__sub">
              {item.roughQty && <span>{item.roughQty}</span>}
              {item.nutrition && (
                <span className="provenance-tag provenance-tag--tiny">
                  {NUTRITION_SOURCE_LABELS[item.nutrition.source] || item.nutrition.source}
                </span>
              )}
            </span>
          )}
        </span>
      </button>
    </div>
  )
}

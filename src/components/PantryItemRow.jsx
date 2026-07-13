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
        <span className="pantry-row__name">{item.name}</span>
        <span className={`pantry-row__badge pantry-row__badge--${item.role}`}>{item.role}</span>
        {item.roughQty && <span className="pantry-row__qty">{item.roughQty}</span>}
      </button>
    </div>
  )
}

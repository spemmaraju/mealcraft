import ProvenanceTag from './ProvenanceTag.jsx'

export default function PantryItemRow({ item, onToggleOnHand, onOpenEditor }) {
  return (
    <div className="pantry-row">
      <button type="button" className="pantry-row__body" onClick={() => onOpenEditor(item.id)}>
        <span className="row2__main">
          <span className="row2__name">
            {item.name}
            {item.nutrition && <ProvenanceTag source={item.nutrition.source} tiny />}
          </span>
          {(item.roughQty || item.role) && (
            <span className="row2__sub">
              {item.roughQty && <span>{item.roughQty}</span>}
              {item.roughQty && item.role && <span> · </span>}
              {item.role && <span className="pantry-row__roletag">{item.role}</span>}
            </span>
          )}
        </span>
      </button>
      <button
        type="button"
        className={`pantry-row__onhand${item.onHand ? ' pantry-row__onhand--active' : ''}`}
        onClick={() => onToggleOnHand(item.id, !item.onHand)}
        aria-pressed={item.onHand}
        aria-label={item.onHand ? `${item.name} on hand, tap to mark out` : `${item.name} out, tap to mark on hand`}
      />
    </div>
  )
}

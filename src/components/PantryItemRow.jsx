import ProvenanceTag from './ProvenanceTag.jsx'

// Round 3.5 design sync: sub-line is "{roughQty or 'on hand'} · {ROLE}" —
// the "on hand" fallback only fills in when the item actually IS on hand
// (an off-hand item with no roughQty note has nothing to say there; showing
// "on hand" next to a toggle that's visibly off would contradict it).
function pantrySubline(item) {
  if (item.roughQty) return item.roughQty
  return item.onHand ? 'on hand' : null
}

export default function PantryItemRow({ item, onToggleOnHand, onOpenEditor }) {
  const subline = pantrySubline(item)
  return (
    <div className="pantry-row">
      <button type="button" className="pantry-row__body" onClick={() => onOpenEditor(item.id)}>
        <span className="row2__main">
          <span className="row2__name">
            {item.name}
            {item.nutrition && <ProvenanceTag source={item.nutrition.source} tiny />}
          </span>
          {(subline || item.role) && (
            <span className="row2__sub">
              {subline && <span>{subline}</span>}
              {subline && item.role && <span> · </span>}
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

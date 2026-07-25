// Advisory grocery-ideas card (Phase P1 prep flow). Unlike the old
// WeekPlan.grocerySuggestions (a `dismissed` flag left in place), a
// GroceryItem has no dismissed state — dismissing one removes its record
// outright; no undo, they're advisory (CLAUDE.md §1).
export default function GroceryCard({ grocery, onDismiss }) {
  if (grocery.length === 0) return null
  return (
    <div className="plan-section">
      <h2>🛒 Grocery ideas — advisory</h2>
      {grocery.map((item, index) => (
        <div key={index} className="grocery-row">
          <span className="grocery-row__label">
            {item.name} <span className="grocery-row__sub">for {item.forDish}</span>
          </span>
          <button
            type="button"
            className="assembly-card__x"
            onClick={() => onDismiss(index)}
            aria-label={`Remove ${item.name} from grocery ideas`}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}

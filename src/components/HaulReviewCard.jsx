import { TrashIcon } from './Icons.jsx'

/**
 * Phase 20: review step for a shopping haul (the haul twin of
 * ParseReviewCard). Each row either restocks an existing pantry item or
 * creates a new one in a category the user can change. Amounts are free
 * text; leave one blank and the item is just marked "plenty".
 */
export default function HaulReviewCard({ rows, pantry, categories, onRowsChange, onConfirm, onBack }) {
  function update(index, patch) {
    onRowsChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  return (
    <div className="parse-review">
      <h3 className="parse-review__title">Check it before the pantry changes</h3>
      <ul className="parse-review__list">
        {rows.map((row, i) => {
          const existing = row.pantryId ? pantry.find((p) => p.id === row.pantryId) : null
          return (
            <li key={row.key} className={`parse-row${existing ? '' : ' parse-row--estimate'}`}>
              <div className="parse-row__head">
                <span className="parse-row__name">{row.name}</span>
                <button type="button" className="parse-row__remove" aria-label={`Remove ${row.name}`} onClick={() => onRowsChange(rows.filter((_, j) => j !== i))}>
                  <TrashIcon size={16} />
                </button>
              </div>
              <input
                type="text"
                className="parse-row__measure"
                aria-label={`Amount of ${row.name} bought`}
                placeholder="amount (optional)"
                value={row.measure}
                onChange={(e) => update(i, { measure: e.target.value })}
              />
              {existing ? (
                <p className="field-caption">
                  Restocks your {existing.name}
                  {existing.roughQty ? ` (now ${existing.roughQty})` : ''}
                </p>
              ) : (
                <label className="parse-row__toggle">
                  New item in
                  <select aria-label={`Category for ${row.name}`} value={row.category} onChange={(e) => update(i, { category: e.target.value })}>
                    <option value="">Best guess</option>
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </li>
          )
        })}
      </ul>
      <div className="button-row">
        <button type="button" className="btn btn--primary" disabled={rows.length === 0} onClick={onConfirm}>
          Restock pantry
        </button>
        <button type="button" className="btn" onClick={onBack}>
          Back
        </button>
      </div>
    </div>
  )
}

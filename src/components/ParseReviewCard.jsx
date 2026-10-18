import { itemMacros } from '../trackOps.js'
import { rowLogItem, setRowMeasure } from '../parseOps.js'
import ProvenanceTag from './ProvenanceTag.jsx'
import { TrashIcon } from './Icons.jsx'

const round = (n) => Math.round(n)

// Phase 18: the one review step every free-text parse goes through before
// anything is written (CLAUDE.md §1 — AI parses are drafts). Rows are
// parseOps draft rows; measure edits and the pantry/estimate toggle are
// pure parseOps transforms, and macros are recomputed with the same
// trackOps.itemMacros the Track screen uses, so what you see is what logs.
export default function ParseReviewCard({ rows, components, pantry, confirmLabel, onRowsChange, onConfirm, onBack }) {
  const resolved = rows.map((row) => itemMacros(rowLogItem(row), components, pantry))
  const total = resolved.reduce(
    (acc, m) => (m ? { kcal: acc.kcal + m.kcal, protein_g: acc.protein_g + m.protein_g, carbs_g: acc.carbs_g + m.carbs_g, fat_g: acc.fat_g + m.fat_g } : acc),
    { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  )
  const unresolved = resolved.filter((m) => !m).length

  function update(index, next) {
    onRowsChange(rows.map((row, i) => (i === index ? next : row)))
  }

  return (
    <div className="parse-review">
      <h3 className="parse-review__title">Check it before it's logged</h3>
      <ul className="parse-review__list">
        {rows.map((row, i) => {
          const item = rowLogItem(row)
          const macros = resolved[i]
          const source = item.kind === 'pantry' ? pantry.find((p) => p.id === item.pantryId)?.nutrition?.source : item.nutrition.source
          return (
            <li key={row.key} className={`parse-row${row.usePantry ? '' : ' parse-row--estimate'}`}>
              <div className="parse-row__head">
                <span className="parse-row__name">{row.usePantry ? row.pantryName : row.name}</span>
                <button
                  type="button"
                  className="parse-row__remove"
                  aria-label={`Remove ${row.name}`}
                  onClick={() => onRowsChange(rows.filter((_, j) => j !== i))}
                >
                  <TrashIcon size={16} />
                </button>
              </div>
              <input
                type="text"
                className="parse-row__measure"
                aria-label={`Amount of ${row.name}`}
                value={item.measure}
                onChange={(e) => update(i, setRowMeasure(row, e.target.value))}
              />
              <div className="parse-row__meta">
                <span>{macros ? `${round(macros.kcal)} kcal · ${round(macros.protein_g)} g protein` : "— can't convert this amount"}</span>
                {source && <ProvenanceTag source={source} tiny />}
              </div>
              {row.pantryItem && (
                <label className="parse-row__toggle">
                  <input type="checkbox" checked={row.usePantry} onChange={(e) => update(i, { ...row, usePantry: e.target.checked })} />
                  Use my pantry's {row.pantryName ?? 'item'} nutrition
                </label>
              )}
              {row.note && !row.usePantry && <p className="field-caption">{row.note}</p>}
            </li>
          )
        })}
      </ul>

      {rows.length > 0 && (
        <p className="parse-review__total">
          ≈ {round(total.kcal)} kcal · {round(total.protein_g)} g protein · {round(total.carbs_g)} g carbs · {round(total.fat_g)} g fat
          {unresolved > 0 && ` (+${unresolved} not counted)`}
        </p>
      )}

      <div className="button-row">
        <button type="button" className="btn btn--primary" disabled={rows.length === 0} onClick={onConfirm}>
          {confirmLabel}
        </button>
        <button type="button" className="btn" onClick={onBack}>
          Back
        </button>
      </div>
    </div>
  )
}

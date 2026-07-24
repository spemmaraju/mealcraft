import * as trackOps from '../trackOps.js'

// Expanded per-item macro breakdown (tap target: MealSection's
// itemrow__main). Reuses trackOps.macroDonut's same protein*4/carbs*4/fat*9
// kcal-split math the Track hero's donut uses, and the same three CSS vars
// (--donut-protein/--donut-carbs/--donut-fat) so a tapped item's mix reads
// as a miniature version of the hero, not a new color language.
export default function ItemMacroPanel({ itemMacro }) {
  if (!itemMacro) {
    return <p className="item-macro-panel__empty">No nutrition data for this measure.</p>
  }

  const donut = trackOps.macroDonut(itemMacro)
  const proteinPct = Math.round(donut.proteinPct * 100)
  const carbsPct = Math.round(donut.carbsPct * 100)
  const fatPct = Math.round(donut.fatPct * 100)

  return (
    <div className="item-macro-panel">
      <div className="item-macro-panel__bar">
        {donut.hasData && (
          <>
            <span className="item-macro-panel__seg" style={{ width: `${proteinPct}%`, background: 'var(--donut-protein)' }} />
            <span className="item-macro-panel__seg" style={{ width: `${carbsPct}%`, background: 'var(--donut-carbs)' }} />
            <span className="item-macro-panel__seg" style={{ width: `${fatPct}%`, background: 'var(--donut-fat)' }} />
          </>
        )}
      </div>
      <div className="item-macro-panel__cols">
        <span className="item-macro-panel__col" style={{ color: 'var(--donut-protein)' }}>
          Protein {Math.round(itemMacro.protein_g)} g · {proteinPct}%
        </span>
        <span className="item-macro-panel__col" style={{ color: 'var(--donut-carbs)' }}>
          Carbs {Math.round(itemMacro.carbs_g)} g · {carbsPct}%
        </span>
        <span className="item-macro-panel__col" style={{ color: 'var(--donut-fat)' }}>
          Fat {Math.round(itemMacro.fat_g)} g · {fatPct}%
        </span>
      </div>
    </div>
  )
}

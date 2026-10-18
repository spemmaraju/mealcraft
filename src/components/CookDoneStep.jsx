import { MEALS, MEAL_LABELS, STOCK_LEVELS, STOCK_LEVEL_LABELS } from '../schema.js'
import { choiceForPatch } from '../stockOps.js'

const CHOICES = [...STOCK_LEVELS, 'out']
const CHOICE_LABELS = { ...STOCK_LEVEL_LABELS, out: 'Out' }

function afterText(patch) {
  if (!patch.onHand) return 'out'
  return patch.roughQty || patch.level || 'on hand'
}

function Stepper({ value, min, max, onChange, label }) {
  return (
    <div className="stepper">
      <button type="button" className="stepper__btn" onClick={() => onChange(Math.max(min, value - 1))} aria-label={`Less ${label}`}>
        −
      </button>
      <span className="stepper__value">{value}</span>
      <button type="button" className="stepper__btn" onClick={() => onChange(Math.min(max, value + 1))} aria-label={`More ${label}`}>
        +
      </button>
    </div>
  )
}

/**
 * 🍳 Cook, step 2 (Phase 19): what actually happened. Servings made, how
 * long it keeps, how much you're eating now (logged to the chosen meal) —
 * whatever's left goes to the ready-to-eat shelf. Replaces P1's "split
 * across plan slots" step (user decision: shelf, not auto-filled slots).
 */
export default function CookDoneStep({ name, servingsMade, keepsDays, eatNow, eatMeal, stock = [], onServingsMade, onKeepsDays, onEatNow, onEatMeal, onStockChoice, onBack, onConfirm }) {
  const eating = Math.min(eatNow, servingsMade)
  const left = servingsMade - eating
  const parts = []
  if (eating > 0) parts.push(`${eating} logged to ${MEAL_LABELS[eatMeal].toLowerCase()}`)
  if (left > 0) parts.push(`${left} on the shelf for ${keepsDays} day${keepsDays === 1 ? '' : 's'}`)

  return (
    <>
      <h2>Done cooking {name.trim() || 'this dish'}</h2>

      <div className="field">
        <label>Servings it made</label>
        <Stepper value={servingsMade} min={1} max={12} onChange={onServingsMade} label="servings made" />
      </div>

      <div className="field">
        <label>Keeps for (days)</label>
        <Stepper value={keepsDays} min={1} max={14} onChange={onKeepsDays} label="days" />
      </div>

      <div className="field">
        <label>Eating now</label>
        <Stepper value={eating} min={0} max={servingsMade} onChange={onEatNow} label="servings now" />
      </div>
      {eating > 0 && (
        <div className="field">
          <label htmlFor="cook-eat-meal">Log it to</label>
          <select id="cook-eat-meal" value={eatMeal} onChange={(e) => onEatMeal(e.target.value)}>
            {MEALS.map((m) => (
              <option key={m} value={m}>
                {MEAL_LABELS[m]}
              </option>
            ))}
          </select>
        </div>
      )}

      <p className="prep-summary__macros">{parts.join(' · ') || 'Nothing to log or keep.'}</p>

      {/* Phase 20: pre-filled from stockOps.consume — the chips are optional corrections, never required. */}
      {stock.length > 0 && (
        <div className="field">
          <label>Pantry after cooking</label>
          <ul className="stock-after">
            {stock.map((s) => {
              const active = choiceForPatch(s.patch)
              return (
                <li key={s.pantryId} className="stock-after__row">
                  <span className="stock-after__name">
                    {s.name} <span className="field-caption">→ {afterText(s.patch)}</span>
                  </span>
                  {s.how === 'unknown' && <span className="field-caption">Couldn’t tell how much this used — tap one if it changed.</span>}
                  <span className="segmented">
                    {CHOICES.map((c) => (
                      <button key={c} type="button" className={`chip chip--small${active === c ? ' chip--active' : ''}`} aria-pressed={active === c} onClick={() => onStockChoice(s.pantryId, c)}>
                        {CHOICE_LABELS[c]}
                      </button>
                    ))}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <div className="button-row">
        <button type="button" className="btn btn--primary" onClick={onConfirm}>
          Save
        </button>
        <button type="button" className="btn" onClick={onBack}>
          ← Back
        </button>
      </div>
    </>
  )
}

import { useState } from 'react'
import { mealForTime } from '../trackOps.js'
import { rowForPantryItem, rowsFromReview, rowsFromSession, stockSuggestions } from '../cookOps.js'
import { patchForChoice } from '../stockOps.js'
import { defaultMeasureFor } from '../measures.js'
import CookIngredientsStep from './CookIngredientsStep.jsx'
import CookDoneStep from './CookDoneStep.jsx'
import FreeTextParseSheet from './FreeTextParseSheet.jsx'

const DEFAULT_SERVINGS = 3
const DEFAULT_KEEPS_DAYS = 3

function initialRows(seed, pantry) {
  if (seed.session) return rowsFromSession(seed.session)
  return (seed.initialRows || [])
    .map(({ pantryId }) => pantry.find((p) => p.id === pantryId))
    .filter(Boolean)
    .map((item) => rowForPantryItem(item, item.nutrition ? defaultMeasureFor(item.nutrition) : ''))
}

/**
 * 🍳 Cook (Phase 19; replaces P1's PrepSheet). `seed` is one of:
 *   {}                                  — blank cook
 *   { initialName, initialRows, buy }   — from an idea's "Prep →"
 *   { session }                         — resuming a saved draft
 * Nothing is written here: onSaveDraft / onDone hand PlanScreen a payload
 * for cookOps.saveDraft / cookOps.finishCook.
 */
export default function CookSheet({ seed, pantry, components, byok, onSaveDraft, onDone, onClose }) {
  const session = seed.session || null
  const [step, setStep] = useState(1)
  const [name, setName] = useState(session?.name || seed.initialName || '')
  const [text, setText] = useState(session?.text || '')
  const [rows, setRows] = useState(() => initialRows(seed, pantry))
  const [servings, setServings] = useState(session?.servingsMade || DEFAULT_SERVINGS)
  const [describing, setDescribing] = useState(false)
  const [keepsDays, setKeepsDays] = useState(DEFAULT_KEEPS_DAYS)
  const [eatNow, setEatNow] = useState(1)
  const [eatMeal, setEatMeal] = useState(() => mealForTime())
  // Phase 20: { [pantryId]: 'plenty'|'some'|'low'|'out' } — only rows the user re-chipped.
  const [stockChoices, setStockChoices] = useState({})

  const base = { sessionId: session?.id || null, name: name.trim(), text, rows }

  // What the pantry will look like after this cook: stockOps' suggestion,
  // unless the user tapped a chip for that item.
  const stock = stockSuggestions(rows, pantry).map((s) => {
    const choice = stockChoices[s.pantryId]
    if (!choice) return s
    const item = pantry.find((p) => p.id === s.pantryId)
    return { ...s, patch: patchForChoice({ ...item, ...s.patch }, choice), how: 'chosen' }
  })

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        {step === 1 ? (
          <CookIngredientsStep
            name={name}
            rows={rows}
            servings={servings}
            pantry={pantry}
            components={components}
            onName={setName}
            onRows={setRows}
            onServings={setServings}
            onDescribe={() => setDescribing(true)}
            onSaveDraft={() => onSaveDraft({ ...base, servings })}
            onDone={() => setStep(2)}
            onClose={onClose}
          />
        ) : (
          <CookDoneStep
            name={name}
            servingsMade={servings}
            keepsDays={keepsDays}
            eatNow={eatNow}
            eatMeal={eatMeal}
            stock={stock}
            onStockChoice={(pantryId, choice) => setStockChoices((prev) => ({ ...prev, [pantryId]: choice }))}
            onServingsMade={setServings}
            onKeepsDays={setKeepsDays}
            onEatNow={setEatNow}
            onEatMeal={setEatMeal}
            onBack={() => setStep(1)}
            onConfirm={() =>
              onDone({
                ...base,
                servingsMade: servings,
                keepsDays,
                eatNow: eatNow > 0 ? { count: Math.min(eatNow, servings), meal: eatMeal } : null,
                stockPatches: Object.fromEntries(stock.map((s) => [s.pantryId, s.patch])),
              })
            }
          />
        )}

        {describing && (
          <FreeTextParseSheet
            mode="cook"
            byok={byok}
            pantry={pantry}
            components={components}
            confirmLabel="Add to ingredients"
            onConfirm={(reviewRows, meta, describedText) => {
              setRows((prev) => [...prev, ...rowsFromReview(reviewRows)])
              if (!name.trim() && meta.dishName) setName(meta.dishName)
              if (meta.servings) setServings(Math.min(12, meta.servings))
              setText((prev) => [prev, describedText.trim()].filter(Boolean).join('\n'))
              setDescribing(false)
            }}
            onCancel={() => setDescribing(false)}
          />
        )}
      </div>
    </div>
  )
}

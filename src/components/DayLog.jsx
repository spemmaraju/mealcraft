import { useEffect, useState } from 'react'
import { MEALS, MEAL_LABELS } from '../schema.js'
import * as trackOps from '../trackOps.js'
import MealSection from './MealSection.jsx'
import AddLogItemSheet from './AddLogItemSheet.jsx'

// Round 2.6: the day-strip moved into TrackHero (it's part of the hero card
// per screens/track.html) — DayLog just renders one MealSection per MEALS
// entry for whichever date TrackScreen currently has selected.
//
// Round 2.7 bugfix: the add sheet is now a SINGLE instance owned here
// (rather than one-per-MealSection) so its "Add to {Meal} ▾" header can be a
// real picker that retargets which meal a commit lands in — previously each
// MealSection instantiated its own sheet, so the FAB's fabSignal locked the
// user into whichever meal it guessed (trackOps.mealForTime()) with no way
// to change it. MealSection now just calls onOpenAdd(meal) to request the
// sheet; `fabSignal` ({meal, nonce}) still auto-opens it, exactly as before.
export default function DayLog({
  week,
  selectedDate,
  logs,
  components,
  pantry,
  categories,
  fdcKey,
  today,
  fabSignal,
  onLogFromPlan,
  onAddItems,
  onSetItemCount,
  onSetItemMeasure,
  onRemoveItem,
  onRemoveLog,
  onSaveToPantry,
  onAttachNutrition,
  onGoToSettings,
}) {
  const card = week ? trackOps.assemblyCardForDate(week, selectedDate) : null
  // null | { meal }. `meal` is retargetable via the sheet's own header picker
  // without closing/reopening the sheet, so query/pending-amount-step state
  // inside AddLogItemSheet survives a meal switch untouched.
  const [addSheet, setAddSheet] = useState(null)

  useEffect(() => {
    if (fabSignal) setAddSheet({ meal: fabSignal.meal })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fabSignal?.nonce])

  const activeEntry = addSheet ? trackOps.logFor(logs, selectedDate, addSheet.meal) : null
  const existingComponentIds = activeEntry
    ? activeEntry.log.items.filter((i) => i.kind === 'component').map((i) => i.componentId)
    : []

  return (
    <div className="day-log">
      {MEALS.map((meal) => {
        const entry = trackOps.logFor(logs, selectedDate, meal)
        return (
          <MealSection
            key={meal}
            meal={meal}
            label={MEAL_LABELS[meal]}
            log={entry ? entry.log : null}
            components={components}
            pantry={pantry}
            card={card}
            onLogFromPlan={() => onLogFromPlan(selectedDate)}
            onSetItemCount={(index, count) => onSetItemCount(selectedDate, meal, index, count)}
            onSetItemMeasure={(index, measure) => onSetItemMeasure(selectedDate, meal, index, measure)}
            onRemoveItem={(index) => onRemoveItem(selectedDate, meal, index)}
            onRemoveLog={() => onRemoveLog(selectedDate, meal)}
            onOpenAdd={() => setAddSheet({ meal })}
          />
        )
      })}

      {addSheet && (
        <AddLogItemSheet
          meal={addSheet.meal}
          label={MEAL_LABELS[addSheet.meal]}
          card={card}
          components={components}
          pantry={pantry}
          categories={categories}
          fdcKey={fdcKey}
          logs={logs}
          today={today}
          existingComponentIds={existingComponentIds}
          onMealChange={(meal) => setAddSheet({ meal })}
          onPick={(items) => {
            onAddItems(selectedDate, addSheet.meal, items)
            setAddSheet(null)
          }}
          onSaveToPantry={onSaveToPantry}
          onAttachNutrition={onAttachNutrition}
          onGoToSettings={onGoToSettings}
          onClose={() => setAddSheet(null)}
        />
      )}
    </div>
  )
}

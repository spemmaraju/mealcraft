import { useEffect, useRef, useState } from 'react'
import { createLogEntry, MEALS, MEAL_LABELS } from '../schema.js'
import * as trackOps from '../trackOps.js'
import MealSection from './MealSection.jsx'
import AddLogItemSheet from './AddLogItemSheet.jsx'
import SaveAsDishSheet from './SaveAsDishSheet.jsx'

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
  onSetLog,
  onSetItemCount,
  onSetItemMeasure,
  onRemoveItem,
  onRemoveLog,
  onSaveToPantry,
  onAttachNutrition,
  onSaveDish,
  onGoToSettings,
}) {
  const card = week ? trackOps.assemblyCardForDate(week, selectedDate) : null
  // null | { meal }. `meal` is retargetable via the sheet's own header picker
  // without closing/reopening the sheet, so query/pending-amount-step state
  // inside AddLogItemSheet survives a meal switch untouched.
  const [addSheet, setAddSheet] = useState(null)
  // Round 3 "Save as dish": which meal's sheet is open, or null.
  const [dishSheetMeal, setDishSheetMeal] = useState(null)
  // Round 3 "Log it again" undo: { date, meal, priorLog, count, skipped } or
  // null. Scoped by (date, meal) so switching days never shows a stale undo
  // for the wrong card, and reverts land back on the exact day it came from
  // even if the user has since navigated elsewhere.
  const [undo, setUndo] = useState(null)
  const undoTimerRef = useRef(null)

  useEffect(() => {
    if (fabSignal) setAddSheet({ meal: fabSignal.meal })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fabSignal?.nonce])

  useEffect(() => () => clearTimeout(undoTimerRef.current), [])

  function handleLogAgain(meal, sourceLog) {
    const priorEntry = trackOps.logFor(logs, selectedDate, meal)
    const priorLog = priorEntry ? priorEntry.log : null
    const { items, skipped } = trackOps.copyItemsForRelog(sourceLog, components, pantry)
    if (items.length === 0) return
    const newLog = priorLog ? trackOps.mergeItems(priorLog, items) : createLogEntry({ date: selectedDate, meal, items })
    onSetLog(selectedDate, meal, newLog)

    clearTimeout(undoTimerRef.current)
    setUndo({ date: selectedDate, meal, priorLog, count: items.length, skipped })
    undoTimerRef.current = setTimeout(() => setUndo(null), 6000)
  }

  function handleUndo() {
    if (!undo) return
    clearTimeout(undoTimerRef.current)
    onSetLog(undo.date, undo.meal, undo.priorLog)
    setUndo(null)
  }

  const activeEntry = addSheet ? trackOps.logFor(logs, selectedDate, addSheet.meal) : null
  const existingComponentIds = activeEntry
    ? activeEntry.log.items.filter((i) => i.kind === 'component').map((i) => i.componentId)
    : []

  return (
    <div className="day-log">
      {MEALS.map((meal) => {
        const entry = trackOps.logFor(logs, selectedDate, meal)
        const hasItems = entry && entry.log.items.length > 0
        const sameMealHint = !hasItems ? trackOps.lastSameMeal(logs, selectedDate, meal) : null
        const mealUndo = undo && undo.date === selectedDate && undo.meal === meal ? undo : null
        return (
          <MealSection
            key={meal}
            meal={meal}
            label={MEAL_LABELS[meal]}
            log={entry ? entry.log : null}
            components={components}
            pantry={pantry}
            card={card}
            sameMealHint={sameMealHint}
            undo={mealUndo}
            onLogFromPlan={() => onLogFromPlan(selectedDate)}
            onLogAgain={() => sameMealHint && handleLogAgain(meal, sameMealHint.log)}
            onUndo={handleUndo}
            onSetItemCount={(index, count) => onSetItemCount(selectedDate, meal, index, count)}
            onSetItemMeasure={(index, measure) => onSetItemMeasure(selectedDate, meal, index, measure)}
            onRemoveItem={(index) => onRemoveItem(selectedDate, meal, index)}
            onRemoveLog={() => onRemoveLog(selectedDate, meal)}
            onOpenAdd={() => setAddSheet({ meal })}
            onOpenSaveDish={() => setDishSheetMeal(meal)}
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

      {dishSheetMeal &&
        (() => {
          const entry = trackOps.logFor(logs, selectedDate, dishSheetMeal)
          if (!entry) return null
          return (
            <SaveAsDishSheet
              log={entry.log}
              mealLabel={MEAL_LABELS[dishSheetMeal]}
              dateISO={selectedDate}
              components={components}
              pantry={pantry}
              onSave={(name) => {
                onSaveDish(name, entry.log)
                setDishSheetMeal(null)
              }}
              onClose={() => setDishSheetMeal(null)}
            />
          )
        })()}
    </div>
  )
}

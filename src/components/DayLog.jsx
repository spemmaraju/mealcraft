import { MEALS } from '../schema.js'
import * as trackOps from '../trackOps.js'
import MealSection from './MealSection.jsx'

const MEAL_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' }

// Round 2.6: the day-strip moved into TrackHero (it's part of the hero card
// per screens/track.html) — DayLog just renders one MealSection per MEALS
// entry for whichever date TrackScreen currently has selected.
// `fabSignal` ({meal, nonce}) comes from the FAB (App.jsx) by way of
// TrackScreen; each MealSection watches for its own meal to auto-open.
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
            logs={logs}
            today={today}
            components={components}
            pantry={pantry}
            categories={categories}
            fdcKey={fdcKey}
            card={card}
            fabSignal={fabSignal}
            onLogFromPlan={() => onLogFromPlan(selectedDate)}
            onAddItems={(items) => onAddItems(selectedDate, meal, items)}
            onSetItemCount={(index, count) => onSetItemCount(selectedDate, meal, index, count)}
            onSetItemMeasure={(index, measure) => onSetItemMeasure(selectedDate, meal, index, measure)}
            onRemoveItem={(index) => onRemoveItem(selectedDate, meal, index)}
            onRemoveLog={() => onRemoveLog(selectedDate, meal)}
            onSaveToPantry={onSaveToPantry}
            onAttachNutrition={onAttachNutrition}
            onGoToSettings={onGoToSettings}
          />
        )
      })}
    </div>
  )
}

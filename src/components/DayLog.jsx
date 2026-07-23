import { useState } from 'react'
import { MEALS } from '../schema.js'
import * as trackOps from '../trackOps.js'
import MealSection from './MealSection.jsx'

const MEAL_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' }

// Replaces LogMealCard.jsx (Phase 15): a day-strip picker over a week, plus
// one MealSection per MEALS entry for whichever date is selected.
export default function DayLog({
  week,
  logs,
  components,
  pantry,
  categories,
  fdcKey,
  today,
  onLogFromPlan,
  onAddItems,
  onSetItemCount,
  onSetItemMeasure,
  onRemoveItem,
  onSetRating,
  onRemoveLog,
  onSaveToPantry,
  onAttachNutrition,
}) {
  const weekOf = week ? week.weekOf : trackOps.currentWeekSundayISO(today)
  const [selectedDate, setSelectedDate] = useState(today)

  const card = week ? trackOps.assemblyCardForDate(week, selectedDate) : null

  return (
    <div className="plan-section day-log">
      <h2>Log</h2>

      <div className="day-strip">
        {trackOps.weekDates(weekOf).map(({ day, date }) => {
          const logged = logs.some((l) => l.date === date && l.items.length > 0)
          return (
            <button
              key={date}
              type="button"
              className={`day-strip__day${date === selectedDate ? ' day-strip__day--selected' : ''}${logged ? ' day-strip__day--logged' : ''}`}
              onClick={() => setSelectedDate(date)}
            >
              {day}
            </button>
          )
        })}
      </div>

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
            onLogFromPlan={() => onLogFromPlan(selectedDate)}
            onAddItems={(items) => onAddItems(selectedDate, meal, items)}
            onSetItemCount={(index, count) => onSetItemCount(selectedDate, meal, index, count)}
            onSetItemMeasure={(index, measure) => onSetItemMeasure(selectedDate, meal, index, measure)}
            onRemoveItem={(index) => onRemoveItem(selectedDate, meal, index)}
            onSetRating={(rating) => onSetRating(selectedDate, meal, rating)}
            onRemoveLog={() => onRemoveLog(selectedDate, meal)}
            onSaveToPantry={onSaveToPantry}
            onAttachNutrition={onAttachNutrition}
          />
        )
      })}
    </div>
  )
}

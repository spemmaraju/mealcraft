import { useState } from 'react'
import * as weekOps from '../weekOps.js'
import RunSheet from './RunSheet.jsx'
import AssemblyCards from './AssemblyCards.jsx'
import ComponentPickerSheet from './ComponentPickerSheet.jsx'
import GroceryList from './GroceryList.jsx'

export default function WeekView({ week, components, pantry, settings, onCommit, onGenerateNew, onSubstituteComponent }) {
  const [picker, setPicker] = useState(null) // { day, mode: 'substitute'|'add', fromId?, type? }
  const byokActive = !!(settings && settings.apiMode === 'byok' && settings.apiKey)

  function handleToggleStep(index) {
    onCommit(weekOps.toggleRunSheetStep(week, index))
  }

  function handleSwap(dayA, dayB) {
    onCommit(weekOps.swapAssemblyDays(week, dayA, dayB))
  }

  function handleRemove(day, componentId) {
    onCommit(weekOps.removeComponentFromDay(week, day, componentId))
  }

  function handlePick(componentId) {
    if (!picker) return
    if (picker.mode === 'substitute') {
      onCommit(weekOps.substituteComponent(week, picker.day, picker.fromId, componentId))
    } else {
      onCommit(weekOps.addComponentToDay(week, picker.day, componentId))
    }
    setPicker(null)
  }

  function handleToggleGrocery(index) {
    onCommit(weekOps.toggleGrocerySuggestion(week, index))
  }

  function handleDismissAllGroceries() {
    onCommit(weekOps.dismissAllGroceries(week))
  }

  const excludeIds = picker ? week.assembly.find((a) => a.day === picker.day)?.componentIds || [] : []

  return (
    <div>
      <div className="week-view__header">
        <h2 className="week-view__weekof">Week of {week.weekOf}</h2>
        <button type="button" className="btn" onClick={onGenerateNew}>
          Generate a new week
        </button>
      </div>

      <RunSheet week={week} components={components} settings={settings} onToggleStep={handleToggleStep} />

      <AssemblyCards
        week={week}
        components={components}
        pantry={pantry}
        settings={settings}
        byokActive={byokActive}
        onSwap={handleSwap}
        onRemove={handleRemove}
        onRequestPicker={setPicker}
        onAiSubstitute={onSubstituteComponent}
      />

      <GroceryList week={week} onToggle={handleToggleGrocery} onDismissAll={handleDismissAllGroceries} />

      {picker && (
        <ComponentPickerSheet
          components={components}
          excludeIds={excludeIds}
          initialType={picker.type}
          onPick={handlePick}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  )
}

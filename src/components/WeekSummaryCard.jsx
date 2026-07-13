export default function WeekSummaryCard({ week, components, onGenerateNew }) {
  const byId = Object.fromEntries(components.map((c) => [c.id, c]))
  const grouped = {}
  for (const id of week.componentIds) {
    const component = byId[id]
    if (!component) continue
    if (!grouped[component.type]) grouped[component.type] = []
    grouped[component.type].push(component.name)
  }

  return (
    <div className="plan-section">
      <h2>Week of {week.weekOf}</h2>

      {Object.entries(grouped).map(([type, names]) => (
        <div key={type} className="week-summary__group">
          <h3>{type}</h3>
          <div>{names.join(', ')}</div>
        </div>
      ))}

      <div className="week-summary__counts">
        <span>{week.runSheet.length} run-sheet steps</span>
        <span>{week.assembly.length} assembly days</span>
        <span>{week.refresh.componentIds.length} refresh components</span>
        <span>{week.grocerySuggestions.length} grocery suggestions</span>
      </div>

      <p className="placeholder">The full planner — checkable run sheet, swappable assembly cards — comes in Phase 4.</p>

      <div className="button-row">
        <button type="button" className="btn btn--primary" onClick={onGenerateNew}>
          Generate a new week
        </button>
      </div>
    </div>
  )
}

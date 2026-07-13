export default function NaturalUnitsEditor({ units, onChange }) {
  function updateRow(index, patch) {
    onChange(units.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  function removeRow(index) {
    onChange(units.filter((_, i) => i !== index))
  }

  function addRow() {
    onChange([...units, { label: '', gramsOrFraction: 0 }])
  }

  return (
    <div className="field">
      <span>Natural units (e.g. "1/3 cup" → 55 g)</span>
      {units.map((row, i) => (
        <div className="ingredient-list__row" key={i}>
          <input
            type="text"
            className="ingredient-list__name"
            value={row.label}
            onChange={(e) => updateRow(i, { label: e.target.value })}
            placeholder="Label"
          />
          <input
            type="text"
            inputMode="decimal"
            className="ingredient-list__measure"
            value={row.gramsOrFraction}
            onChange={(e) => updateRow(i, { gramsOrFraction: parseFloat(e.target.value) || 0 })}
            placeholder="Grams"
          />
          <button
            type="button"
            className="btn list-row__remove"
            onClick={() => removeRow(i)}
            aria-label={`Remove natural unit ${i + 1}`}
          >
            ✕
          </button>
        </div>
      ))}
      <button type="button" className="list-add-btn" onClick={addRow}>
        + Add natural unit
      </button>
    </div>
  )
}

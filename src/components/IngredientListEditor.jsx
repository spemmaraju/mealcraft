import MeasureInput from './MeasureInput.jsx'

export default function IngredientListEditor({ ingredients, onChange }) {
  function updateRow(index, patch) {
    onChange(ingredients.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  function removeRow(index) {
    onChange(ingredients.filter((_, i) => i !== index))
  }

  function addRow() {
    onChange([...ingredients, { name: '', measure: '' }])
  }

  return (
    <div className="field">
      <span>Ingredients</span>
      {ingredients.map((row, i) => (
        <div className="ingredient-list__row" key={i}>
          <input
            type="text"
            className="ingredient-list__name"
            value={row.name}
            onChange={(e) => updateRow(i, { name: e.target.value })}
            placeholder="Name"
          />
          <MeasureInput value={row.measure} onChange={(measure) => updateRow(i, { measure })} />
          <button
            type="button"
            className="btn list-row__remove"
            onClick={() => removeRow(i)}
            aria-label={`Remove ingredient ${i + 1}`}
          >
            ✕
          </button>
        </div>
      ))}
      <button type="button" className="list-add-btn" onClick={addRow}>
        + Add ingredient
      </button>
    </div>
  )
}

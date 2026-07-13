export default function StepListEditor({ steps, onChange }) {
  function updateStep(index, text) {
    onChange(steps.map((s, i) => (i === index ? text : s)))
  }

  function removeStep(index) {
    onChange(steps.filter((_, i) => i !== index))
  }

  function moveStep(index, direction) {
    const target = direction === 'up' ? index - 1 : index + 1
    if (target < 0 || target >= steps.length) return
    const next = [...steps]
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }

  function addStep() {
    onChange([...steps, ''])
  }

  return (
    <div className="field">
      <span>Steps</span>
      {steps.map((step, i) => (
        <div className="step-list__row" key={i}>
          <span className="step-list__num">{i + 1}.</span>
          <input
            type="text"
            className="step-list__text"
            value={step}
            onChange={(e) => updateStep(i, e.target.value)}
            placeholder="Step description"
          />
          <button
            type="button"
            className="btn list-row__move"
            onClick={() => moveStep(i, 'up')}
            disabled={i === 0}
            aria-label={`Move step ${i + 1} up`}
          >
            ▲
          </button>
          <button
            type="button"
            className="btn list-row__move"
            onClick={() => moveStep(i, 'down')}
            disabled={i === steps.length - 1}
            aria-label={`Move step ${i + 1} down`}
          >
            ▼
          </button>
          <button
            type="button"
            className="btn list-row__remove"
            onClick={() => removeStep(i)}
            aria-label={`Remove step ${i + 1}`}
          >
            ✕
          </button>
        </div>
      ))}
      <button type="button" className="list-add-btn" onClick={addStep}>
        + Add step
      </button>
    </div>
  )
}

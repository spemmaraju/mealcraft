const RATING_SEGMENTS = [
  { value: 'repeat', label: 'Repeat' },
  { value: 'fine', label: 'Fine' },
  { value: 'never', label: 'Never' },
]

function makeabilityText(status) {
  if (!status || status.makeable) return '✓ Makeable now'
  const shown = status.missing.slice(0, 2).join(', ')
  const suffix = status.missing.length > 2 ? '…' : ''
  return `missing ${status.missing.length}: ${shown}${suffix}`
}

export default function ComponentRow({ component, status, onOpenDetail, onRate }) {
  function handleRate(value) {
    onRate(component.id, component.rating === value ? null : value)
  }

  return (
    <div className="component-row">
      <button type="button" className="component-row__body" onClick={() => onOpenDetail(component.id)}>
        <div className="component-row__top">
          <span className="component-row__name">{component.name}</span>
          <span className={`component-row__badge component-row__badge--${component.type}`}>{component.type}</span>
        </div>
        <div className="component-row__meta">
          {component.cuisineTags.length > 0 && <span>{component.cuisineTags.join(', ')}</span>}
          <span
            className={`component-row__makeable${status && status.makeable ? ' component-row__makeable--yes' : ''}`}
          >
            {makeabilityText(status)}
          </span>
        </div>
      </button>
      <div className="component-row__rating">
        {RATING_SEGMENTS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            className={`rating-segment rating-segment--${value}${component.rating === value ? ' rating-segment--active' : ''}`}
            onClick={() => handleRate(value)}
            aria-pressed={component.rating === value}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

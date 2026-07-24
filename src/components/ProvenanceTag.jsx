import { NUTRITION_SOURCE_LABELS, provenanceClass } from '../schema.js'
import { PROVENANCE_ICONS } from './Icons.jsx'

// Shared provenance badge (components/rows.html) — icon + short label, one
// of 4 colors (seed/online/manual/barcode) keyed off provenanceClass(source).
// CLAUDE.md §5: nutrition provenance must be visible wherever a macro number
// shows; this is the one place that rule is implemented so every surface
// (Pantry rows, Track item rows, Component detail, editors) renders it the
// same way.
export default function ProvenanceTag({ source, tiny }) {
  if (!source) return null
  const cls = provenanceClass(source)
  const Icon = PROVENANCE_ICONS[cls]
  const label = NUTRITION_SOURCE_LABELS[source] || source
  return (
    <span className={`badge badge--${cls}${tiny ? ' badge--tiny' : ''}`}>
      <Icon size={tiny ? 10 : 12} strokeWidth={cls === 'seed' ? 2.5 : 2} />
      {label}
    </span>
  )
}

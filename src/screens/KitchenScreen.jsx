import PantryScreen from './PantryScreen.jsx'
import PlanScreen from './PlanScreen.jsx'
import LibraryScreen from './LibraryScreen.jsx'

const SECTIONS = [
  { id: 'pantry', label: 'Pantry' },
  { id: 'plan', label: 'Cook & plan' },
  { id: 'library', label: 'Recipes' },
]

// Three-tab layout: Pantry, Plan and Library live here as sections. The
// selected section is owned by App.jsx so it survives switching tabs.
export default function KitchenScreen({ section = 'pantry', onSectionChange, onGoToSettings }) {
  return (
    <div className="screen">
      <h1>Kitchen</h1>
      <div className="segmented" role="tablist" aria-label="Kitchen sections">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={section === s.id}
            className={`segmented__btn${section === s.id ? ' segmented__btn--active' : ''}`}
            onClick={() => onSectionChange?.(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>
      {section === 'pantry' && <PantryScreen embedded />}
      {section === 'plan' && <PlanScreen embedded onGoToSettings={onGoToSettings} />}
      {section === 'library' && <LibraryScreen embedded />}
    </div>
  )
}

const TABS = [
  { id: 'pantry', label: 'Pantry', icon: '🥫' },
  { id: 'library', label: 'Library', icon: '📖' },
  { id: 'plan', label: 'Plan', icon: '📅' },
  { id: 'track', label: 'Track', icon: '📈' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
]

export default function TabBar({ active, onChange }) {
  return (
    <nav className="tab-bar" aria-label="Main navigation">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          className={`tab-bar__item${active === tab.id ? ' tab-bar__item--active' : ''}`}
          onClick={() => onChange(tab.id)}
          aria-current={active === tab.id ? 'page' : undefined}
        >
          <span className="tab-bar__icon" aria-hidden="true">{tab.icon}</span>
          <span className="tab-bar__label">{tab.label}</span>
        </button>
      ))}
    </nav>
  )
}

import { NAV_ICONS, FabPlusIcon } from './Icons.jsx'

const TABS = [
  { id: 'pantry', label: 'Pantry' },
  { id: 'library', label: 'Library' },
  { id: 'plan', label: 'Plan' },
  { id: 'track', label: 'Track' },
  { id: 'settings', label: 'Settings' },
]

// components/nav.html: a floating pill nav (line-icon SVGs, not emoji) plus
// a FAB that's context-sensitive by screen (App.jsx decides what it opens).
export default function TabBar({ active, onChange, onFab, backupOverdue }) {
  return (
    <div className="tab-bar">
      <div className="tab-bar__inner">
        <nav className="tab-bar__nav" aria-label="Main navigation">
          {TABS.map((tab) => {
            const Icon = NAV_ICONS[tab.id]
            return (
              <button
                key={tab.id}
                className={`tab-bar__item${active === tab.id ? ' tab-bar__item--active' : ''}`}
                onClick={() => onChange(tab.id)}
                aria-current={active === tab.id ? 'page' : undefined}
              >
                <Icon size={24} />
                <span className="tab-bar__label">{tab.label}</span>
                {tab.id === 'settings' && backupOverdue && <span className="tab-bar__badge" aria-label="Backup overdue" />}
              </button>
            )
          })}
        </nav>
        <button type="button" className="tab-bar__fab" onClick={onFab} aria-label="Quick add">
          <FabPlusIcon size={26} />
        </button>
      </div>
    </div>
  )
}

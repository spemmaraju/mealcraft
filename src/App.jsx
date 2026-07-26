import { useEffect, useState } from 'react'
import * as storage from './storage.js'
import * as trackOps from './trackOps.js'
import { shouldNudgeBackup } from './backupOps.js'
import TabBar from './components/TabBar.jsx'
import AppHeader from './components/AppHeader.jsx'
import HelpSheet from './components/HelpSheet.jsx'
import InstallHint from './components/InstallHint.jsx'
import PantryScreen from './screens/PantryScreen.jsx'
import LibraryScreen from './screens/LibraryScreen.jsx'
import PlanScreen from './screens/PlanScreen.jsx'
import TrackScreen from './screens/TrackScreen.jsx'
import SettingsScreen from './screens/SettingsScreen.jsx'

const SCREENS = {
  pantry: PantryScreen,
  library: LibraryScreen,
  plan: PlanScreen,
  track: TrackScreen,
  settings: SettingsScreen,
}

export default function App() {
  const [activeTab, setActiveTab] = useState('pantry')
  const [showHelp, setShowHelp] = useState(false)
  const [fabSignal, setFabSignal] = useState(null)
  const [backupOverdue, setBackupOverdue] = useState(false)
  const Screen = SCREENS[activeTab]

  // Round 5 Fix 5: a cheap daily safety-net snapshot (guards against a bad
  // write or corruption bug) and a best-effort request for persistent
  // storage, so the browser is less likely to evict localStorage under
  // pressure. Both are fire-and-forget — neither may ever block or break
  // app boot, hence the guards.
  useEffect(() => {
    storage.captureSnapshotIfNeeded()
    try {
      navigator.storage?.persist?.()?.catch(() => {})
    } catch {
      // Persistent storage is best-effort only.
    }
  }, [])

  // Round 2.6 §5: BackupNudge no longer lives in the global top bar — it's
  // a card at the bottom of Settings — but the tab bar still needs a light
  // signal (a dot on the Settings icon) that it's overdue.
  useEffect(() => {
    async function check() {
      const [components, planSlots, logs, settings] = await Promise.all([
        storage.get('components'),
        storage.get('planSlots'),
        storage.get('logs'),
        storage.get('settings'),
      ])
      const hasUserData = components.length > 0 || planSlots.length > 0 || logs.length > 0
      setBackupOverdue(shouldNudgeBackup({ lastExportAt: settings.lastExportAt, hasUserData, nowISO: new Date().toISOString() }))
    }
    check()
    return storage.subscribe(check)
  }, [])

  // FAB opens the add sheet for the time-appropriate meal, on Track — from
  // any other screen it first jumps to Track, then opens the same sheet.
  function handleFab() {
    setActiveTab('track')
    setFabSignal({ meal: trackOps.mealForTime(), nonce: Date.now() })
  }

  return (
    <div className="app-shell">
      <AppHeader onHelp={() => setShowHelp(true)} />
      <InstallHint />
      <main className="app-content">
        <Screen
          onGoToSettings={() => setActiveTab('settings')}
          onGoToPlan={() => setActiveTab('plan')}
          fabSignal={activeTab === 'track' ? fabSignal : null}
        />
      </main>
      <TabBar active={activeTab} onChange={setActiveTab} onFab={handleFab} backupOverdue={backupOverdue} />
      {showHelp && <HelpSheet onClose={() => setShowHelp(false)} />}
    </div>
  )
}

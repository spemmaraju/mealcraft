import { useState } from 'react'
import TabBar from './components/TabBar.jsx'
import AppHeader from './components/AppHeader.jsx'
import HelpSheet from './components/HelpSheet.jsx'
import BackupNudge from './components/BackupNudge.jsx'
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
  const Screen = SCREENS[activeTab]

  return (
    <div className="app-shell">
      <AppHeader onHelp={() => setShowHelp(true)} />
      <BackupNudge onGoSettings={() => setActiveTab('settings')} />
      <InstallHint />
      <main className="app-content">
        <Screen onGoToSettings={() => setActiveTab('settings')} />
      </main>
      <TabBar active={activeTab} onChange={setActiveTab} />
      {showHelp && <HelpSheet onClose={() => setShowHelp(false)} />}
    </div>
  )
}

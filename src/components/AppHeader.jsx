export default function AppHeader({ onHelp }) {
  return (
    <header className="app-header">
      <span className="app-header__title">MealCraft</span>
      <button
        type="button"
        className="app-header__help"
        onClick={onHelp}
        aria-label="How to use MealCraft"
      >
        ?
      </button>
    </header>
  )
}

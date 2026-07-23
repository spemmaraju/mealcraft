// Same backdrop/sheet pattern as MicroActionSheet — a reference page, not a
// form, so there's nothing to apply or discard, just Close.
export default function HelpSheet({ onClose }) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet help-sheet" onClick={(e) => e.stopPropagation()}>
        <h2>How to use MealCraft</h2>

        <section className="help-section">
          <h3>Welcome</h3>
          <p>
            MealCraft is local-first: there's no account and no server — everything
            you enter lives only in this browser, on this device. That means it's
            private, but it also means <strong>you</strong> are responsible for backing
            it up. Use Export in Settings regularly, especially before clearing
            browser data or switching devices.
          </p>
        </section>

        <section className="help-section">
          <h3>🥫 Pantry</h3>
          <p>
            Track what you actually have on hand. Mark items as <strong>staple</strong>{' '}
            (always around) or <strong>rotating</strong>, and toggle on-hand as you use
            things up or restock. Categories are yours to rename or add to. You can
            scan a barcode to pull in nutrition facts automatically.
          </p>
        </section>

        <section className="help-section">
          <h3>📖 Library</h3>
          <p>
            Your reusable meal building blocks — bases, proteins, veg, sauces,
            finishers — plus full dishes made of them. Rate anything{' '}
            <strong>repeat</strong>, <strong>fine</strong>, or <strong>never</strong>{' '}
            after you try it, so future plans favor what you actually liked. Add
            nutrition info by photographing a label or entering it manually.
          </p>
        </section>

        <section className="help-section">
          <h3>📅 Plan</h3>
          <p>There are two ways to generate a week:</p>
          <ol>
            <li>
              <strong>Paste flow (no API key needed):</strong> copy the generated
              prompt, paste it into Claude or Gemini's normal chat, then paste that
              reply's JSON back into the import box.
            </li>
            <li>
              <strong>One-tap generate:</strong> if you've set up your own API key
              (BYOK) in Settings, MealCraft can call the AI directly.
            </li>
          </ol>
          <p>
            Once you have a week, you'll see a <strong>run sheet</strong> with
            checkable timed steps, daily <strong>assembly cards</strong>, and{' '}
            <strong>grocery suggestions</strong> — those are advisory only, dismiss
            anything you don't need. You can also regenerate or substitute a single
            component without redoing the whole week.
          </p>
        </section>

        <section className="help-section">
          <h3>📈 Track</h3>
          <p>
            Log breakfast, lunch, dinner, and snacks separately — lunch keeps a
            one-tap "log from plan" shortcut straight from the day's assembly card.
            For anything else, tap <strong>+ Add</strong> and pick a source: today's
            plan, your library, a pantry item (with an amount), or an online search.
            Search results can be logged as a one-off or saved to the pantry so the
            same food resolves offline next time. The small tag under each macro
            number shows where it came from — <strong>seed_table</strong>/
            <strong>ai_estimate</strong> are rough estimates,{' '}
            <strong>barcode</strong>/<strong>label_photo</strong>/
            <strong>online_search</strong>/<strong>manual</strong> are measured. The
            gauges (protein band, plate mix, streak, money saved) are directional —
            meant to build awareness, not to be a precise ledger. On Fridays you'll
            get a short 3-line weekly feedback prompt.
          </p>
        </section>

        <section className="help-section">
          <h3>⚙️ Settings</h3>
          <p>
            <strong>Export / Import</strong> is your backup and the only way to move
            data to another device — use it often. You can also add a free USDA
            FoodData Central key for nutrition lookups, and set up BYOK (your own
            Anthropic or Google API key) to enable one-tap week generation and AI
            micro-actions.
          </p>
        </section>

        <section className="help-section">
          <h3>Install as an app</h3>
          <p>
            MealCraft works offline once installed. If you see a banner offering to
            add it to your home screen, that's this — on iOS, use your browser's
            Share menu and "Add to Home Screen" instead.
          </p>
        </section>

        <section className="help-section">
          <h3>A few things worth knowing</h3>
          <ul>
            <li>Plans and grocery lists are proposals — edit or ignore anything.</li>
            <li>Anything destructive always asks to confirm, or can be undone.</li>
            <li>If you haven't exported in a while, you'll see an occasional reminder banner.</li>
          </ul>
        </section>

        <div className="button-row">
          <button type="button" className="btn btn--primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

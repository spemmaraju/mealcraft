# Help section — "How to use MealCraft"

Post-Phase-6 addition (PROMPT_PACK.md hands off after Phase 6 and asks the
user to say what's missing from real use — this is that ask).

## What it is

A persistent header (`MealCraft` title + a `?` button) shown above the app
content on every tab. Tapping `?` opens a bottom sheet with a plain-English
walkthrough of every screen and feature, written for a beginner user.

## Why

The app has no onboarding or reference material. Between weekly uses, the
paste-flow (copy prompt → paste into AI chat → paste JSON back) and the BYOK
setup are easy to forget. A built-in reference removes the need to re-derive
these from memory or old chat history.

## Files

- `src/components/AppHeader.jsx` — new. Title + `?` button, `onHelp` prop.
- `src/components/HelpSheet.jsx` — new. Reuses the existing
  `.sheet-backdrop`/`.sheet` bottom-sheet pattern (same shape as
  `MicroActionSheet.jsx`). Content is hardcoded JSX, one section per feature
  area: Welcome, Pantry, Library, Plan, Track, Settings, Install as an app,
  A few things worth knowing.
- `src/App.jsx` — renders `AppHeader` above the existing banners, holds
  `showHelp` state, conditionally renders `HelpSheet`.
- `src/styles.css` — adds `.app-header` and `.app-header__help` (first
  icon-button pattern in the app); help-sheet content reuses existing
  typography/list/button-row classes, no new sheet-level CSS.

## Non-goals

No new dependency, no router, no persisted "seen it" / first-run-only state
(the help is a reference, meant to be reopened anytime) — dismiss is
always available and its state is not tracked or saved.

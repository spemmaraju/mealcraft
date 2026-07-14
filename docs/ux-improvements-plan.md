# MealCraft — Four UX Improvements

## Context

Post-Phase-6 polish based on the user's first real-use feedback:

1. The Pantry screen is a long scroll — category sections should be collapsible, collapsed by default.
2. Quick-add only captures a name; setting role/qty/nutrition requires tapping the item again. Wanted: quick-add creates the item AND opens the full editor prefilled.
3. Sunday cook / Wednesday refresh are hardcoded. Wanted: cook-day and refresh-day pickers in Settings (refresh can be "none"). Lunches stay Mon–Fri.
4. The design feels dull. Agreed direction: "Warm Kitchen" — terracotta brand accent for actions, green kept for food status, plus baseline polish (shadows, transitions, press states, dark-mode accent tuning). CSS-only.

Five commits, one per checkpoint, matching existing "checkpoint" commit style; push after each (remote exists). No new dependencies. No test suite — manual verification via `npm run dev` per checkpoint.

## Checkpoint 1 — Collapsible pantry sections

**Files:** `src/screens/PantryScreen.jsx`, `src/styles.css`

- Ephemeral `useState(() => new Set())` of expanded categories (empty = all collapsed). Not persisted: collapse state is UI chrome; persisting would need a schema bump for pure view state, and the agreed default is collapsed-on-visit anyway.
- `renderSection` (PantryScreen.jsx:99-127): replace plain `<h2>` with a header button inside the h2 — category name + count span ("3/12 on hand", computed from the filtered `items` passed in) + rotating chevron, `aria-expanded`. Rows + quick-add render only when open. Adding to a collapsed section = tap header to expand first.
- While search is active (`search.trim()`): all sections with matches auto-expand; sections with zero matches are skipped entirely (at the emit site, PantryScreen.jsx:165-166). Clearing search reverts to the manual expanded set.
- CSS: `.pantry-section__header` full-width flex button, min-height 44px, no bg/border; keep existing uppercase title styling; chevron with transform transition.

**Verify:** collapsed on load; toggle works; counts reflect filters and on-hand toggles; search expands matching sections only; add flow works via expand; "Other" section behavior unchanged.

## Checkpoint 2 — Quick-add opens the full editor

**Files:** `src/pantryOps.js`, `src/screens/PantryScreen.jsx`

- `pantryOps.addItem` (pantryOps.js:6-8) returns `{ pantry, item }` instead of just the array — its only caller is PantryScreen.jsx:89.
- `commitAdd` (PantryScreen.jsx:82-91): persist, close the input (`setAddingIn(null)`), and `setEditingItemId(item.id)` when triggered by Enter.
- Semantics: **Enter** = commit + open editor (rapid-entry loop intentionally ends); **blur** = commit silently, no sheet (preserves tap-away-saves); **Escape** = cancel (unchanged).
- Double-commit guard (Enter then unmount-blur both firing): Enter sets an `openEditorRef` flag and calls `e.currentTarget.blur()`; only `onBlur` runs `commitAdd`, reading + resetting the ref. Single commit path.
- Editor needs no changes: Cancel keeps the quick-added item; Delete has its existing confirm.

**Verify:** Enter → row appears AND editor sheet opens prefilled (name, category from section, role=rotating, onHand, seeded nutrition if matched); no duplicate rows; Escape creates nothing; blur creates item without sheet.

## Checkpoint 3a — Cook/refresh day: schema v5 + Settings UI

**Files:** `src/schema.js`, `src/storage.js`, `src/screens/SettingsScreen.jsx`

- New exports in schema.js: `DAYS` (Sun–Sat), `REFRESH_DAYS` (Mon–Fri), `DAY_NAMES` (short→full names). Short tokens match the existing `refresh.day: 'Wed'` convention.
- `createSettings` (schema.js:128-139) gains `cookDay: 'Sun'`, `refreshDay: 'Wed'` (`'Mon'..'Fri' | null`); validator (schema.js:288-296) gains matching enum checks (refreshDay nullable).
- storage.js: `SCHEMA_VERSION` 4→5; extend `migrate()` (storage.js:47-78) with a v4 step backfilling `cookDay ??= 'Sun'`, `refreshDay ??= 'Wed'`; update the comment block. **Required** — verified: `readRaw()` (storage.js:84) spreads defaults at top level only, so stored `settings` fully replaces the default and missing fields are NOT backfilled; `parseAndValidate` runs `migrate()` on imports so old exports keep working.
- **Week model decision — `weekOf` stays Sunday-anchored.** `weekOf` is the storage identity of plans/feedback and drives all trackOps math; cookDay never participates in date arithmetic (run-sheet times are relative, cook day appears only as a label and prompt text). If cookDay=Sat, the cook is simply the Saturday before the Mon–Fri lunch week; no code computes that date. `currentWeekSundayISO`, `nextSundayISO`, `isFeedbackWindow` (Fri/Sat — end of the eating week, unchanged), and all of trackOps stay untouched.
- SettingsScreen: new "Week schedule" section (pattern-match the FDC-key section's load/save at SettingsScreen.jsx:41-47). Chip rows (reuse `.chip`, 44px): Cook day = Sun–Sat; Refresh day = Mon–Fri + "None" (null). Save on tap. Helper text: "Applies to newly generated weeks."

**Verify:** fresh profile defaults Sun/Wed; existing v4 localStorage migrates on reload (schemaVersion 5, fields present); v4 export imports cleanly; hand-mangled `cookDay: "Someday"` rejected on import; picker choices persist.

## Checkpoint 3b — Cook/refresh day: prompt + labels

**Files:** `src/promptCompiler.js`, `src/components/GenerateWeekForm.jsx`, `src/components/RunSheet.jsx`, `src/components/WeekView.jsx`

- promptCompiler.js: `GENERATION_BRIEF` (:8-17) becomes `buildGenerationBrief(cookName, refreshName, refreshEnabled)` — "Assign durable components to {cookName}…", "{cookName} run sheet"; when refresh is off: single-session wording, keep-5-days guidance. `constraintsSection` (:49-52): `cookSunday/wedRefresh` → `cook/refresh`, event strings from `DAY_NAMES`. `outputFormatSection` (:110-138): refresh example `day: refreshDay ?? cookDay`; when off, instruct empty `refresh.steps`/`componentNames` (WeekPlan shape/validator unchanged).
- GenerateWeekForm.jsx: `cookSunday/wedRefresh` → `cookEnabled/refreshEnabled`; chip labels dynamic ("Saturday cook", "Tuesday refresh"); hide refresh chip when `settings.refreshDay === null`. "Lunch servings (Mon–Fri)" label stays. `weekOf` default stays `nextSundayISO()`.
- RunSheet.jsx: add `settings` prop (WeekView.jsx:53 already has settings); headers (:13, :21) → "`${DAY_NAMES[settings?.cookDay ?? 'Sun']} run sheet`".
- Existing saved plans: unaffected — assembly/refresh cards are data-driven off stored `week.refresh.day`. Known, accepted quirk: changing cookDay re-labels an existing plan's run-sheet header (times are relative; harmless).
- **Do NOT touch:** trackOps.js, weekOps.js, weekImport.js, AssemblyCards.jsx, LogMealCard.jsx, GaugesPanel.jsx, WeeklyFeedbackForm.jsx, HelpSheet.jsx, WeekPlan schema.

**Verify:** cookDay=Sat + refreshDay=Tue → chips and compiled prompt say "Saturday cook"/"Tuesday refresh", example `day: "Tue"`, still "Lunch servings Mon–Fri: 5"; refreshDay=None → chip hidden, single-session prompt; RunSheet header "Saturday run sheet"; existing week renders unchanged; Track screen unchanged; paste-mode import still validates.

## Checkpoint 4 — Warm Kitchen visual refresh (CSS-only)

**File:** `src/styles.css` only (tokens at :1-12, dark block :1389-1398). Zero JSX changes.

Token table (light / dark):

| Token | Light | Dark | For |
|---|---|---|---|
| `--brand` (new) | #b04a2b | #c25f3c | primary buttons, active tab, active chips, selected cards, help button, focus rings |
| `--brand-soft` (new) | #f6e7df | #3a2a21 | active-chip bg, selection tints |
| `--accent` (green) | #2f6b4f | **add** #4f9673 | on-hand, staple badge, success, "repeat" rating, protein in-band |
| `--accent-soft` / `--accent-border` (new) | #e9f3ee / #c9e2d5 (promoted from :195-197) | #22322a / #35503f | success messages |
| `--danger` | unchanged | **add** #d06258 | danger |
| `--danger-soft` / `--danger-border` (new) | #fbeae8 / #f0c6c2 (from :189-191) | #3a2422 / #5c332f | error messages |
| `--gold` (new) | #b08a2e (from :561) | #cfa54a | "fine" rating |
| `--amber` (new) | #c98a2b (from :1267) | #d9a04a | plate-mix carbs |
| `--teal` (new) | #3f8f8a (from :1271) | #57aaa4 | plate-mix veg |
| `--shadow-sm` (new) | 0 1px 2px rgba(31,35,32,.06) | 0 1px 2px rgba(0,0,0,.45) | rows, banners |
| `--shadow-md` (new) | 0 4px 14px rgba(31,35,32,.10) | 0 8px 20px rgba(0,0,0,.55) | cards, sheets |

- Coherence rule: **actions/navigation = terracotta, food-status = green.** `--brand`: `.btn--primary` (:128), `.tab-bar__item--active` (:103), `.chip--active` (:240, restyled to brand-soft bg + brand border/text), `.day-strip__day--selected`, `.assembly-card--selected` (:922), `.app-header__help` (:59). Green stays: on-hand toggle, staple badge, `.message--success`, repeat rating, run-sheet checks, protein/plate-mix protein.
- Baseline polish: `--shadow-md` on `.settings-section` (:162), `.plan-section` (:711), `.sheet` (:359); `--shadow-sm` on `.assembly-card` (:915), `.banner` (:1345); radii 12→16px on big cards; headings 600→700 (`.screen h1` :71, section h2s); `.btn`/`.chip`/`.tab-bar__item` get transitions + `:active { transform: scale(0.97) }` + `:focus-visible` brand outline; messages/ratings/plate-mix rewritten to tokens.
- Do NOT touch: 44px min-heights, recipe-step 1.25rem, sheet layout, `#000` video bg (:1106), font stack.

**Verify (light + dark via devtools emulation):** terracotta actions vs green food-status as assigned; shadows/rounder cards both modes; press-scale and focus rings; error/success messages legible in dark (previously untinted); after edit, only remaining raw hexes live in `:root`, the dark block, and `#000`.

## Risks

- **Export compatibility is one-way:** v5 exports won't import into an older deployed build (stale GH Pages). Old→new is safe. Redeploy Pages after checkpoint 3a; take a backup export before upgrading.
- Feature 2 Enter+blur double-commit — mitigated by the single-blur-path ref guard; test explicitly.
- Prompt changes are parameterized-only; weekImport validation untouched, so BYOK retry and paste mode keep working.

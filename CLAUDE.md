# CLAUDE.md — MealCraft (working title) — Enforced Ruleset

You are building **MealCraft**, a local-first kitchen PWA for a single user.
This file is law. If a phase prompt conflicts with this file, this file wins.
If anything is ambiguous, STOP and ask the user before writing code.

## 1. Product identity

- Local-first PWA. No accounts, no backend, no analytics, no third-party trackers.
- Phone-primary, desktop-capable: responsive layout, one-handed mobile use is the
  design target (big tap targets, kitchen-friendly).
- The app closes one loop — **stock → cook → eat (home or out) → restock**:
  pantry + recipe library + cook sessions + food log + advisory grocery list.
  (Phase 17 re-statement; it began as a weekly meal-prep planner.)
- The USER drives. The app proposes; it never locks, forces, or gates the
  user's behavior. Grocery lists are advisory. Plans are editable proposals.
  AI parses are drafts: nothing is saved until the user confirms a review card.
- Tracking is a mindfulness habit, not a rigorous ledger. Directional gauges,
  bands, and trends — never precision theater. Quantities are tracked ONLY
  when the user states them ("10 carrots" → 10); otherwise soft levels.
  Never ask the user to count. No nudges or push-style reminders.

## 2. Tech constraints

- Vite + React, single-page app. Plain CSS or a single small utility layer —
  no heavy UI frameworks.
- Data layer: ALL persistence goes through one storage module
  (`src/storage.js`). v1 implementation: localStorage (JSON). The module's
  interface must allow swapping to IndexedDB later without touching callers.
- Full-state Export/Import as JSON is a first-class feature from Phase 0.
  It is the backup mechanism AND the manual cross-device sync.
- BYOK mode: user's Claude/Gemini API key is stored ONLY in localStorage,
  sent ONLY to the provider's official endpoint, never logged or embedded,
  and nulled out of every export/snapshot.
- Default Anthropic model: `claude-sonnet-5-5` (structured extraction);
  Settings offers Opus 5.5 / Haiku 5.5 (Phase 19).
  The user approved using their key extensively for parsing (Phase 17).
- PWA: manifest + service worker for offline use.
- No barcode/vision/nutrition network calls except: Open Food Facts API,
  USDA FoodData Central API, and (BYOK mode) the official Anthropic/Google
  endpoints.

## 3. The schema is the contract

All modules communicate through these shapes (source of truth:
`src/schema.js`). Changing a schema requires explicit user approval and a
`SCHEMA_VERSION` bump in `src/storage.js` with a migration step (older
exports must still import). Current: **v13**.

```
State (localStorage key "mealcraft.v1") {
  schemaVersion, categories: [string],          // category list is user-editable
  pantry: [PantryItem], components: [Component], planSlots: [PlanSlot],
  logs: [LogEntry], feedback: [WeeklyFeedback], grocery: [GroceryItem],
  ideas: [Idea], cookSessions: [CookSession], shelf: [ShelfEntry],
  settings: Settings
}
// Daily snapshots (newest 3) live under "mealcraft.snapshots.v1", never in exports.

PantryItem {
  id, name, category,
  onHand: bool,
  roughQty: string | null,       // free text: "half bag", "2 blocks"
  nutrition: NutritionInfo | null
}

NutritionInfo {
  source: "barcode" | "label_photo" | "seed_table" | "ai_estimate" | "manual" | "online_search",
  servingDesc: string,           // "1/3 cup drained", "100 g", "1 block (396 g)"
  servingsPerContainer: number | null,
  perServing: { kcal, protein_g, carbs_g, fat_g, fiber_g? },
  naturalUnits: [ { label: string, gramsOrFraction } ],   // "1/3 cup" -> 55 g
  barcode?: string | null
}
// A pantry item whose name matches the seed table (src/nutritionSeeds.js +
// nutritionSeedsVeg.js) gets nutrition auto-attached with source:'seed_table'
// — at first seeding, at add-time, and via a backfill migration for existing
// installs. Never overwrites nutrition that's already set.

Component {                       // a recipe component or a composed dish
  id, name,
  type: "base" | "protein" | "veg" | "sauce" | "finisher" | "dish",
  ingredients: [ { name, measure,        // measure is FREE TEXT (cup/g/handful)
                   nutrition?: NutritionInfo | null } ],  // snapshot used when no pantry item resolves it (v13)
  steps: [string],
  shelfLifeDays: number,
  storage: string,
  station: "stovetop" | "oven" | "instant_pot" | "none",
  activeMin, passiveMin,
  servings: number | null,
  macrosPerServing: { kcal, protein_g, carbs_g, fat_g } | null,
  macroSource: NutritionInfo.source | "derived",   // "derived" is PARTIAL: sums what resolves (v13)
  rating: "repeat" | "fine" | "never" | null,
  archived: bool
}

LogItem =                          // shared by LogEntry and PlanSlot
  | { kind: "component", componentId: string, count: number }   // servings, stepper ±0.5
  | { kind: "pantry",    pantryId: string,    measure: string }  // "1 cup", "150 g"
  | { kind: "adhoc",     name: string, measure: string,
      nutrition: NutritionInfo }                                 // snapshot; survives without a pantry save

LogEntry {
  date,                            // LOCAL YYYY-MM-DD — always via src/dates.js todayISO()
  meal: "breakfast" | "lunch" | "dinner" | "snack",
  items: [LogItem],
  quickRating: "repeat" | "fine" | "never" | null
}
// Identity is (date, meal) — upsertLog replaces the matching entry.

PlanSlot { date, meal, items: [LogItem] }    // an editable proposal for a future meal
GroceryItem { name, forDish }                // ADVISORY ONLY; dismiss = delete
Idea { id, name, line, uses: [string], buy: [string], starred: bool }   // "What can I make?"

CookSession {                      // 🍳 Cook: a draft, then what actually went in (v13)
  id, status: "draft" | "done", createdAt, name, text,
  rows: [ { name, measure, pantryId: string | null, nutrition: NutritionInfo | null, checked: bool } ],
  servingsMade: number | null, componentId: string | null   // set when done
}
ShelfEntry { id, componentId, servingsLeft, cookedOn, eatBy }   // ready-to-eat shelf (v13)
WeeklyFeedback { weekOf, repeatWorthy, diedUneaten, boredomNotes }
// No UI since Phase 11; collection kept so old exports still import.

Settings {
  proteinBand: { low_g, high_g },  // DAILY band across all logged meals
  boughtLunchCost: number,         // money-saved gauge (lunch-only today)
  apiMode: "paste" | "byok",
  provider: "anthropic" | "google",
  apiKey: string | null,           // nulled in exports
  fdcKey: string | null,           // USDA key; nulled in exports
  lastExportAt: string | null,     // ISO timestamp, drives the backup nudge
  cookDay: "Sun".."Sat",
  refreshDay: "Mon".."Fri" | null,
  anthropicModel: "claude-sonnet-5-5" | "claude-opus-5-5" | "claude-haiku-5-5"   // v13
}
```

Planned (Phases 20–21, pending each phase's approval): pantry stock
(`qty+unit` when stated, else a level) and a `where: home | packed | out`
tag on log entries. See `docs/kitchen-loop-plan.md`.

## 4. Process rules (phase gating — engineering, not habit)

1. Work ONE phase at a time, exactly as specified in PROMPT_PACK.md.
2. Before coding a phase: restate the plan in ≤10 bullets, list files you will
   touch, and WAIT for user approval.
3. Every phase ends with its acceptance tests demonstrably passing. Show the
   evidence (test output or a manual verification checklist the user can run).
   `npm test` (all `scripts/smoke-*.mjs`) must pass; CI runs it before every
   deploy, so a red suite blocks the deploy.
4. Do not start the next phase until the user says the gate passed. Work on a
   branch; merging to `main` deploys to the user's phone.
5. Never refactor prior phases opportunistically. If a prior-phase bug blocks
   you, report it and propose the minimal fix. Fix the class, not the instance:
   if a bug pattern can recur, fix the pattern.
6. Removing a feature removes or updates its smoke checks in the same change.
   Never skip or disable a check to get green.
7. No new dependencies without stating why and getting approval. Current
   allowlist: react, react-dom, vite, @vitejs/plugin-react, @zxing/browser
   (+ its @zxing/library peer).
8. Keep components small; no file over ~300 lines without justification.

## 5. UX rules

- Every destructive action (delete item, clear week) needs an undo or confirm.
- Free-text measures are first-class everywhere; never force unit conversion.
- Run sheet / cook steps are checkable with a thumb, phone on the counter.
- Nutrition provenance is visible wherever a macro number is shown (small tag).
- The app must be usable with apiMode = "paste" and zero network access
  (except the nutrition lookups the user explicitly triggers): every AI flow
  keeps a copy-prompt / paste-reply fallback. BYOK may add extras (auto
  retries, live estimates) that paste mode doesn't have.
- Free-text inputs meant for dictation (cook, shopping haul, eat-out) are
  large, autofocused, and tolerant of run-on speech (the user dictates with
  Wispr Flow via the system keyboard — no in-app speech API).

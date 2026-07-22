# CLAUDE.md — MealCraft (working title) — Enforced Ruleset

You are building **MealCraft**, a local-first meal-prep PWA for a single user.
This file is law. If a phase prompt conflicts with this file, this file wins.
If anything is ambiguous, STOP and ask the user before writing code.

## 1. Product identity

- Local-first PWA. No accounts, no backend, no analytics, no third-party trackers.
- Phone-primary, desktop-capable: responsive layout, one-handed mobile use is the
  design target (big tap targets, kitchen-friendly).
- The USER drives. The app is: database + recipe generator + recipe saver +
  ideator + tracker + planner. It proposes; it never locks, forces, or gates the
  user's behavior. Grocery lists are advisory. Plans are editable proposals.
- Tracking is a mindfulness habit, not a rigorous ledger. Directional gauges,
  bands, and trends — never precision theater.

## 2. Tech constraints

- Vite + React, single-page app. Plain CSS or a single small utility layer —
  no heavy UI frameworks.
- Data layer: ALL persistence goes through one storage module
  (`src/storage.js`). v1 implementation: localStorage (JSON). The module's
  interface must allow swapping to IndexedDB later without touching callers.
- Full-state Export/Import as JSON is a first-class feature from Phase 0.
  It is the backup mechanism AND the manual cross-device sync.
- BYOK mode: user's Claude/Gemini API key is stored ONLY in localStorage,
  sent ONLY to the provider's official endpoint, never logged or embedded.
- PWA: manifest + service worker for offline use (added in final phase).
- No barcode/vision/nutrition network calls except: Open Food Facts API,
  USDA FoodData Central API, and (BYOK mode) the official Anthropic/Google
  endpoints.

## 3. The schema is the contract

All modules communicate through these shapes. Changing a schema requires
explicit user approval and a version bump on the export format.

```
PantryItem {
  id, name, category,            // category list is user-editable
  role: "staple" | "rotating",
  onHand: bool,
  roughQty: string | null,       // free text: "half bag", "2 blocks"
  nutrition: NutritionInfo | null
}

NutritionInfo {
  source: "barcode" | "label_photo" | "seed_table" | "ai_estimate" | "manual",
  servingDesc: string,           // "1/3 cup drained", "100 g", "1 block (396 g)"
  servingsPerContainer: number | null,
  perServing: { kcal, protein_g, carbs_g, fat_g, fiber_g? },
  naturalUnits: [ { label: string, gramsOrFraction } ]   // "1/3 cup" -> 55 g
}
// A pantry item whose name matches the seed table (src/nutritionSeeds.js +
// nutritionSeedsVeg.js) gets nutrition auto-attached with source:'seed_table'
// — at first seeding, at add-time, and via a backfill migration for existing
// installs. Never overwrites nutrition that's already set.

Component {                       // also used for composed dishes
  id, name,
  type: "base" | "protein" | "veg" | "sauce" | "finisher" | "dish",
  cuisineTags: [string],
  ingredients: [ { name, measure } ],   // measure is FREE TEXT (cup/g/handful)
  steps: [string],
  shelfLifeDays: number,
  storage: string,
  station: "stovetop" | "oven" | "instant_pot" | "none",
  activeMin, passiveMin,
  macrosPerServing: { kcal, protein_g, carbs_g, fat_g } | null,
  macroSource: NutritionInfo.source | "derived",
  rating: "repeat" | "fine" | "never" | null,
  origin: "ai" | "manual" | "adapted",
  archived: bool
}

WeekPlan {
  weekOf: date,
  componentIds: [string],
  runSheet: [ { t: "0:05", station, action, componentId? , done: bool } ],
  assembly: [ { day, componentIds: [string], note } ],       // 5 cards
  refresh: { day: "Wed", steps: [string], componentIds: [string] },
  grocerySuggestions: [ { name, qty, dismissed: bool } ]     // ADVISORY ONLY
}

LogEntry {
  date, meal: "lunch" | "other",
  componentIds: [string],
  portions: [ { componentId, naturalUnitLabel, count } ],
  quickRating: "repeat" | "fine" | "never" | null
}

WeeklyFeedback { weekOf, repeatWorthy, diedUneaten, boredomNotes }  // 3 lines

Settings {
  proteinBand: { low_g, high_g },
  boughtLunchCost: number,        // for money-saved gauge
  apiMode: "paste" | "byok",
  provider: "anthropic" | "google",
  apiKey: string | null
}
```

## 4. Process rules (phase gating — engineering, not habit)

1. Work ONE phase at a time, exactly as specified in PROMPT_PACK.md.
2. Before coding a phase: restate the plan in ≤10 bullets, list files you will
   touch, and WAIT for user approval.
3. Every phase ends with its acceptance tests demonstrably passing. Show the
   evidence (test output or a manual verification checklist the user can run).
4. Do not start the next phase until the user says the gate passed.
5. Never refactor prior phases opportunistically. If a prior-phase bug blocks
   you, report it and propose the minimal fix. Fix the class, not the instance:
   if a bug pattern can recur, fix the pattern.
6. No new dependencies without stating why and getting approval. Expected
   allowlist: react, react-dom, vite, @zxing/browser (Phase 4.5 only).
7. Keep components small; no file over ~300 lines without justification.

## 5. UX rules

- Every destructive action (delete item, clear week) needs an undo or confirm.
- Free-text measures are first-class everywhere; never force unit conversion.
- Run sheet steps are checkable with a thumb, phone on the counter.
- Nutrition provenance is visible wherever a macro number is shown (small tag).
- The app must be fully usable with apiMode = "paste" and zero network access
  (except the nutrition lookups the user explicitly triggers).

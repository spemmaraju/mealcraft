# Kitchen Loop — design plan (Phases 17–21)

Status: Phases 17–19 built; 20–21 are proposals. Each phase still restates
its plan and waits for approval (CLAUDE.md §4). Decisions recorded here came
from the user on 2026-10-18.

## The loop

```
  shopping haul ──► pantry stock ──► cook session ──► shelf ──► log (home)
        ▲                                │                         │
        │                                └──── my portion ─────────┤
        └──── grocery list ◄── low / out ◄── stock decrements      │
                                                 eat out ──► log (out)
```

Every arrow that starts from free text goes through ONE parser and ONE
review card (Phase 18). Nothing is written until the user taps Confirm.

## User decisions

| Question | Decision |
|---|---|
| AI usage | BYOK key in use; use it extensively. Paste fallback kept for every parse. |
| Model | `claude-sonnet-5-5` default; model picker in Settings (Phase 18). |
| Cook timing | Draft beforehand, confirm what actually happened. |
| Pantry stock | Exact quantity when stated ("10 carrots"); soft level otherwise. Never ask to count. |
| Leftovers | "Ready to eat" shelf the user picks from — not auto-filled into plan slots. |
| Eating out | Logged by free text → AI estimate, tagged `out`. |
| Protein by meal | Yes. |
| Nudges | None. Low stock shows on the grocery list, silently. |
| Weekly recap | Stays off (Phase 13–16 "do not resurrect" list). |
| Dictation | Wispr Flow via the system keyboard. No in-app speech API (Chrome's sends audio to Google). |

## Phase 18 — parser + review card

- One prompt compiler, three modes: `cook` (ingredients + servings made),
  `haul` (purchases), `meal` (what I ate, incl. out).
- Prompt carries the pantry's item names so the model can match
  ("toor dal" ↔ pantry "Toor dal (split pigeon peas)").
- Reply shape (validated, named errors, fix-request on failure):
  `{ items: [{ name, qty: number|null, unit: string|null, measure: string, pantryMatch: string|null }], servingsMade?: number, place?: string }`
- `measure` stays free text — `qty`/`unit` are extracted only when the
  user said them. Never invent a quantity.
- Data sent to Anthropic: the typed/dictated text + pantry item names.
  Nothing else (no logs, no key in exports).

## Phase 19 — cook session + shelf

- Draft is saved as the user types; "Done" opens the review card prefilled
  with the draft so edits record what actually went in.
- Done → (a) upsert the dish (Component, type `dish`, servings),
  (b) log the user's portion, (c) shelf entry for the rest, eat-by =
  cook date + shelfLifeDays.
- Macro derivation becomes partial: resolved ingredients sum; unresolved
  ones are listed with "~N% known". Fixes the all-or-nothing behavior of
  `deriveComponentMacros`.

## Phase 20 — stock + haul

- `stock: { qty, unit } | { level: plenty|some|low|out } | null` on
  PantryItem (v13 migration: `roughQty` text is kept; `onHand` is derived
  for old callers until they move over).
- Decrement: same unit → arithmetic; otherwise step the level down one and
  show a "still have X?" chip on the cook review card.
- Grocery list gets low/out items (advisory, dismiss = delete, as today).

## Phase 21 — eat out + insights

- `where: home | packed | out` on LogEntry; guessed (component/pantry items
  → home, `meal` parse with a place → out), editable in one tap.
- Track additions: home vs total meals (week), cook sessions (week),
  protein per meal, money saved counting every home meal.

## Schema v13 (proposed, approved per phase)

- PantryItem: `+ stock`
- New collection `cookSessions`: `{ id, status: draft|done, date, text,
  items, servingsMade, componentId|null }`
- Component: `+ shelf: { servingsLeft, eatBy } | null`
- LogEntry: `+ where`
- Settings: `+ anthropicModel`

Each addition lands with the phase that needs it, one version bump per
phase, with a migration and an older-export import check.

## Known risks

- Parse quality on Indian ingredient names → pantry names are in the prompt;
  unmatched rows are flagged, never silently dropped.
- Dry vs cooked measures (Phase 13 risk) → parser keeps the user's words in
  `measure`; seed names already encode cooked/dry.
- Cost → Sonnet 5.5, thinking off, short prompts; one retry max.

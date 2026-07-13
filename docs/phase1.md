# Phase 1 — Approved Execution Spec: Pantry

> Status: plan approved, **not yet executed**.
> This document is self-contained: an executor (e.g. Sonnet) should be able to
> build Phase 1 from this file alone, plus repo-root `CLAUDE.md` (the enforced
> ruleset — read it first; it wins on any conflict). Per CLAUDE.md §4, before
> coding restate this plan in ≤10 bullets and WAIT for the user's approval.

## Context

Phase 0 is complete and gated: Vite + React scaffold, 5-tab mobile shell,
`src/schema.js` (factories + `validate(obj, shapeName)` returning
field-naming error strings), `src/storage.js` (the ONLY module touching
localStorage; async API: `get`, `set`, `subscribe`, `getFullState`,
`exportState`, `previewImport`, `importState`, `resetState`; root key
`mealcraft.v1`, `schemaVersion: 1`), and a working Settings Export/Import
screen. Smoke script: `scripts/smoke-phase0.mjs` (8 checks, passing).

Phase 1 replaces the Pantry placeholder with the real Pantry screen: items
grouped by user-editable categories, item CRUD with fast add, filters and
search, and ~40 seeded starter items.

**Approved schema change (user signed off — do not re-ask):** stored state
and the export format gain a top-level `categories: [string]` field (ordered,
user-editable category names), and `schemaVersion` bumps **1 → 2**. Old v1
exports must auto-migrate on import. This is the ONLY schema change permitted
in this phase; the seven shapes in CLAUDE.md §3 are untouched
(`PantryItem.category` stays a plain string naming its category).

Standing rules that bind this phase (from CLAUDE.md):
- All persistence via `src/storage.js`. UI components never touch localStorage.
- Phone-first at 390px; tap targets ≥ 44px; one-handed use.
- Free text is first-class (`roughQty` is never parsed or coerced).
- Every destructive action (delete item, delete category) needs confirm or undo.
- No new dependencies. No file over ~300 lines. No opportunistic refactors of
  Phase 0 code beyond the approved storage change below.

## Steps

1. **`src/storage.js` — version bump + categories + migration** (approved
   modification):
   - `SCHEMA_VERSION = 2`. `defaultState()` gains
     `categories: [...DEFAULT_CATEGORIES]` and `pantry: seedPantryItems()`
     (see step 2), so a fresh install and `resetState()` start with a useful
     pantry. Imports keep exactly what the imported file contains.
   - Add `migrate(state)`: if `schemaVersion === 1`, set
     `categories` = DEFAULT_CATEGORIES ∪ (categories referenced by the
     state's own pantry items, preserving default order, extras appended),
     then `schemaVersion = 2`. Apply in `readRaw()` (so an existing v1
     browser state upgrades silently on next load) and in
     `parseAndValidate()` BEFORE validation (so pasting a Phase-0 export
     "just works").
   - v2 validation in `parseAndValidate()`: `categories` must be an array of
     strings (error style matches existing messages, e.g.
     `categories[2]: expected string, got 4`). `COLLECTION_SHAPES` is NOT
     extended — categories are plain strings, not records.
   - Import diff summary should now also count categories.
2. **`src/seeds.js` (new)** — data only, no logic:
   - `DEFAULT_CATEGORIES` (this exact order): Spices, Condiments & Sauces,
     Oils & Fats, Grains & Bases, Legumes, Proteins, Vegetables, Fruits,
     Nuts Seeds & Finishers, Dairy, Frozen.
   - `seedPantryItems()` returning ~40 starter items built with
     `createPantryItem()` from `schema.js`, spread across those categories,
     for a veg + eggs kitchen: tofu, paneer, eggs, chickpeas (canned + dry),
     2–3 dals (toor, masoor, chana), rice (basmati), quinoa or millet, oats,
     common spices (cumin, coriander, turmeric, chili powder, garam masala,
     mustard seeds, hing…), oils (olive, neutral, ghee), soy sauce, vinegar,
     tahini, peanut butter, onions, garlic, ginger, tomatoes, seasonal veg,
     lemons, yogurt, milk, butter, nuts/seeds (peanuts, sesame, almonds),
     frozen peas, frozen spinach. Staples get `role: "staple"`,
     `onHand: true`; perishables `role: "rotating"`. All editable/deletable
     like any user item; `nutrition: null` everywhere (Phase 4.5 concern).
3. **`src/pantryOps.js` (new)** — pure functions over plain state (no DOM, no
   storage imports) so the smoke script can test them directly. Each takes
   current arrays and returns new ones:
   - `addItem(pantry, {name, category, ...})` (uses `createPantryItem`),
     `updateItem(pantry, id, patch)`, `deleteItem(pantry, id)`.
   - `addCategory(categories, name)` (reject empty/duplicate),
     `renameCategory(categories, pantry, oldName, newName)` → returns
     `{categories, pantry}` with every item whose `category === oldName`
     updated — **items follow the rename**,
     `moveCategory(categories, name, direction)` (up/down reorder),
     `deleteCategory(categories, pantry, name)` → error string if any item
     still uses it (delete-if-empty rule), else new list.
   - `filterItems(pantry, {search, role, onHandOnly})` — case-insensitive
     substring search on name; `role` is `null | "staple" | "rotating"`.
4. **Pantry UI** — replace the placeholder. Small components, each well under
   300 lines:
   - `src/screens/PantryScreen.jsx`: loads `pantry` + `categories` via
     `storage.get`, re-reads on `storage.subscribe`; owns filter/search state
     and an `editingItemId` / `managingCategories` UI state; renders filter
     bar, category sections in `categories` order (items not matching any
     known category render under a final "Other" section — display only,
     nothing is auto-recategorized).
   - `src/components/PantryItemRow.jsx`: one row = big onHand toggle
     (≥44px, one tap, immediate persist), name, small role badge
     (staple/rotating), `roughQty` free text if present; tapping the name
     opens the editor.
   - `src/components/PantryItemEditor.jsx`: bottom-sheet style editor —
     name, category `<select>` (from the categories list), staple/rotating
     toggle, onHand toggle, roughQty text input, Save / Cancel / Delete.
     Delete requires a confirm step (two-tap "Delete → Really delete?" or
     `confirm()` — either satisfies CLAUDE.md §5).
   - Fast add: an inline "+ Add item" row at the bottom of every category
     section — tap, type a name, Enter → item created in that category with
     `onHand: true`, `role: "rotating"`, input stays focused for the next
     item. Esc/blur cancels an empty input.
   - `src/components/CategoryManager.jsx`: opened from an "Edit categories"
     button on the Pantry screen. List of categories with per-row: rename
     (inline text edit), ↑/↓ reorder buttons, delete (disabled with an item
     count shown when non-empty; confirm when empty). "Add category" input
     at the bottom. All actions go through `pantryOps` then `storage.set`.
   - Filter bar: search input + three toggle chips — Staples, Rotating,
     On hand (Staples/Rotating are mutually exclusive; On hand combines with
     either). Chips ≥44px tall.
   - `src/styles.css`: extend, mobile-first, designed at 390px.
5. **`scripts/smoke-phase1.mjs` (new)** — zero deps, shims localStorage like
   the Phase 0 script. Checks at minimum:
   - Every seed item passes `validate(item, 'PantryItem')`; seed categories
     are unique and non-empty.
   - `renameCategory` moves all matching items; non-matching untouched.
   - `deleteCategory` refuses when occupied, works when empty.
   - `moveCategory` reorders correctly at both boundaries.
   - `filterItems` combinations (search + role + onHand).
   - Migration: a hand-built v1 export (no `categories`, incl. one item in a
     custom category) imports cleanly, lands at `schemaVersion: 2`, and its
     custom category appears in `categories`.
   - v2 export → wipe → import round trip stays deep-equal.
   Run with `node scripts/smoke-phase1.mjs`. Keep `smoke-phase0.mjs` passing
   (update ONLY its schemaVersion expectations if it hardcodes `1`; nothing
   else).
6. Verify the gate (below). Commit at logical checkpoints with clear
   messages and push to `origin main` (remote exists; checkpoint pushes are
   pre-authorized).

## Files to create / modify

```
src/seeds.js                          (new — default categories + ~40 items)
src/pantryOps.js                      (new — pure pantry/category operations)
src/storage.js                        (modify — SCHEMA_VERSION 2, categories,
                                       migrate(), validation, diff summary)
src/screens/PantryScreen.jsx          (replace placeholder — real screen)
src/components/PantryItemRow.jsx      (new)
src/components/PantryItemEditor.jsx   (new)
src/components/CategoryManager.jsx    (new)
src/styles.css                        (extend)
scripts/smoke-phase1.mjs              (new)
scripts/smoke-phase0.mjs              (touch only if it hardcodes version 1)
```

Every file ≤ ~300 lines. No new dependencies.

## Acceptance gate (must show evidence)

1. Create, edit, recategorize, and delete an item; state survives a reload.
   Evidence: manual browser checklist at 390px.
2. Rename a category; its items follow. Evidence: smoke script
   (`renameCategory`) + manual check.
3. Toggling onHand from the list view takes exactly one tap.
   Evidence: manual check.
4. A Phase-0 (`schemaVersion: 1`) export imports cleanly and is auto-migrated
   to v2 with categories populated. Evidence: smoke script + manual paste.
5. `node scripts/smoke-phase1.mjs` and `node scripts/smoke-phase0.mjs` both
   pass. Evidence: script output.

## Out of scope

Library/Plan/Track features, nutrition editing or lookups (PantryItem
`nutrition` stays null-capable but has no UI), barcode scanning, PWA
manifest/service worker, BYOK, drag-and-drop reordering (↑/↓ buttons
suffice). Do not start Phase 2 until the user says this gate passed.

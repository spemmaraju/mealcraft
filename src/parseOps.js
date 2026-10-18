// Free-text parser (Phase 18): one prompt compiler + one reply validator
// behind every "type or dictate it" flow. Phase 18 ships mode 'meal'
// ("Describe what I ate"); Phases 19-21 add 'cook' / 'haul' on the same
// pipeline. Pure — no storage, no DOM — so paste mode and BYOK (byok.js
// parseTextViaApi) share every line of it.
//
// Pipeline: compileParsePrompt -> (AI) -> validateParseReply -> buildDraftRows
// -> user edits in ParseReviewCard -> rowsToLogItems -> onPick.

import { createNutritionInfo } from './schema.js'
import { extractJson } from './aiReplyOps.js'
import { measureToServings, parseMeasure, stripLeadingQty } from './measures.js'

const MAX_ITEMS = 30

function describe(v) {
  if (v === undefined) return 'undefined'
  if (v === null) return 'null'
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

function isPlainObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isNonNegativeNumber(v) {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0
}

const MODE_COPY = {
  meal: {
    intro: 'You are reading a food log entry that was typed or dictated (it may be run-on speech, with filler words). Split it into the individual foods that were eaten.',
    heading: 'What was eaten',
    estimate: 'your best estimate of the macros for the whole amount eaten (not per 100 g)',
    extra: '',
  },
  cook: {
    intro: 'You are reading the ingredient list for a home-cooked dish, typed or dictated (it may be run-on speech, with filler words). Split it into the individual ingredients that go into the pot.',
    heading: 'What goes into the dish',
    estimate: 'your best estimate of the macros for the whole amount of that ingredient used (not per 100 g)',
    extra: '\n- Optional top-level "dishName" (string) if the dish was named, and "servings" (number) if the user said how many servings it makes. Omit them otherwise.',
  },
}

/** Clipboard/BYOK-ready prompt. mode 'meal' (what I ate) or 'cook' (what goes into a dish). */
export function compileParsePrompt({ text, pantry, mode = 'meal' }) {
  const copy = MODE_COPY[mode] || MODE_COPY.meal
  const names = pantry.map((p) => p.name).filter(Boolean)
  const pantryList = names.length > 0 ? names.map((n) => `- ${n}`).join('\n') : '(none)'
  return `${copy.intro}

## ${copy.heading}
${text.trim()}

## The user's pantry (exact names)
${pantryList}

## Rules
- One item per distinct food. Keep the user's own words for the amount in "measure" ("2 rotis", "a bowl", "a handful", "150 g"). If no amount was said, use "1 serving". Never invent precise amounts the user didn't say.
- "pantryMatch": copy a pantry name EXACTLY from the list above only when the food IS that pantry item (e.g. "toor dal" -> "Toor dal (cooked)"). Do not match a dish to one of its ingredients (roti is not "Atta"). Otherwise null.
- "grams": your best estimate of the weight, a positive number.
- "estimate": ${copy.estimate}.${copy.extra}

## Output format
Output ONLY one JSON object — no prose, no markdown fences:
{"items": [{"name": "Roti", "measure": "2 rotis", "grams": 80, "pantryMatch": null, "estimate": {"kcal": 240, "protein_g": 8, "carbs_g": 44, "fat_g": 4}}]}`
}

/**
 * Validates a parse reply (either mode — same item shape). Structural problems are named errors (the
 * caller turns them into a fix request). A pantryMatch that isn't an exact
 * (case-insensitive) pantry name is NOT an error — models paraphrase — it's
 * cleared and remembered as `suggestedMatch` so the review card can say so.
 * @returns {{ok:true, items} | {ok:false, errors, rawText}}
 */
export function validateParseReply(rawText, { pantry }) {
  let parsed
  try {
    parsed = JSON.parse(extractJson(rawText))
  } catch (e) {
    return { ok: false, errors: [`(json): could not parse — ${e.message}`], rawText }
  }
  if (!isPlainObject(parsed)) {
    return { ok: false, errors: [`(root): expected object, got ${describe(parsed)}`], rawText }
  }
  if (!Array.isArray(parsed.items)) {
    return { ok: false, errors: [`items: expected array, got ${describe(parsed.items)}`], rawText }
  }
  if (parsed.items.length === 0 || parsed.items.length > MAX_ITEMS) {
    return { ok: false, errors: [`items: expected 1-${MAX_ITEMS} entries, got ${parsed.items.length}`], rawText }
  }

  const pantryByName = new Map(pantry.map((p) => [p.name.trim().toLowerCase(), p]))
  const errors = []
  const items = []
  parsed.items.forEach((raw, i) => {
    const path = `items[${i}]`
    if (!isPlainObject(raw)) {
      errors.push(`${path}: expected object, got ${describe(raw)}`)
      return
    }
    if (typeof raw.name !== 'string' || !raw.name.trim()) {
      errors.push(`${path}.name: expected non-empty string, got ${describe(raw.name)}`)
      return
    }
    if (typeof raw.measure !== 'string' || !raw.measure.trim()) {
      errors.push(`${path}.measure: expected non-empty string, got ${describe(raw.measure)}`)
      return
    }
    if (raw.grams != null && !(typeof raw.grams === 'number' && raw.grams > 0)) {
      errors.push(`${path}.grams: expected positive number or null, got ${describe(raw.grams)}`)
      return
    }
    if (raw.pantryMatch != null && typeof raw.pantryMatch !== 'string') {
      errors.push(`${path}.pantryMatch: expected string or null, got ${describe(raw.pantryMatch)}`)
      return
    }
    const est = raw.estimate
    const badMacro = isPlainObject(est) ? ['kcal', 'protein_g', 'carbs_g', 'fat_g'].find((k) => !isNonNegativeNumber(est[k])) : null
    if (!isPlainObject(est) || badMacro) {
      const where = badMacro ? `${path}.estimate.${badMacro}` : `${path}.estimate`
      const got = badMacro ? est[badMacro] : est
      errors.push(`${where}: expected ${badMacro ? 'non-negative number' : 'object {kcal, protein_g, carbs_g, fat_g}'}, got ${describe(got)}`)
      return
    }

    const suggested = typeof raw.pantryMatch === 'string' ? raw.pantryMatch.trim() : ''
    const match = suggested ? pantryByName.get(suggested.toLowerCase()) : null
    items.push({
      name: raw.name.trim(),
      measure: raw.measure.trim(),
      grams: raw.grams ?? null,
      pantryId: match ? match.id : null,
      suggestedMatch: suggested && !match ? suggested : null,
      estimate: { kcal: est.kcal, protein_g: est.protein_g, carbs_g: est.carbs_g, fat_g: est.fat_g },
    })
  })

  // Optional cook-mode meta; anything malformed is just ignored (it's a hint).
  if (errors.length > 0) return { ok: false, errors, rawText }
  const dishName = typeof parsed.dishName === 'string' && parsed.dishName.trim() ? parsed.dishName.trim() : null
  const servings = typeof parsed.servings === 'number' && parsed.servings > 0 ? Math.round(parsed.servings) : null
  return { ok: true, items, dishName, servings }
}

/**
 * The AI-estimate snapshot for one parsed item, shaped so the stated
 * measure resolves to exactly the estimated amount — and so an edited
 * measure scales: "3 rotis" against servingDesc "2 rotis (80 g)" -> 1.5x,
 * "100 g" via the gram figure. No grams -> the measure is logged as
 * "1 serving" (path 0 of measureToServings) and described in servingDesc.
 */
export function estimateNutrition(item) {
  const hasGrams = typeof item.grams === 'number' && item.grams > 0
  return createNutritionInfo({
    source: 'ai_estimate',
    servingDesc: hasGrams ? `${item.measure} (${Math.round(item.grams)} g)` : item.measure,
    perServing: { ...item.estimate },
    naturalUnits: hasGrams ? [estimateUnit(item.measure, item.grams)] : [],
  })
}

// The unit MeasureInput will offer for this item. "2 rotis" @ 80 g becomes
// a per-one "rotis" unit @ 40 g, so the logged row reads "3 [rotis]" rather
// than "3 [2 rotis]"; a quantity-less phrase ("a bowl") stays whole.
function estimateUnit(measure, grams) {
  const { qty } = parseMeasure(measure)
  const tail = stripLeadingQty(measure)
  if (qty != null && qty > 0 && tail && tail !== measure) {
    return { label: tail, gramsOrFraction: Math.round((grams / qty) * 10) / 10 }
  }
  return { label: measure, gramsOrFraction: Math.round(grams) }
}

/**
 * One editable review row per parsed item. A pantry match is used only when
 * that pantry item has nutrition AND the stated measure converts against it;
 * otherwise the row falls back to the AI estimate and says why.
 */
export function buildDraftRows(items, pantry) {
  const pantryById = new Map(pantry.map((p) => [p.id, p]))
  return items.map((item, i) => {
    const nutrition = estimateNutrition(item)
    const aiItem = {
      kind: 'adhoc',
      name: item.name,
      measure: measureToServings(item.measure, nutrition) === 1 ? item.measure : '1 serving',
      nutrition,
    }
    const pantryItem = item.pantryId ? pantryById.get(item.pantryId) : null
    let note = null
    let pantryLogItem = null
    if (pantryItem && !pantryItem.nutrition) {
      note = `Matched ${pantryItem.name}, but it has no nutrition yet — using the AI estimate.`
    } else if (pantryItem && measureToServings(item.measure, pantryItem.nutrition) == null) {
      note = `Matched ${pantryItem.name}, but "${item.measure}" doesn't convert to its serving — using the AI estimate.`
    } else if (pantryItem) {
      pantryLogItem = { kind: 'pantry', pantryId: pantryItem.id, measure: item.measure }
    } else if (item.suggestedMatch) {
      note = `"${item.suggestedMatch}" isn't in your pantry — using the AI estimate.`
    }
    return {
      key: `row_${i}`,
      name: item.name,
      pantryName: pantryLogItem ? pantryItem.name : null,
      usePantry: !!pantryLogItem,
      pantryItem: pantryLogItem,
      aiItem,
      note,
    }
  })
}

/** The LogItem a row will log right now (pantry match or AI estimate). */
export function rowLogItem(row) {
  return row.usePantry && row.pantryItem ? row.pantryItem : row.aiItem
}

/** Edits the measure on both candidate items, so toggling the pantry match keeps the edit. Immutable. */
export function setRowMeasure(row, measure) {
  return {
    ...row,
    pantryItem: row.pantryItem ? { ...row.pantryItem, measure } : null,
    aiItem: { ...row.aiItem, measure },
  }
}

/** Final LogEntry items[] for onPick. */
export function rowsToLogItems(rows) {
  return rows.map(rowLogItem)
}

// ---- Mode 'haul' (Phase 20): what I just bought -> pantry restock ----------
// A different reply shape (no macros — nothing is eaten, and no AI-guessed
// nutrition is ever stored on the pantry): name, the amount bought in the
// user's own words (or null), an exact pantry match, and a category from
// the user's own list for new items.

/** Clipboard/BYOK-ready prompt for a shopping haul. */
export function compileHaulPrompt({ text, pantry, categories }) {
  const names = pantry.map((p) => p.name).filter(Boolean)
  const pantryList = names.length > 0 ? names.map((n) => `- ${n}`).join('\n') : '(none)'
  const categoryList = categories.length > 0 ? categories.map((c) => `- ${c}`).join('\n') : '(none)'
  return `You are reading a grocery haul that was typed or dictated (it may be run-on speech, with filler words). List each distinct thing that was bought.

## What was bought
${text.trim()}

## The user's pantry (exact names)
${pantryList}

## The user's pantry categories (exact names)
${categoryList}

## Rules
- One item per distinct product.
- "measure": the amount bought in the user's own words ("10 carrots", "5 kg", "2 blocks", "a bag"), or null if no amount was said. Never invent an amount.
- "pantryMatch": copy a pantry name EXACTLY from the list above when the product IS that pantry item, otherwise null.
- "category": for items with no pantry match, copy the best-fitting category EXACTLY from the category list; otherwise null.

## Output format
Output ONLY one JSON object — no prose, no markdown fences:
{"items": [{"name": "Carrots", "measure": "10 carrots", "pantryMatch": null, "category": "Vegetables"}]}`
}

/**
 * Validates a haul reply. Invented pantry matches / categories are cleared
 * (not errors), same rule as validateParseReply.
 * @returns {{ok:true, items: {name, measure, pantryId, category}[]} | {ok:false, errors, rawText}}
 */
export function validateHaulReply(rawText, { pantry, categories }) {
  let parsed
  try {
    parsed = JSON.parse(extractJson(rawText))
  } catch (e) {
    return { ok: false, errors: [`(json): could not parse — ${e.message}`], rawText }
  }
  if (!isPlainObject(parsed)) return { ok: false, errors: [`(root): expected object, got ${describe(parsed)}`], rawText }
  if (!Array.isArray(parsed.items)) return { ok: false, errors: [`items: expected array, got ${describe(parsed.items)}`], rawText }
  if (parsed.items.length === 0 || parsed.items.length > MAX_ITEMS) {
    return { ok: false, errors: [`items: expected 1-${MAX_ITEMS} entries, got ${parsed.items.length}`], rawText }
  }
  const pantryByName = new Map(pantry.map((p) => [p.name.trim().toLowerCase(), p]))
  const errors = []
  const items = []
  parsed.items.forEach((raw, i) => {
    const path = `items[${i}]`
    if (!isPlainObject(raw)) return errors.push(`${path}: expected object, got ${describe(raw)}`)
    if (typeof raw.name !== 'string' || !raw.name.trim()) return errors.push(`${path}.name: expected non-empty string, got ${describe(raw.name)}`)
    if (raw.measure != null && typeof raw.measure !== 'string') return errors.push(`${path}.measure: expected string or null, got ${describe(raw.measure)}`)
    const match = typeof raw.pantryMatch === 'string' ? pantryByName.get(raw.pantryMatch.trim().toLowerCase()) : null
    const category = typeof raw.category === 'string' && categories.includes(raw.category.trim()) ? raw.category.trim() : null
    items.push({ name: raw.name.trim(), measure: raw.measure?.trim() || null, pantryId: match ? match.id : null, category })
  })
  if (errors.length > 0) return { ok: false, errors, rawText }
  return { ok: true, items }
}

/**
 * Editable review rows for a haul: restock an existing item, or create one
 * in `category`. When the AI gave no pantry match, an exact (case-
 * insensitive) name match still counts — the same rule stockOps.applyHaul
 * uses on save, so the card never says "new" for something that restocks.
 */
export function buildHaulRows(items, pantry) {
  const pantryById = new Map(pantry.map((p) => [p.id, p]))
  const pantryByName = new Map(pantry.map((p) => [p.name.trim().toLowerCase(), p]))
  return items.map((item, i) => {
    const match = item.pantryId ? pantryById.get(item.pantryId) : pantryByName.get(item.name.trim().toLowerCase()) || null
    return {
      key: `haul_${i}`,
      name: match ? match.name : item.name,
      measure: item.measure || '',
      pantryId: match ? match.id : null,
      category: match ? match.category : item.category || '',
    }
  })
}

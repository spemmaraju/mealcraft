// Compiles clipboard-ready prompts from app state for the paste-mode AI
// flows. Pure — no storage imports, no DOM. Mirrors the module style of
// componentOps.js/pantryOps.js.

import { COMPONENT_TYPES, STATIONS } from './schema.js'

function formatPantryGroup(items) {
  if (items.length === 0) return '(none)'
  return items.map((item) => `- ${item.name}${item.roughQty ? ` (${item.roughQty})` : ''}`).join('\n')
}

function pantrySection(pantry) {
  const onHand = pantry.filter((p) => p.onHand)
  return ['## 1. On-hand pantry', '', formatPantryGroup(onHand)].join('\n')
}

// Shared with componentTaskSection so the example component shape never
// drifts out of sync across the two AI flows that still exist.
function componentExample(typeEnum, stationEnum) {
  return {
    name: '...',
    type: typeEnum,
    ingredients: [{ name: '...', measure: '...' }],
    steps: [],
    shelfLifeDays: 4,
    storage: '...',
    station: stationEnum,
    activeMin: 10,
    passiveMin: 25,
    macrosPerServing: { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  }
}

function proteinBandSection(settings) {
  const { low_g, high_g } = settings.proteinBand
  return ['## Protein band', '', `${low_g}–${high_g} g per serving`].join('\n')
}

function currentComponentSection(component) {
  const { id, rating, archived, macroSource, ...rest } = component
  return ['## Current component', '', '```json', JSON.stringify(rest, null, 2), '```'].join('\n')
}

function componentTaskSection(mode, instruction) {
  const typeEnum = COMPONENT_TYPES.join(' | ')
  const stationEnum = STATIONS.join(' | ')
  const taskLine =
    mode === 'substitute'
      ? 'Propose a REPLACEMENT component for this slot, following the instruction below.'
      : 'Revise this component, following the instruction below.'
  return [
    '## Task',
    '',
    taskLine,
    `Instruction: ${instruction}`,
    '',
    'Output ONLY one JSON object — a single component. No prose, no markdown code fences.',
    `"type" must be one of: ${typeEnum}. "station" must be one of: ${stationEnum}.`,
    '',
    '```json',
    JSON.stringify(componentExample(typeEnum, stationEnum), null, 2),
    '```',
  ].join('\n')
}

/**
 * @param {{component, pantry, settings}} state
 * @param {{mode: 'regenerate'|'substitute', instruction: string}} options
 * @returns {string}
 */
export function compileComponentPrompt({ component, pantry, settings }, { mode, instruction }) {
  return [
    pantrySection(pantry),
    proteinBandSection(settings),
    currentComponentSection(component),
    componentTaskSection(mode, instruction),
  ].join('\n\n')
}

// Phase P2 "What can I make?" — kept deliberately compact (this IS the
// anti-"AI wastage" feature: a small prompt, a small reply, no recipes).
// Grouped by category rather than one bullet per item so a full pantry
// doesn't balloon the prompt.
function pantryByCategorySection(pantry) {
  const onHand = pantry.filter((p) => p.onHand)
  if (onHand.length === 0) return ['## 1. On-hand pantry', '', '(none)'].join('\n')
  const byCategory = new Map()
  for (const item of onHand) {
    const category = item.category || '(uncategorized)'
    if (!byCategory.has(category)) byCategory.set(category, [])
    byCategory.get(category).push(item.name)
  }
  const lines = [...byCategory.entries()].map(([category, names]) => `- ${category}: ${names.join(', ')}`)
  return ['## 1. On-hand pantry', '', ...lines].join('\n')
}

// "Don't suggest these" — never-repeat components only (not the full
// rating history) to keep the prompt small.
function neverRepeatSection(components) {
  const names = components.filter((c) => !c.archived && c.rating === 'never').map((c) => c.name)
  return ['## 2. Avoid', '', `Don't suggest anything close to these (rated never-repeat): ${names.length > 0 ? names.join(', ') : '(none)'}`].join(
    '\n',
  )
}

function ideasTaskSection() {
  return [
    '## 3. Task',
    '',
    "Suggest exactly 12 quick dish IDEAS using mostly what's on hand. No recipes, no steps, no quantities — just ideas.",
    'Each idea needs a "uses" array of 2-4 pantry item names copied VERBATIM from the on-hand list above, and a "line" ' +
      'of one sentence (12 words or fewer). "buy" is 0-2 common main ingredients NOT in the on-hand list — an empty ' +
      'array if the idea needs nothing extra.',
    '',
    'Output ONLY valid JSON — no prose, no markdown code fences, no commentary before or after.',
    '',
    '```json',
    JSON.stringify({ ideas: [{ name: '...', line: '...', uses: ['...', '...'], buy: [] }] }, null, 2),
    '```',
  ].join('\n')
}

/** @param {{pantry, components}} state @returns {string} */
export function compileIdeasPrompt({ pantry, components }) {
  return [pantryByCategorySection(pantry), neverRepeatSection(components), ideasTaskSection()].join('\n\n')
}

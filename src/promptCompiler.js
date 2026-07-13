// Compiles one clipboard-ready prompt from app state for the paste-mode
// Ideator flow (Phase 3). Pure — no storage imports, no DOM. Mirrors the
// module style of componentOps.js/pantryOps.js.

import { COMPONENT_TYPES, STATIONS } from './schema.js'

// Standing generation brief from PROMPT_PACK.md (Phase 3 section), verbatim.
export const GENERATION_BRIEF =
  'Design a component-based meal-prep week (bowl format): bases, protein preps ' +
  '(veg + eggs: tofu/paneer/legumes/eggs), veg preps, 3–4 sauces from DIFFERENT ' +
  'cuisine families, finishers. No two consecutive lunches share a sauce family. ' +
  'Assign durable components to Sunday, fragile ones to the Wednesday refresh ' +
  '(15 min, one fresh sauce + one quick veg). Produce a timed Sunday run sheet ' +
  '(~90 min) that runs Instant Pot, oven, and stovetop in parallel, ordered to ' +
  'maximize passive overlap. Include shelf life, storage notes, and approximate ' +
  'macros per serving for every component. Grocery suggestions = plan minus ' +
  'on-hand, advisory.'

/** @param {Date|string} [from] @returns {string} YYYY-MM-DD of the next Sunday (today if today is Sunday) */
export function nextSundayISO(from) {
  const base = from ? new Date(from) : new Date()
  const day = base.getDay()
  const offset = day === 0 ? 0 : 7 - day
  const next = new Date(base)
  next.setDate(base.getDate() + offset)
  return next.toISOString().slice(0, 10)
}

function formatPantryGroup(items) {
  if (items.length === 0) return '(none)'
  return items.map((item) => `- ${item.name}${item.roughQty ? ` (${item.roughQty})` : ''}`).join('\n')
}

function pantrySection(pantry) {
  const onHand = pantry.filter((p) => p.onHand)
  const staples = onHand.filter((p) => p.role === 'staple')
  const rotating = onHand.filter((p) => p.role === 'rotating')
  return [
    '## 1. On-hand pantry',
    '',
    'Staples:',
    formatPantryGroup(staples),
    '',
    'Rotating:',
    formatPantryGroup(rotating),
  ].join('\n')
}

function constraintsSection(settings, { servings, cookSunday, wedRefresh, notes, weekOf }) {
  const cookEvents = []
  if (cookSunday) cookEvents.push('Sunday cook')
  if (wedRefresh) cookEvents.push('Wednesday refresh')
  const { low_g, high_g } = settings.proteinBand
  return [
    '## 2. Constraints',
    '',
    `- Week of: ${weekOf}`,
    `- Lunch servings Mon–Fri: ${servings}`,
    `- Cook events: ${cookEvents.length > 0 ? cookEvents.join(', ') : '(none)'}`,
    `- Protein band: ${low_g}–${high_g} g per serving`,
    `- Notes: ${notes && notes.trim() ? notes.trim() : '(none)'}`,
  ].join('\n')
}

function feedbackSection(components, feedback) {
  const latest =
    feedback.length === 0
      ? null
      : [...feedback].sort((a, b) => (a.weekOf < b.weekOf ? 1 : a.weekOf > b.weekOf ? -1 : 0))[0]
  const feedbackLines = latest
    ? [
        `Latest feedback (week of ${latest.weekOf}):`,
        `- Repeat-worthy: ${latest.repeatWorthy || '(none)'}`,
        `- Died uneaten: ${latest.diedUneaten || '(none)'}`,
        `- Boredom notes: ${latest.boredomNotes || '(none)'}`,
      ]
    : ['(no feedback yet)']

  const repeatNames = components.filter((c) => !c.archived && c.rating === 'repeat').map((c) => c.name)
  const neverNames = components.filter((c) => !c.archived && c.rating === 'never').map((c) => c.name)

  return [
    '## 3. Recent feedback & ratings',
    '',
    ...feedbackLines,
    '',
    `Repeat-worthy components: ${repeatNames.length > 0 ? repeatNames.join(', ') : '(none)'}`,
    `Never-repeat components: ${neverNames.length > 0 ? neverNames.join(', ') : '(none)'}`,
  ].join('\n')
}

function outputFormatSection() {
  const typeEnum = COMPONENT_TYPES.join(' | ')
  const stationEnum = STATIONS.join(' | ')
  return [
    '## 4. Output format (STRICT)',
    '',
    'Output ONLY valid JSON — no prose, no markdown code fences, no commentary ' +
      'before or after. Reference components by NAME (never id) everywhere below. ' +
      `Component "type" must be one of: ${typeEnum}. Component "station" must be ` +
      `one of: ${stationEnum}. "macrosPerServing" may be null — never fake precision.`,
    '',
    '```json',
    JSON.stringify(
      {
        components: [
          {
            name: '...',
            type: typeEnum,
            cuisineTags: [],
            ingredients: [{ name: '...', measure: '...' }],
            steps: [],
            shelfLifeDays: 4,
            storage: '...',
            station: stationEnum,
            activeMin: 10,
            passiveMin: 25,
            macrosPerServing: { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
          },
        ],
        weekPlan: {
          weekOf: 'YYYY-MM-DD',
          runSheet: [{ t: '0:05', station: stationEnum, action: '...', componentName: '...' }],
          assembly: [{ day: 'Mon', componentNames: [], note: '' }],
          refresh: { day: 'Wed', steps: [], componentNames: [] },
          grocerySuggestions: [{ name: '...', qty: '...' }],
        },
      },
      null,
      2,
    ),
    '```',
  ].join('\n')
}

function briefSection() {
  return ['## 5. Brief', '', GENERATION_BRIEF].join('\n')
}

/**
 * @param {{pantry, components, feedback, settings}} state
 * @param {{servings, cookSunday, wedRefresh, notes, weekOf}} options
 * @returns {string}
 */
export function compileWeekPrompt({ pantry, components, feedback, settings }, options) {
  return [
    pantrySection(pantry),
    constraintsSection(settings, options),
    feedbackSection(components, feedback),
    outputFormatSection(),
    briefSection(),
  ].join('\n\n')
}

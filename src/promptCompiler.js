// Compiles one clipboard-ready prompt from app state for the paste-mode
// Ideator flow (Phase 3). Pure — no storage imports, no DOM. Mirrors the
// module style of componentOps.js/pantryOps.js.

import { COMPONENT_TYPES, STATIONS, DAY_NAMES } from './schema.js'

// Standing generation brief, parameterized by the configured cook/refresh
// days. Rescoped in Phase 10 to a smaller single-station session (no longer
// mirrors the original Phase 3 brief verbatim). refreshName = null means a
// single cook session with no midweek refresh.
export function buildGenerationBrief(cookName, refreshName) {
  const assignment = refreshName
    ? `Assign durable components to ${cookName}, fragile ones to the ${refreshName} refresh ` +
      '(15 min, one fresh sauce + one quick veg). '
    : `Everything is cooked in the single ${cookName} session, so favor components ` +
      'that keep for 5 days. '
  return (
    'Design a small component-based meal-prep session (bowl format): one base, ' +
    'one protein prep (veg + eggs: tofu/paneer/legumes/eggs), one veg prep, one ' +
    'sauce. ' +
    assignment +
    `Cook everything sequentially on a single station (stovetop OR oven, ` +
    `whichever fits) — produce a timed ${cookName} run sheet targeting ~45 ` +
    'minutes total. Include shelf life, storage notes, and approximate macros ' +
    'per serving for every component. Grocery suggestions = plan minus on-hand, ' +
    'advisory.'
  )
}

function scheduleNames(settings) {
  return {
    cookName: DAY_NAMES[settings.cookDay] ?? 'Sunday',
    refreshName: settings.refreshDay ? DAY_NAMES[settings.refreshDay] : null,
  }
}

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
  return ['## 1. On-hand pantry', '', formatPantryGroup(onHand)].join('\n')
}

function constraintsSection(settings, { servings, cook, refresh, notes, weekOf }) {
  const { cookName, refreshName } = scheduleNames(settings)
  const cookEvents = []
  if (cook) cookEvents.push(`${cookName} cook`)
  if (refresh && refreshName) cookEvents.push(`${refreshName} refresh`)
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

function feedbackSection(components) {
  const repeatNames = components.filter((c) => !c.archived && c.rating === 'repeat').map((c) => c.name)
  const neverNames = components.filter((c) => !c.archived && c.rating === 'never').map((c) => c.name)

  return [
    '## 3. Component ratings',
    '',
    `Repeat-worthy components: ${repeatNames.length > 0 ? repeatNames.join(', ') : '(none)'}`,
    `Never-repeat components: ${neverNames.length > 0 ? neverNames.join(', ') : '(none)'}`,
  ].join('\n')
}

// Shared between the week prompt's output-format section and
// compileComponentPrompt so the two example shapes never drift apart.
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

function outputFormatSection(settings, refreshEnabled) {
  const typeEnum = COMPONENT_TYPES.join(' | ')
  const stationEnum = STATIONS.join(' | ')
  const refreshExampleDay = refreshEnabled ? settings.refreshDay : (settings.cookDay ?? 'Wed')
  return [
    '## 4. Output format (STRICT)',
    '',
    'Output ONLY valid JSON — no prose, no markdown code fences, no commentary ' +
      'before or after. Reference components by NAME (never id) everywhere below. ' +
      `Component "type" must be one of: ${typeEnum}. Component "station" must be ` +
      `one of: ${stationEnum}. "macrosPerServing" may be null — never fake precision.` +
      (refreshEnabled ? '' : ' There is no midweek refresh: set refresh.steps and refresh.componentNames to empty arrays.'),
    '',
    '```json',
    JSON.stringify(
      {
        components: [componentExample(typeEnum, stationEnum)],
        weekPlan: {
          weekOf: 'YYYY-MM-DD',
          runSheet: [{ t: '0:05', station: stationEnum, action: '...', componentName: '...' }],
          assembly: [{ day: 'Mon', componentNames: [], note: '' }],
          refresh: { day: refreshExampleDay, steps: [], componentNames: [] },
          grocerySuggestions: [{ name: '...', qty: '...' }],
        },
      },
      null,
      2,
    ),
    '```',
  ].join('\n')
}

function briefSection(settings, refreshEnabled) {
  const { cookName, refreshName } = scheduleNames(settings)
  return ['## 5. Brief', '', buildGenerationBrief(cookName, refreshEnabled ? refreshName : null)].join('\n')
}

/**
 * @param {{pantry, components, feedback, settings}} state
 * @param {{servings, cook, refresh, notes, weekOf}} options
 * @returns {string}
 */
export function compileWeekPrompt({ pantry, components, settings }, options) {
  const refreshEnabled = Boolean(options.refresh && settings.refreshDay)
  return [
    pantrySection(pantry),
    constraintsSection(settings, options),
    feedbackSection(components),
    outputFormatSection(settings, refreshEnabled),
    briefSection(settings, refreshEnabled),
  ].join('\n\n')
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

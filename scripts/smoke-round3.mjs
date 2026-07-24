// Zero-dependency Node smoke test for Round 3 ("repeat shortcuts"): the two
// pure-logic seams behind "Log it again" (trackOps.lastSameMeal,
// trackOps.copyItemsForRelog) and "Save as dish"
// (componentOps.ingredientsFromMeal, componentOps.dishFromMeal). No DOM.
// Run with:
//   node scripts/smoke-round3.mjs

import assert from 'node:assert/strict'
import * as schema from '../src/schema.js'
import * as trackOps from '../src/trackOps.js'
import * as componentOps from '../src/componentOps.js'

let passed = 0
async function check(label, fn) {
  await fn()
  passed++
  console.log(`ok - ${label}`)
}

function logEntry(date, meal, items) {
  return schema.createLogEntry({ date, meal, items })
}

try {
  // ==== trackOps.weekdayName ====

  await check('weekdayName: full weekday name for a known date', () => {
    assert.equal(trackOps.weekdayName('2026-07-21'), 'Tuesday') // matches package.json/CLAUDE.md "today" context date
    assert.equal(trackOps.weekdayName('2026-07-19'), 'Sunday')
  })

  // ==== trackOps.lastSameMeal ====

  await check('lastSameMeal: finds the most recent non-empty same-meal log within 7 days, ignores other meals', () => {
    const logs = [
      logEntry('2026-07-15', 'lunch', [{ kind: 'pantry', pantryId: 'p1', measure: '1 cup' }]), // 7 days back
      logEntry('2026-07-18', 'lunch', [{ kind: 'pantry', pantryId: 'p1', measure: '2 cup' }]), // 4 days back, more recent
      logEntry('2026-07-18', 'dinner', [{ kind: 'pantry', pantryId: 'p2', measure: '1 cup' }]), // different meal
    ]
    const hit = trackOps.lastSameMeal(logs, '2026-07-22', 'lunch')
    assert.equal(hit.log.date, '2026-07-18')
    assert.equal(hit.daysAgo, 4)
  })

  await check('lastSameMeal: null when the only match is more than 7 days back', () => {
    const logs = [logEntry('2026-07-10', 'lunch', [{ kind: 'pantry', pantryId: 'p1', measure: '1 cup' }])]
    assert.equal(trackOps.lastSameMeal(logs, '2026-07-22', 'lunch'), null)
  })

  await check('lastSameMeal: an empty-items log (cleared but not removed) never counts as a match', () => {
    const logs = [logEntry('2026-07-20', 'lunch', [])]
    assert.equal(trackOps.lastSameMeal(logs, '2026-07-22', 'lunch'), null)
  })

  await check('lastSameMeal: today itself (daysAgo 0) and future dates never match', () => {
    const logs = [
      logEntry('2026-07-22', 'lunch', [{ kind: 'pantry', pantryId: 'p1', measure: '1 cup' }]),
      logEntry('2026-07-25', 'lunch', [{ kind: 'pantry', pantryId: 'p1', measure: '1 cup' }]),
    ]
    assert.equal(trackOps.lastSameMeal(logs, '2026-07-22', 'lunch'), null)
  })

  // ==== trackOps.copyItemsForRelog ====

  await check('copyItemsForRelog: keeps component/pantry items whose id still resolves, drops+counts deleted ones', () => {
    const components = [schema.createComponent({ id: 'c1', name: 'Stir Fry' })]
    const pantry = [schema.createPantryItem({ id: 'p1', name: 'Rice' })]
    const source = logEntry('2026-07-18', 'dinner', [
      { kind: 'component', componentId: 'c1', count: 1 },
      { kind: 'component', componentId: 'deleted-comp', count: 1 },
      { kind: 'pantry', pantryId: 'p1', measure: '1 cup' },
      { kind: 'pantry', pantryId: 'deleted-pantry', measure: '1 cup' },
    ])
    const { items, skipped } = trackOps.copyItemsForRelog(source, components, pantry)
    assert.equal(items.length, 2)
    assert.equal(skipped, 2)
    assert.deepEqual(
      items.map((i) => i.kind),
      ['component', 'pantry'],
    )
  })

  await check('copyItemsForRelog: adhoc items are deep-copied (mutating the copy never touches the source)', () => {
    const nutrition = schema.createNutritionInfo({ perServing: { kcal: 100, protein_g: 5, carbs_g: 10, fat_g: 2 } })
    const source = logEntry('2026-07-18', 'snack', [{ kind: 'adhoc', name: 'Trail mix', measure: '1 serving', nutrition }])
    const { items } = trackOps.copyItemsForRelog(source, [], [])
    items[0].nutrition.perServing.kcal = 999
    items[0].measure = '2 servings'
    assert.equal(source.items[0].nutrition.perServing.kcal, 100, 'source nutrition must be untouched')
    assert.equal(source.items[0].measure, '1 serving', 'source measure must be untouched')
    assert.notEqual(items[0].nutrition, source.items[0].nutrition, 'must be a distinct object, not a shared reference')
  })

  await check('copyItemsForRelog: all-deleted-references source yields zero items (caller treats this as a no-op)', () => {
    const source = logEntry('2026-07-18', 'lunch', [{ kind: 'component', componentId: 'gone', count: 1 }])
    const { items, skipped } = trackOps.copyItemsForRelog(source, [], [])
    assert.equal(items.length, 0)
    assert.equal(skipped, 1)
  })

  // ==== componentOps.ingredientsFromMeal ====

  await check('ingredientsFromMeal: component -> name + "N serving(s)", pantry -> name + logged measure, adhoc -> name + measure', () => {
    const components = [schema.createComponent({ id: 'c1', name: 'Quinoa' })]
    const pantry = [schema.createPantryItem({ id: 'p1', name: 'Tofu' })]
    const log = logEntry('2026-07-18', 'dinner', [
      { kind: 'component', componentId: 'c1', count: 1.5 },
      { kind: 'pantry', pantryId: 'p1', measure: '1/2 block' },
      { kind: 'adhoc', name: 'Soy sauce', measure: '1 tbsp', nutrition: schema.createNutritionInfo() },
    ])
    const ingredients = componentOps.ingredientsFromMeal(log, components, pantry)
    assert.deepEqual(ingredients, [
      { name: 'Quinoa', measure: '1.5 servings' },
      { name: 'Tofu', measure: '1/2 block' },
      { name: 'Soy sauce', measure: '1 tbsp' },
    ])
  })

  await check('ingredientsFromMeal: singular "1 serving" for count 1, drops dangling component/pantry refs', () => {
    const log = logEntry('2026-07-18', 'lunch', [
      { kind: 'component', componentId: 'c1', count: 1 },
      { kind: 'component', componentId: 'deleted', count: 1 },
    ])
    const ingredients = componentOps.ingredientsFromMeal(log, [schema.createComponent({ id: 'c1', name: 'Bowl' })], [])
    assert.deepEqual(ingredients, [{ name: 'Bowl', measure: '1 serving' }])
  })

  // ==== componentOps.dishFromMeal ====

  await check('dishFromMeal: sums resolvable itemMacros, type dish, macroSource derived, sensible defaults', () => {
    const components = [
      schema.createComponent({ id: 'c1', name: 'Quinoa', macrosPerServing: { kcal: 200, protein_g: 8, carbs_g: 35, fat_g: 3 } }),
    ]
    const pantry = [
      schema.createPantryItem({
        id: 'p1',
        name: 'Tofu',
        nutrition: schema.createNutritionInfo({
          servingDesc: '1 block (396 g)',
          perServing: { kcal: 300, protein_g: 30, carbs_g: 5, fat_g: 18 },
          naturalUnits: [{ label: '1 block', gramsOrFraction: 1 }],
        }),
      }),
    ]
    const log = logEntry('2026-07-18', 'dinner', [
      { kind: 'component', componentId: 'c1', count: 1 },
      { kind: 'pantry', pantryId: 'p1', measure: '1 block' },
    ])
    const dish = componentOps.dishFromMeal('Quinoa Tofu Bowl', log, components, pantry)
    assert.equal(dish.name, 'Quinoa Tofu Bowl')
    assert.equal(dish.type, 'dish')
    assert.equal(dish.macroSource, 'derived')
    assert.deepEqual(dish.macrosPerServing, { kcal: 500, protein_g: 38, carbs_g: 40, fat_g: 21 })
    assert.equal(dish.shelfLifeDays, 3)
    assert.equal(dish.storage, 'fridge')
    assert.equal(dish.station, 'none')
    assert.deepEqual(dish.steps, [])
    assert.equal(schema.validate(dish, 'Component').length, 0, 'must validate as a real Component')
  })

  await check('dishFromMeal: any unresolvable item -> macrosPerServing null, never a partial/faked number', () => {
    const components = [schema.createComponent({ id: 'c1', name: 'Quinoa', macrosPerServing: { kcal: 200, protein_g: 8, carbs_g: 35, fat_g: 3 } })]
    const log = logEntry('2026-07-18', 'dinner', [
      { kind: 'component', componentId: 'c1', count: 1 },
      { kind: 'adhoc', name: 'Mystery sauce', measure: 'a splash', nutrition: schema.createNutritionInfo() },
    ])
    const dish = componentOps.dishFromMeal('Mystery Bowl', log, components, [])
    assert.equal(dish.macrosPerServing, null)
    assert.equal(dish.macroSource, 'derived')
  })

  console.log(`\n${passed} checks passed.`)
} catch (err) {
  console.error(`\nFAILED after ${passed} checks:`)
  console.error(err)
  process.exit(1)
}

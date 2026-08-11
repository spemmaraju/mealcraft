// Zero-dependency Node smoke test for Round 2 ("open on Track" / Recent-logs
// one-tap re-log): trackOps.canRelogTo, and a full relog+undo round-trip at
// the ops level (copyItemsForRelog -> merge-or-create -> upsertLog, then the
// undo restore back to the exact prior logs[]). No DOM — mirrors
// TrackScreen's handleLogAgain/handleUndoRelog logic directly against
// trackOps so it doesn't need React.
// Run with:
//   node scripts/smoke-lever2.mjs

import assert from 'node:assert/strict'
import * as schema from '../src/schema.js'
import * as trackOps from '../src/trackOps.js'

let passed = 0
async function check(label, fn) {
  await fn()
  passed++
  console.log(`ok - ${label}`)
}

function logEntry(date, meal, items) {
  return schema.createLogEntry({ date, meal, items })
}

// Mirrors TrackScreen.handleLogAgain exactly, but against a plain logs[]
// array instead of storage/state, so the round-trip below is testing the
// same shape of logic the UI runs.
function logAgain(logs, sourceLog, todayISO, components, pantry) {
  const meal = sourceLog.meal
  const priorEntry = trackOps.logFor(logs, todayISO, meal)
  const priorLog = priorEntry ? priorEntry.log : null
  const { items, skipped } = trackOps.copyItemsForRelog(sourceLog, components, pantry)
  if (items.length === 0) return { logs, undo: null }
  const newLog = priorLog ? trackOps.mergeItems(priorLog, items) : schema.createLogEntry({ date: todayISO, meal, items })
  const nextLogs = trackOps.upsertLog(logs, newLog)
  return { logs: nextLogs, undo: { meal, priorLog, count: items.length, skipped } }
}

// Mirrors TrackScreen.handleUndoRelog.
function undoRelog(logs, undo, todayISO) {
  if (undo.priorLog === null) {
    const entry = trackOps.logFor(logs, todayISO, undo.meal)
    if (!entry) return logs
    return trackOps.removeLogAt(logs, entry.index)
  }
  return trackOps.upsertLog(logs, undo.priorLog)
}

try {
  // ==== trackOps.canRelogTo ====

  await check('canRelogTo: true for a past non-empty log', () => {
    const log = logEntry('2026-08-09', 'lunch', [{ kind: 'pantry', pantryId: 'p1', measure: '1 cup' }])
    assert.equal(trackOps.canRelogTo(log, '2026-08-10'), true)
  })

  await check('canRelogTo: false for today\'s own row (would double itself)', () => {
    const log = logEntry('2026-08-10', 'lunch', [{ kind: 'pantry', pantryId: 'p1', measure: '1 cup' }])
    assert.equal(trackOps.canRelogTo(log, '2026-08-10'), false)
  })

  await check('canRelogTo: false for an empty-items log', () => {
    const log = logEntry('2026-08-09', 'lunch', [])
    assert.equal(trackOps.canRelogTo(log, '2026-08-10'), false)
  })

  await check('canRelogTo: null-safe on log/items', () => {
    assert.equal(trackOps.canRelogTo(null, '2026-08-10'), false)
    assert.equal(trackOps.canRelogTo(undefined, '2026-08-10'), false)
    assert.equal(trackOps.canRelogTo({ date: '2026-08-09' }, '2026-08-10'), false)
  })

  // ==== Full relog round-trip: no prior log at (today, meal) ====

  await check('relog round-trip (no prior log): creates a new today log, undo removes it back to the exact prior logs[]', () => {
    const components = [schema.createComponent({ id: 'c1', name: 'Stir Fry' })]
    const pantry = [schema.createPantryItem({ id: 'p1', name: 'Rice' })]
    const source = logEntry('2026-08-05', 'dinner', [
      { kind: 'component', componentId: 'c1', count: 1 },
      { kind: 'pantry', pantryId: 'p1', measure: '1 cup' },
    ])
    const before = [source]

    const { logs: afterLog, undo } = logAgain(before, source, '2026-08-10', components, pantry)
    assert.equal(afterLog.length, 2)
    const todayEntry = trackOps.logFor(afterLog, '2026-08-10', 'dinner')
    assert.ok(todayEntry)
    assert.equal(todayEntry.log.items.length, 2)
    assert.equal(undo.count, 2)
    assert.equal(undo.skipped, 0)
    assert.equal(undo.priorLog, null)

    const restored = undoRelog(afterLog, undo, '2026-08-10')
    assert.deepEqual(restored, before, 'undo must restore the exact prior logs[] (today log removed entirely)')
  })

  // ==== Full relog round-trip: an existing today log gets merged into ====

  await check('relog round-trip (prior log existed): merges into today, undo restores the exact prior today log', () => {
    const components = [schema.createComponent({ id: 'c1', name: 'Stir Fry' })]
    const pantry = [schema.createPantryItem({ id: 'p1', name: 'Rice' })]
    const source = logEntry('2026-08-05', 'lunch', [{ kind: 'pantry', pantryId: 'p1', measure: '1 cup' }])
    const todayPrior = logEntry('2026-08-10', 'lunch', [{ kind: 'component', componentId: 'c1', count: 1 }])
    const before = [source, todayPrior]

    const { logs: afterLog, undo } = logAgain(before, source, '2026-08-10', components, pantry)
    const todayEntry = trackOps.logFor(afterLog, '2026-08-10', 'lunch')
    assert.equal(todayEntry.log.items.length, 2, 'merged onto the existing today log, not replacing it')
    assert.deepEqual(undo.priorLog, todayPrior)

    const restored = undoRelog(afterLog, undo, '2026-08-10')
    assert.deepEqual(restored, before, 'undo must restore the exact prior logs[], including the untouched source row')
  })

  // ==== Skipped-count: a referenced component/pantry id no longer exists ====

  await check('relog: items referencing deleted components/pantry ids are skipped and counted', () => {
    const source = logEntry('2026-08-05', 'snack', [
      { kind: 'component', componentId: 'gone-comp', count: 1 },
      { kind: 'pantry', pantryId: 'gone-pantry', measure: '1 cup' },
    ])
    const { logs: afterLog, undo } = logAgain([source], source, '2026-08-10', [], [])
    // Nothing survives to copy, so the op is a no-op — no new/merged log.
    assert.equal(trackOps.logFor(afterLog, '2026-08-10', 'snack'), null)
    assert.equal(undo, null)
  })

  await check('relog: partial skip — one surviving item still relogs, skipped count reflects the dropped one', () => {
    const components = [schema.createComponent({ id: 'c1', name: 'Stir Fry' })]
    const source = logEntry('2026-08-05', 'breakfast', [
      { kind: 'component', componentId: 'c1', count: 1 },
      { kind: 'component', componentId: 'gone-comp', count: 1 },
    ])
    const { logs: afterLog, undo } = logAgain([source], source, '2026-08-10', components, [])
    const todayEntry = trackOps.logFor(afterLog, '2026-08-10', 'breakfast')
    assert.equal(todayEntry.log.items.length, 1)
    assert.equal(undo.count, 1)
    assert.equal(undo.skipped, 1)
  })
} catch (err) {
  console.error(`FAILED after ${passed} checks`)
  console.error(err)
  process.exit(1)
}

console.log(`\n${passed} checks passed`)

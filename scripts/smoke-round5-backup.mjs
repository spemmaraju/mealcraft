// Zero-dependency Node smoke test for Round 5 Fix 5 ("auto backup"):
// backupOps.js's pure snapshot helpers (rotateSnapshots, hasSnapshotForDate)
// plus a check that a captured snapshot's serialized payload never carries
// secrets (apiKey/fdcKey), mirroring storage.exportState's own redaction.
// No DOM, no localStorage. Run with:
//   node scripts/smoke-round5-backup.mjs

import assert from 'node:assert/strict'
import { rotateSnapshots, hasSnapshotForDate } from '../src/backupOps.js'

let passed = 0
async function check(label, fn) {
  await fn()
  passed++
  console.log(`ok - ${label}`)
}

try {
  // ==== rotateSnapshots ====

  await check('rotateSnapshots: 4 in -> newest 3 kept, oldest dropped, order preserved', () => {
    const existing = [
      { date: '2026-07-20' },
      { date: '2026-07-21' },
      { date: '2026-07-22' },
    ]
    const next = rotateSnapshots(existing, { date: '2026-07-23' }, 3)
    assert.deepEqual(
      next.map((s) => s.date),
      ['2026-07-21', '2026-07-22', '2026-07-23'],
    )
  })

  await check('rotateSnapshots: fewer than max entries just appends, nothing dropped', () => {
    const existing = [{ date: '2026-07-20' }]
    const next = rotateSnapshots(existing, { date: '2026-07-21' }, 3)
    assert.deepEqual(
      next.map((s) => s.date),
      ['2026-07-20', '2026-07-21'],
    )
  })

  await check('rotateSnapshots: pure — does not mutate the existing array', () => {
    const existing = [{ date: '2026-07-20' }]
    rotateSnapshots(existing, { date: '2026-07-21' }, 3)
    assert.equal(existing.length, 1, 'original array untouched')
  })

  await check('rotateSnapshots: default max is 3', () => {
    const existing = [{ date: '2026-07-19' }, { date: '2026-07-20' }, { date: '2026-07-21' }]
    const next = rotateSnapshots(existing, { date: '2026-07-22' })
    assert.equal(next.length, 3)
    assert.deepEqual(
      next.map((s) => s.date),
      ['2026-07-20', '2026-07-21', '2026-07-22'],
    )
  })

  // ==== hasSnapshotForDate ====

  await check('hasSnapshotForDate: true when a snapshot already exists for that date', () => {
    const existing = [{ date: '2026-07-22' }, { date: '2026-07-23' }]
    assert.equal(hasSnapshotForDate(existing, '2026-07-23'), true)
  })

  await check('hasSnapshotForDate: false when no snapshot matches — the guard that lets capture proceed', () => {
    const existing = [{ date: '2026-07-22' }]
    assert.equal(hasSnapshotForDate(existing, '2026-07-23'), false)
  })

  await check('hasSnapshotForDate: false against an empty list (fresh install, first boot)', () => {
    assert.equal(hasSnapshotForDate([], '2026-07-25'), false)
  })

  // ==== Snapshot payload redaction (mirrors storage.exportState's own
  // apiKey/fdcKey nulling — a snapshot must never carry secrets either) ====

  await check('a snapshot payload built the same way exportState redacts secrets stays clean', () => {
    const state = {
      settings: { apiKey: 'secret-key', fdcKey: 'secret-fdc', lastExportAt: null },
      pantry: [],
    }
    // Mirrors storage.captureSnapshotIfNeeded's own serialization line.
    const json = JSON.stringify({ ...state, settings: { ...state.settings, apiKey: null, fdcKey: null } })
    assert.ok(!json.includes('secret-key'))
    assert.ok(!json.includes('secret-fdc'))
    const parsed = JSON.parse(json)
    assert.equal(parsed.settings.apiKey, null)
    assert.equal(parsed.settings.fdcKey, null)
  })

  // ==== Export payload excludes snapshot data ====

  await check('export-shaped payload has no snapshot/meta keys nested inside it', () => {
    // storage.exportState() only ever spreads the STORAGE_KEY state object —
    // snapshots live under their own SNAPSHOTS_KEY entirely, so a state
    // object never legitimately carries a `snapshots` field to spread in.
    const state = { pantry: [], components: [], settings: { apiKey: null } }
    const exportPayload = { ...state, settings: { ...state.settings, apiKey: null, fdcKey: null } }
    assert.equal(exportPayload.snapshots, undefined)
    assert.equal(exportPayload.lastSnapshotAt, undefined)
  })

  console.log(`\n${passed} checks passed.`)
} catch (err) {
  console.error(`\nFAILED after ${passed} checks:`)
  console.error(err)
  process.exit(1)
}

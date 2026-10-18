// Zero-dependency Node smoke test for Phase 17 (housekeeping): calendar
// dates are the user's LOCAL day everywhere — the daily snapshot and the
// export filename used the UTC day, which is "tomorrow" every evening in the
// Americas. Pins TZ to Los Angeles and freezes the clock at 11:30pm local.
// Run with:
//   node scripts/smoke-phase17.mjs

process.env.TZ = 'America/Los_Angeles'

import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { todayISO } from '../src/dates.js'
import * as trackOps from '../src/trackOps.js'
import * as storage from '../src/storage.js'

class MemoryStorage {
  constructor() {
    this.store = new Map()
  }
  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null
  }
  setItem(key, value) {
    this.store.set(key, String(value))
  }
  removeItem(key) {
    this.store.delete(key)
  }
  clear() {
    this.store.clear()
  }
}

globalThis.localStorage = new MemoryStorage()

let passed = 0
async function check(label, fn) {
  await fn()
  passed++
  console.log(`ok - ${label}`)
}

// 2026-03-10 23:30 in Los Angeles is already 2026-03-11 in UTC.
const LATE_EVENING = new Date(2026, 2, 10, 23, 30)

function withFrozenClock(fixed, fn) {
  const RealDate = Date
  globalThis.Date = class extends RealDate {
    constructor(...args) {
      super(...(args.length ? args : [fixed.getTime()]))
    }
    static now() {
      return fixed.getTime()
    }
  }
  return Promise.resolve(fn()).finally(() => {
    globalThis.Date = RealDate
  })
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })
}

try {
  await check('premise: 11:30pm local in LA is already the next day in UTC', () => {
    assert.equal(LATE_EVENING.toISOString().slice(0, 10), '2026-03-11')
  })

  await check('todayISO: returns the local day at 11:30pm, not the UTC day', () => {
    assert.equal(todayISO(LATE_EVENING), '2026-03-10')
  })

  await check('trackOps.todayISO is the same shared helper (re-export)', () => {
    assert.equal(trackOps.todayISO, todayISO)
  })

  await check('captureSnapshotIfNeeded at 11:30pm local stamps the local date', async () => {
    await storage.resetState()
    await withFrozenClock(LATE_EVENING, () => storage.captureSnapshotIfNeeded())
    const [snapshot] = await storage.listSnapshots()
    assert.ok(snapshot, 'a snapshot was taken')
    assert.equal(snapshot.date, '2026-03-10')
  })

  await check('export filename is built from the shared local-date helper', () => {
    const src = readFileSync(new URL('../src/screens/SettingsScreen.jsx', import.meta.url), 'utf-8')
    assert.ok(src.includes("from '../dates.js'"), 'SettingsScreen imports dates.js')
    assert.ok(src.includes('mealcraft-export-${todayISO()}.json'), 'filename uses todayISO()')
  })

  // Fix the class, not the instance: no UTC-day derivation anywhere in src/.
  await check('no src/ file derives a calendar day from toISOString()', () => {
    const srcDir = fileURLToPath(new URL('../src', import.meta.url))
    const offenders = walk(srcDir)
      .filter((path) => /\.(js|jsx)$/.test(path))
      .filter((path) => /toISOString\(\)\s*\.slice\(\s*0\s*,\s*10\s*\)/.test(readFileSync(path, 'utf-8')))
    assert.deepEqual(offenders, [], 'use todayISO() from src/dates.js instead')
  })

  console.log(`\n${passed} checks passed.`)
} catch (err) {
  console.error(`\nFAILED after ${passed} checks:`)
  console.error(err)
  process.exit(1)
}

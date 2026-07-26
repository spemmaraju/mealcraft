// Pure — no storage imports, no DOM. Mirrors planOps.js/componentOps.js.

const NUDGE_AFTER_DAYS = 14
const MS_PER_DAY = 24 * 60 * 60 * 1000

/** Fresh installs with only pantry seeds are never nagged. */
export function shouldNudgeBackup({ lastExportAt, hasUserData, nowISO }) {
  if (!hasUserData) return false
  if (!lastExportAt) return true
  const elapsedDays = (new Date(nowISO) - new Date(lastExportAt)) / MS_PER_DAY
  return elapsedDays > NUDGE_AFTER_DAYS
}

/** @returns {number|null} whole days since lastExportAt, or null if never exported */
export function daysSinceExport({ lastExportAt, nowISO }) {
  if (!lastExportAt) return null
  return Math.floor((new Date(nowISO) - new Date(lastExportAt)) / MS_PER_DAY)
}

// ---- Daily auto-snapshots (Round 5 Fix 5: auto backup) ----
// A snapshot is a safety net against a bad write or corruption bug — NOT a
// replacement for the user's real export (that's still Export/BackupNudge).
// storage.js owns the localStorage key and snapshot record shape; these two
// functions only see plain data so they can be smoke-tested without a DOM.

/** True if `existing` already holds a snapshot dated `todayISODate` ('YYYY-MM-DD') —
 * the guard against capturing a second snapshot on a repeat visit the same day. */
export function hasSnapshotForDate(existing, todayISODate) {
  return existing.some((s) => s.date === todayISODate)
}

/** Appends `newSnapshot` and drops the oldest entries beyond `max`, keeping
 * the relative order of everything retained. Pure — shape-agnostic about
 * what a snapshot record actually contains. */
export function rotateSnapshots(existing, newSnapshot, max = 3) {
  const next = [...existing, newSnapshot]
  return next.length > max ? next.slice(next.length - max) : next
}

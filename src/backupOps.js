// Pure — no storage imports, no DOM. Mirrors weekOps.js/componentOps.js.

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

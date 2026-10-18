// Shared local-date helpers (Phase 17). Calendar dates are always the
// user's LOCAL day — slicing the date off toISOString() gives the UTC day,
// which rolls over to "tomorrow" every evening west of Greenwich. Pure, no
// imports, so storage.js and trackOps.js can both depend on it.

/** @param {Date} [now] @returns {string} local YYYY-MM-DD (never UTC — evening logging must land on today) */
export function todayISO(now = new Date()) {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** @param {string} dateISO YYYY-MM-DD @param {number} days @returns {string} YYYY-MM-DD, pure calendar math (no timezone shift) */
export function addDaysISO(dateISO, days) {
  const [y, m, d] = dateISO.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}

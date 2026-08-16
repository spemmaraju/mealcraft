// Round 6: debounced online food search embedded directly in AddLogItemSheet's
// single search box — no more separate "Search online" step/tab. Split out
// of the component (mirrors addSheetOps.js/logSearchOps.js) so
// AddLogItemSheet stays under CLAUDE.md §4.7's ~300-line budget.
//
// Fires only while the user is actively typing a food search (query >= 3
// chars, 700ms idle) — still "user-triggered" in CLAUDE.md §2's sense, not a
// background poll — and hits only the already-allowlisted Open Food Facts /
// USDA FDC endpoints via nutritionLookup.searchFoods. Never fires for an
// empty box (including on mount). Guards against a slow/superseded response
// landing after a newer one the same way FoodSearchSheet's own handleSearch
// does (a claimed sequence number, checked before writing state) — but
// claimed synchronously whenever the query changes, not just when a fetch
// actually starts, so a fetch already in flight is invalidated the instant
// the user keeps typing, not just when the next fetch's timer fires.
// Results are cached per normalized (trimmed, lowercased) query string in a
// Map for the sheet's lifetime, so backspacing back to an earlier query (or
// retyping it) doesn't refetch.

import { useEffect, useRef, useState } from 'react'
import { searchFoods } from './nutritionLookup.js'

const MIN_QUERY_LEN = 3
const DEBOUNCE_MS = 700

/**
 * @param {string} query
 * @param {{fdcKey: string|null}} opts
 * @returns {{status: 'idle'|'searching'|'ok'|'error', results: object[], errorReason: string|null}}
 */
export function useOnlineFoodSearch(query, { fdcKey } = {}) {
  const [status, setStatus] = useState('idle')
  const [results, setResults] = useState([])
  const [errorReason, setErrorReason] = useState(null)
  const cacheRef = useRef(new Map())
  const seqRef = useRef(0)
  const timerRef = useRef(null)

  useEffect(() => {
    clearTimeout(timerRef.current)
    // Claimed NOW, not when a fetch starts — invalidates any earlier
    // in-flight fetch as soon as the query changes, even if that fetch's
    // debounce timer already fired and it's mid-request.
    const mySeq = ++seqRef.current
    const trimmed = query.trim()
    const key = trimmed.toLowerCase()

    function apply(result) {
      if (result.ok) {
        setStatus('ok')
        setResults(result.results)
        setErrorReason(null)
      } else {
        setStatus('error')
        setResults([])
        setErrorReason(result.reason || 'unreachable')
      }
    }

    if (trimmed.length < MIN_QUERY_LEN) {
      setStatus('idle')
      setResults([])
      setErrorReason(null)
      return
    }

    const cached = cacheRef.current.get(key)
    if (cached) {
      apply(cached)
      return
    }

    timerRef.current = setTimeout(async () => {
      setStatus('searching')
      const result = await searchFoods(trimmed, { fdcKey })
      if (mySeq !== seqRef.current) return // superseded by a newer query — drop this response
      cacheRef.current.set(key, result)
      apply(result)
    }, DEBOUNCE_MS)

    return () => clearTimeout(timerRef.current)
  }, [query, fdcKey])

  return { status, results, errorReason }
}

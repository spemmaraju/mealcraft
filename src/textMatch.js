// Pure helper for bolding the matched substring in a search result name
// (Round 2.6 add-sheet spec: "bold the matched substring in result names").
// Case-insensitive, first-occurrence only — mirrors logSearchOps.matchesQuery's
// plain-substring semantics rather than reimplementing fuzzy matching.

/** @returns {{text:string, match:boolean}[]} non-empty segments of `text` split around the first case-insensitive hit of `query`. */
export function splitMatch(text, query) {
  const source = text || ''
  const needle = (query || '').trim()
  if (!needle) return [{ text: source, match: false }]
  const idx = source.toLowerCase().indexOf(needle.toLowerCase())
  if (idx === -1) return [{ text: source, match: false }]
  return [
    { text: source.slice(0, idx), match: false },
    { text: source.slice(idx, idx + needle.length), match: true },
    { text: source.slice(idx + needle.length), match: false },
  ].filter((seg) => seg.text.length > 0)
}

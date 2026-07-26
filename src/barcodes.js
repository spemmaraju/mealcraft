// Pure barcode helpers. No DOM, no fetch — nutritionLookup.js and
// pantryOps.js both need to compare/expand barcodes across the 12-vs-13-
// digit UPC-A/EAN-13 zero-padding gap different sources store them at
// (Open Food Facts, USDA FDC, and whatever a scanner or a user typed in
// each return), and this is the one place that logic lives.

/**
 * The candidate codes worth trying for a lookup, in priority order: the
 * trimmed input first, then its 12<->13-digit zero-padded counterpart
 * (UPC-A <-> EAN-13 are the same number modulo a leading zero). Anything
 * that isn't all-digits (or is some other digit length, e.g. 8-digit EAN-8)
 * passes through unchanged — there's no padding convention to expand.
 * @returns {string[]} deduped, order preserved
 */
export function barcodeCandidates(code) {
  const trimmed = (code ?? '').toString().trim()
  const candidates = [trimmed]
  if (/^\d{12}$/.test(trimmed)) {
    candidates.push(`0${trimmed}`)
  } else if (/^\d{13}$/.test(trimmed) && trimmed.startsWith('0')) {
    candidates.push(trimmed.slice(1))
  }
  return [...new Set(candidates)]
}

/**
 * True when `a` and `b` are digit strings that denote the same GTIN once
 * leading zeros are stripped — the general form of the 12/13/14-digit
 * padding gap barcodeCandidates targets. Non-string or empty input is
 * never equal to anything (including itself), since there's nothing to
 * compare.
 */
export function gtinEquals(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  if (!/^\d+$/.test(a) || !/^\d+$/.test(b)) return false
  const strip = (s) => s.replace(/^0+/, '')
  const sa = strip(a)
  const sb = strip(b)
  if (!sa || !sb) return false
  return sa === sb
}

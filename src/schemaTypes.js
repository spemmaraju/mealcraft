// Declarative validation engine used by schema.js (extracted Phase 15 so
// schema.js stays under the ~300-line guideline as LogEntry grows a
// discriminated union). Each field spec is a checker function
// (value, path, errors) => void. T.* build checkers; T.obj/T.discriminated
// compose them into a shape checker.

export function describe(v) {
  if (v === undefined) return 'undefined'
  if (v === null) return 'null'
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

export function isPlainObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export const T = {
  str:
    (opts = {}) =>
    (v, path, errors) => {
      if (v === null && opts.nullable) return
      if (typeof v !== 'string') errors.push(`${path}: expected string${opts.nullable ? ' | null' : ''}, got ${describe(v)}`)
    },
  num:
    (opts = {}) =>
    (v, path, errors) => {
      if (v === null && opts.nullable) return
      if (typeof v !== 'number' || Number.isNaN(v))
        errors.push(`${path}: expected number${opts.nullable ? ' | null' : ''}, got ${describe(v)}`)
    },
  bool: () => (v, path, errors) => {
    if (typeof v !== 'boolean') errors.push(`${path}: expected boolean, got ${describe(v)}`)
  },
  enumOf:
    (values, opts = {}) =>
    (v, path, errors) => {
      if (v === null && opts.nullable) return
      if (!values.includes(v))
        errors.push(`${path}: expected ${values.map((x) => `"${x}"`).join(' | ')}, got ${describe(v)}`)
    },
  optional: (checker) => (v, path, errors) => {
    if (v !== undefined) checker(v, path, errors)
  },
  strArray: () => (v, path, errors) => T.arrayOf(T.str())(v, path, errors),
  arrayOf: (itemChecker) => (v, path, errors) => {
    if (!Array.isArray(v)) {
      errors.push(`${path}: expected array, got ${describe(v)}`)
      return
    }
    v.forEach((item, i) => itemChecker(item, `${path}[${i}]`, errors))
  },
  obj:
    (fields, opts = {}) =>
    (v, path, errors) => {
      if (v === null && opts.nullable) return
      if (!isPlainObject(v)) {
        errors.push(`${path || '(root)'}: expected object${opts.nullable ? ' | null' : ''}, got ${describe(v)}`)
        return
      }
      for (const [key, checker] of Object.entries(fields)) {
        checker(v[key], path ? `${path}.${key}` : key, errors)
      }
    },
  /**
   * A tagged union: `key` (e.g. "kind") selects which field spec in
   * `variants` (e.g. {component: {...}, pantry: {...}}) applies. The
   * discriminant itself doesn't need to be redeclared in each variant's
   * fields — it's validated against Object.keys(variants) here.
   */
  discriminated:
    (key, variants) =>
    (v, path, errors) => {
      if (!isPlainObject(v)) {
        errors.push(`${path || '(root)'}: expected object, got ${describe(v)}`)
        return
      }
      const tag = v[key]
      const fields = variants[tag]
      if (!fields) {
        errors.push(`${path}.${key}: expected ${Object.keys(variants).map((x) => `"${x}"`).join(' | ')}, got ${describe(tag)}`)
        return
      }
      T.obj(fields)(v, path, errors)
    },
}

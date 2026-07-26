// Zero-dependency Node smoke test for Round 5 ("fraction select + loosened
// qty parsing"): measures.js's parseQty/parseMeasure now accept leading-dot
// decimals (".5") and 1-2-digit comma decimals ("1,5") while still rejecting
// a comma-grouped thousands number ("1,000"). No DOM. Run with:
//   node scripts/smoke-round5.mjs

import assert from 'node:assert/strict'
import { parseQty, parseMeasure } from '../src/measures.js'

let passed = 0
async function check(label, fn) {
  await fn()
  passed++
  console.log(`ok - ${label}`)
}

try {
  // ==== parseQty: new decimal forms ====

  await check('parseQty: leading-dot decimal ".5" -> 0.5', () => {
    assert.equal(parseQty('.5'), 0.5)
  })

  await check('parseQty: comma decimal "1,5" -> 1.5', () => {
    assert.equal(parseQty('1,5'), 1.5)
  })

  await check('parseQty: two-digit comma decimal "1,25" -> 1.25', () => {
    assert.equal(parseQty('1,25'), 1.25)
  })

  await check('parseQty: thousands-grouped "1,000" is rejected, not read as 1.0', () => {
    assert.equal(parseQty('1,000'), null)
  })

  await check('parseQty: plain decimal "0.67" still parses', () => {
    assert.ok(Math.abs(parseQty('0.67') - 0.67) < 0.0001)
  })

  // ==== parseQty: regressions ====

  await check('parseQty regression: "1 1/2" -> 1.5', () => {
    assert.equal(parseQty('1 1/2'), 1.5)
  })

  await check('parseQty regression: "½" -> 0.5', () => {
    assert.equal(parseQty('½'), 0.5)
  })

  await check('parseQty regression: "2/3" -> ~0.6667', () => {
    assert.ok(Math.abs(parseQty('2/3') - 2 / 3) < 0.0001)
  })

  await check('parseQty regression: "" -> null', () => {
    assert.equal(parseQty(''), null)
  })

  // ==== parseMeasure: new decimal forms carry through unit-token splitting ====

  await check('parseMeasure: ".5 cup" -> qty 0.5, unit ["cup"]', () => {
    const { qty, unitTokens } = parseMeasure('.5 cup')
    assert.equal(qty, 0.5)
    assert.deepEqual(unitTokens, ['cup'])
  })

  await check('parseMeasure: "1,5 cup" -> qty 1.5, unit ["cup"]', () => {
    const { qty, unitTokens } = parseMeasure('1,5 cup')
    assert.equal(qty, 1.5)
    assert.deepEqual(unitTokens, ['cup'])
  })

  console.log(`\n${passed} checks passed.`)
} catch (err) {
  console.error(`\nFAILED after ${passed} checks:`)
  console.error(err)
  process.exit(1)
}

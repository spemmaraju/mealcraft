// Zero-dependency Node smoke test for Round 5 ("fraction select + loosened
// qty parsing"): measures.js's parseQty/parseMeasure now accept leading-dot
// decimals (".5") and 1-2-digit comma decimals ("1,5") while still rejecting
// a comma-grouped thousands number ("1,000"). No DOM. Run with:
//   node scripts/smoke-round5.mjs

import assert from 'node:assert/strict'
import { parseQty, parseMeasure } from '../src/measures.js'
import { barcodeCandidates, gtinEquals } from '../src/barcodes.js'
import { findByBarcode } from '../src/pantryOps.js'
import { mapOffProduct, composeNameWithBrand } from '../src/nutritionMappers.js'

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

  // ==== Fix 2: barcodes.js (candidates + GTIN equality) ====

  await check('barcodeCandidates: 12-digit input also offers its 13-digit zero-padded form', () => {
    assert.deepEqual(barcodeCandidates('036632071613'), ['036632071613', '0036632071613'])
  })

  await check('barcodeCandidates: 13-digit zero-padded input also offers its stripped 12-digit form', () => {
    assert.ok(barcodeCandidates('0036632071613').includes('036632071613'))
  })

  await check('barcodeCandidates: an 8-digit (EAN-8) code passes through unchanged', () => {
    assert.deepEqual(barcodeCandidates('12345678'), ['12345678'])
  })

  await check('barcodeCandidates: non-digit input passes through as just the trimmed input', () => {
    assert.deepEqual(barcodeCandidates('abc'), ['abc'])
  })

  await check('gtinEquals: 14-vs-11-digit zero-padding difference is still equal', () => {
    assert.equal(gtinEquals('00036632071613', '36632071613'), true)
  })

  await check('gtinEquals: 12-vs-13-digit zero-padding difference is still equal', () => {
    assert.equal(gtinEquals('036632071613', '0036632071613'), true)
  })

  await check('gtinEquals: genuinely different codes are not equal', () => {
    assert.equal(gtinEquals('123', '124'), false)
  })

  // ==== Fix 2: pantryOps.findByBarcode across the same zero-padding gap ====

  await check('findByBarcode: stored 13-digit padded barcode matches a 12-digit query', () => {
    const pantry = [{ id: 'p1', name: 'Tofu', nutrition: { barcode: '0036632071613' } }]
    assert.equal(findByBarcode(pantry, '036632071613')?.id, 'p1')
  })

  await check('findByBarcode: stored 12-digit barcode matches a 13-digit padded query', () => {
    const pantry = [{ id: 'p1', name: 'Tofu', nutrition: { barcode: '036632071613' } }]
    assert.equal(findByBarcode(pantry, '0036632071613')?.id, 'p1')
  })

  // ==== Fix 3: mapOffProduct's servingsPerContainer ====

  await check('mapOffProduct: per-serving branch computes servingsPerContainer from product_quantity/serving_quantity', () => {
    const off = {
      code: '111',
      product: {
        serving_size: '32 g',
        product_quantity: '454',
        serving_quantity: '32',
        nutriments: { 'energy-kcal_serving': 100, proteins_serving: 5, carbohydrates_serving: 10, fat_serving: 2 },
      },
    }
    assert.equal(mapOffProduct(off).servingsPerContainer, 14.2)
  })

  await check('mapOffProduct: per-100g branch divides product_quantity by 100', () => {
    const off = {
      code: '111',
      product: {
        product_quantity: 450,
        nutriments: { 'energy-kcal_100g': 200, proteins_100g: 10, carbohydrates_100g: 20, fat_100g: 5 },
      },
    }
    assert.equal(mapOffProduct(off).servingsPerContainer, 4.5)
  })

  await check('mapOffProduct: missing product_quantity -> servingsPerContainer null', () => {
    const off = {
      code: '111',
      product: {
        serving_quantity: '32',
        nutriments: { 'energy-kcal_serving': 100, proteins_serving: 5, carbohydrates_serving: 10, fat_serving: 2 },
      },
    }
    assert.equal(mapOffProduct(off).servingsPerContainer, null)
  })

  await check('mapOffProduct: mismatched ml-vs-g quantity units -> servingsPerContainer null', () => {
    const off = {
      code: '111',
      product: {
        product_quantity: '454',
        product_quantity_unit: 'ml',
        serving_quantity: '32',
        serving_quantity_unit: 'g',
        nutriments: { 'energy-kcal_serving': 100, proteins_serving: 5, carbohydrates_serving: 10, fat_serving: 2 },
      },
    }
    assert.equal(mapOffProduct(off).servingsPerContainer, null)
  })

  // ==== Fix 3: name composition (product name + first brand) ====

  await check('composeNameWithBrand: appends the first comma-separated brand', () => {
    assert.equal(composeNameWithBrand('Rolled Oats', "Trader Joe's, Some Co-brand"), "Rolled Oats — Trader Joe's")
  })

  await check('composeNameWithBrand: skipped when the name already contains the brand (case-insensitive)', () => {
    assert.equal(composeNameWithBrand("Trader Joe's Rolled Oats", "trader joe's"), "Trader Joe's Rolled Oats")
  })

  await check('composeNameWithBrand: null/blank-safe on both arguments', () => {
    assert.equal(composeNameWithBrand(null, "Trader Joe's"), null)
    assert.equal(composeNameWithBrand('Rolled Oats', null), 'Rolled Oats')
    assert.equal(composeNameWithBrand('Rolled Oats', ''), 'Rolled Oats')
  })

  console.log(`\n${passed} checks passed.`)
} catch (err) {
  console.error(`\nFAILED after ${passed} checks:`)
  console.error(err)
  process.exit(1)
}

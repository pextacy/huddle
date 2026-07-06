/**
 * Platform settlement fee — the revenue model (pure domain). Integer minor units only.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { computeSettlement, platformRevenue, DEFAULT_FEE_BPS } from '../src/domain/fees.js'
import { makeFee, validateEntry } from '../src/domain/entries.js'

test('default fee is 0.50% charged on top of the debt', () => {
  // 100.00 USD₮ debt at 50 bps -> 0.50 fee; creditor still gets the full 100.00.
  const q = computeSettlement(10000, { enabled: true, bps: DEFAULT_FEE_BPS })
  assert.equal(q.amountMinor, 10000)
  assert.equal(q.feeMinor, 50)
  assert.equal(q.totalMinor, 10050)
  assert.equal(q.feeBps, 50)
})

test('fee is zero when the policy is disabled (no treasury configured)', () => {
  const q = computeSettlement(10000, { enabled: false, bps: 50 })
  assert.equal(q.feeMinor, 0)
  assert.equal(q.totalMinor, 10000)
})

test('fee floors (never rounds up) to whole cents', () => {
  // 12.34 * 0.5% = 0.0617 -> floor to 6 cents.
  assert.equal(computeSettlement(1234, { enabled: true, bps: 50 }).feeMinor, 6)
})

test('minMinor enforces a floor, maxMinor enforces a cap', () => {
  // 1.00 at 50 bps = 0 cents, but min is 25 cents.
  assert.equal(computeSettlement(100, { enabled: true, bps: 50, minMinor: 25 }).feeMinor, 25)
  // 1000.00 at 50 bps = 5.00, but max is 2.00.
  assert.equal(computeSettlement(100000, { enabled: true, bps: 50, maxMinor: 200 }).feeMinor, 200)
})

test('fee can never exceed the principal itself', () => {
  assert.equal(computeSettlement(50, { enabled: true, bps: 50, minMinor: 9999 }).feeMinor, 50)
})

test('flat-fee policy (bps 0 + minMinor) still collects the floor when enabled', () => {
  // `enabled` (a treasury is configured) is the on/off switch, not bps — a flat 50c-per-settle
  // policy must still charge, even though the percentage line contributes 0.
  assert.equal(computeSettlement(10000, { enabled: true, bps: 0, minMinor: 50 }).feeMinor, 50)
  // still zero when the whole policy is disabled, regardless of a min floor.
  assert.equal(computeSettlement(10000, { enabled: false, bps: 0, minMinor: 50 }).feeMinor, 0)
})

test('rejects non-positive / non-integer amounts and out-of-range bps', () => {
  assert.throws(() => computeSettlement(0, { enabled: true }))
  assert.throws(() => computeSettlement(-5, { enabled: true }))
  assert.throws(() => computeSettlement(1.5, { enabled: true }))
  assert.throws(() => computeSettlement(100, { enabled: true, bps: 10001 }))
})

test('platformRevenue sums fee entries, idempotent on tx hash', () => {
  const entries = [
    { type: 'expense', amountMinor: 5000 },
    makeFee({ id: 'a', payer: 'me', amountMinor: 50, treasury: '0xdead', txHash: '0x1', ts: 1 }),
    makeFee({ id: 'b', payer: 'me', amountMinor: 25, treasury: '0xdead', txHash: '0x2', ts: 2 }),
    // replicated retry of the first fee — must not be double-counted.
    makeFee({ id: 'c', payer: 'me', amountMinor: 50, treasury: '0xdead', txHash: '0x1', ts: 3 })
  ]
  const rev = platformRevenue(entries)
  assert.equal(rev.feesMinor, 75)
  assert.equal(rev.count, 2)
})

test('fee entry validation rejects malformed fees', () => {
  assert.throws(() => validateEntry({ type: 'fee', id: 'a', payer: 'me', amountMinor: 50, treasury: '0xdead', ts: 1 })) // no txHash
  assert.throws(() => makeFee({ id: 'a', payer: 'me', amountMinor: 0, treasury: '0xdead', txHash: '0x1', ts: 1 })) // zero amount
  assert.throws(() => makeFee({ id: 'a', payer: 'me', amountMinor: 50, txHash: '0x1', ts: 1 })) // no treasury
})

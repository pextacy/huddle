/**
 * Pro subscription — the second revenue stream (pure domain). Time math only; no I/O.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { isProActive, extendPro, MONTH_MS, MAX_MONTHS } from '../src/domain/pro.js'

const NOW = 1_700_000_000_000

test('isProActive is true only while the expiry is in the future', () => {
  assert.equal(isProActive(null, NOW), false)
  assert.equal(isProActive({ until: NOW - 1 }, NOW), false)
  assert.equal(isProActive({ until: NOW + 1 }, NOW), true)
  assert.equal(isProActive({}, NOW), false)
})

test('extendPro starts a fresh subscription from now', () => {
  const p = extendPro(null, 1, NOW, '0xabc', 500)
  assert.equal(p.until, NOW + MONTH_MS)
  assert.equal(p.lastPaidMinor, 500)
  assert.equal(p.subscriptionRevenueMinor, 500)
  assert.equal(p.txHash, '0xabc')
})

test('extending an active subscription stacks from current expiry (no burned time)', () => {
  const first = extendPro(null, 1, NOW, '0x1', 500)
  // Renew 10 days later while still active — new expiry stacks on the old one.
  const renewAt = NOW + 10 * 24 * 60 * 60 * 1000
  const second = extendPro(first, 2, renewAt, '0x2', 1000)
  assert.equal(second.until, first.until + 2 * MONTH_MS)
  assert.equal(second.subscriptionRevenueMinor, 1500) // cumulative revenue across payments
})

test('extending a lapsed subscription restarts from now (no retroactive credit)', () => {
  const first = extendPro(null, 1, NOW, '0x1', 500)
  const lapsedAt = first.until + MONTH_MS // a month after it expired
  const second = extendPro(first, 1, lapsedAt, '0x2', 500)
  assert.equal(second.until, lapsedAt + MONTH_MS)
})

test('extendPro rejects bad months and non-positive price', () => {
  assert.throws(() => extendPro(null, 0, NOW, '0x', 500))
  assert.throws(() => extendPro(null, MAX_MONTHS + 1, NOW, '0x', 500))
  assert.throws(() => extendPro(null, 1.5, NOW, '0x', 500))
  assert.throws(() => extendPro(null, 1, NOW, '0x', 0))
})

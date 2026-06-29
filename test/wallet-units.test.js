/**
 * Money conversion at the WDK boundary — pure, integer-only (docs/claude.md money rules).
 * No network. Verifies ledger minor units (cents) <-> USD₮ base units (6 decimals).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  MINOR_TO_BASE,
  toUsdtBaseUnits,
  fromUsdtBaseUnits,
  parseUsdtToMinor,
  formatMinor,
  formatUsdt
} from '../src/wallet/units.js'

test('minor->base multiplier is 10^(6-2) = 10000', () => {
  assert.equal(MINOR_TO_BASE, 10000n)
})

test('toUsdtBaseUnits: 50.00 USD (5000 cents) -> 50_000000 base units', () => {
  assert.equal(toUsdtBaseUnits(5000), 50000000n)
  assert.equal(toUsdtBaseUnits(1), 10000n) // 1 cent -> 0.01 USD₮
  assert.equal(toUsdtBaseUnits(0), 0n)
})

test('fromUsdtBaseUnits splits whole cents from sub-cent dust', () => {
  assert.deepEqual(fromUsdtBaseUnits(50000000n), { minorUnits: 5000n, remainderBase: 0n })
  // 0.011234 USD₮ -> 1 cent + 1234 base-unit dust
  assert.deepEqual(fromUsdtBaseUnits(11234n), { minorUnits: 1n, remainderBase: 1234n })
})

test('round-trip: minor -> base -> minor is lossless for whole cents', () => {
  for (const m of [0, 1, 99, 5000, 123456]) {
    const { minorUnits, remainderBase } = fromUsdtBaseUnits(toUsdtBaseUnits(m))
    assert.equal(minorUnits, BigInt(m))
    assert.equal(remainderBase, 0n)
  }
})

test('parseUsdtToMinor parses decimal strings without floats', () => {
  assert.equal(parseUsdtToMinor('50'), 5000n)
  assert.equal(parseUsdtToMinor('50.00'), 5000n)
  assert.equal(parseUsdtToMinor('1.5'), 150n)
  assert.equal(parseUsdtToMinor('0.25'), 25n)
  assert.equal(parseUsdtToMinor('0.01'), 1n)
})

test('parseUsdtToMinor rejects junk and over-precise input', () => {
  assert.throws(() => parseUsdtToMinor('1.234')) // > 2 decimals
  assert.throws(() => parseUsdtToMinor('abc'))
  assert.throws(() => parseUsdtToMinor('-5'))
  assert.throws(() => parseUsdtToMinor(''))
})

test('formatMinor renders cents as 2-decimal strings', () => {
  assert.equal(formatMinor(5000), '50.00')
  assert.equal(formatMinor(1), '0.01')
  assert.equal(formatMinor(0), '0.00')
  assert.equal(formatMinor(-2500), '-25.00')
})

test('formatUsdt renders base units as 6-decimal strings', () => {
  assert.equal(formatUsdt(50000000n), '50.000000')
  assert.equal(formatUsdt(0n), '0.000000')
  assert.equal(formatUsdt(11234n), '0.011234')
})

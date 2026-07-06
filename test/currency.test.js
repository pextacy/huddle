import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { convertMinor, parseRate, formatRate, isCurrency, RATE_SCALE } from '../src/domain/currency.js'
import { makeExpense, validateEntry } from '../src/domain/entries.js'
import { computeBalances } from '../src/domain/balances.js'
import { createBridge } from '../server/bridge.mjs'

test('RATE_SCALE is 1e6 micros', () => {
  assert.equal(RATE_SCALE, 1000000n)
})

test('convertMinor: exact integer conversion with round-half-up', () => {
  // 45.00 EUR at 1.083500 -> 48.7575 -> rounds to 4876 cents.
  assert.equal(convertMinor(4500, 1083500), 4876)
  // 1.00 at rate 1.0 -> unchanged
  assert.equal(convertMinor(100, 1000000), 100)
  // round-half-up boundary: 1 cent at rate 1.5 -> 1.5 -> 2
  assert.equal(convertMinor(1, 1500000), 2)
})

test('convertMinor rejects bad inputs', () => {
  assert.throws(() => convertMinor(-1, 1000000), /originMinor/)
  assert.throws(() => convertMinor(100, 0), /rateMicros/)
})

test('parseRate/formatRate round-trip without floats', () => {
  assert.equal(parseRate('1.0835'), 1083500)
  assert.equal(parseRate('1'), 1000000)
  assert.equal(formatRate(1083500), '1.0835')
  assert.equal(formatRate(1000000), '1')
  assert.throws(() => parseRate('1.2345678'), /Bad rate/)
  assert.throws(() => parseRate('abc'), /Bad rate/)
})

test('isCurrency knows supported codes', () => {
  assert.ok(isCurrency('EUR'))
  assert.ok(!isCurrency('XYZ'))
})

test('a foreign expense validates only when amountMinor equals the conversion', () => {
  // 45.00 EUR @ 1.0835 -> 4876 base cents
  const ok = makeExpense({ id: 'x1', payer: 'ada', amountMinor: 4876, participants: ['ada', 'bob'], origCurrency: 'EUR', origAmountMinor: 4500, rate: 1083500, ts: 1 })
  assert.equal(ok.amountMinor, 4876)
  // wrong base amount is rejected
  assert.throws(() => makeExpense({ id: 'x2', payer: 'ada', amountMinor: 4500, participants: ['ada', 'bob'], origCurrency: 'EUR', origAmountMinor: 4500, rate: 1083500, ts: 1 }), /converted origin amount/)
  // partial trio is rejected
  assert.throws(() => validateEntry({ type: 'expense', id: 'x3', payer: 'ada', amountMinor: 100, currency: 'USD', participants: ['ada', 'bob'], split: 'equal', origCurrency: 'EUR', ts: 1 }), /origAmountMinor/)
})

test('bridge: a EUR expense converts to USD base and splits in USD', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sk-bridge-fx-'))
  const bridge = createBridge({ baseDir: dir, enableSwarm: false, enableWallet: false })
  try {
    const created = await bridge.createGroup({ name: 'Trip', member: 'Me' })
    const me = created.me.memberId
    // 45.00 EUR @ 1.0835 -> 48.76 USD, split equally with bob -> bob owes 24.38.
    const state = await bridge.addExpense({ payer: me, description: 'Dinner', participants: [me, 'bob'], origCurrency: 'EUR', origAmountMinor: 4500, rate: 1083500 })
    const exp = state.entries.find((e) => e.type === 'expense')
    assert.equal(exp.amountMinor, 4876, 'converted to base USD cents')
    assert.equal(exp.origCurrency, 'EUR')
    assert.equal(exp.origAmountMinor, 4500)
    assert.equal(exp.rate, 1083500)
    assert.equal(state.balances[me], 2438)
    assert.equal(state.balances.bob, -2438)
    // balances stay in USD base — verify the pure fold agrees
    assert.deepEqual(computeBalances(state.entries), state.balances)
  } finally {
    await bridge.teardown()
    rmSync(dir, { recursive: true, force: true })
  }
})

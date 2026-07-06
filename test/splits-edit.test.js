/**
 * Competitor-parity domain features: weighted splits (percent/shares), edit/delete via void
 * entries, and off-chain "cash" settlements. Pure domain — no I/O, integer minor units only.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { weightedShares, splitShares, computeBalances, voidedIds } from '../src/domain/balances.js'
import { groupInsights } from '../src/domain/insights.js'
import { makeExpense, makeVoid, makeCashPayment, makePayment, validateEntry } from '../src/domain/entries.js'

test('weightedShares: percentages distribute exactly', () => {
  const out = weightedShares(10000, ['a', 'b'], { a: 60, b: 40 })
  assert.deepEqual(out, { a: 6000, b: 4000 })
  assert.equal(out.a + out.b, 10000)
})

test('weightedShares: shares split leftover cent by largest remainder', () => {
  // 2:1 of 100.00 -> 66.67 / 33.33, exact to the cent.
  const out = weightedShares(10000, ['a', 'b'], { a: 2, b: 1 })
  assert.deepEqual(out, { a: 6667, b: 3333 })
  assert.equal(out.a + out.b, 10000)
})

test('weightedShares: three-way thirds sum exactly with deterministic leftover', () => {
  const out = weightedShares(10000, ['a', 'b', 'c'], { a: 1, b: 1, c: 1 })
  assert.equal(out.a + out.b + out.c, 10000)
  // 3334/3333/3333 — the leftover cent goes to the first in participant order.
  assert.deepEqual(out, { a: 3334, b: 3333, c: 3333 })
})

test('makeExpense accepts a percent split and validates the weights sum to 100', () => {
  const e = makeExpense({ id: 'e1', payer: 'a', amountMinor: 10000, participants: ['a', 'b'], split: { kind: 'percent', weights: { a: 70, b: 30 } }, ts: 1 })
  assert.deepEqual(splitShares(e), { a: 7000, b: 3000 })
  assert.throws(() => makeExpense({ id: 'e2', payer: 'a', amountMinor: 10000, participants: ['a', 'b'], split: { kind: 'percent', weights: { a: 70, b: 40 } }, ts: 1 }), /sum to 100/)
})

test('makeExpense rejects an unknown split kind and non-participant weights', () => {
  assert.throws(() => makeExpense({ id: 'e', payer: 'a', amountMinor: 100, participants: ['a'], split: { kind: 'ratio', weights: { a: 1 } }, ts: 1 }), /split.kind/)
  assert.throws(() => makeExpense({ id: 'e', payer: 'a', amountMinor: 100, participants: ['a'], split: { kind: 'shares', weights: { a: 1, z: 1 } }, ts: 1 }), /not a participant|cover exactly/)
})

test('computeBalances reflects a shares split', () => {
  const e = makeExpense({ id: 'e1', payer: 'a', amountMinor: 9000, participants: ['a', 'b', 'c'], split: { kind: 'shares', weights: { a: 1, b: 1, c: 1 } }, ts: 1 })
  const net = computeBalances([e])
  // a fronted 9000, owes 3000 -> +6000; b, c each owe 3000.
  assert.equal(net.a, 6000)
  assert.equal(net.b, -3000)
  assert.equal(net.c, -3000)
  assert.equal(net.a + net.b + net.c, 0)
})

test('a void entry deletes an expense from balances and insights', () => {
  const e = makeExpense({ id: 'exp1', payer: 'a', amountMinor: 6000, participants: ['a', 'b'], split: 'equal', category: 'food', ts: 1 })
  const v = makeVoid({ id: 'v1', target: 'exp1', by: 'a', ts: 2 })
  assert.deepEqual([...voidedIds([e, v])], ['exp1'])
  const net = computeBalances([e, v])
  assert.deepEqual(net, {}) // fully reversed -> no balances
  const ins = groupInsights([e, v])
  assert.equal(ins.totalSpentMinor, 0)
  assert.equal(ins.expenseCount, 0)
})

test('editing = void the old expense + add a corrected one', () => {
  const old = makeExpense({ id: 'exp1', payer: 'a', amountMinor: 10000, participants: ['a', 'b'], ts: 1 })
  const v = makeVoid({ id: 'v1', target: 'exp1', by: 'a', ts: 2 })
  const fixed = makeExpense({ id: 'exp2', payer: 'a', amountMinor: 4000, participants: ['a', 'b'], ts: 3 })
  const net = computeBalances([old, v, fixed])
  // only the corrected 40.00 counts: a fronted, owes 2000 -> +2000; b owes 2000.
  assert.equal(net.a, 2000)
  assert.equal(net.b, -2000)
})

test('an off-chain cash payment clears debt without a tx hash', () => {
  const e = makeExpense({ id: 'e1', payer: 'a', amountMinor: 5000, participants: ['a', 'b'], ts: 1 })
  const cash = makeCashPayment({ id: 'p1', from: 'b', to: 'a', amountMinor: 2500, note: 'paid in cash', ts: 2 })
  assert.equal(cash.method, 'cash')
  assert.equal(cash.txHash, undefined)
  const net = computeBalances([e, cash])
  assert.equal(net.a, 0) // b repaid their 2500 share
  assert.equal(net.b, 0)
})

test('cash payments dedup on entry id; on-chain still dedup on tx hash', () => {
  const e = makeExpense({ id: 'e1', payer: 'a', amountMinor: 6000, participants: ['a', 'b'], ts: 1 })
  const cash = makeCashPayment({ id: 'p1', from: 'b', to: 'a', amountMinor: 1000, ts: 2 })
  // The same replicated cash entry (same id) must not be counted twice.
  assert.equal(computeBalances([e, cash, cash]).b, -2000) // 3000 owed - 1000 repaid once
  const onchain = makePayment({ id: 'p2', from: 'b', to: 'a', amountMinor: 1000, txHash: '0xabc', ts: 3 })
  assert.equal(computeBalances([e, onchain, onchain]).b, -2000) // tx-hash dedup
})

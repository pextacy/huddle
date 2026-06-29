/**
 * Domain logic — pure, deterministic, integer-money (docs/claude.md). No I/O.
 * Worked examples for splitting, balances, idempotent settlement, and the minimal-transfer plan.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { splitShares, computeBalances } from '../src/domain/balances.js'
import { settlementPlan } from '../src/domain/settlement.js'
import { validateEntry, makeExpense, makePayment } from '../src/domain/entries.js'

const expense = (id, payer, amountMinor, participants, split = 'equal', ts = 1) =>
  makeExpense({ id, payer, amountMinor, participants, split, ts })
const payment = (id, from, to, amountMinor, txHash, ts = 1) =>
  makePayment({ id, from, to, amountMinor, txHash, ts })

// ── splitShares ────────────────────────────────────────────────────────────
test('equal split distributes the remainder deterministically and sums exactly', () => {
  const e = expense('e1', 'a', 1000, ['a', 'b', 'c']) // 1000 / 3
  const shares = splitShares(e)
  assert.deepEqual(shares, { a: 334, b: 333, c: 333 }) // remainder 1 -> first participant
  assert.equal(shares.a + shares.b + shares.c, 1000)
})

test('equal split with no remainder', () => {
  assert.deepEqual(splitShares(expense('e', 'a', 900, ['a', 'b', 'c'])), { a: 300, b: 300, c: 300 })
})

test('custom split returns the explicit shares', () => {
  const e = expense('e', 'a', 5000, ['a', 'b'], { a: 2000, b: 3000 })
  assert.deepEqual(splitShares(e), { a: 2000, b: 3000 })
})

// ── computeBalances ──────────────────────────────────────────────────────────
test('single expense: payer is owed the others\' shares', () => {
  const net = computeBalances([expense('e1', 'A', 3000, ['A', 'B', 'C'])])
  assert.deepEqual(net, { A: 2000, B: -1000, C: -1000 })
  assert.equal(sum(net), 0)
})

test('a payment moves balance from debtor toward zero', () => {
  const net = computeBalances([
    expense('e1', 'A', 3000, ['A', 'B', 'C']), // B owes 1000
    payment('p1', 'B', 'A', 1000, '0xabc') // B pays A 1000
  ])
  assert.equal(net.B, 0) // B's debt cleared
  assert.equal(net.A, 1000) // A still owed 1000 (by C)
  assert.equal(net.C, -1000)
  assert.equal(sum(net), 0)
})

test('payments are idempotent on tx hash (no double counting)', () => {
  const entries = [
    expense('e1', 'A', 3000, ['A', 'B', 'C']),
    payment('p1', 'B', 'A', 1000, '0xdup'),
    payment('p2', 'B', 'A', 1000, '0xdup') // same tx hash, replicated/retried
  ]
  const net = computeBalances(entries)
  assert.equal(net.B, 0) // counted once, not -> +1000
  assert.equal(sum(net), 0)
})

// ── settlementPlan ───────────────────────────────────────────────────────────
test('5-person trip collapses to <= 4 transfers and clears everyone', () => {
  const entries = [
    expense('e1', 'A', 5000, ['A', 'B', 'C', 'D', 'E']), // tickets
    expense('e2', 'B', 2500, ['A', 'B', 'C', 'D', 'E']) // food
  ]
  const net = computeBalances(entries)
  assert.deepEqual(net, { A: 3500, B: 1000, C: -1500, D: -1500, E: -1500 })

  const plan = settlementPlan(net)
  assert.ok(plan.length <= 4, `expected <= 4 transfers, got ${plan.length}`)
  assert.equal(plan.length, 4)
  assertClears(net, plan)
  // every transfer is a positive integer amount
  for (const t of plan) assert.ok(Number.isInteger(t.amountMinor) && t.amountMinor > 0)
})

test('settlement plan is deterministic regardless of net key order', () => {
  const a = { C: -1500, A: 3500, E: -1500, B: 1000, D: -1500 }
  const b = { A: 3500, B: 1000, C: -1500, D: -1500, E: -1500 }
  assert.deepEqual(settlementPlan(a), settlementPlan(b))
})

test('empty / all-settled net yields no transfers', () => {
  assert.deepEqual(settlementPlan({}), [])
  assert.deepEqual(settlementPlan({ A: 0, B: 0 }), [])
})

test('end-to-end: expenses -> balances -> plan clears all debts', () => {
  const entries = [
    expense('e1', 'A', 6000, ['A', 'B', 'C', 'D']), // 1500 each
    expense('e2', 'C', 4000, ['A', 'B', 'C', 'D']), // 1000 each
    expense('e3', 'B', 800, ['A', 'B']) // 400 each
  ]
  const net = computeBalances(entries)
  assert.equal(sum(net), 0)
  const plan = settlementPlan(net)
  assertClears(net, plan)
})

// ── validation ───────────────────────────────────────────────────────────────
test('validateEntry rejects float and non-positive money', () => {
  assert.throws(() => makeExpense({ id: 'e', payer: 'a', amountMinor: 10.5, participants: ['a', 'b'], ts: 1 }))
  assert.throws(() => makeExpense({ id: 'e', payer: 'a', amountMinor: 0, participants: ['a'], ts: 1 }))
})

test('validateEntry rejects a custom split that does not sum to the amount', () => {
  assert.throws(() => makeExpense({ id: 'e', payer: 'a', amountMinor: 5000, participants: ['a', 'b'], split: { a: 2000, b: 2000 }, ts: 1 }))
})

test('validateEntry requires a tx hash on payments (idempotency key)', () => {
  assert.throws(() => validateEntry({ type: 'payment', id: 'p', from: 'a', to: 'b', amountMinor: 100, currency: 'USDT', chain: 'ethereum', ts: 1 }))
})

// ── helpers ──────────────────────────────────────────────────────────────────
function sum (net) { return Object.values(net).reduce((a, b) => a + b, 0) }

/** Apply the plan to net and assert every balance becomes exactly zero. */
function assertClears (net, plan) {
  const after = { ...net }
  for (const t of plan) {
    after[t.from] = (after[t.from] ?? 0) + t.amountMinor // debtor pays -> balance rises
    after[t.to] = (after[t.to] ?? 0) - t.amountMinor // creditor received -> balance falls
  }
  for (const m of Object.keys(after)) assert.equal(after[m], 0, `member ${m} not cleared: ${after[m]}`)
}

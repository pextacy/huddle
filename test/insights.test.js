/**
 * Group spending insights — pure domain aggregation. Integer minor units only; deterministic
 * across peers (fixed category order, stable tie-breaks). See src/domain/insights.js.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { groupInsights, normalizeCategory, CATEGORIES } from '../src/domain/insights.js'
import { makeExpense, makePayment, makeFee } from '../src/domain/entries.js'

const exp = (id, payer, amountMinor, participants, category, ts = 1) =>
  makeExpense({ id, payer, amountMinor, participants, category, description: id, ts })

test('empty ledger yields a zeroed dashboard', () => {
  const i = groupInsights([])
  assert.equal(i.totalSpentMinor, 0)
  assert.equal(i.expenseCount, 0)
  assert.equal(i.avgPerExpenseMinor, 0)
  assert.deepEqual(i.byCategory, [])
  assert.deepEqual(i.byMember, [])
  assert.equal(i.largest, null)
})

test('normalizeCategory maps unknown/missing values to "other"', () => {
  assert.equal(normalizeCategory('tickets'), 'tickets')
  assert.equal(normalizeCategory('food'), 'food')
  assert.equal(normalizeCategory('nope'), 'other')
  assert.equal(normalizeCategory(undefined), 'other')
  assert.equal(normalizeCategory(42), 'other')
})

test('only expense entries count toward spend; payments/fees are ignored', () => {
  const entries = [
    exp('e1', 'A', 3000, ['A', 'B', 'C'], 'tickets'),
    makePayment({ id: 'p1', from: 'B', to: 'A', amountMinor: 1000, txHash: '0x1', ts: 2 }),
    makeFee({ id: 'f1', payer: 'B', amountMinor: 5, treasury: '0xdead', txHash: '0x2', ts: 3 })
  ]
  const i = groupInsights(entries)
  assert.equal(i.totalSpentMinor, 3000)
  assert.equal(i.expenseCount, 1)
})

test('category breakdown sums, counts, and sorts largest-first with percentages', () => {
  const entries = [
    exp('e1', 'A', 6000, ['A', 'B'], 'tickets'),
    exp('e2', 'B', 3000, ['A', 'B'], 'food'),
    exp('e3', 'A', 1000, ['A', 'B'], 'food')
  ]
  const i = groupInsights(entries)
  assert.equal(i.totalSpentMinor, 10000)
  assert.equal(i.expenseCount, 3)
  assert.equal(i.avgPerExpenseMinor, 3333) // round(10000/3)
  // tickets 6000 (60%) then food 4000 (40%), largest first
  assert.deepEqual(i.byCategory.map((c) => [c.key, c.amountMinor, c.count, c.pct]), [
    ['tickets', 6000, 1, 60],
    ['food', 4000, 2, 40]
  ])
})

test('unknown / missing categories fold into "other"', () => {
  const entries = [
    makeExpense({ id: 'e1', payer: 'A', amountMinor: 1000, participants: ['A'], ts: 1 }), // defaults to 'other'
    exp('e2', 'A', 500, ['A'], 'weird-unknown-cat')
  ]
  const i = groupInsights(entries)
  assert.equal(i.byCategory.length, 1)
  assert.equal(i.byCategory[0].key, 'other')
  assert.equal(i.byCategory[0].amountMinor, 1500)
  assert.equal(i.byCategory[0].count, 2)
})

test('per-member paid vs. share is tracked; sums stay consistent', () => {
  // A pays 3000 split 3 ways (1000 each); B pays 900 split 3 ways (300 each).
  const entries = [
    exp('e1', 'A', 3000, ['A', 'B', 'C'], 'travel'),
    exp('e2', 'B', 900, ['A', 'B', 'C'], 'food')
  ]
  const i = groupInsights(entries)
  const byId = Object.fromEntries(i.byMember.map((m) => [m.member, m]))
  assert.equal(byId.A.paidMinor, 3000)
  assert.equal(byId.B.paidMinor, 900)
  assert.equal(byId.C.paidMinor, 0)
  // shares: A 1000+300, B 1000+300, C 1000+300
  assert.equal(byId.A.shareMinor, 1300)
  assert.equal(byId.B.shareMinor, 1300)
  assert.equal(byId.C.shareMinor, 1300)
  // total paid and total consumed both equal total spent
  const totalPaid = i.byMember.reduce((s, m) => s + m.paidMinor, 0)
  const totalShare = i.byMember.reduce((s, m) => s + m.shareMinor, 0)
  assert.equal(totalPaid, i.totalSpentMinor)
  assert.equal(totalShare, i.totalSpentMinor)
  // sorted by paid desc: A (3000), then B (900), then C (0)
  assert.deepEqual(i.byMember.map((m) => m.member), ['A', 'B', 'C'])
})

test('largest expense is picked, ties broken deterministically by id', () => {
  const entries = [
    exp('e2', 'A', 5000, ['A', 'B'], 'stay'),
    exp('e1', 'B', 5000, ['A', 'B'], 'tickets'), // same amount, smaller id wins
    exp('e3', 'A', 2000, ['A', 'B'], 'food')
  ]
  const i = groupInsights(entries)
  assert.equal(i.largest.id, 'e1')
  assert.equal(i.largest.amountMinor, 5000)
  assert.equal(i.largest.category, 'tickets')
})

test('result is independent of entry order (peers converge on the same dashboard)', () => {
  const a = [
    exp('e1', 'A', 6000, ['A', 'B'], 'tickets'),
    exp('e2', 'B', 3000, ['A', 'B'], 'food'),
    exp('e3', 'A', 1000, ['A', 'B'], 'travel')
  ]
  const b = [a[2], a[0], a[1]]
  assert.deepEqual(groupInsights(a), groupInsights(b))
})

test('CATEGORIES includes the themed keys used by the UI', () => {
  const keys = CATEGORIES.map((c) => c.key)
  assert.deepEqual(keys, ['tickets', 'food', 'travel', 'stay', 'gear', 'other'])
  for (const c of CATEGORIES) {
    assert.ok(c.label && c.emoji, `category ${c.key} needs a label + emoji`)
  }
})

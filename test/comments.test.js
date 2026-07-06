import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeComment, makeExpense, validateEntry, COMMENT_MAX, ENTRY_TYPES } from '../src/domain/entries.js'
import { computeBalances } from '../src/domain/balances.js'

test("'comment' is a known entry type", () => {
  assert.ok(ENTRY_TYPES.includes('comment'))
})

test('makeComment builds a valid comment on an expense', () => {
  const c = makeComment({ id: 'c1', target: 'x1', by: 'ada', text: 'who paid the tip?', ts: 1 })
  assert.equal(c.type, 'comment')
  assert.equal(c.target, 'x1')
  assert.equal(c.by, 'ada')
  assert.equal(c.text, 'who paid the tip?')
})

test('comment validation rejects missing target/author/text and over-long bodies', () => {
  assert.throws(() => validateEntry({ type: 'comment', id: 'c', by: 'a', text: 'hi', ts: 1 }), /target/)
  assert.throws(() => validateEntry({ type: 'comment', id: 'c', target: 'x', text: 'hi', ts: 1 }), /by/)
  assert.throws(() => validateEntry({ type: 'comment', id: 'c', target: 'x', by: 'a', text: '', ts: 1 }), /text/)
  assert.throws(() => validateEntry({ type: 'comment', id: 'c', target: 'x', by: 'a', text: 'x'.repeat(COMMENT_MAX + 1), ts: 1 }), /<=/)
  assert.throws(() => validateEntry({ type: 'comment', id: 'c', target: 'x', by: 'a', text: 'hi', ts: 0 }), /ts/)
})

test('comments never affect balances (purely social)', () => {
  const expense = makeExpense({ id: 'x1', payer: 'ada', amountMinor: 1000, participants: ['ada', 'bob'], ts: 1 })
  const before = computeBalances([expense])
  const after = computeBalances([
    expense,
    makeComment({ id: 'c1', target: 'x1', by: 'bob', text: 'thanks!', ts: 2 }),
    makeComment({ id: 'c2', target: 'x1', by: 'ada', text: 'np', ts: 3 })
  ])
  assert.deepEqual(after, before)
  assert.equal(after.ada, 500)
  assert.equal(after.bob, -500)
})

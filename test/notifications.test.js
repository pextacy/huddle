import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildNotifications, unreadCount, NOTIFICATION_TYPES } from '../src/domain/notifications.js'
import { makeExpense, makeComment, makeReminder, makeCashPayment, makeVoid } from '../src/domain/entries.js'

const wallet = (member, ts) => ({ type: 'wallet', member, name: member, chain: 'ethereum', address: '0x' + member, ts })

test('notification types are the documented kinds', () => {
  assert.deepEqual([...NOTIFICATION_TYPES], ['expense_added', 'comment', 'nudge', 'payment', 'member_joined'])
})

test('an expense someone else adds me to notifies me; my own does not', () => {
  const entries = [
    makeExpense({ id: 'x1', payer: 'bob', amountMinor: 1000, participants: ['ada', 'bob'], description: 'Tickets', ts: 10 }),
    makeExpense({ id: 'x2', payer: 'ada', amountMinor: 500, participants: ['ada', 'bob'], description: 'Mine', ts: 11 })
  ]
  const notes = buildNotifications(entries, 'ada')
  assert.equal(notes.length, 1)
  assert.equal(notes[0].type, 'expense_added')
  assert.equal(notes[0].actor, 'bob')
  assert.equal(notes[0].description, 'Tickets')
})

test('a voided expense produces no notification', () => {
  const entries = [
    makeExpense({ id: 'x1', payer: 'bob', amountMinor: 1000, participants: ['ada', 'bob'], ts: 10 }),
    makeVoid({ id: 'v1', target: 'x1', by: 'bob', ts: 12 })
  ]
  assert.equal(buildNotifications(entries, 'ada').length, 0)
})

test('a comment by another on my expense notifies me; my own comment does not', () => {
  const entries = [
    makeExpense({ id: 'x1', payer: 'ada', amountMinor: 1000, participants: ['ada', 'bob'], description: 'Dinner', ts: 10 }),
    makeComment({ id: 'c1', target: 'x1', by: 'bob', text: 'thanks', ts: 11 }),
    makeComment({ id: 'c2', target: 'x1', by: 'ada', text: 'np', ts: 12 })
  ]
  const notes = buildNotifications(entries, 'ada').filter((n) => n.type === 'comment')
  assert.equal(notes.length, 1)
  assert.equal(notes[0].actor, 'bob')
  assert.equal(notes[0].text, 'thanks')
})

test('a nudge and a payment aimed at me notify me', () => {
  const entries = [
    makeReminder({ id: 'r1', from: 'bob', to: 'ada', amountMinor: 500, ts: 20 }),
    makeCashPayment({ id: 'p1', from: 'bob', to: 'ada', amountMinor: 500, ts: 21 }),
    makeReminder({ id: 'r2', from: 'ada', to: 'bob', ts: 22 }) // I nudged bob -> not mine to see
  ]
  const notes = buildNotifications(entries, 'ada')
  assert.deepEqual(notes.map((n) => n.type).sort(), ['nudge', 'payment'])
})

test('the first wallet entry per other member is a join; mine and republishes are not', () => {
  const entries = [
    wallet('ada', 1),
    wallet('bob', 2),
    wallet('bob', 5) // address republish -> not a second join
  ]
  const notes = buildNotifications(entries, 'ada')
  assert.equal(notes.filter((n) => n.type === 'member_joined').length, 1)
  assert.equal(notes[0].actor, 'bob')
})

test('feed is newest-first and unread respects the watermark', () => {
  const entries = [
    makeReminder({ id: 'r1', from: 'bob', to: 'ada', ts: 10 }),
    makeReminder({ id: 'r2', from: 'bob', to: 'ada', ts: 30 }),
    makeReminder({ id: 'r3', from: 'bob', to: 'ada', ts: 20 })
  ]
  const notes = buildNotifications(entries, 'ada')
  assert.deepEqual(notes.map((n) => n.ts), [30, 20, 10])
  assert.equal(unreadCount(notes, 15), 2) // ts 30 and 20 are newer than 15
  assert.equal(unreadCount(notes, 0), 3)
})

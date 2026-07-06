import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { makeReminder, makeExpense, validateEntry, ENTRY_TYPES } from '../src/domain/entries.js'
import { computeBalances } from '../src/domain/balances.js'
import { createBridge } from '../server/bridge.mjs'

test("'reminder' is a known entry type", () => {
  assert.ok(ENTRY_TYPES.includes('reminder'))
})

test('makeReminder builds a valid nudge; validation guards from/to', () => {
  const r = makeReminder({ id: 'r1', from: 'ada', to: 'bob', amountMinor: 500, ts: 1 })
  assert.equal(r.type, 'reminder')
  assert.equal(r.amountMinor, 500)
  assert.throws(() => validateEntry({ type: 'reminder', id: 'r', from: 'ada', to: 'ada', ts: 1 }), /differ/)
  assert.throws(() => validateEntry({ type: 'reminder', id: 'r', from: 'ada', to: 'bob', amountMinor: -1, ts: 1 }), /amountMinor/)
  assert.throws(() => validateEntry({ type: 'reminder', id: 'r', from: 'ada', ts: 1 }), /to/)
})

test('reminders never affect balances', () => {
  const expense = makeExpense({ id: 'x1', payer: 'ada', amountMinor: 1000, participants: ['ada', 'bob'], ts: 1 })
  const before = computeBalances([expense])
  const after = computeBalances([expense, makeReminder({ id: 'r1', from: 'ada', to: 'bob', ts: 2 })])
  assert.deepEqual(after, before)
})

test('bridge nudge appends a reminder carrying the outstanding amount owed to the creditor', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sk-bridge-nudge-'))
  const bridge = createBridge({ baseDir: dir, enableSwarm: false, enableWallet: false })
  try {
    const created = await bridge.createGroup({ name: 'Trip', member: 'Me' })
    const me = created.me.memberId
    // I (creditor) fronted 1000 split with bob -> bob owes me 500.
    await bridge.addExpense({ payer: me, amountMinor: 1000, description: 'Tickets', participants: [me, 'bob'] })
    const state = await bridge.nudge({ to: 'bob' })
    const reminders = state.entries.filter((e) => e.type === 'reminder')
    assert.equal(reminders.length, 1)
    assert.equal(reminders[0].from, me)
    assert.equal(reminders[0].to, 'bob')
    assert.equal(reminders[0].amountMinor, 500)
    assert.deepEqual(state.balances, { [me]: 500, bob: -500 }, 'nudge moved no balances')
  } finally {
    await bridge.teardown()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('bridge nudge refuses when the target owes nothing / you are not owed', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sk-bridge-nudge2-'))
  const bridge = createBridge({ baseDir: dir, enableSwarm: false, enableWallet: false })
  try {
    const created = await bridge.createGroup({ name: 'Trip', member: 'Me' })
    const me = created.me.memberId
    // bob paid; I owe bob -> I am not a creditor, so I cannot nudge.
    await bridge.addExpense({ payer: 'bob', amountMinor: 1000, description: 'Tickets', participants: [me, 'bob'] })
    await assert.rejects(() => bridge.nudge({ to: 'bob' }), /others owe you/)
    await assert.rejects(() => bridge.nudge({ to: me }), /yourself/)
  } finally {
    await bridge.teardown()
    rmSync(dir, { recursive: true, force: true })
  }
})

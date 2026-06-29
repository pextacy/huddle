/**
 * Backend bridge — group/expense/settlement over the real ledger, isolated to a temp dir
 * with the swarm and wallet disabled (no network). Exercises the same code path the HTTP
 * API and the Next.js frontend use.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createBridge } from '../server/bridge.mjs'

test('create group -> add expense -> balances + minimal plan', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sk-bridge-'))
  const bridge = createBridge({ baseDir: dir, enableSwarm: false, enableWallet: false })
  try {
    const created = await bridge.createGroup({ name: 'Trip', member: 'Me' })
    assert.equal(created.active, true)
    const me = created.me.memberId
    assert.ok(created.me.writable, 'creator is a writer')
    assert.match(created.group.invite, /^[0-9a-f]{64}:[0-9a-f]{64}$/) // <secret>:<bootstrap>

    const state = await bridge.addExpense({
      payer: me,
      amountMinor: 6000,
      description: 'Tickets',
      participants: [me, 'bob', 'carol'],
      split: 'equal'
    })

    assert.equal(state.balances[me], 4000)
    assert.equal(state.balances.bob, -2000)
    assert.equal(state.balances.carol, -2000)

    // Minimal plan: bob and carol each pay the payer.
    assert.equal(state.plan.length, 2)
    for (const t of state.plan) {
      assert.equal(t.to, me)
      assert.equal(t.amountMinor, 2000)
    }

    // Entries persisted in the ledger view (1 wallet membership + 1 expense).
    assert.ok(state.entries.some((e) => e.type === 'expense' && e.description === 'Tickets'))
  } finally {
    await bridge.teardown()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('custom (unequal) split is accepted and reflected in balances', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sk-bridge2-'))
  const bridge = createBridge({ baseDir: dir, enableSwarm: false, enableWallet: false })
  try {
    const created = await bridge.createGroup({ name: 'Dinner', member: 'Me' })
    const me = created.me.memberId
    const state = await bridge.addExpense({
      payer: me,
      amountMinor: 5000,
      description: 'Dinner',
      participants: [me, 'bob'],
      split: { [me]: 2000, bob: 3000 }
    })
    // me paid 5000, owes 2000 of it -> +3000; bob owes 3000.
    assert.equal(state.balances[me], 3000)
    assert.equal(state.balances.bob, -3000)
  } finally {
    await bridge.teardown()
    rmSync(dir, { recursive: true, force: true })
  }
})

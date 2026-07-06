/**
 * Backend bridge — group/expense/settlement over the real ledger, isolated to a temp dir
 * with the swarm and wallet disabled (no network). Exercises the same code path the HTTP
 * API and the Next.js frontend use.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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

test('wallet status surfaces fee + pro pricing even when the wallet is unavailable', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sk-bridge-policy-'))
  const bridge = createBridge({ baseDir: dir, enableSwarm: false, enableWallet: false })
  try {
    const w = await bridge.walletStatus()
    assert.equal(w.ok, false) // wallet disabled in this test
    assert.equal(w.fee.enabled, true) // pricing still surfaced for the UI
    assert.equal(w.pro.enabled, true)
    assert.equal(w.pro.active, false)
    assert.equal(w.pro.pricePerMonthMinor, 500)
  } finally {
    await bridge.teardown()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('settle quote breaks out the platform fee on top of the debt', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sk-bridge-fee-'))
  // Default policy: Sepolia ships a demo treasury, so the fee is enabled at 0.50%.
  const bridge = createBridge({ baseDir: dir, enableSwarm: false, enableWallet: false })
  try {
    await bridge.createGroup({ name: 'Trip', member: 'Me' })
    const q = await bridge.quoteSettle({ to: 'bob', amountMinor: 10000 })
    assert.equal(q.amountMinor, 10000) // creditor still receives the full debt
    assert.equal(q.feeEnabled, true)
    assert.equal(q.feeMinor, 50) // 0.50% of 100.00
    assert.equal(q.totalMinor, 10050) // payer's total out-of-pocket
    assert.ok(q.treasury, 'treasury address surfaced for transparency')
  } finally {
    await bridge.teardown()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('an active Pro subscription waives the per-settle fee', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sk-bridge-pro-'))
  // Seed an active subscription (expires far in the future) before the bridge reads it.
  writeFileSync(join(dir, 'pro.json'), JSON.stringify({ until: Date.now() + 1_000_000, subscriptionRevenueMinor: 500 }))
  const bridge = createBridge({ baseDir: dir, enableSwarm: false, enableWallet: false })
  try {
    await bridge.createGroup({ name: 'Trip', member: 'Me' })
    const q = await bridge.quoteSettle({ to: 'bob', amountMinor: 10000 })
    assert.equal(q.pro, true)
    assert.equal(q.feeMinor, 0) // Pro pays no per-settle fee
    assert.equal(q.totalMinor, 10000)
    assert.equal(q.feeEnabled, false)
    const status = bridge.proStatus()
    assert.equal(status.active, true)
    assert.equal(status.subscriptionRevenueMinor, 500)
  } finally {
    await bridge.teardown()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('group state exposes platform revenue, starting at zero', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sk-bridge-rev-'))
  const bridge = createBridge({ baseDir: dir, enableSwarm: false, enableWallet: false })
  try {
    const state = await bridge.createGroup({ name: 'Trip', member: 'Me' })
    assert.deepEqual(state.revenue, { feesMinor: 0, count: 0 })
  } finally {
    await bridge.teardown()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('expense category flows through to group insights', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sk-bridge-ins-'))
  const bridge = createBridge({ baseDir: dir, enableSwarm: false, enableWallet: false })
  try {
    const created = await bridge.createGroup({ name: 'Trip', member: 'Me' })
    const me = created.me.memberId
    await bridge.addExpense({ payer: me, amountMinor: 6000, description: 'Match tickets', participants: [me, 'bob'], category: 'tickets' })
    const state = await bridge.addExpense({ payer: me, amountMinor: 4000, description: 'Kebabs', participants: [me, 'bob'], category: 'food' })

    const ins = state.insights
    assert.equal(ins.totalSpentMinor, 10000)
    assert.equal(ins.expenseCount, 2)
    // tickets 6000 (60%) sorts ahead of food 4000 (40%).
    assert.deepEqual(ins.byCategory.map((c) => [c.key, c.amountMinor, c.pct]), [
      ['tickets', 6000, 60],
      ['food', 4000, 40]
    ])
    assert.equal(ins.largest.category, 'tickets')
    assert.equal(ins.largest.description, 'Match tickets')
    // the payer fronted the whole group's spend.
    assert.equal(ins.byMember.find((m) => m.member === me).paidMinor, 10000)
  } finally {
    await bridge.teardown()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('an expense with no category folds into "other" in insights', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sk-bridge-ins2-'))
  const bridge = createBridge({ baseDir: dir, enableSwarm: false, enableWallet: false })
  try {
    const created = await bridge.createGroup({ name: 'Trip', member: 'Me' })
    const me = created.me.memberId
    const state = await bridge.addExpense({ payer: me, amountMinor: 1000, description: 'Misc', participants: [me, 'bob'] })
    assert.equal(state.insights.byCategory[0].key, 'other')
    assert.equal(state.insights.byCategory[0].amountMinor, 1000)
  } finally {
    await bridge.teardown()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a settle with an already-recorded receipt returns the prior tx hash without re-sending', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sk-bridge-idem-'))
  // Seed a durable receipt (as if a prior settle's transfer landed but its response was lost).
  // The wallet is disabled here, so if doSettle reached the on-chain step it would throw
  // 'Wallet unavailable' — a clean return proves the receipt short-circuits before any re-send.
  writeFileSync(join(dir, 'settles.json'), JSON.stringify({ 'key-1': { txHash: '0xdeadbeef', amountMinor: 2500, ts: Date.now() } }))
  const bridge = createBridge({ baseDir: dir, enableSwarm: false, enableWallet: false })
  try {
    await bridge.createGroup({ name: 'Trip', member: 'Me' })
    const res = await bridge.settle({ to: 'bob', amountMinor: 2500, idempotencyKey: 'key-1' })
    assert.equal(res.duplicate, true)
    assert.equal(res.txHash, '0xdeadbeef')
    assert.equal(res.feeMinor, 0)
  } finally {
    await bridge.teardown()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('membership is published exactly once (create + restart append no duplicates)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sk-bridge-member-'))
  // Regression: the initial ledger tick used to race the explicit publish in createGroup,
  // appending the wallet/membership entry twice.
  const bridge = createBridge({ baseDir: dir, enableSwarm: false, enableWallet: false })
  try {
    const created = await bridge.createGroup({ name: 'Trip', member: 'Me' })
    const me = created.me.memberId
    await new Promise((resolve) => setTimeout(resolve, 2000)) // let a few ticks run
    const state = await bridge.groupState()
    assert.equal(state.entries.filter((e) => e.type === 'wallet' && e.member === me).length, 1)

    // A restart must re-seed the published address from the ledger, not publish again.
    await bridge.teardown()
    const reopened = createBridge({ baseDir: dir, enableSwarm: false, enableWallet: false })
    try {
      await reopened.restore()
      await new Promise((resolve) => setTimeout(resolve, 2000))
      const after = await reopened.groupState()
      assert.equal(after.entries.filter((e) => e.type === 'wallet' && e.member === me).length, 1)
    } finally {
      await reopened.teardown()
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('delete (void) an expense clears its effect on balances', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sk-bridge-void-'))
  const bridge = createBridge({ baseDir: dir, enableSwarm: false, enableWallet: false })
  try {
    const created = await bridge.createGroup({ name: 'Trip', member: 'Me' })
    const me = created.me.memberId
    const s1 = await bridge.addExpense({ payer: me, amountMinor: 6000, participants: [me, 'bob'], description: 'Tickets' })
    const exp = s1.entries.find((e) => e.type === 'expense')
    assert.equal(s1.balances[me], 3000)

    const s2 = await bridge.voidExpense({ target: exp.id })
    assert.equal(s2.balances[me] ?? 0, 0)
    assert.equal(s2.insights.totalSpentMinor, 0)
    await assert.rejects(bridge.voidExpense({ target: 'nope' }), /no longer exists/)
  } finally {
    await bridge.teardown()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('edit an expense supersedes the original amount', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sk-bridge-edit-'))
  const bridge = createBridge({ baseDir: dir, enableSwarm: false, enableWallet: false })
  try {
    const created = await bridge.createGroup({ name: 'Trip', member: 'Me' })
    const me = created.me.memberId
    const s1 = await bridge.addExpense({ payer: me, amountMinor: 10000, participants: [me, 'bob'], description: 'Dinner' })
    const exp = s1.entries.find((e) => e.type === 'expense')

    const s2 = await bridge.editExpense({ target: exp.id, payer: me, amountMinor: 4000, participants: [me, 'bob'], description: 'Dinner (fixed)' })
    assert.equal(s2.balances[me], 2000) // only the corrected 40.00 counts
    assert.equal(s2.balances.bob, -2000)
    assert.equal(s2.insights.totalSpentMinor, 4000)
  } finally {
    await bridge.teardown()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('percentage split flows through the bridge into balances', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sk-bridge-pct-'))
  const bridge = createBridge({ baseDir: dir, enableSwarm: false, enableWallet: false })
  try {
    const created = await bridge.createGroup({ name: 'Trip', member: 'Me' })
    const me = created.me.memberId
    const state = await bridge.addExpense({ payer: me, amountMinor: 10000, participants: [me, 'bob'], split: { kind: 'percent', weights: { [me]: 70, bob: 30 } } })
    assert.equal(state.balances[me], 3000) // fronted 10000, owes 7000
    assert.equal(state.balances.bob, -3000)
  } finally {
    await bridge.teardown()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('cash settlement clears a debt with no wallet / no tx hash', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sk-bridge-cash-'))
  const bridge = createBridge({ baseDir: dir, enableSwarm: false, enableWallet: false })
  try {
    const created = await bridge.createGroup({ name: 'Trip', member: 'Me' })
    const me = created.me.memberId
    // Someone else fronts, so `me` owes and can record a cash repayment.
    await bridge.addExpense({ payer: 'bob', amountMinor: 5000, participants: [me, 'bob'] })
    const state = await bridge.cashSettle({ to: 'bob', amountMinor: 2500, note: 'paid cash' })
    assert.equal(state.balances[me] ?? 0, 0)
    const pay = state.entries.find((e) => e.type === 'payment')
    assert.equal(pay.method, 'cash')
    assert.equal(pay.txHash, undefined)
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

/**
 * Multi-group registry — create several groups, switch between their live ledgers, leave one, and
 * migrate a legacy single-group install. Swarm/wallet disabled (no network).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createBridge } from '../server/bridge.mjs'

test('create two groups; the newest is active and both are listed', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sk-mg-'))
  const bridge = createBridge({ baseDir: dir, enableSwarm: false, enableWallet: false })
  try {
    await bridge.createGroup({ name: 'Trip', member: 'Me' })
    await bridge.createGroup({ name: 'Flat', member: 'Me' })
    const full = await bridge.fullState()
    assert.equal(full.group.group.name, 'Flat', 'newest group is active')
    assert.equal(full.groups.groups.length, 2)
    assert.deepEqual(full.groups.groups.map((g) => g.name).sort(), ['Flat', 'Trip'])
    assert.ok(full.groups.groups.find((g) => g.name === 'Flat').active)
  } finally {
    await bridge.teardown()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('switching activates the other group and its own ledger/identity', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sk-mg2-'))
  const bridge = createBridge({ baseDir: dir, enableSwarm: false, enableWallet: false })
  try {
    const trip = await bridge.createGroup({ name: 'Trip', member: 'Me' })
    const tripId = trip.group.id
    const tripMember = trip.me.memberId
    await bridge.addExpense({ payer: tripMember, amountMinor: 1000, description: 'Tickets', participants: [tripMember, 'bob'] })

    const flat = await bridge.createGroup({ name: 'Flat', member: 'Me' })
    // Flat is a fresh ledger — no expenses from Trip leak in.
    assert.equal(flat.entries.filter((e) => e.type === 'expense').length, 0)

    const back = await bridge.switchGroup({ id: tripId })
    assert.equal(back.group.name, 'Trip')
    assert.equal(back.me.memberId, tripMember, 'Trip keeps its own identity')
    assert.equal(back.entries.filter((e) => e.type === 'expense').length, 1, 'Trip ledger restored')
  } finally {
    await bridge.teardown()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('leaving the active group falls back to another; switch is a no-op when already active', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sk-mg3-'))
  const bridge = createBridge({ baseDir: dir, enableSwarm: false, enableWallet: false })
  try {
    const trip = await bridge.createGroup({ name: 'Trip', member: 'Me' })
    const flat = await bridge.createGroup({ name: 'Flat', member: 'Me' })
    // Flat is active; no-op switch returns the same active group.
    const same = await bridge.switchGroup({ id: flat.group.id })
    assert.equal(same.group.name, 'Flat')

    const after = await bridge.leaveGroup({ id: flat.group.id })
    assert.equal(after.group.active, true)
    assert.equal(after.group.group.name, 'Trip', 'fell back to the remaining group')
    assert.equal(after.groups.groups.length, 1)
  } finally {
    await bridge.teardown()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a legacy single group.json install migrates into the registry', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sk-mg-legacy-'))
  // First run: create a group, then simulate a legacy install by leaving only group.json behind.
  const b1 = createBridge({ baseDir: dir, enableSwarm: false, enableWallet: false })
  const created = await b1.createGroup({ name: 'Legacy', member: 'Me' })
  const meta = { id: created.group.id, name: 'Legacy', invite: created.group.invite, memberId: created.me.memberId, memberName: 'Me' }
  await b1.teardown()
  // Reconstruct the legacy world: keep the store, drop the registry, write the old group.json.
  rmSync(join(dir, 'groups.json'), { force: true })
  // Fill in the fields startLedger/switch need from the created group's invite.
  const [secretHex, bootstrap] = created.group.invite.split(':')
  writeFileSync(join(dir, 'group.json'), JSON.stringify({ ...meta, secretHex, bootstrap, creator: true }))

  const b2 = createBridge({ baseDir: dir, enableSwarm: false, enableWallet: false })
  try {
    await b2.restore()
    const full = await b2.fullState()
    assert.equal(full.group.active, true)
    assert.equal(full.group.group.name, 'Legacy')
    assert.ok(existsSync(join(dir, 'groups.json')) || full.groups.groups.length === 1)
    assert.equal(full.groups.groups.length, 1)
  } finally {
    await b2.teardown()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('groupsSummary reports this device net per group + overall (inactive read read-only)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sk-mg-sum-'))
  const bridge = createBridge({ baseDir: dir, enableSwarm: false, enableWallet: false })
  try {
    // Trip: I front 1000 split with bob -> I'm owed +500.
    const trip = await bridge.createGroup({ name: 'Trip', member: 'Me' })
    const tripMe = trip.me.memberId
    await bridge.addExpense({ payer: tripMe, amountMinor: 1000, description: 'Tickets', participants: [tripMe, 'bob'] })
    // Flat (now active): bob fronts 2000 split with me -> I owe -1000.
    const flat = await bridge.createGroup({ name: 'Flat', member: 'Me' })
    const flatMe = flat.me.memberId
    await bridge.addExpense({ payer: 'bob', amountMinor: 2000, description: 'Rent', participants: [flatMe, 'bob'] })

    const sum = await bridge.groupsSummary()
    const byName = Object.fromEntries(sum.groups.map((g) => [g.name, g.netMinor]))
    assert.equal(byName.Trip, 500, 'owed in Trip (read from its store read-only)')
    assert.equal(byName.Flat, -1000, 'owes in Flat (live active ledger)')
    assert.equal(sum.overallMinor, -500, 'overall net across groups')
  } finally {
    await bridge.teardown()
    rmSync(dir, { recursive: true, force: true })
  }
})

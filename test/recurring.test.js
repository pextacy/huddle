import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { nextOccurrence, dueOccurrences, materializeOccurrence, latestTemplates } from '../src/domain/recurring.js'
import { makeRecurring, validateEntry, ENTRY_TYPES } from '../src/domain/entries.js'
import { createBridge } from '../server/bridge.mjs'

const DAY = 86400000
const at = (y, m, d) => Date.UTC(y, m - 1, d) // 1-based month for readability

test("'recurring' is a known entry type", () => {
  assert.ok(ENTRY_TYPES.includes('recurring'))
})

test('nextOccurrence: daily/weekly are fixed intervals', () => {
  const t = at(2026, 1, 10)
  assert.equal(nextOccurrence(t, 'daily'), t + DAY)
  assert.equal(nextOccurrence(t, 'weekly'), t + 7 * DAY)
})

test('nextOccurrence: monthly keeps the day-of-month', () => {
  assert.equal(nextOccurrence(at(2026, 1, 15), 'monthly'), at(2026, 2, 15))
  assert.equal(nextOccurrence(at(2026, 11, 15), 'monthly'), at(2026, 12, 15))
  // year rollover
  assert.equal(nextOccurrence(at(2026, 12, 15), 'monthly'), at(2027, 1, 15))
})

test('nextOccurrence: monthly clamps to the shorter month (Jan 31 -> Feb 28)', () => {
  assert.equal(nextOccurrence(at(2026, 1, 31), 'monthly'), at(2026, 2, 28))
})

test('dueOccurrences: only occurrences at/before now, indexed from the anchor', () => {
  const tpl = { id: 't1', cadence: 'weekly', anchorTs: at(2026, 1, 1), active: true }
  const now = at(2026, 1, 1) + 15 * DAY // covers weeks at day 0, 7, 14
  const due = dueOccurrences(tpl, now)
  assert.deepEqual(due.map((o) => o.index), [0, 1, 2])
  assert.deepEqual(due.map((o) => o.ts), [at(2026, 1, 1), at(2026, 1, 8), at(2026, 1, 15)])
})

test('dueOccurrences: an inactive template yields nothing', () => {
  const tpl = { id: 't1', cadence: 'daily', anchorTs: at(2026, 1, 1), active: false }
  assert.deepEqual(dueOccurrences(tpl, at(2026, 2, 1)), [])
})

test('materializeOccurrence: deterministic id + ts derived from the template', () => {
  const tpl = makeRecurring({ id: 'rentT', payer: 'ada', amountMinor: 1200, participants: ['ada', 'bob'], cadence: 'monthly', anchorTs: at(2026, 1, 1), ts: 1 })
  const occ = { index: 3, ts: at(2026, 4, 1) }
  const exp = materializeOccurrence(tpl, occ)
  assert.equal(exp.id, 'rentT#3')
  assert.equal(exp.ts, at(2026, 4, 1))
  assert.equal(exp.amountMinor, 1200)
  assert.equal(exp.recurringId, 'rentT')
})

test('latestTemplates: newest ts per id wins (stop supersedes)', () => {
  const a = makeRecurring({ id: 't1', payer: 'ada', amountMinor: 100, participants: ['ada', 'bob'], cadence: 'daily', anchorTs: 1000, ts: 10 })
  const stopped = makeRecurring({ ...a, active: false, ts: 20 })
  const reduced = latestTemplates([a, stopped])
  assert.equal(reduced.length, 1)
  assert.equal(reduced[0].active, false)
})

test('recurring validation rejects a bad cadence and missing anchor', () => {
  assert.throws(() => validateEntry({ type: 'recurring', id: 't', payer: 'a', amountMinor: 100, currency: 'USD', participants: ['a', 'b'], split: 'equal', cadence: 'yearly', anchorTs: 1, active: true, ts: 1 }), /cadence/)
  assert.throws(() => validateEntry({ type: 'recurring', id: 't', payer: 'a', amountMinor: 100, currency: 'USD', participants: ['a', 'b'], split: 'equal', cadence: 'daily', active: true, ts: 1 }), /anchorTs/)
})

test('bridge: a recurring template with a past anchor materializes due expenses idempotently', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sk-bridge-rec-'))
  const bridge = createBridge({ baseDir: dir, enableSwarm: false, enableWallet: false })
  try {
    const created = await bridge.createGroup({ name: 'Flat', member: 'Me' })
    const me = created.me.memberId
    // Anchor 20 days ago, weekly -> occurrences at day 0, 7, 14 are due (3 expenses).
    const anchorTs = Date.now() - 20 * DAY
    const state = await bridge.addRecurring({ payer: me, amountMinor: 3000, description: 'Rent', participants: [me, 'bob'], cadence: 'weekly', anchorTs })

    const tpl = state.recurring.find((t) => t.description === 'Rent')
    assert.ok(tpl, 'template is listed as active')
    const materialized = state.entries.filter((e) => e.type === 'expense' && e.recurringId === tpl.id)
    assert.equal(materialized.length, 3, 'three weekly occurrences materialized')
    assert.equal(state.balances[me], 4500, '3 x 3000 fronted, half owed by bob')
    assert.equal(state.balances.bob, -4500)

    // Idempotent: adding another template shouldn't duplicate the first one's occurrences.
    const again = await bridge.addRecurring({ payer: me, amountMinor: 500, description: 'Wifi', participants: [me, 'bob'], cadence: 'weekly', anchorTs })
    const rentAgain = again.entries.filter((e) => e.type === 'expense' && e.recurringId === tpl.id)
    assert.equal(rentAgain.length, 3, 'rent occurrences were not re-created')
  } finally {
    await bridge.teardown()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('bridge: stopping a template prevents further materialization', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sk-bridge-rec2-'))
  const bridge = createBridge({ baseDir: dir, enableSwarm: false, enableWallet: false })
  try {
    const created = await bridge.createGroup({ name: 'Flat', member: 'Me' })
    const me = created.me.memberId
    const state = await bridge.addRecurring({ payer: me, amountMinor: 1000, description: 'Rent', participants: [me, 'bob'], cadence: 'weekly', anchorTs: Date.now() - 3 * DAY })
    const tpl = state.recurring[0]
    const stopped = await bridge.stopRecurring({ id: tpl.id })
    assert.equal(stopped.recurring.length, 0, 'no active templates after stop')
  } finally {
    await bridge.teardown()
    rmSync(dir, { recursive: true, force: true })
  }
})

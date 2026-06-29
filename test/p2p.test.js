/**
 * P2P layer — topic derivation (pure) and single-peer ledger persistence.
 *
 * Multi-peer convergence + restart-safety are verified end-to-end by
 * `scripts/verify-p2p.mjs` (npm run p2p:verify), which spins up two real replicating peers.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import b4a from 'b4a'
import Corestore from 'corestore'

import { createGroup, joinGroup } from '../src/p2p/topic.js'
import { openLedger, appendEntry, readLedger } from '../src/p2p/ledger.js'
import { makeExpense } from '../src/domain/entries.js'

test('invite code round-trips to the same 32-byte topic', () => {
  const { topic, inviteCode } = createGroup()
  assert.equal(topic.length, 32)
  assert.equal(inviteCode.length, 64) // 32 bytes hex
  const joined = joinGroup(inviteCode)
  assert.ok(b4a.equals(joined.topic, topic), 'joined topic must equal creator topic')
})

test('different secrets produce different topics', () => {
  assert.ok(!b4a.equals(createGroup().topic, createGroup().topic))
})

test('joinGroup rejects malformed invite codes', () => {
  assert.throws(() => joinGroup('nothex'))
  assert.throws(() => joinGroup('abcd')) // too short
  assert.throws(() => joinGroup(''))
})

test('single-peer ledger persists entries across reopen', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sk-led-'))
  try {
    let store = new Corestore(dir)
    let base = await openLedger(store, null)
    await appendEntry(base, makeExpense({ id: 'e1', payer: 'A', amountMinor: 900, participants: ['A', 'B', 'C'], ts: 1 }))
    let view = await readLedger(base)
    assert.equal(view.length, 1)
    assert.equal(view[0].id, 'e1')
    await base.close(); await store.close()

    // Reopen from disk — the entry must still be there (Corestore-backed).
    store = new Corestore(dir)
    base = await openLedger(store, null)
    view = await readLedger(base)
    assert.equal(view.length, 1)
    assert.equal(view[0].payer, 'A')
    await base.close(); await store.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

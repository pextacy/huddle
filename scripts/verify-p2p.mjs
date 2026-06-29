// Phase 3 verification: two real peers replicate, multi-writer entries converge to an
// identical view, and the ledger survives a restart. Uses piped Corestore replication
// (deterministic, no DHT needed) — the swarm is the same store.replicate() over Hyperswarm.
import Corestore from 'corestore'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  openLedger, appendEntry, addWriter, readLedger, localWriterKey, bootstrapKey, isWritable
} from '../src/p2p/ledger.js'
import { makeExpense } from '../src/domain/entries.js'
import { computeBalances } from '../src/domain/balances.js'

const wait = (ms) => new Promise(r => setTimeout(r, ms))
const dirA = mkdtempSync(join(tmpdir(), 'sk-a-'))
const dirB = mkdtempSync(join(tmpdir(), 'sk-b-'))

function pipe (s1, s2) {
  const a = s1.replicate(true)
  const b = s2.replicate(false)
  a.pipe(b).pipe(a)
  return () => { a.destroy(); b.destroy() }
}

async function untilWritable (base, ms = 15000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    await base.update()
    if (isWritable(base)) return true
    await wait(200)
  }
  return false
}

async function syncRead (base) {
  for (let i = 0; i < 30; i++) { await base.update(); await wait(150) }
  return readLedger(base)
}

let storeA = new Corestore(dirA)
let storeB = new Corestore(dirB)
let unpipe = pipe(storeA, storeB)

const baseA = await openLedger(storeA, null)           // group creator
const boot = bootstrapKey(baseA)
const baseB = await openLedger(storeB, boot)           // member joins via bootstrap key

console.log('bootstrap key:', boot.slice(0, 16), '...')

// B announces its writer key; A authorizes it (the addWriter flow).
const bKey = localWriterKey(baseB)
await addWriter(baseA, bKey)
const ok = await untilWritable(baseB)
console.log('peer B became a writer:', ok)
if (!ok) { console.error('FAIL: B never became writable'); process.exit(1) }

// Both peers append expenses offline-style; they must converge.
await appendEntry(baseA, makeExpense({ id: 'e1', payer: 'A', amountMinor: 5000, participants: ['A', 'B', 'C'], description: 'Tickets', ts: 1000 }))
await appendEntry(baseB, makeExpense({ id: 'e2', payer: 'B', amountMinor: 1500, participants: ['A', 'B', 'C'], description: 'Food', ts: 2000 }))

const viewA = await syncRead(baseA)
const viewB = await syncRead(baseB)

const jsonA = JSON.stringify(viewA)
const jsonB = JSON.stringify(viewB)
console.log('A view entries:', viewA.length, '| B view entries:', viewB.length)
console.log('views identical:', jsonA === jsonB)
console.log('balances (A):', computeBalances(viewA))

if (jsonA !== jsonB) { console.error('FAIL: views diverged'); process.exit(1) }
if (viewA.length !== 2) { console.error('FAIL: expected 2 entries'); process.exit(1) }

// Restart peer A from disk — entries must persist (Corestore-backed).
unpipe()
await baseA.close(); await storeA.close()
storeA = new Corestore(dirA)
const baseA2 = await openLedger(storeA, null)
const viewA2 = await readLedger(baseA2)
console.log('after restart, A view entries:', viewA2.length)
const persisted = JSON.stringify(viewA2) === jsonA
console.log('restart-safe (identical view):', persisted)
await baseA2.close(); await storeA.close(); await baseB.close(); await storeB.close()

rmSync(dirA, { recursive: true, force: true })
rmSync(dirB, { recursive: true, force: true })

if (!persisted) { console.error('FAIL: ledger not restart-safe'); process.exit(1) }
console.log('\nPASS — real multi-writer sync, converged, restart-safe.')
process.exit(0)

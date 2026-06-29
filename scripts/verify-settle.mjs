// Phase 4 verification — the settle loop's ledger mechanics across two real peers:
//   expense (B owes A) -> B records a `payment` entry -> both peers converge and the debt
//   clears for everyone. The on-chain USD₮ send itself is the real wallet path verified in
//   Phase 1 (scripts/wallet.mjs); here we prove the loop closes deterministically over P2P.
import Corestore from 'corestore'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  openLedger, appendEntry, addWriter, readLedger, localWriterKey, bootstrapKey, isWritable
} from '../src/p2p/ledger.js'
import { makeExpense, makePayment } from '../src/domain/entries.js'
import { computeBalances } from '../src/domain/balances.js'

const wait = (ms) => new Promise(r => setTimeout(r, ms))
const dirA = mkdtempSync(join(tmpdir(), 'sk-s-a-'))
const dirB = mkdtempSync(join(tmpdir(), 'sk-s-b-'))

function pipe (s1, s2) {
  const a = s1.replicate(true); const b = s2.replicate(false)
  a.pipe(b).pipe(a)
  return () => { a.destroy(); b.destroy() }
}
async function untilWritable (base, ms = 15000) {
  const end = Date.now() + ms
  while (Date.now() < end) { await base.update(); if (isWritable(base)) return true; await wait(200) }
  return false
}
async function syncRead (base) {
  for (let i = 0; i < 30; i++) { await base.update(); await wait(150) }
  return readLedger(base)
}

const storeA = new Corestore(dirA)
const storeB = new Corestore(dirB)
const unpipe = pipe(storeA, storeB)

const baseA = await openLedger(storeA, null)
const baseB = await openLedger(storeB, bootstrapKey(baseA))
await addWriter(baseA, localWriterKey(baseB))
if (!await untilWritable(baseB)) { console.error('FAIL: B not writable'); process.exit(1) }

// A pays 10.00 for [A,B] equal -> B owes A 5.00.
await appendEntry(baseA, makeExpense({ id: 'e1', payer: 'A', amountMinor: 1000, participants: ['A', 'B'], description: 'Tickets', ts: 1000 }))

let before = computeBalances(await syncRead(baseB))
console.log('before settle — balances:', before)
if (before.B !== -500 || before.A !== 500) { console.error('FAIL: unexpected pre-settle balances'); process.exit(1) }

// B settles: after the on-chain USD₮ transfer, B records a payment entry (idempotent on txHash).
const txHash = '0x' + 'ab'.repeat(32)
await appendEntry(baseB, makePayment({ id: 'p1', from: 'B', to: 'A', amountMinor: 500, txHash, ts: 2000 }))

// Replicate a duplicate of the same payment (retry) — must NOT double-count.
await appendEntry(baseA, makePayment({ id: 'p1b', from: 'B', to: 'A', amountMinor: 500, txHash, ts: 2001 }))

const viewA = await syncRead(baseA)
const viewB = await syncRead(baseB)
const identical = JSON.stringify(viewA) === JSON.stringify(viewB)
const after = computeBalances(viewA)
console.log('views identical:', identical)
console.log('after settle — balances:', after)
console.log('peer count of payment entries:', viewA.filter(e => e.type === 'payment').length)

unpipe()
await baseA.close(); await baseB.close(); await storeA.close(); await storeB.close()
rmSync(dirA, { recursive: true, force: true }); rmSync(dirB, { recursive: true, force: true })

if (!identical) { console.error('FAIL: views diverged'); process.exit(1) }
if (after.A !== 0 || after.B !== 0) { console.error('FAIL: debt not cleared for all peers'); process.exit(1) }
console.log('\nPASS — settle loop closes: debt cleared for every peer, idempotent on tx hash.')
process.exit(0)

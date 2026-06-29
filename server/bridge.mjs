/**
 * Backend bridge — the single Node-side context the Next.js frontend talks to.
 *
 * Holepunch (Hyperswarm/Autobase/Corestore) and WDK run in Node, not the browser, so this
 * bridge owns the live P2P ledger + self-custodial wallet and exposes plain JSON operations.
 * The Next.js frontend (web/) consumes these over HTTP/SSE — no mocks, real modules.
 *
 * Group invite format: `<groupSecretHex>:<bootstrapKeyHex>` — the secret derives the swarm
 * topic (peer discovery), the bootstrap key bootstraps the shared Autobase.
 */

import Corestore from 'corestore'
import { homedir, platform } from 'node:os'
import { join } from 'node:path'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import crypto from 'hypercore-crypto'
import b4a from 'b4a'

import { createGroup, joinGroup } from '../src/p2p/topic.js'
import { openLedger, appendEntry, addWriter, readLedger, localWriterKey, bootstrapKey, isWritable } from '../src/p2p/ledger.js'
import { joinSwarm } from '../src/p2p/swarm.js'
import { computeBalances } from '../src/domain/balances.js'
import { settlementPlan } from '../src/domain/settlement.js'
import { makeExpense, makePayment } from '../src/domain/entries.js'
import { generateSeed, openWallet, getNativeBalance, getUsdtBalance, sendUsdt, getNetwork, NETWORK, USDT } from '../src/wallet/wdk.js'
import { loadOrCreateSeed } from '../src/wallet/seed-store.js'
import { formatUsdt } from '../src/wallet/units.js'

const APP_DIR = 'splitkick-plus'

function appDir () {
  const home = homedir()
  if (platform() === 'darwin') return join(home, 'Library', 'Application Support', APP_DIR)
  if (platform() === 'win32') return join(process.env.APPDATA || join(home, 'AppData', 'Roaming'), APP_DIR)
  return join(process.env.XDG_DATA_HOME || join(home, '.local', 'share'), APP_DIR)
}

export function createBridge (opts = {}) {
  const baseDir = opts.baseDir || appDir()
  const enableSwarm = opts.enableSwarm !== false // default on
  const enableWallet = opts.enableWallet !== false // default on
  mkdirSync(baseDir, { recursive: true })
  const groupMetaPath = join(baseDir, 'group.json')

  /** @type {{ store, base, swarm, group } | null} */
  let ledger = null
  let wallet = null
  let walletError = null
  const listeners = new Set() // SSE subscribers
  let memberId = null
  let memberName = null

  function emit () {
    for (const fn of listeners) { try { fn() } catch {} }
  }

  // ── wallet ────────────────────────────────────────────────────────────────
  async function ensureWallet () {
    if (wallet || walletError) return
    if (!enableWallet) { walletError = 'wallet disabled'; return }
    try {
      const { seed } = loadOrCreateSeed(generateSeed)
      wallet = await openWallet(seed)
    } catch (e) {
      walletError = e.shortMessage || e.message
    }
  }

  async function walletStatus () {
    await ensureWallet()
    const net = { ...getNetwork(), explorerTxUrl: NETWORK.explorerTxUrl, explorerAddressUrl: NETWORK.explorerAddressUrl }
    if (!wallet) return { ok: false, error: walletError, network: net }
    let usdt = null; let gas = null; let online = true
    try {
      const [u, w] = await Promise.all([getUsdtBalance(wallet), getNativeBalance(wallet)])
      usdt = formatUsdt(u); gas = (w / 10n ** 18n).toString() + '.' + (w % 10n ** 18n).toString().padStart(18, '0').slice(0, 6)
    } catch (e) { online = false }
    return {
      ok: true,
      address: wallet.address,
      network: net,
      testnet: NETWORK.testnet,
      usdt,
      gas,
      online,
      usdtToken: USDT.address
    }
  }

  // ── group / ledger ──────────────────────────────────────────────────────────
  function persistGroup (meta) { writeFileSync(groupMetaPath, JSON.stringify(meta, null, 2)) }
  function loadGroupMeta () { return existsSync(groupMetaPath) ? JSON.parse(readFileSync(groupMetaPath, 'utf8')) : null }

  async function startLedger ({ invite, secretHex, topic, bootstrap, meta }) {
    const store = new Corestore(join(baseDir, 'store', meta.id))
    const base = await openLedger(store, bootstrap || null)
    let swarm = null
    if (enableSwarm) {
      try {
        const res = await Promise.race([
          joinSwarm(topic, store),
          new Promise((resolve) => setTimeout(() => resolve(null), 8000)) // best-effort; don't hang
        ])
        swarm = res?.swarm ? res : null
      } catch (e) { /* offline-capable: ledger still works locally */ }
    }

    ledger = { store, base, swarm, group: meta }

    // Periodically pull updates so SSE pushes converge across peers.
    base.update().catch(() => {})
    const timer = setInterval(() => { base.update().then(emit).catch(() => {}) }, 1500)
    ledger.timer = timer
    return ledger
  }

  async function doCreateGroup ({ name, member }) {
    await teardownLedger()
    await ensureWallet()
    const { topic, inviteCode } = createGroup()
    const id = b4a.toString(crypto.randomBytes(8), 'hex')
    memberId = b4a.toString(crypto.randomBytes(8), 'hex')
    memberName = member || 'Me'
    const store = new Corestore(join(baseDir, 'store', id))
    const base = await openLedger(store, null)
    const bootstrap = bootstrapKey(base)
    const invite = `${inviteCode}:${bootstrap}`
    const meta = { id, name: name || 'Group', invite, bootstrap, secretHex: inviteCode, memberId, memberName, creator: true }
    await base.close(); await store.close()

    const joined = joinGroup(inviteCode)
    await startLedger({ invite, secretHex: inviteCode, topic: joined.topic, bootstrap, meta })
    persistGroup(meta)

    // Creator is the initial writer — publish our member + wallet address.
    await publishMembership()
    emit()
    return groupState()
  }

  async function doJoinGroup ({ invite, member }) {
    await teardownLedger()
    await ensureWallet()
    const [secretHex, bootstrap] = String(invite).split(':')
    if (!secretHex || !bootstrap) throw new Error('Invalid invite (expected "<secret>:<bootstrap>").')
    const { topic } = joinGroup(secretHex)
    const id = b4a.toString(crypto.randomBytes(8), 'hex')
    memberId = b4a.toString(crypto.randomBytes(8), 'hex')
    memberName = member || 'Me'
    const meta = { id, name: 'Group', invite, bootstrap, secretHex, memberId, memberName, creator: false }
    await startLedger({ invite, secretHex, topic, bootstrap, meta })
    persistGroup(meta)
    emit()
    return groupState()
  }

  async function publishMembership () {
    if (!ledger || !isWritable(ledger.base)) return
    await ensureWallet()
    const ts = Date.now()
    await appendEntry(ledger.base, { type: 'wallet', member: memberId, name: memberName, chain: 'ethereum', address: wallet?.address ?? null, ts })
    await ledger.base.update()
  }

  async function doAddExpense ({ payer, amountMinor, description, participants, split }) {
    if (!ledger) throw new Error('No active group.')
    if (!isWritable(ledger.base)) throw new Error('This device is not yet an authorized writer. Ask a member to approve your writer key.')
    const id = b4a.toString(crypto.randomBytes(8), 'hex')
    const entry = makeExpense({
      id,
      payer: payer || memberId,
      amountMinor: Number(amountMinor),
      description: description || '',
      participants,
      split: split || 'equal',
      ts: Date.now()
    })
    await appendEntry(ledger.base, entry)
    await ledger.base.update()
    emit()
    return groupState()
  }

  async function doApproveWriter ({ writerKey }) {
    if (!ledger) throw new Error('No active group.')
    if (!isWritable(ledger.base)) throw new Error('Only an authorized writer can approve members.')
    if (!/^[0-9a-fA-F]{64}$/.test(String(writerKey).trim())) throw new Error('Writer key must be 64 hex chars.')
    await addWriter(ledger.base, writerKey.trim())
    await ledger.base.update()
    emit()
    return groupState()
  }

  /** Record a payment entry (after an on-chain transfer). Idempotent on txHash downstream. */
  async function doRecordPayment ({ from, to, amountMinor, txHash }) {
    if (!ledger) throw new Error('No active group.')
    const entry = makePayment({ id: b4a.toString(crypto.randomBytes(8), 'hex'), from, to, amountMinor: Number(amountMinor), txHash, ts: Date.now() })
    await appendEntry(ledger.base, entry)
    await ledger.base.update()
    emit()
    return groupState()
  }

  /** Resolve a member's published on-chain address from the ledger. */
  async function creditorAddress (memberId) {
    const entries = await readLedger(ledger.base)
    let addr = null
    for (const e of entries) if (e.type === 'wallet' && e.member === memberId && e.address) addr = e.address
    return addr
  }

  /**
   * Phase 4 — the loop: settle a debt on-chain, then record it in the ledger so every peer
   * sees it cleared. `to` is the creditor's memberId; `amountMinor` is ledger minor units.
   * Online-only (FR-13): the USD₮ transfer writes to a blockchain.
   */
  async function doSettle ({ to, amountMinor }) {
    if (!ledger) throw new Error('No active group.')
    if (!isWritable(ledger.base)) throw new Error('This device is not an authorized writer yet.')
    await ensureWallet()
    if (!wallet) throw new Error(`Wallet unavailable: ${walletError || 'unknown'}`)

    const address = await creditorAddress(to)
    if (!address) throw new Error('Creditor has not published a wallet address yet.')

    // Real on-chain USD₮ transfer (needs the internet — this is the online-only step).
    const { hash } = await sendUsdt(wallet, address, Number(amountMinor))

    // Record the settlement so the debt clears for everyone once replicated. Idempotent on hash.
    await doRecordPayment({ from: memberId, to, amountMinor: Number(amountMinor), txHash: hash })
    return { txHash: hash, state: await groupState() }
  }

  async function groupState () {
    if (!ledger) return { active: false }
    const entries = await readLedger(ledger.base)
    const net = computeBalances(entries)
    const plan = settlementPlan(net)
    const members = {}
    for (const e of entries) {
      if (e.type === 'wallet') members[e.member] = { id: e.member, name: e.name || e.member, address: e.address }
    }
    return {
      active: true,
      group: { name: ledger.group.name, invite: ledger.group.invite, creator: ledger.group.creator },
      me: { memberId, memberName, writable: isWritable(ledger.base), writerKey: localWriterKey(ledger.base) },
      members,
      entries,
      balances: net,
      plan,
      peers: ledger.swarm ? ledger.swarm.swarm.connections.size : 0
    }
  }

  async function teardownLedger () {
    if (!ledger) return
    try { clearInterval(ledger.timer) } catch {}
    try { if (ledger.swarm) await ledger.swarm.destroy() } catch {}
    try { await ledger.base.close() } catch {}
    try { await ledger.store.close() } catch {}
    ledger = null
  }

  async function fullState () {
    return { wallet: await walletStatus(), group: await groupState() }
  }

  async function restore () {
    const meta = loadGroupMeta()
    if (!meta) return
    try {
      memberId = meta.memberId; memberName = meta.memberName
      const { topic } = joinGroup(meta.secretHex)
      await startLedger({ invite: meta.invite, secretHex: meta.secretHex, topic, bootstrap: meta.bootstrap, meta })
    } catch (e) { /* ignore restore errors */ }
  }

  function subscribe (fn) { listeners.add(fn); return () => listeners.delete(fn) }

  return {
    fullState,
    walletStatus,
    groupState,
    createGroup: doCreateGroup,
    joinGroup: doJoinGroup,
    addExpense: doAddExpense,
    approveWriter: doApproveWriter,
    recordPayment: doRecordPayment,
    settle: doSettle,
    subscribe,
    restore,
    teardown: teardownLedger
  }
}

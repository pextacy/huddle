/**
 * Multi-writer ledger: Autobase + Hyperbee view (docs/docs.md §6.3).
 *
 * Verified against the installed autobase@7.28.1 API:
 *   new Autobase(store, bootstrap, { open, apply, valueEncoding })
 *   apply(nodes, view, host): host.addWriter(key, { indexer: true }); view.put(key, value)
 *   base.append(value) · base.update() · base.view (the Hyperbee) · base.local.key · base.key
 *
 * The `apply` function is pure and deterministic — no Date.now(), no iteration-order
 * assumptions. Entries are stored under a stable, sortable key so every peer's Hyperbee view
 * is byte-for-byte identical (docs/claude.md determinism). Persisted via Corestore, so the
 * ledger survives an app restart.
 */

import Autobase from 'autobase'
import Hyperbee from 'hyperbee'
import b4a from 'b4a'
import { validateEntry } from '../domain/entries.js'

/** Pad a timestamp so string keys sort in chronological order. */
function tsKey (ts) {
  return String(ts ?? 0).padStart(16, '0')
}

/** Stable, sortable Hyperbee key for an entry. */
function entryKey (op) {
  const id = op.id ?? op.member ?? op.key ?? ''
  return `${op.type}:${tsKey(op.ts)}:${id}`
}

// Internal binding records live under a NUL-prefixed key namespace. Real entry keys always start
// with a type name (e.g. "expense:"), never NUL, so readLedger cleanly filters bindings out and a
// crafted entry can never collide with the binding namespace.
const BIND_PREFIX = '\x00bind:' // writerKeyHex -> { key, member }
const MEMBER_PREFIX = '\x00member:' // memberId    -> { key, member }

// Entry types whose member field is an assertion of the APPENDER's OWN identity. These are bound to
// the writer that produced them, so a peer cannot publish another member's wallet address (and
// redirect their settlement), nudge, or comment as them. Fields that legitimately name a DIFFERENT
// member (expense.payer — "Bob paid"; payment.from on a recorded-received settlement) are NOT here.
const IDENTITY_FIELD = { wallet: 'member', comment: 'by', reminder: 'from' }

function open (store) {
  return new Hyperbee(store.get('ledger-view'), {
    keyEncoding: 'utf-8',
    valueEncoding: 'json'
  })
}

async function apply (nodes, view, host) {
  for (const node of nodes) {
    const op = node.value
    if (!op || typeof op !== 'object') continue
    // The writer core that produced this node — the cryptographic identity behind the entry.
    const fromKey = node.from && node.from.key ? b4a.toString(node.from.key, 'hex') : null

    // Authorize a new writer (a member joining the group). Only act on a well-formed hex key —
    // ignore a malformed authorize op rather than letting b4a.from throw and stall the base.
    if (op.type === 'addWriter') {
      if (typeof op.key === 'string' && /^[0-9a-fA-F]+$/.test(op.key) && op.key.length % 2 === 0) {
        try { await host.addWriter(b4a.from(op.key, 'hex'), { indexer: true }) } catch { /* skip bad key */ }
      }
      continue
    }

    // Self-asserted writerKey<->memberId binding. A writer may only bind ITSELF (op.key must equal
    // the producing writer), and only when neither the writer nor the member id is already bound —
    // first assertion wins, so a member id can't be stolen and a writer can't rebind to impersonate.
    if (op.type === 'member') {
      if (!fromKey || typeof op.key !== 'string' || op.key !== fromKey) continue
      if (typeof op.member !== 'string' || op.member.length === 0) continue
      const byKey = await view.get(BIND_PREFIX + fromKey)
      const byMember = await view.get(MEMBER_PREFIX + op.member)
      if (byKey && byKey.value && byKey.value.member !== op.member) continue
      if (byMember && byMember.value && byMember.value.key !== fromKey) continue
      const rec = { key: fromKey, member: op.member }
      await view.put(BIND_PREFIX + fromKey, rec)
      await view.put(MEMBER_PREFIX + op.member, rec)
      continue
    }

    // Validate EVERY replicated entry before it enters the shared view. Peers are semi-trusted
    // writers; a malformed or malicious entry (negative/huge amount, wrong type, bad split) must
    // never reach computeBalances and corrupt the group's balances. validateEntry is pure and
    // deterministic, so every peer independently drops exactly the same invalid entries and the
    // views stay byte-for-byte identical (docs/claude.md determinism + money correctness).
    try { validateEntry(op) } catch { continue }

    // Identity ownership: an entry asserting the appender's OWN member id (wallet address publish,
    // comment author, nudge sender) is honored only if that member is the one cryptographically
    // bound to the producing writer. This closes the settlement-redirect attack (a peer publishing
    // another member's wallet address) without constraining fields that name a different member.
    const idField = IDENTITY_FIELD[op.type]
    if (idField) {
      if (!fromKey) continue
      const bind = await view.get(BIND_PREFIX + fromKey)
      if (!bind || !bind.value || bind.value.member !== op[idField]) continue
    }

    await view.put(entryKey(op), op)
  }
}

/**
 * Open (or create) the ledger Autobase over a Corestore.
 * @param {object} store - a Corestore
 * @param {Buffer|string|null} [bootstrap] - the group's base key (hex or buffer) to join an
 *   existing ledger, or null to create a new one (the group creator).
 * @param {{ ackInterval?: number }} [opts] - ackInterval (ms) lets indexers eagerly merge
 *   causal forks so peers converge promptly (default 1000).
 * @returns {Promise<object>} the ready Autobase
 */
export async function openLedger (store, bootstrap = null, opts = {}) {
  const key = typeof bootstrap === 'string' ? b4a.from(bootstrap, 'hex') : bootstrap
  const base = new Autobase(store, key, {
    open,
    apply,
    valueEncoding: 'json',
    ackInterval: opts.ackInterval ?? 1000
  })
  await base.ready()
  return base
}

/** Append a ledger entry from this peer (triggers apply + replication). */
export async function appendEntry (base, entry) {
  await base.append(entry)
}

/**
 * Authorize another member's writer key so their appends count in the view.
 * @param {object} base
 * @param {string} writerKeyHex - the joining member's base.local.key in hex
 */
export async function addWriter (base, writerKeyHex) {
  await base.append({ type: 'addWriter', key: writerKeyHex })
}

/** Read the whole ledger view as an array of entries, in key order (binding records excluded). */
export async function readLedger (base) {
  await base.update()
  const entries = []
  for await (const { key, value } of base.view.createReadStream()) {
    if (typeof key === 'string' && key.charCodeAt(0) === 0) continue // \x00-prefixed binding record
    entries.push(value)
  }
  return entries
}

/**
 * Publish this writer's identity binding: "the writer that appends this IS memberId". apply only
 * honors it because the producing writer matches op.key, and only once per member/writer — so it
 * lets peers verify that later wallet/comment/reminder entries claiming `memberId` really came from
 * this device. Must be appended BEFORE the first identity entry (wallet address publish).
 */
export async function publishBinding (base, memberId) {
  await base.append({ type: 'member', member: memberId, key: localWriterKey(base) })
}

/** Whether this member id already has a binding record in the view (seed to avoid re-publishing). */
export async function hasBinding (base, memberId) {
  try {
    await base.update()
    const rec = await base.view.get(MEMBER_PREFIX + memberId)
    return !!(rec && rec.value)
  } catch { return false }
}

/** This peer's writer key (hex) — share it so an existing writer can addWriter() it. */
export function localWriterKey (base) {
  return b4a.toString(base.local.key, 'hex')
}

/** The group's bootstrap key (hex) — share it (with the invite) so peers join the same ledger. */
export function bootstrapKey (base) {
  return b4a.toString(base.key, 'hex')
}

/** Whether this peer is currently allowed to write to the ledger. */
export function isWritable (base) {
  return base.writable
}

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

    // Authorize a new writer (a member joining the group). Only act on a well-formed hex key —
    // ignore a malformed authorize op rather than letting b4a.from throw and stall the base.
    if (op.type === 'addWriter') {
      if (typeof op.key === 'string' && /^[0-9a-fA-F]+$/.test(op.key) && op.key.length % 2 === 0) {
        try { await host.addWriter(b4a.from(op.key, 'hex'), { indexer: true }) } catch { /* skip bad key */ }
      }
      continue
    }

    // Validate EVERY replicated entry before it enters the shared view. Peers are semi-trusted
    // writers; a malformed or malicious entry (negative/huge amount, wrong type, bad split) must
    // never reach computeBalances and corrupt the group's balances. validateEntry is pure and
    // deterministic, so every peer independently drops exactly the same invalid entries and the
    // views stay byte-for-byte identical (docs/claude.md determinism + money correctness).
    try { validateEntry(op) } catch { continue }
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

/** Read the whole ledger view as an array of entries, in key order. */
export async function readLedger (base) {
  await base.update()
  const entries = []
  for await (const { value } of base.view.createReadStream()) entries.push(value)
  return entries
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

/**
 * Multi-writer ledger: Autobase + Hyperbee view (docs/docs.md §6.3).
 *
 * The Autobase `apply` function folds writer entries into a Hyperbee key/value view that
 * is identical on every peer. `apply` must be pure and deterministic: no Date.now(), no
 * iteration-order assumptions (docs/claude.md). Persisted via Corestore (survives restart).
 *
 * NOTE: the Autobase apply/host signature shifts across releases — verify against the
 * installed version's README (docs/docs.md §6.3 note).
 *
 * Implemented in Phase 3. See docs/phases.md.
 */

/** @param {object} store @param {Buffer|null} bootstrap @returns {Promise<object>} */
export async function openLedger (store, bootstrap) {
  throw new Error('not implemented yet — Phase 3')
}

/** @param {object} base @param {object} entry @returns {Promise<void>} */
export async function appendEntry (base, entry) {
  throw new Error('not implemented yet — Phase 3')
}

/** @param {object} base @returns {Promise<object[]>} */
export async function readLedger (base) {
  throw new Error('not implemented yet — Phase 3')
}

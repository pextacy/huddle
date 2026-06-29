/**
 * Ledger entry types + validation (pure, deterministic — no I/O).
 *
 * Entry shapes (see docs/docs.md §5): 'addWriter' | 'wallet' | 'expense' | 'payment'.
 * Money is always stored as integer minor units — never floats (docs/claude.md).
 *
 * Implemented in Phase 2. See docs/phases.md.
 */

/** @typedef {'addWriter'|'wallet'|'expense'|'payment'} EntryType */

export const ENTRY_TYPES = /** @type {const} */ (['addWriter', 'wallet', 'expense', 'payment'])

/**
 * Validate a ledger entry. Throws on malformed input.
 * @param {object} entry
 * @returns {object} the validated entry
 */
export function validateEntry (entry) {
  throw new Error('not implemented yet — Phase 2')
}

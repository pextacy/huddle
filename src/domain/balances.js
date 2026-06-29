/**
 * Net balance computation (pure, deterministic — no I/O).
 *
 * computeBalances(entries) -> { memberId: netMinorUnits }
 *   positive = is owed, negative = owes. Equal-split remainders distributed
 *   deterministically (docs/docs.md §7.1). Integer minor units only.
 *
 * Implemented in Phase 2. See docs/phases.md.
 */

/**
 * @param {object[]} entries
 * @returns {Record<string, number>} net balance per member, in minor units
 */
export function computeBalances (entries) {
  throw new Error('not implemented yet — Phase 2')
}

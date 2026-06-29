/**
 * Minimal-transfer settlement plan (pure, deterministic — no I/O).
 *
 * settlementPlan(net) -> [{ from, to, amountMinor }]
 *   greedy min-cash-flow: the smallest set of transfers that clears all debts
 *   (docs/docs.md §7.2). 5-person trip -> typically 3-4 transfers.
 *
 * Implemented in Phase 2. See docs/phases.md.
 */

/**
 * @param {Record<string, number>} net  net balance per member (minor units)
 * @returns {{from: string, to: string, amountMinor: number}[]}
 */
export function settlementPlan (net) {
  throw new Error('not implemented yet — Phase 2')
}

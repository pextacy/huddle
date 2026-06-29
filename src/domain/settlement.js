/**
 * Minimal-transfer settlement plan (pure, deterministic — no I/O; docs/docs.md §7.2).
 *
 * settlementPlan(net) -> [{ from, to, amountMinor }]
 *   greedy min-cash-flow: repeatedly settle the largest debtor against the largest creditor.
 *   This collapses a tangle of pairwise IOUs into a small set of transfers (a 5-person trip
 *   typically goes from up to ~20 pairwise debts down to 3-4 transfers).
 *
 * Determinism: creditors/debtors are sorted by amount descending, with a stable tie-break by
 * memberId. The plan is therefore independent of the order `net`'s keys were inserted — every
 * peer computes the identical plan. Integer minor units throughout.
 */

/**
 * @param {Record<string, number>} net  net balance per member (minor units; + owed, - owes)
 * @returns {{from: string, to: string, amountMinor: number}[]}
 */
export function settlementPlan (net) {
  const creditors = []
  const debtors = []
  for (const m of Object.keys(net)) {
    const v = net[m]
    if (v > 0) creditors.push({ m, v })
    else if (v < 0) debtors.push({ m, v: -v })
  }

  // Largest first; ties broken by memberId so the result is fully deterministic.
  const byAmountThenId = (a, b) => (b.v - a.v) || (a.m < b.m ? -1 : a.m > b.m ? 1 : 0)
  creditors.sort(byAmountThenId)
  debtors.sort(byAmountThenId)

  const transfers = []
  let i = 0 // debtor index
  let j = 0 // creditor index
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].v, creditors[j].v)
    if (pay > 0) {
      transfers.push({ from: debtors[i].m, to: creditors[j].m, amountMinor: pay })
    }
    debtors[i].v -= pay
    creditors[j].v -= pay
    if (debtors[i].v === 0) i++
    if (creditors[j].v === 0) j++
  }
  return transfers
}

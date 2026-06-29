/**
 * Net balance computation (pure, deterministic — no I/O, no floats; docs/docs.md §7.1).
 *
 * computeBalances(entries) -> { memberId: netMinorUnits }
 *   positive = is owed, negative = owes. Integer minor units only. Equal-split remainders
 *   are distributed deterministically (first participants in array order each get +1 cent),
 *   so every peer derives an identical view.
 *
 * Payments are idempotent on their on-chain tx hash: a replicated/retried payment with a
 * tx hash already seen is ignored, so settlement is never double-counted (docs/claude.md).
 */

/**
 * Compute each participant's share of an expense, in integer minor units.
 *  - 'equal': floor split, with the integer remainder handed to the first `rem` participants
 *    in `participants` order (deterministic, sums exactly to amountMinor).
 *  - custom: the explicit { memberId: minorUnits } map (already sums to amountMinor).
 * @param {object} expense
 * @returns {Record<string, number>}
 */
export function splitShares (expense) {
  if (expense.split === 'equal') {
    const parts = expense.participants
    const n = parts.length
    const base = Math.floor(expense.amountMinor / n)
    const rem = expense.amountMinor - base * n // 0 <= rem < n
    const out = {}
    parts.forEach((m, i) => { out[m] = base + (i < rem ? 1 : 0) })
    return out
  }
  return { ...expense.split }
}

/**
 * Fold ledger entries into net balances per member.
 * @param {object[]} entries  ledger entries in linearized order
 * @returns {Record<string, number>}  net balance per member, in minor units (sums to 0)
 */
export function computeBalances (entries) {
  const net = {}
  const add = (m, v) => { net[m] = (net[m] ?? 0) + v }
  const seenTx = new Set()

  for (const e of entries) {
    if (e.type === 'expense') {
      const shares = splitShares(e)
      add(e.payer, e.amountMinor) // payer fronted the whole cost
      for (const m of Object.keys(shares)) add(m, -shares[m]) // each participant owes their share
    } else if (e.type === 'payment') {
      if (seenTx.has(e.txHash)) continue // idempotent on tx hash — never double-count
      seenTx.add(e.txHash)
      add(e.from, e.amountMinor) // paying down what you owe raises your balance toward zero
      add(e.to, -e.amountMinor)
    }
    // 'wallet' and 'addWriter' entries have no effect on balances
  }
  return net
}

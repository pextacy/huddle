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
 * Distribute `amountMinor` across participants by integer weights, exactly, deterministically.
 * Uses the largest-remainder method: floor each proportional share, then hand the leftover cents
 * one-by-one to the largest fractional remainders (ties broken by `participants` order). The result
 * always sums to `amountMinor`, so every peer derives the identical split from the stored weights.
 *
 * @param {number} amountMinor  total to distribute (positive integer)
 * @param {string[]} participants  order-defining list (tie-break for leftover cents)
 * @param {Record<string, number>} weights  positive integer weight per participant
 * @returns {Record<string, number>}
 */
export function weightedShares (amountMinor, participants, weights) {
  const totalWeight = participants.reduce((s, m) => s + weights[m], 0)
  const out = {}
  const rema = [] // { m, frac } to rank leftover-cent recipients
  let assigned = 0
  for (const m of participants) {
    const exact = amountMinor * weights[m] // integer numerator; divide by totalWeight
    const base = Math.floor(exact / totalWeight)
    out[m] = base
    assigned += base
    rema.push({ m, frac: exact - base * totalWeight }) // remainder numerator (0..totalWeight)
  }
  let leftover = amountMinor - assigned // 0 <= leftover < participants.length
  // Largest remainder first; ties keep participants order (stable index tiebreak) for determinism.
  const order = participants.map((m, i) => i)
  order.sort((a, b) => (rema[b].frac - rema[a].frac) || (a - b))
  for (let k = 0; k < leftover; k++) out[rema[order[k]].m] += 1
  return out
}

/**
 * Compute each participant's share of an expense, in integer minor units.
 *  - 'equal': floor split, with the integer remainder handed to the first `rem` participants
 *    in `participants` order (deterministic, sums exactly to amountMinor).
 *  - weighted { kind:'percent'|'shares', weights }: proportional shares via largest-remainder.
 *  - custom map: the explicit { memberId: minorUnits } map (already sums to amountMinor).
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
  if (expense.split && typeof expense.split.kind === 'string') {
    return weightedShares(expense.amountMinor, expense.participants, expense.split.weights)
  }
  return { ...expense.split }
}

/**
 * The set of expense ids that have been voided (deleted, or superseded by an edit). A later `void`
 * entry with `target: <expenseId>` cancels that expense's effect on balances and insights.
 * @param {object[]} entries
 * @returns {Set<string>}
 */
export function voidedIds (entries) {
  const voided = new Set()
  for (const e of entries) if (e && e.type === 'void' && e.target) voided.add(e.target)
  return voided
}

/**
 * Fold ledger entries into net balances per member.
 * @param {object[]} entries  ledger entries in linearized order
 * @returns {Record<string, number>}  net balance per member, in minor units (sums to 0)
 */
export function computeBalances (entries) {
  const net = {}
  const add = (m, v) => { net[m] = (net[m] ?? 0) + v }
  const seen = new Set()
  const voided = voidedIds(entries)

  for (const e of entries) {
    if (e.type === 'expense') {
      if (voided.has(e.id)) continue // deleted/edited-away — no effect on balances
      const shares = splitShares(e)
      add(e.payer, e.amountMinor) // payer fronted the whole cost
      for (const m of Object.keys(shares)) add(m, -shares[m]) // each participant owes their share
    } else if (e.type === 'payment') {
      // Idempotent per settlement: on-chain payments dedup on their tx hash; off-chain "cash"
      // settlements (no tx hash) dedup on their entry id. Never double-count a replicated payment.
      const key = e.txHash || `id:${e.id}`
      if (seen.has(key)) continue
      seen.add(key)
      add(e.from, e.amountMinor) // paying down what you owe raises your balance toward zero
      add(e.to, -e.amountMinor)
    }
    // 'wallet', 'addWriter', 'fee', 'void', and 'comment' entries have no direct additive effect
    // here. ('fee' is platform revenue to the treasury — src/domain/fees.js; 'void' is handled
    // above; 'comment' is a purely social thread on an expense — src/domain/entries.js.)
  }
  return net
}

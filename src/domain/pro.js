/**
 * Pro subscription — the second revenue stream (pure, deterministic; no I/O, no floats).
 *
 * SplitKick+ is freemium: casual users pay a 0.50% fee per on-chain settlement (src/domain/fees.js),
 * while **Pro** subscribers pay a flat monthly USD₮ subscription to the platform treasury and settle
 * with **no per-settle fee**. Both streams are revenue to the same treasury; this module owns only
 * the pure time math — "is the subscription still active?" and "extend it by N months" — so it stays
 * trivially testable. The on-chain payment + persistence live in the bridge.
 *
 * A subscription is a `{ until, ... }` record; it is active while `until` is in the future. Extending
 * stacks from the later of "now" or the current expiry, so paying early never burns remaining time.
 */

/** Subscription month length in ms (fixed 30 days — deterministic, no calendar math). */
export const MONTH_MS = 30 * 24 * 60 * 60 * 1000

/** Hard cap on months purchasable in one transaction (sanity bound on the on-chain charge). */
export const MAX_MONTHS = 36

/**
 * @param {{ until?: number } | null | undefined} pro  the stored subscription record
 * @param {number} now  current epoch ms (supplied by the caller — no Date.now here)
 * @returns {boolean}
 */
export function isProActive (pro, now) {
  return !!(pro && Number.isFinite(pro.until) && pro.until > now)
}

/**
 * Extend (or start) a subscription by `months`, stacking from the later of now or current expiry.
 * @param {{ until?: number, subscriptionRevenueMinor?: number } | null} pro  prior record (or null)
 * @param {number} months  whole months to add (1..MAX_MONTHS)
 * @param {number} now  current epoch ms
 * @param {string} txHash  on-chain payment hash (audit trail)
 * @param {number} priceMinor  amount paid for this extension, in minor units
 * @returns {{ until: number, txHash: string, lastPaidMinor: number, subscriptionRevenueMinor: number, updatedAt: number }}
 */
export function extendPro (pro, months, now, txHash, priceMinor) {
  const m = Number(months)
  if (!Number.isSafeInteger(m) || m <= 0 || m > MAX_MONTHS) {
    throw new Error(`months must be a whole number between 1 and ${MAX_MONTHS} (got ${months}).`)
  }
  const price = Number(priceMinor)
  if (!Number.isSafeInteger(price) || price <= 0) throw new Error('priceMinor must be a positive integer.')
  const base = isProActive(pro, now) ? pro.until : now
  const priorRevenue = pro && Number.isSafeInteger(pro.subscriptionRevenueMinor) ? pro.subscriptionRevenueMinor : 0
  return {
    until: base + m * MONTH_MS,
    txHash,
    lastPaidMinor: price,
    subscriptionRevenueMinor: priorRevenue + price,
    updatedAt: now
  }
}

/**
 * Platform settlement fee — the revenue model (pure, deterministic; no I/O, no floats).
 *
 * SplitKick+ earns a small fee on every on-chain USD₮ settlement, skimmed to a platform
 * treasury wallet. The fee is charged **on top** of the debt: the creditor always receives the
 * full amount they are owed (so the group ledger clears exactly), and the payer additionally
 * sends `feeMinor` to the treasury. Total out-of-pocket for the payer is `amountMinor + feeMinor`.
 *
 * Charging on top (rather than skimming from the creditor's amount) keeps the domain math clean:
 * `computeBalances` never has to know about fees, and a settlement still zeroes the debt exactly.
 *
 * All amounts are integer minor units (cents). The fee is `floor(amount * bps / 10000)`, clamped
 * to an optional [minMinor, maxMinor] band, and can never exceed the principal itself.
 */

/** Default platform fee: 0.50% (50 basis points). */
export const DEFAULT_FEE_BPS = 50

/** Basis-point denominator: 10000 bps = 100%. */
export const BPS_DENOMINATOR = 10000

/**
 * @typedef {object} FeePolicy
 * @property {boolean} [enabled]   when false (e.g. no treasury configured) the fee is always 0
 * @property {number}  [bps]       fee in basis points (50 = 0.50%)
 * @property {number}  [minMinor]  minimum fee per settle, in minor units (default 0)
 * @property {number}  [maxMinor]  optional cap on the fee per settle, in minor units
 */

/**
 * Compute the on-chain fee for settling `amountMinor` of debt under a fee policy.
 *
 * @param {number} amountMinor  the debt being settled, in integer minor units (> 0)
 * @param {FeePolicy} [policy]
 * @returns {{ amountMinor: number, feeMinor: number, totalMinor: number, feeBps: number }}
 *   `amountMinor` goes to the creditor, `feeMinor` to the treasury, `totalMinor` is the payer's
 *   total spend (`amountMinor + feeMinor`).
 */
export function computeSettlement (amountMinor, policy = {}) {
  const amount = Number(amountMinor)
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error(`settle amount must be a positive whole number of minor units (got ${amountMinor}).`)
  }
  const bps = Number.isSafeInteger(policy.bps) ? policy.bps : DEFAULT_FEE_BPS
  if (bps < 0 || bps > BPS_DENOMINATOR) throw new Error(`fee bps out of range: ${bps}`)

  // `enabled` (i.e. a treasury is configured) is the on/off switch — not `bps`. This lets a
  // flat-fee policy (bps=0, minMinor>0) still collect the floor; the percentage line just
  // contributes 0 when bps is 0.
  let feeMinor = 0
  if (policy.enabled) {
    if (bps > 0) feeMinor = Math.floor((amount * bps) / BPS_DENOMINATOR)
    if (Number.isSafeInteger(policy.minMinor) && policy.minMinor > 0) feeMinor = Math.max(feeMinor, policy.minMinor)
    if (Number.isSafeInteger(policy.maxMinor) && policy.maxMinor >= 0) feeMinor = Math.min(feeMinor, policy.maxMinor)
    // A fee larger than the debt itself is never sensible — clamp as a final safety net.
    if (feeMinor > amount) feeMinor = amount
  }
  return { amountMinor: amount, feeMinor, totalMinor: amount + feeMinor, feeBps: bps }
}

/**
 * Fold ledger entries into total platform revenue (sum of `fee` entries), idempotent on the
 * on-chain fee tx hash so a replicated/retried fee is never double-counted.
 *
 * @param {object[]} entries  ledger entries in linearized order
 * @returns {{ feesMinor: number, count: number }}
 */
export function platformRevenue (entries) {
  let feesMinor = 0
  let count = 0
  const seen = new Set()
  for (const e of entries) {
    if (!e || e.type !== 'fee') continue
    if (e.txHash) {
      if (seen.has(e.txHash)) continue
      seen.add(e.txHash)
    }
    feesMinor += e.amountMinor
    count++
  }
  return { feesMinor, count }
}

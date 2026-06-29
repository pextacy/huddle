/**
 * Self-custodial wallet via Tether WDK (docs/docs.md §8).
 *
 * Generates/loads a seed phrase (kept ONLY in device secure storage — never logged,
 * never written to the ledger, never replicated; docs/claude.md). Reads address/balance
 * and sends a real testnet USD₮ (ERC-20) transfer, returning the on-chain tx hash.
 *
 * Minor units -> token's 6-decimal big-int unit conversion happens ONLY here, at the WDK
 * boundary.
 *
 * Implemented in Phase 1. See docs/phases.md.
 */

/** @param {{ seedPhrase?: string, provider: string }} opts @returns {Promise<object>} */
export async function initWallet (opts) {
  throw new Error('not implemented yet — Phase 1')
}

/** @param {object} wallet @returns {Promise<string>} 0x address */
export async function getAddress (wallet) {
  throw new Error('not implemented yet — Phase 1')
}

/** @param {object} wallet @returns {Promise<bigint>} USD₮ balance in token units */
export async function getBalance (wallet) {
  throw new Error('not implemented yet — Phase 1')
}

/**
 * @param {object} wallet
 * @param {string} to creditor address
 * @param {bigint} amountTokenUnits USD₮ amount in 6-decimal token units
 * @returns {Promise<string>} on-chain tx hash
 */
export async function sendUsdt (wallet, to, amountTokenUnits) {
  throw new Error('not implemented yet — Phase 1')
}

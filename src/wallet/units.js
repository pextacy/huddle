/**
 * Money unit conversion at the WDK boundary (pure, deterministic — no I/O, no floats).
 *
 * Two integer representations exist (docs/claude.md money rules):
 *   - LEDGER minor units: integer cents (2 decimals). 50.00 USD -> 5000.
 *   - USD₮ on-chain base units: 6 decimals. 50.00 USD₮ -> 50_000000n.
 *
 * Conversion happens ONLY here. Everything in /src/domain stays in ledger minor units;
 * everything that touches the chain uses USD₮ base units (bigint).
 */

export const LEDGER_DECIMALS = 2
export const USDT_DECIMALS = 6

/** Multiplier between ledger minor units (cents) and USD₮ base units: 10^(6-2) = 10000. */
export const MINOR_TO_BASE = 10n ** BigInt(USDT_DECIMALS - LEDGER_DECIMALS)

/**
 * Ledger minor units (integer cents) -> USD₮ on-chain base units (bigint, 6 decimals).
 * @param {number|bigint} minorUnits
 * @returns {bigint}
 */
export function toUsdtBaseUnits (minorUnits) {
  const m = BigInt(minorUnits)
  return m * MINOR_TO_BASE
}

/**
 * USD₮ base units -> ledger minor units. Sub-cent dust is returned separately so callers
 * never silently lose or round money.
 * @param {bigint} baseUnits
 * @returns {{ minorUnits: bigint, remainderBase: bigint }}
 */
export function fromUsdtBaseUnits (baseUnits) {
  const b = BigInt(baseUnits)
  return { minorUnits: b / MINOR_TO_BASE, remainderBase: b % MINOR_TO_BASE }
}

/**
 * Parse a human USD₮ decimal string (e.g. "1.50", "0.25") into ledger minor units (cents).
 * Integer-only parsing — never uses parseFloat. Rejects more precision than 2 decimals.
 * @param {string} text
 * @returns {bigint} minor units (cents)
 */
export function parseUsdtToMinor (text) {
  const s = String(text).trim()
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error(`Invalid USD₮ amount: "${text}"`)
  const [whole, frac = ''] = s.split('.')
  if (frac.length > LEDGER_DECIMALS) {
    throw new Error(`USD₮ amount supports at most ${LEDGER_DECIMALS} decimals: "${text}"`)
  }
  const fracPadded = frac.padEnd(LEDGER_DECIMALS, '0')
  return BigInt(whole) * 10n ** BigInt(LEDGER_DECIMALS) + BigInt(fracPadded)
}

/**
 * Format ledger minor units (cents) as a human string, e.g. 5000 -> "50.00".
 * @param {number|bigint} minorUnits
 * @returns {string}
 */
export function formatMinor (minorUnits) {
  const m = BigInt(minorUnits)
  const neg = m < 0n
  const abs = neg ? -m : m
  const scale = 10n ** BigInt(LEDGER_DECIMALS)
  const whole = abs / scale
  const frac = (abs % scale).toString().padStart(LEDGER_DECIMALS, '0')
  return `${neg ? '-' : ''}${whole}.${frac}`
}

/**
 * Format a USD₮ base-unit amount (6 decimals) as a human string, e.g. 50_000000n -> "50.000000".
 * @param {bigint} baseUnits
 * @returns {string}
 */
export function formatUsdt (baseUnits) {
  const b = BigInt(baseUnits)
  const neg = b < 0n
  const abs = neg ? -b : b
  const scale = 10n ** BigInt(USDT_DECIMALS)
  const whole = abs / scale
  const frac = (abs % scale).toString().padStart(USDT_DECIMALS, '0')
  return `${neg ? '-' : ''}${whole}.${frac}`
}

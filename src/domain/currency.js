/**
 * Multi-currency support (pure, deterministic — no I/O, no floats).
 *
 * The group has ONE base currency; every balance and settlement is computed in it. An expense may
 * be *entered* in a foreign currency: the payer records the amount in that currency plus the FX
 * rate at entry time, and we convert to base minor units ONCE, at append (src/domain/entries.js
 * stores the converted `amountMinor`). Because the converted amount is frozen into the entry, the
 * ledger stays deterministic — a later rate change never rewrites history, and every peer agrees.
 *
 * Rates are integer "micros" (rate × 1_000_000) so the math is exact BigInt arithmetic, never a
 * float. convertMinor(originAmount, rateMicros) = round(originAmount × rate) in base minor units.
 */

/** Rate is stored as an integer scaled by 1e6 (micros): 1.083500 EUR→USD -> 1_083_500. */
export const RATE_SCALE = 1_000_000n

/**
 * A small reference list of common currencies (codes/symbols/names are facts, not fabricated
 * data). `minorDigits` is the number of fractional digits the currency's minor unit uses.
 */
export const CURRENCIES = [
  { code: 'USD', symbol: '$', name: 'US Dollar', minorDigits: 2 },
  { code: 'EUR', symbol: '€', name: 'Euro', minorDigits: 2 },
  { code: 'GBP', symbol: '£', name: 'British Pound', minorDigits: 2 },
  { code: 'TRY', symbol: '₺', name: 'Turkish Lira', minorDigits: 2 },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen', minorDigits: 0 },
  { code: 'CHF', symbol: 'Fr', name: 'Swiss Franc', minorDigits: 2 },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar', minorDigits: 2 },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', minorDigits: 2 },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee', minorDigits: 2 },
  { code: 'BRL', symbol: 'R$', name: 'Brazilian Real', minorDigits: 2 }
]

const BY_CODE = new Map(CURRENCIES.map((c) => [c.code, c]))

/** True if `code` is a supported currency code. */
export function isCurrency (code) {
  return typeof code === 'string' && BY_CODE.has(code)
}

/** The currency record for a code, or the USD record as a safe default. */
export function currencyOf (code) {
  return BY_CODE.get(code) || BY_CODE.get('USD')
}

/**
 * Convert an amount in the origin currency's minor units to base minor units at `rateMicros`,
 * with banker-free round-half-up. Exact integer/BigInt math — no floating point.
 * @param {number} originMinor  amount in the origin currency's minor units (positive integer)
 * @param {number} rateMicros  origin→base rate × 1e6 (positive integer)
 * @returns {number} amount in base minor units
 */
export function convertMinor (originMinor, rateMicros) {
  if (!Number.isSafeInteger(originMinor) || originMinor < 0) throw new Error('convertMinor: originMinor must be a non-negative integer')
  if (!Number.isSafeInteger(rateMicros) || rateMicros <= 0) throw new Error('convertMinor: rateMicros must be a positive integer')
  const num = BigInt(originMinor) * BigInt(rateMicros) + RATE_SCALE / 2n // + half for round-half-up
  return Number(num / RATE_SCALE)
}

/**
 * Parse a decimal rate string ("1.0835") into integer micros (1_083_500), without floats. Accepts
 * up to 6 fractional digits.
 * @param {string} text
 * @returns {number} rateMicros
 */
export function parseRate (text) {
  const s = String(text).trim()
  if (!/^\d+(\.\d{1,6})?$/.test(s)) throw new Error(`Bad rate: ${text}`)
  const [whole, frac = ''] = s.split('.')
  return Number(whole) * 1_000_000 + Number(frac.padEnd(6, '0'))
}

/** Format integer micros back to a trimmed decimal string ("1.0835"). */
export function formatRate (rateMicros) {
  const whole = Math.floor(rateMicros / 1_000_000)
  const frac = String(rateMicros % 1_000_000).padStart(6, '0').replace(/0+$/, '')
  return frac ? `${whole}.${frac}` : String(whole)
}

// UI-side mirror of src/domain/currency.js (kept in web/ so client components don't reach across
// the package boundary). Base currency is USD₮; a foreign expense is converted to USD at entry.

export const CURRENCIES = [
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'TRY', symbol: '₺', name: 'Turkish Lira' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
  { code: 'CHF', symbol: 'Fr', name: 'Swiss Franc' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
  { code: 'BRL', symbol: 'R$', name: 'Brazilian Real' }
]

const BY_CODE = Object.fromEntries(CURRENCIES.map((c) => [c.code, c]))

/** Symbol for a currency code (falls back to the code itself). */
export function symbolOf (code) {
  return BY_CODE[code]?.symbol || code || '$'
}

/** Convert origin minor units to base (USD) minor units at rateMicros — integer round-half-up. */
export function convertMinor (originMinor, rateMicros) {
  // Numbers here are well within 2^53 for realistic expense sizes; mirror the domain's round-half-up.
  return Math.floor((originMinor * rateMicros + 500000) / 1000000)
}

/** Parse a decimal rate string ("1.0835") into integer micros. Throws on junk / >6 dp. */
export function parseRate (text) {
  const s = String(text).trim()
  if (!/^\d+(\.\d{1,6})?$/.test(s)) throw new Error(`Bad rate: ${text}`)
  const [whole, frac = ''] = s.split('.')
  return Number(whole) * 1000000 + Number(frac.padEnd(6, '0'))
}

/** Trim integer micros to a decimal string ("1.0835"). */
export function formatRate (rateMicros) {
  const whole = Math.floor(rateMicros / 1000000)
  const frac = String(rateMicros % 1000000).padStart(6, '0').replace(/0+$/, '')
  return frac ? `${whole}.${frac}` : String(whole)
}

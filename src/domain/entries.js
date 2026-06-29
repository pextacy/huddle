/**
 * Ledger entry types + validation (pure, deterministic — no I/O, no floats).
 *
 * Entry shapes (docs/docs.md §5): 'addWriter' | 'wallet' | 'expense' | 'payment'.
 * Money is always integer minor units (cents) — never floats (docs/claude.md).
 *
 * Constructors take an explicit `ts` (set by the caller at append time) — the domain layer
 * never calls Date.now(), so the same inputs always produce the same entry on every peer.
 */

/** @typedef {'addWriter'|'wallet'|'expense'|'payment'} EntryType */

export const ENTRY_TYPES = /** @type {const} */ (['addWriter', 'wallet', 'expense', 'payment'])

function fail (msg) { throw new Error(`Invalid entry: ${msg}`) }
function isNonEmptyString (s) { return typeof s === 'string' && s.length > 0 }
function isPosInt (n) { return Number.isSafeInteger(n) && n > 0 }
function isNonNegInt (n) { return Number.isSafeInteger(n) && n >= 0 }

/**
 * Validate any ledger entry. Returns the entry on success; throws on malformed input.
 * @param {object} entry
 * @returns {object}
 */
export function validateEntry (entry) {
  if (!entry || typeof entry !== 'object') fail('not an object')
  if (!ENTRY_TYPES.includes(entry.type)) fail(`unknown type "${entry.type}"`)
  switch (entry.type) {
    case 'addWriter': return validateAddWriter(entry)
    case 'wallet': return validateWallet(entry)
    case 'expense': return validateExpense(entry)
    case 'payment': return validatePayment(entry)
    default: return fail(`unhandled type "${entry.type}"`)
  }
}

function validateAddWriter (e) {
  if (!isNonEmptyString(e.key)) fail('addWriter.key must be a hex string')
  if (!e.member || !isNonEmptyString(e.member.id)) fail('addWriter.member.id required')
  return e
}

function validateWallet (e) {
  if (!isNonEmptyString(e.member)) fail('wallet.member required')
  if (!isNonEmptyString(e.chain)) fail('wallet.chain required')
  if (!isNonEmptyString(e.address)) fail('wallet.address required')
  return e
}

function validateExpense (e) {
  if (!isNonEmptyString(e.id)) fail('expense.id required')
  if (!isNonEmptyString(e.payer)) fail('expense.payer required')
  if (!isPosInt(e.amountMinor)) fail('expense.amountMinor must be a positive integer (minor units)')
  if (!isNonEmptyString(e.currency)) fail('expense.currency required')
  if (!Array.isArray(e.participants) || e.participants.length === 0) fail('expense.participants must be a non-empty array')
  if (!e.participants.every(isNonEmptyString)) fail('expense.participants must be strings')
  if (new Set(e.participants).size !== e.participants.length) fail('expense.participants must be unique')
  if (!isPosInt(e.ts)) fail('expense.ts must be a positive integer timestamp')

  if (e.split === 'equal') {
    // ok — shares computed from participants
  } else if (e.split && typeof e.split === 'object') {
    const keys = Object.keys(e.split)
    if (keys.length === 0) fail('expense.split (custom) must have at least one share')
    const partSet = new Set(e.participants)
    let sum = 0
    for (const k of keys) {
      if (!partSet.has(k)) fail(`expense.split key "${k}" is not a participant`)
      const v = e.split[k]
      if (!isNonNegInt(v)) fail(`expense.split["${k}"] must be a non-negative integer`)
      sum += v
    }
    if (new Set(keys).size !== e.participants.length) fail('expense.split must cover exactly the participants')
    if (sum !== e.amountMinor) fail(`expense.split sums to ${sum}, expected ${e.amountMinor}`)
  } else {
    fail("expense.split must be 'equal' or a { memberId: minorUnits } object")
  }
  return e
}

function validatePayment (e) {
  if (!isNonEmptyString(e.id)) fail('payment.id required')
  if (!isNonEmptyString(e.from)) fail('payment.from required')
  if (!isNonEmptyString(e.to)) fail('payment.to required')
  if (e.from === e.to) fail('payment.from and payment.to must differ')
  if (!isPosInt(e.amountMinor)) fail('payment.amountMinor must be a positive integer (minor units)')
  if (!isNonEmptyString(e.currency)) fail('payment.currency required')
  if (!isNonEmptyString(e.txHash)) fail('payment.txHash required (idempotency key)')
  if (!isNonEmptyString(e.chain)) fail('payment.chain required')
  if (!isPosInt(e.ts)) fail('payment.ts must be a positive integer timestamp')
  return e
}

/**
 * Build a validated expense entry. `ts` is supplied by the caller (no Date.now in domain).
 * @param {{ id:string, payer:string, amountMinor:number, currency?:string, description?:string,
 *           participants:string[], split?:'equal'|Record<string,number>, ts:number }} fields
 * @returns {object}
 */
export function makeExpense (fields) {
  return validateEntry({
    type: 'expense',
    currency: 'USD',
    description: '',
    split: 'equal',
    ...fields
  })
}

/**
 * Build a validated payment entry (recorded after an on-chain transfer). `ts` from caller.
 * @param {{ id:string, from:string, to:string, amountMinor:number, currency?:string,
 *           txHash:string, chain?:string, ts:number }} fields
 * @returns {object}
 */
export function makePayment (fields) {
  return validateEntry({
    type: 'payment',
    currency: 'USDT',
    chain: 'ethereum',
    ...fields
  })
}

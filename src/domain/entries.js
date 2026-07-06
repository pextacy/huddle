/**
 * Ledger entry types + validation (pure, deterministic — no I/O, no floats).
 *
 * Entry shapes (docs/docs.md §5): 'addWriter' | 'wallet' | 'expense' | 'payment' | 'fee'.
 * Money is always integer minor units (cents) — never floats (docs/claude.md).
 *
 * 'fee' records a platform settlement fee paid on-chain to the treasury (the revenue model,
 * src/domain/fees.js). It carries its own tx hash and never affects group balances.
 *
 * Constructors take an explicit `ts` (set by the caller at append time) — the domain layer
 * never calls Date.now(), so the same inputs always produce the same entry on every peer.
 */

/** @typedef {'addWriter'|'wallet'|'expense'|'payment'|'fee'|'void'|'comment'} EntryType */

export const ENTRY_TYPES = /** @type {const} */ (['addWriter', 'wallet', 'expense', 'payment', 'fee', 'void', 'comment'])

/** Max length of a comment body (kept small so the P2P view stays lightweight). */
export const COMMENT_MAX = 500

/** Split kinds that compute shares from weights (vs. 'equal' or an explicit minor-unit map). */
export const SPLIT_KINDS = /** @type {const} */ (['percent', 'shares'])

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
    case 'fee': return validateFee(entry)
    case 'void': return validateVoid(entry)
    case 'comment': return validateComment(entry)
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
  // `category` is optional (older ledgers predate it) but, if present, must be a string —
  // src/domain/insights.js normalizes any unknown value to 'other', so we stay lenient here.
  if (e.category !== undefined && !isNonEmptyString(e.category)) fail('expense.category must be a non-empty string when present')
  if (!Array.isArray(e.participants) || e.participants.length === 0) fail('expense.participants must be a non-empty array')
  if (!e.participants.every(isNonEmptyString)) fail('expense.participants must be strings')
  if (new Set(e.participants).size !== e.participants.length) fail('expense.participants must be unique')
  if (!isPosInt(e.ts)) fail('expense.ts must be a positive integer timestamp')

  if (e.split === 'equal') {
    // ok — shares computed from participants
  } else if (e.split && typeof e.split === 'object' && typeof e.split.kind === 'string') {
    validateWeightedSplit(e) // { kind:'percent'|'shares', weights:{ memberId: weight } }
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
    fail("expense.split must be 'equal', a { memberId: minorUnits } map, or a { kind, weights } object")
  }
  return e
}

/**
 * Validate a weighted split ({ kind:'percent'|'shares', weights }). The concrete minor-unit shares
 * are derived deterministically at read time (see splitShares in balances.js) so every peer agrees;
 * here we only check the weights are well-formed and cover exactly the participants.
 *  - 'percent': positive integer weights that sum to exactly 100.
 *  - 'shares':  positive integer weights (parts) with any positive sum.
 */
function validateWeightedSplit (e) {
  if (!SPLIT_KINDS.includes(e.split.kind)) fail(`expense.split.kind must be one of ${SPLIT_KINDS.join(', ')}`)
  const w = e.split.weights
  if (!w || typeof w !== 'object') fail('expense.split.weights must be an object')
  const keys = Object.keys(w)
  if (keys.length === 0) fail('expense.split.weights must have at least one entry')
  const partSet = new Set(e.participants)
  let sum = 0
  for (const k of keys) {
    if (!partSet.has(k)) fail(`expense.split.weights key "${k}" is not a participant`)
    if (!isPosInt(w[k])) fail(`expense.split.weights["${k}"] must be a positive integer`)
    sum += w[k]
  }
  if (keys.length !== e.participants.length) fail('expense.split.weights must cover exactly the participants')
  if (e.split.kind === 'percent' && sum !== 100) fail(`percent split weights must sum to 100 (got ${sum})`)
  if (e.split.kind === 'shares' && sum <= 0) fail('shares split weights must sum to a positive number')
  return e
}

/**
 * Validate a void entry — a reversal that marks a prior expense as deleted/edited. It carries the
 * target expense id and the member who voided it; balances + insights ignore any expense whose id
 * has been voided. Append-only friendly: history is preserved, the effect is undone.
 */
function validateVoid (e) {
  if (!isNonEmptyString(e.id)) fail('void.id required')
  if (!isNonEmptyString(e.target)) fail('void.target (voided expense id) required')
  if (!isNonEmptyString(e.by)) fail('void.by (member id) required')
  if (!isPosInt(e.ts)) fail('void.ts must be a positive integer timestamp')
  return e
}

/**
 * Validate a comment — a threaded note attached to a prior expense (Splitwise-style discussion).
 * Purely social: it never affects balances or insights, only replicates so every peer sees the
 * thread. Carries the target expense id, the author member id, and the (bounded) text body.
 */
function validateComment (e) {
  if (!isNonEmptyString(e.id)) fail('comment.id required')
  if (!isNonEmptyString(e.target)) fail('comment.target (expense id) required')
  if (!isNonEmptyString(e.by)) fail('comment.by (member id) required')
  if (!isNonEmptyString(e.text)) fail('comment.text required')
  if (e.text.length > COMMENT_MAX) fail(`comment.text must be <= ${COMMENT_MAX} chars`)
  if (!isPosInt(e.ts)) fail('comment.ts must be a positive integer timestamp')
  return e
}

function validatePayment (e) {
  if (!isNonEmptyString(e.id)) fail('payment.id required')
  if (!isNonEmptyString(e.from)) fail('payment.from required')
  if (!isNonEmptyString(e.to)) fail('payment.to required')
  if (e.from === e.to) fail('payment.from and payment.to must differ')
  if (!isPosInt(e.amountMinor)) fail('payment.amountMinor must be a positive integer (minor units)')
  if (!isNonEmptyString(e.currency)) fail('payment.currency required')
  // `method` distinguishes an on-chain USD₮ transfer (default) from a cash/off-chain settlement a
  // member records manually. On-chain payments carry a tx hash (their idempotency key); a cash
  // payment has none and dedups on its entry id instead (see computeBalances).
  const method = e.method ?? 'onchain'
  if (method !== 'onchain' && method !== 'cash') fail(`payment.method must be 'onchain' or 'cash'`)
  if (method === 'onchain') {
    if (!isNonEmptyString(e.txHash)) fail('payment.txHash required (idempotency key) for on-chain payments')
    if (!isNonEmptyString(e.chain)) fail('payment.chain required for on-chain payments')
  }
  if (!isPosInt(e.ts)) fail('payment.ts must be a positive integer timestamp')
  return e
}

function validateFee (e) {
  if (!isNonEmptyString(e.id)) fail('fee.id required')
  if (!isNonEmptyString(e.payer)) fail('fee.payer required')
  if (!isPosInt(e.amountMinor)) fail('fee.amountMinor must be a positive integer (minor units)')
  if (!isNonEmptyString(e.currency)) fail('fee.currency required')
  if (!isNonEmptyString(e.treasury)) fail('fee.treasury required (destination address)')
  if (!isNonEmptyString(e.txHash)) fail('fee.txHash required (idempotency key)')
  if (!isNonEmptyString(e.chain)) fail('fee.chain required')
  if (!isPosInt(e.ts)) fail('fee.ts must be a positive integer timestamp')
  return e
}

/**
 * Build a validated expense entry. `ts` is supplied by the caller (no Date.now in domain).
 * @param {{ id:string, payer:string, amountMinor:number, currency?:string, description?:string,
 *           participants:string[], split?:'equal'|Record<string,number>, category?:string,
 *           ts:number }} fields
 * @returns {object}
 */
export function makeExpense (fields) {
  return validateEntry({
    type: 'expense',
    currency: 'USD',
    description: '',
    split: 'equal',
    category: 'other',
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
    method: 'onchain',
    currency: 'USDT',
    chain: 'ethereum',
    ...fields
  })
}

/**
 * Build a validated off-chain ("cash") payment — a repayment a member records manually (cash, bank
 * transfer, etc.) that clears the debt without an on-chain USD₮ transfer. No tx hash; dedups on id.
 * @param {{ id:string, from:string, to:string, amountMinor:number, note?:string, ts:number }} fields
 * @returns {object}
 */
export function makeCashPayment (fields) {
  return validateEntry({
    type: 'payment',
    method: 'cash',
    currency: 'USDT',
    ...fields
  })
}

/**
 * Build a validated platform-fee entry (recorded after the on-chain fee transfer to the
 * treasury). Carries its own tx hash so revenue is idempotent and never double-counted.
 * @param {{ id:string, payer:string, amountMinor:number, treasury:string, currency?:string,
 *           txHash:string, chain?:string, ts:number }} fields
 * @returns {object}
 */
export function makeFee (fields) {
  return validateEntry({
    type: 'fee',
    currency: 'USDT',
    chain: 'ethereum',
    ...fields
  })
}

/**
 * Build a validated void entry that reverses a prior expense (delete, or the old half of an edit).
 * @param {{ id:string, target:string, by:string, ts:number }} fields
 * @returns {object}
 */
export function makeVoid (fields) {
  return validateEntry({ type: 'void', ...fields })
}

/**
 * Build a validated comment on an expense. `ts` from caller. Text is trimmed by the caller; the
 * body is bounded to COMMENT_MAX so the replicated view stays small.
 * @param {{ id:string, target:string, by:string, text:string, ts:number }} fields
 * @returns {object}
 */
export function makeComment (fields) {
  return validateEntry({ type: 'comment', ...fields })
}

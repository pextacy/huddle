/**
 * Group spending insights (pure, deterministic — no I/O, no floats; integer minor units only).
 *
 * `computeBalances` answers "who owes whom". This answers "where did the money go" — the numbers
 * a group actually wants to see after a trip: total spent, a per-category breakdown (matchday
 * themed), who fronted vs. who consumed how much, and the single biggest expense. It reads only
 * `expense` entries; payments, fees, wallet and addWriter entries never move the spend total.
 *
 * Determinism: category order is fixed by CATEGORIES; ties in member/category totals break by key
 * so every peer renders the identical dashboard. `pct` is an integer percent of the grand total
 * (rounded) purely for bar widths — the authoritative figures are always the minor-unit amounts.
 */

import { splitShares, voidedIds } from './balances.js'

/**
 * Matchday-themed spend categories. `key` is what's stored on the expense entry; `emoji`/`label`
 * are for display. Any expense whose category is missing or unrecognized folds into 'other', so
 * older ledger entries (written before categories existed) still tally correctly.
 * @type {{ key: string, label: string, emoji: string }[]}
 */
export const CATEGORIES = [
  { key: 'tickets', label: 'Tickets', emoji: '⚽' },
  { key: 'food', label: 'Food & drinks', emoji: '🍔' },
  { key: 'travel', label: 'Travel', emoji: '🚗' },
  { key: 'stay', label: 'Stay', emoji: '🏨' },
  { key: 'gear', label: 'Gear', emoji: '🎽' },
  { key: 'other', label: 'Other', emoji: '💸' }
]

const CATEGORY_KEYS = new Set(CATEGORIES.map((c) => c.key))
const CATEGORY_META = Object.fromEntries(CATEGORIES.map((c) => [c.key, c]))

/** Normalize any stored category value to a known key ('other' for missing/unknown). */
export function normalizeCategory (category) {
  return (typeof category === 'string' && CATEGORY_KEYS.has(category)) ? category : 'other'
}

const pctOf = (part, total) => (total > 0 ? Math.round((part * 100) / total) : 0)

/**
 * Fold ledger entries into a spending dashboard.
 *
 * @param {object[]} entries  ledger entries in linearized order
 * @returns {{
 *   totalSpentMinor: number,
 *   expenseCount: number,
 *   avgPerExpenseMinor: number,
 *   byCategory: { key:string, label:string, emoji:string, amountMinor:number, count:number, pct:number }[],
 *   byMember:   { member:string, paidMinor:number, shareMinor:number, pct:number }[],
 *   largest:    { id:string, description:string, amountMinor:number, category:string, payer:string } | null
 * }}
 */
export function groupInsights (entries) {
  const list = Array.isArray(entries) ? entries : []

  let totalSpentMinor = 0
  let expenseCount = 0
  let largest = null

  const catAmount = new Map() // key -> minor
  const catCount = new Map() // key -> n
  const paid = new Map() // member -> minor fronted
  const share = new Map() // member -> minor consumed
  const bump = (map, k, v) => map.set(k, (map.get(k) ?? 0) + v)
  const voided = voidedIds(list)

  for (const e of list) {
    if (!e || e.type !== 'expense') continue
    if (voided.has(e.id)) continue // deleted/edited-away expenses don't count toward spend
    expenseCount++
    totalSpentMinor += e.amountMinor

    const cat = normalizeCategory(e.category)
    bump(catAmount, cat, e.amountMinor)
    bump(catCount, cat, 1)

    bump(paid, e.payer, e.amountMinor)
    const shares = splitShares(e)
    for (const m of Object.keys(shares)) bump(share, m, shares[m])

    // Biggest single expense; ties resolved by id so every peer picks the same one.
    if (!largest || e.amountMinor > largest.amountMinor ||
        (e.amountMinor === largest.amountMinor && e.id < largest.id)) {
      largest = { id: e.id, description: e.description || '', amountMinor: e.amountMinor, category: cat, payer: e.payer }
    }
  }

  // Only categories that actually saw spend, largest first; ties broken by key for determinism.
  const byCategory = [...catAmount.keys()]
    .map((key) => ({
      key,
      label: CATEGORY_META[key].label,
      emoji: CATEGORY_META[key].emoji,
      amountMinor: catAmount.get(key),
      count: catCount.get(key) ?? 0,
      pct: pctOf(catAmount.get(key), totalSpentMinor)
    }))
    .sort((a, b) => (b.amountMinor - a.amountMinor) || (a.key < b.key ? -1 : 1))

  // Everyone who fronted or consumed money, by amount fronted (then consumed, then id).
  const members = new Set([...paid.keys(), ...share.keys()])
  const byMember = [...members]
    .map((member) => ({
      member,
      paidMinor: paid.get(member) ?? 0,
      shareMinor: share.get(member) ?? 0,
      pct: pctOf(paid.get(member) ?? 0, totalSpentMinor)
    }))
    .sort((a, b) => (b.paidMinor - a.paidMinor) || (b.shareMinor - a.shareMinor) || (a.member < b.member ? -1 : 1))

  const avgPerExpenseMinor = expenseCount > 0 ? Math.round(totalSpentMinor / expenseCount) : 0

  return { totalSpentMinor, expenseCount, avgPerExpenseMinor, byCategory, byMember, largest }
}

// Shared display helpers for the LedgerCore UI. Money is integer minor units (cents) everywhere.

/** Format minor units (cents) as a 2-decimal string, e.g. -1234 -> "-12.34". */
export function fmt (minor) {
  const n = Number(minor) || 0
  const neg = n < 0
  const abs = Math.abs(n)
  return `${neg ? '-' : ''}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

/** Signed format, always showing +/-, e.g. 420 -> "+4.20". */
export function fmtSigned (minor) {
  const n = Number(minor) || 0
  return `${n >= 0 ? '+' : ''}${fmt(n)}`
}

/** Member display name from the group roster, falling back to the raw id ('' for a missing id). */
export function nameOf (group, id) {
  if (!id) return '' // a missing id (e.g. e.from on an expense) must not stringify to "undefined"
  return group?.members?.[id]?.name || id
}

/** Short avatar initials from a name ("Ada Lovelace" -> "AL"). */
export function initials (name) {
  if (!name) return '?'
  const parts = String(name).trim().split(/\s+/)
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || name[0].toUpperCase()
}

/** Short id chip like "0x3B…7E1" from an arbitrary id/hex string. */
export function shortId (id) {
  if (!id) return '—'
  const s = String(id)
  return s.length <= 12 ? s : `${s.slice(0, 6)}…${s.slice(-4)}`
}

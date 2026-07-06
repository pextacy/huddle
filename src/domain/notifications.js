/**
 * In-app notifications (pure, deterministic — no I/O, no Date.now()).
 *
 * Notifications are DERIVED from the replicated ledger relative to one member ("me"); there is no
 * separate notification entry type, so they need no extra P2P traffic and work fully offline. Each
 * is an event another member caused that is relevant to me — a new expense I'm split into, a
 * comment on my expense, a nudge aimed at me, a settlement paid to me, or a member joining.
 *
 * Every notification carries a stable `id` (derived from the source entry) so the UI can track a
 * "last seen" watermark and compute an unread count deterministically across peers.
 */

/** The notification kinds the UI knows how to render. */
export const NOTIFICATION_TYPES = /** @type {const} */ (['expense_added', 'comment', 'nudge', 'payment', 'member_joined'])

/**
 * Build the notification feed for `memberId` from ledger entries, newest first.
 * @param {object[]} entries  ledger entries
 * @param {string} memberId  the viewer's member id
 * @returns {{ id:string, type:string, ts:number, actor:string, amountMinor?:number,
 *            target?:string, text?:string, description?:string }[]}
 */
export function buildNotifications (entries, memberId) {
  if (!memberId) return []
  const out = []

  // Index expenses by id (for comment relevance) and track the first wallet entry per member.
  const expenseById = new Map()
  const seenMember = new Set()
  const voided = new Set()
  for (const e of entries) {
    if (e && e.type === 'expense') expenseById.set(e.id, e)
    if (e && e.type === 'void' && e.target) voided.add(e.target)
  }

  for (const e of entries) {
    if (!e || typeof e !== 'object') continue
    switch (e.type) {
      case 'expense': {
        // Someone else added an expense I'm split into (skip voided + my own).
        if (voided.has(e.id)) break
        if (e.payer === memberId) break
        if (!Array.isArray(e.participants) || !e.participants.includes(memberId)) break
        out.push({ id: `expense:${e.id}`, type: 'expense_added', ts: e.ts || 0, actor: e.payer, amountMinor: e.amountMinor, description: e.description || '' })
        break
      }
      case 'comment': {
        // A comment by someone else on an expense I paid or am split into.
        if (e.by === memberId) break
        const exp = expenseById.get(e.target)
        if (!exp) break
        const mine = exp.payer === memberId || (Array.isArray(exp.participants) && exp.participants.includes(memberId))
        if (!mine) break
        out.push({ id: `comment:${e.id}`, type: 'comment', ts: e.ts || 0, actor: e.by, target: e.target, text: e.text || '', description: exp.description || '' })
        break
      }
      case 'reminder': {
        // A nudge aimed at me.
        if (e.to !== memberId) break
        out.push({ id: `nudge:${e.id}`, type: 'nudge', ts: e.ts || 0, actor: e.from, amountMinor: e.amountMinor })
        break
      }
      case 'payment': {
        // A settlement paid to me by someone else (someone cleared a debt they owed me).
        if (e.to !== memberId || e.from === memberId) break
        out.push({ id: `payment:${e.id}`, type: 'payment', ts: e.ts || 0, actor: e.from, amountMinor: e.amountMinor })
        break
      }
      case 'wallet': {
        // A member (not me) appearing for the first time — treat as "joined the group".
        if (e.member === memberId) break
        if (seenMember.has(e.member)) break
        seenMember.add(e.member)
        out.push({ id: `join:${e.member}`, type: 'member_joined', ts: e.ts || 0, actor: e.member })
        break
      }
      default:
        break
    }
  }

  // Newest first; stable id tiebreak so every peer orders an identical feed.
  out.sort((a, b) => (b.ts - a.ts) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0))
  return out
}

/** Count notifications newer than a "last seen" timestamp (0 = all unread). */
export function unreadCount (notifications, lastSeenTs = 0) {
  let n = 0
  for (const x of notifications) if ((x.ts || 0) > lastSeenTs) n++
  return n
}

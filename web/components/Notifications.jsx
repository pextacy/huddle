'use client'

import { useEffect, useState } from 'react'
import { nameOf, fmt } from '../lib/format'
import Icon from './Icon'

function ago (ts) {
  const s = Math.max(0, Math.floor((Date.now() - (ts || 0)) / 1000))
  if (s < 45) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)}m`
  if (s < 86400) return `${Math.round(s / 3600)}h`
  if (s < 604800) return `${Math.round(s / 86400)}d`
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// Per-type rendering: icon + a human line built from the actor's name.
function render (n, group) {
  const who = nameOf(group, n.actor)
  switch (n.type) {
    case 'expense_added': return { icon: 'receipt', title: `${who} added an expense`, sub: `${n.description || 'Expense'} · ${fmt(n.amountMinor)} USD₮` }
    case 'comment': return { icon: 'chat', title: `${who} commented`, sub: `${n.description ? `"${n.description}" · ` : ''}${n.text || ''}` }
    case 'nudge': return { icon: 'bell', title: `${who} nudged you`, sub: n.amountMinor ? `Settle up ${fmt(n.amountMinor)} USD₮` : 'Reminder to settle up' }
    case 'payment': return { icon: 'down', title: `${who} paid you`, sub: `${fmt(n.amountMinor)} USD₮ settled` }
    case 'member_joined': return { icon: 'wallet', title: `${who} joined the group`, sub: 'New member' }
    default: return { icon: 'bell', title: 'Update', sub: '' }
  }
}

/**
 * Notification bell + sheet. Notifications are derived server-side from the ledger (group.
 * notifications) and are relevant to the current member. Unread is tracked with a per-group
 * "last seen" timestamp in localStorage; opening the sheet marks everything read.
 */
export default function Notifications ({ notifications, group, groupId }) {
  const list = notifications || []
  const key = groupId ? `lc-notif-seen-${groupId}` : null
  const [open, setOpen] = useState(false)
  const [lastSeen, setLastSeen] = useState(0)

  // Load the per-group watermark once we know the group (client-only).
  useEffect(() => {
    if (!key || typeof window === 'undefined') return
    setLastSeen(Number(window.localStorage.getItem(key) || 0))
  }, [key])

  const unread = list.filter((n) => (n.ts || 0) > lastSeen).length

  function openSheet () {
    setOpen(true)
    const maxTs = list.reduce((m, n) => Math.max(m, n.ts || 0), lastSeen)
    if (key && typeof window !== 'undefined') window.localStorage.setItem(key, String(maxTs))
    setLastSeen(maxTs)
  }

  return (
    <>
      <button className="m-bell" onClick={openSheet} aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
        <Icon name="bell" size={19} />
        {unread > 0 && <span className="m-bell-badge">{unread > 9 ? '9+' : unread}</span>}
      </button>

      {open && (
        <div className="m-sheet-backdrop" onClick={() => setOpen(false)}>
          <div className="m-sheet" role="dialog" aria-label="Notifications" onClick={(e) => e.stopPropagation()}>
            <div className="row spread" style={{ marginBottom: 12 }}>
              <h3 className="lc-card-title">Notifications</h3>
              <button className="icon-btn" onClick={() => setOpen(false)} aria-label="close"><Icon name="add" size={18} style={{ transform: 'rotate(45deg)' }} /></button>
            </div>
            {list.length === 0 ? (
              <div className="lc-empty" style={{ padding: '20px 0' }}>You’re all caught up.</div>
            ) : (
              <div className="m-stack">
                {list.map((n) => {
                  const r = render(n, group)
                  return (
                    <div key={n.id} className="m-act">
                      <span className="m-act-icon"><Icon name={r.icon} size={18} /></span>
                      <div className="m-act-body">
                        <div className="m-act-title">{r.title}</div>
                        <div className="m-act-sub" style={{ textTransform: 'none', letterSpacing: 0 }}>{r.sub}</div>
                      </div>
                      <div className="m-act-right"><div className="m-act-status">{ago(n.ts)}</div></div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

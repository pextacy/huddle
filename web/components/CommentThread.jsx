'use client'

import { useState } from 'react'
import { post } from '../lib/api'
import { nameOf } from '../lib/format'
import { COMMENT_MAX } from '../lib/limits'
import Icon from './Icon'

// Short relative time for a comment ("just now", "5m", "3h", "2d") or a date past a week.
function ago (ts) {
  const s = Math.max(0, Math.floor((Date.now() - (ts || 0)) / 1000))
  if (s < 45) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)}m`
  if (s < 86400) return `${Math.round(s / 3600)}h`
  if (s < 604800) return `${Math.round(s / 86400)}d`
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/**
 * A Splitwise-style discussion thread on one expense. Comments are `comment` ledger entries that
 * replicate over P2P (no server), so every peer sees the thread. Collapsed by default; the toggle
 * shows the count. Writers can post; read-only peers just see the thread.
 */
export default function CommentThread ({ group, expenseId, comments }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const canWrite = !!group?.me?.writable
  const list = [...(comments || [])].sort((a, b) => (a.ts || 0) - (b.ts || 0))

  async function send () {
    const body = text.trim()
    if (!body || busy) return
    setBusy(true); setErr(null)
    try { await post('comment', { target: expenseId, text: body }); setText(''); setOpen(true) }
    catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="m-thread">
      <button className="lc-linkbtn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Icon name="chat" size={13} /> {list.length ? `${list.length} comment${list.length === 1 ? '' : 's'}` : 'Comment'}
      </button>

      {open && (
        <div className="m-thread-body">
          {list.map((c) => (
            <div key={c.id} className="m-comment">
              <span className="m-comment-who">{nameOf(group, c.by)}</span>
              <span className="m-comment-text">{c.text}</span>
              <span className="m-comment-ts">{ago(c.ts)}</span>
            </div>
          ))}
          {list.length === 0 && <div className="lc-empty" style={{ padding: '4px 0' }}>No comments yet.</div>}

          {canWrite && (
            <div className="m-comment-form">
              <input
                className="lc-input"
                value={text}
                maxLength={COMMENT_MAX}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') send() }}
                placeholder="Add a comment…"
                aria-label="Add a comment"
              />
              <button className="lc-btn lc-btn-sm lc-btn-primary" disabled={busy || !text.trim()} onClick={send}>
                {busy ? '…' : <Icon name="send" size={14} />}
              </button>
            </div>
          )}
          {err && <div className="lc-error" style={{ marginTop: 6 }}>{err}</div>}
        </div>
      )}
    </div>
  )
}

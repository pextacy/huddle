'use client'

import { useState } from 'react'
import { post } from '../lib/api'
import { fmt, nameOf } from '../lib/format'
import { categoryEmoji } from '../lib/categories'
import MobileHeader from './MobileHeader'
import AddExpense from './AddExpense'
import CommentThread from './CommentThread'
import Icon from './Icon'

// Group entries by day label (Today / Yesterday / date) using their ts.
function dayKey (ts) {
  const d = new Date(ts || 0)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}
function dayLabel (ts) {
  const d = new Date(ts || 0)
  const now = new Date()
  const key = dayKey(ts)
  if (key === dayKey(now.getTime())) return 'Today'
  const y = new Date(now.getTime() - 86400000)
  if (key === dayKey(y.getTime())) return 'Yesterday'
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

// Build a CSV of the ledger for export (records / reimbursement). Quotes every field.
function toCsv (entries, group) {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const head = ['date', 'type', 'description', 'category', 'from/payer', 'to', 'amount_usdt', 'method', 'tx_hash']
  const lines = [head.join(',')]
  for (const e of entries) {
    const date = new Date(e.ts || 0).toISOString()
    if (e.type === 'expense') {
      lines.push([date, 'expense', q(e.description || ''), e.category || 'other', q(nameOf(group, e.payer)), '', fmt(e.amountMinor), e.split?.kind || (e.split === 'equal' ? 'equal' : 'custom'), ''].join(','))
    } else if (e.type === 'payment') {
      lines.push([date, 'payment', q(e.note || 'settlement'), '', q(nameOf(group, e.from)), q(nameOf(group, e.to)), fmt(e.amountMinor), e.method || 'onchain', e.txHash || ''].join(','))
    } else if (e.type === 'fee') {
      lines.push([date, 'fee', q('platform fee'), '', q(nameOf(group, e.payer)), 'treasury', fmt(e.amountMinor), 'onchain', e.txHash || ''].join(','))
    }
  }
  return lines.join('\n')
}

export default function ActivityView ({ group, wallet }) {
  const [filter, setFilter] = useState('all')
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState(null)
  const [actionErr, setActionErr] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const explorerTx = wallet?.network?.explorerTxUrl
  const canEdit = !!group?.me?.writable

  const allEntries = group.entries || []
  const voided = new Set(allEntries.filter((e) => e.type === 'void').map((e) => e.target))
  // Comments bucketed by the expense they hang off, so each row renders its own thread.
  const commentsByExpense = {}
  for (const e of allEntries) {
    if (e.type === 'comment') (commentsByExpense[e.target] ||= []).push(e)
  }
  const entries = allEntries.filter((e) => e.type === 'expense' || e.type === 'payment' || e.type === 'fee')
  const sorted = [...entries].sort((a, b) => (b.ts || 0) - (a.ts || 0))
  const rows = sorted.filter((e) => {
    if (filter === 'expenses' && e.type !== 'expense') return false
    if (filter === 'settled' && e.type !== 'payment') return false
    if (!q.trim()) return true
    const hay = `${e.description || ''} ${e.note || ''} ${nameOf(group, e.payer)} ${nameOf(group, e.from)} ${nameOf(group, e.to)} ${e.txHash || ''} ${e.category || ''}`.toLowerCase()
    return hay.includes(q.trim().toLowerCase())
  })

  // Group into day buckets, preserving newest-first order.
  const groups = []
  let cur = null
  for (const e of rows) {
    const label = dayLabel(e.ts)
    if (!cur || cur.label !== label) { cur = { label, items: [] }; groups.push(cur) }
    cur.items.push(e)
  }

  async function del (e) {
    if (typeof window !== 'undefined' && !window.confirm(`Delete "${e.description || 'this expense'}" (${fmt(e.amountMinor)} USD₮)?`)) return
    setBusyId(e.id); setActionErr(null)
    try { await post('expense/delete', { target: e.id }) } catch (err) { setActionErr(err.message) } finally { setBusyId(null) }
  }

  function exportCsv () {
    if (typeof window === 'undefined') return
    const blob = new Blob([toCsv(sorted, group)], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${(group.group?.name || 'ledger').replace(/\s+/g, '-')}.csv`
    document.body.appendChild(a); a.click(); a.remove()
    URL.revokeObjectURL(url)
  }

  function row (e) {
    if (e.type === 'expense') {
      const isVoid = voided.has(e.id)
      return (
        <div key={e.id} className="m-act-wrap">
          <div className={`m-act ${isVoid ? 'voided' : ''}`}>
            <span className="m-act-icon">{categoryEmoji(e.category)}</span>
            <div className="m-act-body">
              <div className="m-act-title" style={isVoid ? { textDecoration: 'line-through', opacity: 0.6 } : undefined}>{e.description || 'Expense'}</div>
              <div className="m-act-sub">{e.category || 'other'} · {nameOf(group, e.payer)}{e.split?.kind ? ` · ${e.split.kind}` : ''}</div>
            </div>
            <div className="m-act-right">
              <div className="m-act-amt" style={isVoid ? { textDecoration: 'line-through', opacity: 0.6 } : undefined}>- {fmt(e.amountMinor)}</div>
              {isVoid
                ? <div className="m-act-status"><span className="m-dot debt" />Removed</div>
                : <div className="m-act-status"><span className="m-dot muted" />Split {e.participants?.length ?? 0}</div>}
              {canEdit && !isVoid && (
                <div className="row" style={{ gap: 10, marginTop: 6, justifyContent: 'flex-end' }}>
                  <button className="lc-linkbtn" onClick={() => setEditing(e)}>Edit</button>
                  <button className="lc-linkbtn danger" disabled={busyId === e.id} onClick={() => del(e)}>{busyId === e.id ? '…' : 'Delete'}</button>
                </div>
              )}
            </div>
          </div>
          {!isVoid && <CommentThread group={group} expenseId={e.id} comments={commentsByExpense[e.id]} />}
        </div>
      )
    }
    if (e.type === 'payment') {
      const cash = e.method === 'cash'
      return (
        <div key={e.id} className="m-act accent">
          <span className="m-act-icon in"><Icon name="down" size={20} /></span>
          <div className="m-act-body">
            <div className="m-act-title">{nameOf(group, e.from)} → {nameOf(group, e.to)}</div>
            <div className="m-act-sub">{cash
              ? (e.note ? `Cash · ${e.note}` : 'Cash / off-chain')
              : (explorerTx ? <a className="lc-link" href={`${explorerTx}${e.txHash}`} target="_blank" rel="noreferrer">{e.txHash?.slice(0, 16)}…</a> : `${e.txHash?.slice(0, 16)}…`)}</div>
          </div>
          <div className="m-act-right">
            <div className="m-act-amt credit">+ {fmt(e.amountMinor)}</div>
            <div className="m-act-status"><span className="m-dot credit" />{cash ? 'Cash' : 'Settled'}</div>
          </div>
        </div>
      )
    }
    return (
      <div key={e.id} className="m-act">
        <span className="m-act-icon"><Icon name="receipt" size={19} /></span>
        <div className="m-act-body">
          <div className="m-act-title">Platform fee</div>
          <div className="m-act-sub">{nameOf(group, e.payer)} → treasury</div>
        </div>
        <div className="m-act-right">
          <div className="m-act-amt muted">- {fmt(e.amountMinor)}</div>
          <div className="m-act-status"><span className="m-dot credit" />Confirmed</div>
        </div>
      </div>
    )
  }

  return (
    <>
      <MobileHeader title="Activity" />

      {editing && (
        <div style={{ marginBottom: 12 }}>
          <AddExpense group={group} editing={editing} onClose={() => setEditing(null)} />
        </div>
      )}

      <div className="row spread" style={{ marginBottom: 12, gap: 8 }}>
        <div className="lc-field" style={{ flex: 1, marginBottom: 0 }}>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--faint)' }}><Icon name="search" size={18} /></span>
            <input className="lc-input mono" style={{ paddingLeft: 38 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search transactions…" />
          </div>
        </div>
        <button className="lc-btn lc-btn-outline lc-btn-sm" onClick={exportCsv} title="Export CSV" style={{ flexShrink: 0 }}><Icon name="down" size={15} /> CSV</button>
      </div>

      {actionErr && <div className="lc-error" style={{ marginBottom: 12 }}>{actionErr}</div>}

      <div className="lc-seg" style={{ marginBottom: 4 }}>
        {[['all', 'All'], ['expenses', 'Expenses'], ['settled', 'Settled']].map(([k, l]) => (
          <button key={k} className={`lc-seg-item ${filter === k ? 'active' : ''}`} onClick={() => setFilter(k)}>{l}</button>
        ))}
      </div>

      {groups.length === 0 ? (
        <div className="m-card" style={{ marginTop: 16 }}><span className="lc-empty">No matching activity yet.</span></div>
      ) : (
        groups.map((g) => (
          <div key={g.label}>
            <div className="m-dategroup"><span>{g.label}</span><span>{g.items.length} item{g.items.length === 1 ? '' : 's'}</span></div>
            <div className="m-stack">{g.items.map(row)}</div>
          </div>
        ))
      )}
    </>
  )
}

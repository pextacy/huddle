'use client'

import { useEffect, useRef, useState } from 'react'
import { post } from '../lib/api'
import { fmt } from '../lib/format'
import { CATEGORIES } from '../lib/categories'
import Icon from './Icon'

// Parse a USD₮ decimal string into integer minor units (cents) without floats.
function toMinor (text) {
  const s = String(text).trim()
  if (s === '') return 0
  if (!/^\d+(\.\d{1,2})?$/.test(s)) throw new Error(`Bad amount: ${text}`)
  const [whole, frac = ''] = s.split('.')
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'))
}
// Parse a non-negative integer weight (percent points / shares). '' -> 0.
function toWeight (text) {
  const s = String(text).trim()
  if (s === '') return 0
  if (!/^\d+$/.test(s)) throw new Error(`Whole number only: ${text}`)
  return Number(s)
}

/** Reconstruct the editor mode + prefilled fields from an existing expense entry (edit flow). */
function fromExpense (exp) {
  const base = { amount: fmt(exp.amountMinor), desc: exp.description || '', payer: exp.payer, category: exp.category || 'other' }
  if (exp.split && typeof exp.split.kind === 'string') {
    const weights = {}
    for (const [id, w] of Object.entries(exp.split.weights)) weights[id] = String(w)
    return { ...base, mode: exp.split.kind, weights, selected: new Set(exp.participants), custom: {} }
  }
  if (exp.split && typeof exp.split === 'object') {
    const custom = {}
    for (const [id, v] of Object.entries(exp.split)) custom[id] = fmt(v)
    return { ...base, mode: 'custom', custom, selected: new Set(exp.participants), weights: {} }
  }
  return { ...base, mode: 'equal', selected: new Set(exp.participants), custom: {}, weights: {} }
}

export default function AddExpense ({ group, onClose, editing }) {
  const members = Object.values(group.members || {})
  const me = group.me
  const init = editing ? fromExpense(editing) : null

  const [mode, setMode] = useState(init?.mode || 'equal')
  const [amount, setAmount] = useState(init?.amount || '')
  const [desc, setDesc] = useState(init?.desc || '')
  const [payer, setPayer] = useState(init?.payer || me.memberId)
  const [category, setCategory] = useState(init?.category || 'tickets')
  const [selected, setSelected] = useState(() => init?.selected || new Set(members.map((m) => m.id)))
  const [custom, setCustom] = useState(init?.custom || {})
  const [weights, setWeights] = useState(init?.weights || {})
  const [repeat, setRepeat] = useState('none')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  // Keep the equal-split selection reconciled with the live roster (peers join over SSE). Skip while
  // editing — an edit targets a fixed snapshot and shouldn't auto-add newcomers behind the user.
  const memberIds = members.map((m) => m.id)
  const memberKey = memberIds.join(',')
  const knownIds = useRef(new Set(memberIds))
  useEffect(() => {
    if (editing) return
    const idSet = new Set(memberIds)
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => idSet.has(id)))
      for (const id of memberIds) if (!knownIds.current.has(id)) next.add(id)
      return next
    })
    knownIds.current = idSet
  }, [memberKey]) // eslint-disable-line react-hooks/exhaustive-deps

  function toggle (id) {
    const next = new Set(selected)
    next.has(id) ? next.delete(id) : next.add(id)
    setSelected(next)
  }

  const needsAmount = mode !== 'custom'

  // Live totals for the footer readouts / validation hints.
  let customTotal = 0
  try { customTotal = members.reduce((s, m) => s + toMinor(custom[m.id] || ''), 0) } catch { customTotal = NaN }
  let weightTotal = 0
  try { weightTotal = members.reduce((s, m) => s + toWeight(weights[m.id] || ''), 0) } catch { weightTotal = NaN }

  async function submit () {
    setBusy(true); setError(null)
    try {
      let payload
      if (mode === 'equal') {
        const amountMinor = toMinor(amount)
        if (amountMinor <= 0) throw new Error('Enter an amount like 50 or 12.50')
        const participants = [...selected]
        if (participants.length === 0) throw new Error('Pick at least one participant')
        payload = { payer, amountMinor, description: desc, participants, split: 'equal', category }
      } else if (mode === 'custom') {
        const split = {}; const participants = []; let total = 0
        for (const m of members) {
          const v = toMinor(custom[m.id] || '')
          if (v > 0) { split[m.id] = v; participants.push(m.id); total += v }
        }
        if (participants.length === 0) throw new Error('Enter at least one custom amount')
        payload = { payer, amountMinor: total, description: desc, participants, split, category }
      } else {
        // percent | shares — weighted split
        const amountMinor = toMinor(amount)
        if (amountMinor <= 0) throw new Error('Enter the total amount')
        const w = {}; const participants = []
        for (const m of members) {
          const val = toWeight(weights[m.id] || '')
          if (val > 0) { w[m.id] = val; participants.push(m.id) }
        }
        if (participants.length === 0) throw new Error(`Enter at least one ${mode === 'percent' ? 'percentage' : 'share'}`)
        if (mode === 'percent' && participants.reduce((s, id) => s + w[id], 0) !== 100) throw new Error('Percentages must add up to exactly 100%')
        payload = { payer, amountMinor, description: desc, participants, split: { kind: mode, weights: w }, category }
      }

      if (editing) await post('expense/edit', { target: editing.id, ...payload })
      else if (repeat !== 'none') await post('recurring', { ...payload, cadence: repeat, anchorTs: Date.now() })
      else await post('expense', payload)
      setAmount(''); setDesc(''); setCustom({}); setWeights({}); setRepeat('none')
      onClose?.()
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  if (!me.writable) {
    return (
      <div className="lc-card">
        <div className="lc-card-head"><h3 className="lc-card-title">Add expense</h3></div>
        <div className="lc-card-body">
          <div className="lc-notice">This device isn’t an authorized writer yet. Share your writer key (Wallet tab) with a member to be approved.</div>
        </div>
      </div>
    )
  }

  const MODES = [['equal', 'Equal'], ['custom', 'Amounts'], ['percent', '%'], ['shares', 'Shares']]

  return (
    <div className="lc-card">
      <div className="lc-card-head">
        <h3 className="lc-card-title">{editing ? 'Edit expense' : 'Add expense'}</h3>
        {onClose && <button className="icon-btn" onClick={onClose} aria-label="close"><Icon name="add" size={18} style={{ transform: 'rotate(45deg)' }} /></button>}
      </div>
      <div className="lc-card-body">
        <div className="lc-seg" style={{ marginBottom: 14 }}>
          {MODES.map(([k, label]) => (
            <button key={k} className={`lc-seg-item ${mode === k ? 'active' : ''}`} onClick={() => setMode(k)}>{label}</button>
          ))}
        </div>

        {needsAmount && (
          <div className="lc-field">
            <label className="lc-label">{mode === 'equal' ? 'Amount (USD₮)' : 'Total amount (USD₮)'}</label>
            <input className="lc-input mono" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="50.00" />
          </div>
        )}

        <div className="lc-field">
          <label className="lc-label">Description</label>
          <input className="lc-input" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Match tickets" />
        </div>

        <div className="lc-field">
          <label className="lc-label">Category</label>
          <div className="lc-chips">
            {CATEGORIES.map((c) => (
              <button type="button" key={c.key} className={`lc-chip ${category === c.key ? 'active' : ''}`} onClick={() => setCategory(c.key)}>
                <span className="chip-emoji">{c.emoji}</span>{c.label}
              </button>
            ))}
          </div>
        </div>

        <div className="lc-field">
          <label className="lc-label">Paid by</label>
          <select className="lc-select" value={payer} onChange={(e) => setPayer(e.target.value)}>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}{m.id === me.memberId ? ' (you)' : ''}</option>)}
          </select>
        </div>

        {mode === 'equal' && (
          <div className="lc-field">
            <label className="lc-label">Split equally between</label>
            <div className="lc-rows" style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
              {members.map((m) => (
                <label key={m.id} className="lc-brow" style={{ cursor: 'pointer' }}>
                  <span>{m.name}{m.id === me.memberId ? ' (you)' : ''}</span>
                  <input type="checkbox" style={{ width: 'auto', accentColor: 'var(--primary)' }} checked={selected.has(m.id)} onChange={() => toggle(m.id)} />
                </label>
              ))}
            </div>
          </div>
        )}

        {mode === 'custom' && (
          <div className="lc-field">
            <label className="lc-label">Each person owes (USD₮)</label>
            <div className="lc-rows" style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
              {members.map((m) => (
                <div key={m.id} className="lc-brow">
                  <span>{m.name}{m.id === me.memberId ? ' (you)' : ''}</span>
                  <input className="lc-input mono" inputMode="decimal" style={{ width: 110 }} value={custom[m.id] || ''} onChange={(e) => setCustom({ ...custom, [m.id]: e.target.value })} placeholder="0.00" />
                </div>
              ))}
            </div>
            <div className="row spread small muted" style={{ marginTop: 8 }}>
              <span>Total</span>
              <span className="mono">{Number.isNaN(customTotal) ? '—' : fmt(customTotal)} USD₮</span>
            </div>
          </div>
        )}

        {(mode === 'percent' || mode === 'shares') && (
          <div className="lc-field">
            <label className="lc-label">{mode === 'percent' ? 'Each person’s percentage' : 'Shares per person'}</label>
            <div className="lc-rows" style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
              {members.map((m) => {
                const w = toWeight(weights[m.id] || '')
                const preview = (needsAmount && !Number.isNaN(weightTotal) && weightTotal > 0 && w > 0)
                  ? fmt(Math.round((toMinor(amount || '0') * w) / weightTotal))
                  : null
                return (
                  <div key={m.id} className="lc-brow">
                    <span>{m.name}{m.id === me.memberId ? ' (you)' : ''}{preview ? <span className="muted small mono" style={{ marginLeft: 8 }}>≈ {preview}</span> : null}</span>
                    <div className="row" style={{ gap: 6, alignItems: 'center' }}>
                      <input className="lc-input mono" inputMode="numeric" style={{ width: 76 }} value={weights[m.id] || ''} onChange={(e) => setWeights({ ...weights, [m.id]: e.target.value })} placeholder="0" />
                      <span className="muted small">{mode === 'percent' ? '%' : '×'}</span>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="row spread small" style={{ marginTop: 8 }}>
              <span className="muted">{mode === 'percent' ? 'Must total 100%' : 'Total shares'}</span>
              <span className={`mono ${mode === 'percent' && weightTotal !== 100 ? 'warnc' : 'muted'}`}>
                {Number.isNaN(weightTotal) ? '—' : weightTotal}{mode === 'percent' ? '%' : '×'}
              </span>
            </div>
          </div>
        )}

        {!editing && (
          <div className="lc-field">
            <label className="lc-label">Repeat</label>
            <div className="lc-seg">
              {[['none', 'One-off'], ['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly']].map(([k, label]) => (
                <button type="button" key={k} className={`lc-seg-item ${repeat === k ? 'active' : ''}`} onClick={() => setRepeat(k)}>{label}</button>
              ))}
            </div>
            {repeat !== 'none' && <div className="muted small" style={{ marginTop: 8 }}>Adds this expense now and automatically every {repeat === 'daily' ? 'day' : repeat === 'weekly' ? 'week' : 'month'}. Manage it under Recurring on the Ledger.</div>}
          </div>
        )}

        {error && <div className="lc-error" style={{ marginBottom: 12 }}>{error}</div>}
        <button className="lc-btn lc-btn-primary lc-btn-block" onClick={submit} disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : repeat !== 'none' ? 'Add recurring expense' : 'Add expense'}</button>
      </div>
    </div>
  )
}

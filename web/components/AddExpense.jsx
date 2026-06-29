'use client'

import { useState } from 'react'
import { post } from '../lib/api'

// Parse a USD₮ decimal string into integer minor units (cents) without floats.
function toMinor (text) {
  const s = String(text).trim()
  if (s === '') return 0
  if (!/^\d+(\.\d{1,2})?$/.test(s)) throw new Error(`Bad amount: ${text}`)
  const [whole, frac = ''] = s.split('.')
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'))
}

function fmt (minor) { return `${Math.floor(minor / 100)}.${String(minor % 100).padStart(2, '0')}` }

export default function AddExpense ({ group }) {
  const members = Object.values(group.members || {})
  const me = group.me
  const [mode, setMode] = useState('equal')
  const [amount, setAmount] = useState('')
  const [desc, setDesc] = useState('')
  const [payer, setPayer] = useState(me.memberId)
  const [selected, setSelected] = useState(() => new Set(members.map((m) => m.id)))
  const [custom, setCustom] = useState({}) // memberId -> text amount
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  function toggle (id) {
    const next = new Set(selected)
    next.has(id) ? next.delete(id) : next.add(id)
    setSelected(next)
  }

  // Live total for custom mode.
  let customTotal = 0
  try { customTotal = members.reduce((s, m) => s + toMinor(custom[m.id] || ''), 0) } catch { customTotal = NaN }

  async function submit () {
    setBusy(true); setError(null)
    try {
      if (mode === 'equal') {
        const amountMinor = toMinor(amount)
        if (amountMinor <= 0) throw new Error('Enter an amount like 50 or 12.50')
        const participants = [...selected]
        if (participants.length === 0) throw new Error('Pick at least one participant')
        await post('expense', { payer, amountMinor, description: desc, participants, split: 'equal' })
      } else {
        const split = {}
        const participants = []
        let total = 0
        for (const m of members) {
          const v = toMinor(custom[m.id] || '')
          if (v > 0) { split[m.id] = v; participants.push(m.id); total += v }
        }
        if (participants.length === 0) throw new Error('Enter at least one custom amount')
        await post('expense', { payer, amountMinor: total, description: desc, participants, split })
      }
      setAmount(''); setDesc(''); setCustom({})
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  if (!me.writable) {
    return (
      <div className="card">
        <h2>Add expense</h2>
        <div className="notice">This device isn’t an authorized writer yet. Share your writer key (below) with a member to be approved.</div>
      </div>
    )
  }

  return (
    <div className="card">
      <h2>Add expense</h2>

      <div className="tabs" style={{ marginBottom: 14 }}>
        <div className={`tab ${mode === 'equal' ? 'active' : ''}`} onClick={() => setMode('equal')}>Split equally</div>
        <div className={`tab ${mode === 'custom' ? 'active' : ''}`} onClick={() => setMode('custom')}>Custom amounts</div>
      </div>

      {mode === 'equal' && (
        <div className="field">
          <label>Amount (USD₮)</label>
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="50.00" />
        </div>
      )}

      <div className="field">
        <label>Description</label>
        <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Match tickets" />
      </div>

      <div className="field">
        <label>Paid by</label>
        <select value={payer} onChange={(e) => setPayer(e.target.value)}>
          {members.map((m) => <option key={m.id} value={m.id}>{m.name}{m.id === me.memberId ? ' (you)' : ''}</option>)}
        </select>
      </div>

      {mode === 'equal' ? (
        <div className="field">
          <label>Split equally between</label>
          <div className="list">
            {members.map((m) => (
              <label key={m.id} className="item" style={{ cursor: 'pointer' }}>
                <span>{m.name}{m.id === me.memberId ? ' (you)' : ''}</span>
                <input type="checkbox" style={{ width: 'auto' }} checked={selected.has(m.id)} onChange={() => toggle(m.id)} />
              </label>
            ))}
          </div>
        </div>
      ) : (
        <div className="field">
          <label>Each person owes (USD₮)</label>
          <div className="list">
            {members.map((m) => (
              <div key={m.id} className="item">
                <span>{m.name}{m.id === me.memberId ? ' (you)' : ''}</span>
                <input
                  inputMode="decimal"
                  style={{ width: 110 }}
                  value={custom[m.id] || ''}
                  onChange={(e) => setCustom({ ...custom, [m.id]: e.target.value })}
                  placeholder="0.00"
                />
              </div>
            ))}
          </div>
          <div className="row spread small muted" style={{ marginTop: 8 }}>
            <span>Total</span>
            <span>{Number.isNaN(customTotal) ? '—' : fmt(customTotal)} USD₮</span>
          </div>
        </div>
      )}

      {error && <div className="error" style={{ marginBottom: 12 }}>{error}</div>}
      <button className="btn" onClick={submit} disabled={busy}>{busy ? 'Adding…' : 'Add expense'}</button>
    </div>
  )
}

'use client'

import { useState } from 'react'
import { post } from '../lib/api'

// Parse a USD₮ decimal string into integer minor units (cents) without floats.
function toMinor (text) {
  const s = String(text).trim()
  if (!/^\d+(\.\d{1,2})?$/.test(s)) throw new Error('Enter an amount like 50 or 12.50')
  const [whole, frac = ''] = s.split('.')
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'))
}

export default function AddExpense ({ group }) {
  const members = Object.values(group.members || {})
  const me = group.me
  const [amount, setAmount] = useState('')
  const [desc, setDesc] = useState('')
  const [payer, setPayer] = useState(me.memberId)
  const [selected, setSelected] = useState(() => new Set(members.map((m) => m.id)))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  function toggle (id) {
    const next = new Set(selected)
    next.has(id) ? next.delete(id) : next.add(id)
    setSelected(next)
  }

  async function submit () {
    setBusy(true); setError(null)
    try {
      const amountMinor = toMinor(amount)
      const participants = [...selected]
      if (participants.length === 0) throw new Error('Pick at least one participant')
      await post('expense', { payer, amountMinor, description: desc, participants, split: 'equal' })
      setAmount(''); setDesc('')
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
      <div className="field">
        <label>Amount (USD₮)</label>
        <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="50.00" />
      </div>
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
      {error && <div className="error" style={{ marginBottom: 12 }}>{error}</div>}
      <button className="btn" onClick={submit} disabled={busy}>{busy ? 'Adding…' : 'Add expense'}</button>
    </div>
  )
}

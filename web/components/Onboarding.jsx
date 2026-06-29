'use client'

import { useState } from 'react'
import { post } from '../lib/api'

export default function Onboarding () {
  const [mode, setMode] = useState('create')
  const [name, setName] = useState('Matchday')
  const [member, setMember] = useState('Me')
  const [invite, setInvite] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function submit () {
    setBusy(true); setError(null)
    try {
      if (mode === 'create') await post('group/create', { name, member })
      else await post('group/join', { invite: invite.trim(), member })
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="card">
      <h2>Start</h2>
      <div className="tabs" style={{ marginBottom: 14 }}>
        <div className={`tab ${mode === 'create' ? 'active' : ''}`} onClick={() => setMode('create')}>Create group</div>
        <div className={`tab ${mode === 'join' ? 'active' : ''}`} onClick={() => setMode('join')}>Join group</div>
      </div>

      <div className="field">
        <label>Your name</label>
        <input value={member} onChange={(e) => setMember(e.target.value)} placeholder="Me" />
      </div>

      {mode === 'create' ? (
        <div className="field">
          <label>Group name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Matchday" />
        </div>
      ) : (
        <div className="field">
          <label>Invite code</label>
          <input value={invite} onChange={(e) => setInvite(e.target.value)} placeholder="&lt;secret&gt;:&lt;bootstrap&gt;" />
        </div>
      )}

      {error && <div className="error" style={{ marginBottom: 12 }}>{error}</div>}

      <button className="btn" onClick={submit} disabled={busy}>
        {busy ? 'Working…' : mode === 'create' ? 'Create group' : 'Join group'}
      </button>
    </div>
  )
}

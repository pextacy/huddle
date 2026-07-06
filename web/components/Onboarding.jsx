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
    <div className="lc-center">
      <div style={{ marginBottom: 18 }}>
        <div className="lc-label">Get started</div>
        <h1 style={{ margin: '6px 0 4px', fontSize: 30, letterSpacing: '-0.02em' }}>Open a shared ledger</h1>
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>Create a P2P group or join one with an invite. Track expenses offline, settle in USD₮ when online.</p>
      </div>

      <div className="lc-card">
        <div className="lc-card-body">
          <div className="lc-seg" style={{ marginBottom: 16 }}>
            <button className={`lc-seg-item ${mode === 'create' ? 'active' : ''}`} onClick={() => setMode('create')}>Create group</button>
            <button className={`lc-seg-item ${mode === 'join' ? 'active' : ''}`} onClick={() => setMode('join')}>Join group</button>
          </div>

          <div className="lc-field">
            <label className="lc-label">Your name</label>
            <input className="lc-input" value={member} onChange={(e) => setMember(e.target.value)} placeholder="Me" />
          </div>

          {mode === 'create' ? (
            <div className="lc-field">
              <label className="lc-label">Group name</label>
              <input className="lc-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Matchday" />
            </div>
          ) : (
            <div className="lc-field">
              <label className="lc-label">Invite code</label>
              <input className="lc-input mono" value={invite} onChange={(e) => setInvite(e.target.value)} placeholder="<secret>:<bootstrap>" />
            </div>
          )}

          {error && <div className="lc-error" style={{ marginBottom: 12 }}>{error}</div>}

          <button className="lc-btn lc-btn-primary lc-btn-block" onClick={submit} disabled={busy}>
            {busy ? 'Working…' : mode === 'create' ? 'Create group' : 'Join group'}
          </button>
        </div>
      </div>
    </div>
  )
}

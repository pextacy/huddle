'use client'

import { useState } from 'react'
import { post } from '../lib/api'
import Icon from './Icon'

/**
 * Multi-group switcher (Splitwise-style group list). Shows the active group name; tapping opens a
 * sheet to switch between the groups this device has joined, create a new one, join by invite, or
 * leave. Each group is a separate P2P ledger; switching brings its ledger live.
 */
export default function GroupSwitcher ({ groups, activeId, activeName }) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState('list') // 'list' | 'create' | 'join'
  const [name, setName] = useState('')
  const [member, setMember] = useState('Me')
  const [invite, setInvite] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const list = groups || []

  async function run (fn) {
    setBusy(true); setError(null)
    try { await fn(); setOpen(false); setTab('list'); setName(''); setInvite('') }
    catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  const pickGroup = (id) => { if (id !== activeId) run(() => post('group/switch', { id })) }
  const create = () => run(() => post('group/create', { name: name.trim() || 'Group', member: member.trim() || 'Me' }))
  const join = () => run(() => post('group/join', { invite: invite.trim(), member: member.trim() || 'Me' }))
  async function leave (id, gname) {
    if (typeof window !== 'undefined' && !window.confirm(`Leave "${gname}"? It stays on other members' devices; this only forgets it here.`)) return
    run(() => post('group/leave', { id }))
  }

  return (
    <>
      <button className="m-groupbtn" onClick={() => { setOpen(true); setTab('list') }} aria-haspopup="dialog">
        <span className="m-groupbtn-name">{activeName || 'Group'}</span>
        <Icon name="down" size={14} />
      </button>

      {open && (
        <div className="m-sheet-backdrop" onClick={() => setOpen(false)}>
          <div className="m-sheet" role="dialog" aria-label="Groups" onClick={(e) => e.stopPropagation()}>
            <div className="row spread" style={{ marginBottom: 12 }}>
              <h3 className="lc-card-title">Your groups</h3>
              <button className="icon-btn" onClick={() => setOpen(false)} aria-label="close"><Icon name="add" size={18} style={{ transform: 'rotate(45deg)' }} /></button>
            </div>

            <div className="lc-seg" style={{ marginBottom: 14 }}>
              {[['list', 'Switch'], ['create', 'New'], ['join', 'Join']].map(([k, l]) => (
                <button key={k} className={`lc-seg-item ${tab === k ? 'active' : ''}`} onClick={() => { setTab(k); setError(null) }}>{l}</button>
              ))}
            </div>

            {tab === 'list' && (
              <div className="m-stack">
                {list.length === 0 && <div className="lc-empty">No groups yet.</div>}
                {list.map((g) => (
                  <div key={g.id} className={`m-brow ${g.active ? 'accent' : ''}`}>
                    <button className="m-who" style={{ textAlign: 'left', background: 'none', border: 0, cursor: 'pointer', color: 'inherit' }} onClick={() => pickGroup(g.id)} disabled={busy}>
                      <div className="m-who-name">{g.name}{g.active ? ' · active' : ''}</div>
                      <div className="m-who-sub">{g.active ? 'Live now' : 'Tap to switch'}</div>
                    </button>
                    {!g.active && <button className="lc-linkbtn danger" disabled={busy} onClick={() => leave(g.id, g.name)}>Leave</button>}
                  </div>
                ))}
              </div>
            )}

            {tab === 'create' && (
              <div>
                <div className="lc-field"><label className="lc-label">Your name</label><input className="lc-input" value={member} onChange={(e) => setMember(e.target.value)} placeholder="Me" /></div>
                <div className="lc-field"><label className="lc-label">Group name</label><input className="lc-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Weekend trip" /></div>
                <button className="lc-btn lc-btn-primary lc-btn-block" disabled={busy} onClick={create}>{busy ? 'Creating…' : 'Create group'}</button>
              </div>
            )}

            {tab === 'join' && (
              <div>
                <div className="lc-field"><label className="lc-label">Your name</label><input className="lc-input" value={member} onChange={(e) => setMember(e.target.value)} placeholder="Me" /></div>
                <div className="lc-field"><label className="lc-label">Invite code</label><input className="lc-input mono" value={invite} onChange={(e) => setInvite(e.target.value)} placeholder="<secret>:<bootstrap>" /></div>
                <button className="lc-btn lc-btn-primary lc-btn-block" disabled={busy} onClick={join}>{busy ? 'Joining…' : 'Join group'}</button>
              </div>
            )}

            {error && <div className="lc-error" style={{ marginTop: 12 }}>{error}</div>}
          </div>
        </div>
      )}
    </>
  )
}

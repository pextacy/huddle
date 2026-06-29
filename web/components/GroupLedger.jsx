'use client'

import { useState } from 'react'
import { post } from '../lib/api'
import AddExpense from './AddExpense'
import Qr from './Qr'

function fmt (minor) {
  const neg = minor < 0
  const abs = Math.abs(minor)
  return `${neg ? '-' : ''}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

function nameOf (group, id) {
  return group.members?.[id]?.name || id
}

export default function GroupLedger ({ group, wallet }) {
  const [writerKey, setWriterKey] = useState('')
  const [copied, setCopied] = useState(false)
  const [showQr, setShowQr] = useState(false)
  const [err, setErr] = useState(null)
  const [settling, setSettling] = useState(null) // index being settled
  const [settleErr, setSettleErr] = useState(null)
  const [lastTx, setLastTx] = useState(null)

  const me = group.me
  const myNet = group.balances?.[me.memberId] ?? 0
  const canSettle = wallet?.ok && wallet?.online
  const explorerTx = wallet?.network?.explorerTxUrl

  async function settle (t, i) {
    setSettling(i); setSettleErr(null)
    try {
      const res = await post('settle', { to: t.to, amountMinor: t.amountMinor })
      setLastTx(res.txHash)
    } catch (e) { setSettleErr(e.message) } finally { setSettling(null) }
  }

  async function approve () {
    setErr(null)
    try { await post('writer/approve', { writerKey: writerKey.trim() }); setWriterKey('') } catch (e) { setErr(e.message) }
  }

  function copyInvite () {
    navigator.clipboard?.writeText(group.group.invite)
    setCopied(true); setTimeout(() => setCopied(false), 1500)
  }

  const expenses = (group.entries || []).filter((e) => e.type === 'expense')
  const payments = (group.entries || []).filter((e) => e.type === 'payment')

  return (
    <>
      <div className="card">
        <div className="row spread">
          <h2 style={{ margin: 0 }}>{group.group.name}</h2>
          <span className="badge">{group.peers} peer{group.peers === 1 ? '' : 's'}</span>
        </div>
        <div className="row spread" style={{ marginTop: 10 }}>
          <span className="muted small">{myNet >= 0 ? 'You are owed' : 'You owe'}</span>
          <span className={`amount ${myNet < 0 ? 'neg' : ''}`} style={{ fontSize: 28 }}>{fmt(Math.abs(myNet))} USD₮</span>
        </div>
        <div className="field" style={{ marginTop: 12 }}>
          <label>Invite (share to add members)</label>
          <div className="row" style={{ gap: 8 }}>
            <div className="mono small" style={{ flex: 1 }}>{group.group.invite}</div>
            <button className="btn small secondary" onClick={copyInvite}>{copied ? 'Copied' : 'Copy'}</button>
            <button className="btn small secondary" onClick={() => setShowQr((v) => !v)}>{showQr ? 'Hide QR' : 'QR'}</button>
          </div>
          {showQr && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
              <Qr text={group.group.invite} size={180} />
            </div>
          )}
        </div>
      </div>

      <AddExpense group={group} />

      <div className="card">
        <h2>Balances</h2>
        <div className="list">
          {Object.keys(group.balances || {}).length === 0 && <span className="muted small">No balances yet.</span>}
          {Object.entries(group.balances || {}).map(([id, net]) => (
            <div key={id} className="item">
              <span>{nameOf(group, id)}{id === me.memberId ? ' (you)' : ''}</span>
              <span className={net < 0 ? 'status-offline' : 'status-online'}>{net >= 0 ? '+' : ''}{fmt(net)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="row spread">
          <h2 style={{ margin: 0 }}>Settle up — minimal transfers</h2>
          <span className={canSettle ? 'badge status-online' : 'badge status-offline'}>
            {canSettle ? 'online' : 'offline'}
          </span>
        </div>
        {(group.plan || []).length === 0 ? (
          <span className="muted small">All settled — no transfers needed.</span>
        ) : (
          <div className="list" style={{ marginTop: 12 }}>
            {group.plan.map((t, i) => {
              const mine = t.from === me.memberId
              return (
                <div key={i} className="item">
                  <div className="meta">
                    <span>{nameOf(group, t.from)} → {nameOf(group, t.to)}</span>
                    <span className="muted small">{mine ? 'you pay' : ''} {fmt(t.amountMinor)} USD₮</span>
                  </div>
                  {mine
                    ? (
                      <button
                        className="btn small"
                        disabled={!canSettle || settling !== null}
                        onClick={() => settle(t, i)}
                        title={canSettle ? 'Send USD₮ on-chain' : 'Needs internet to settle on-chain'}
                      >
                        {settling === i ? 'Sending…' : 'Pay in USD₮'}
                      </button>
                      )
                    : <span className="status-online">{fmt(t.amountMinor)} USD₮</span>}
                </div>
              )
            })}
            {!canSettle && <div className="notice">Settlement needs the internet — the USD₮ transfer writes to a blockchain. Everything else works offline.</div>}
            {settleErr && <div className="error">{settleErr}</div>}
            {lastTx && (
              <div className="notice">
                Sent! tx{' '}
                {explorerTx ? <a href={`${explorerTx}${lastTx}`} target="_blank" rel="noreferrer" className="mono" style={{ color: 'var(--accent)' }}>{lastTx.slice(0, 18)}…</a> : <span className="mono">{lastTx.slice(0, 18)}…</span>}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <h2>Activity</h2>
        <div className="list">
          {expenses.length === 0 && payments.length === 0 && <span className="muted small">No expenses yet.</span>}
          {expenses.map((e) => (
            <div key={e.id} className="item">
              <div className="meta">
                <span>{e.description || 'Expense'}</span>
                <span className="muted small">{nameOf(group, e.payer)} paid · split {e.participants.length} ways</span>
              </div>
              <span>{fmt(e.amountMinor)} USD₮</span>
            </div>
          ))}
          {payments.map((p) => (
            <div key={p.id} className="item">
              <div className="meta">
                <span><span className="tag">payment</span> {nameOf(group, p.from)} → {nameOf(group, p.to)}</span>
                <span className="muted small mono">{p.txHash?.slice(0, 18)}…</span>
              </div>
              <span className="status-online">{fmt(p.amountMinor)} USD₮</span>
            </div>
          ))}
        </div>
      </div>

      {!me.writable && (
        <div className="card">
          <h2>Become a writer</h2>
          <div className="notice" style={{ marginBottom: 10 }}>Share this writer key with a group member so they can approve you.</div>
          <div className="mono small">{me.writerKey}</div>
        </div>
      )}

      {me.writable && (
        <div className="card">
          <h2>Approve a member</h2>
          <div className="field">
            <label>Their writer key (64 hex)</label>
            <input value={writerKey} onChange={(e) => setWriterKey(e.target.value)} placeholder="paste writer key" />
          </div>
          {err && <div className="error" style={{ marginBottom: 12 }}>{err}</div>}
          <button className="btn secondary" onClick={approve} disabled={!writerKey.trim()}>Approve writer</button>
        </div>
      )}
    </>
  )
}

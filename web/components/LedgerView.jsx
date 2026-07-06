'use client'

import { useRef, useState } from 'react'
import { post } from '../lib/api'
import { fmt, fmtSigned, nameOf, initials } from '../lib/format'
import AddExpense from './AddExpense'
import MobileHeader from './MobileHeader'
import GroupSwitcher from './GroupSwitcher'
import Qr from './Qr'
import Icon from './Icon'

function newIdempotencyKey () {
  return (globalThis.crypto?.randomUUID?.()) || `s-${Date.now()}-${Math.random().toString(16).slice(2)}`
}
function clientFee (amountMinor, fee) {
  if (!fee?.enabled) return 0
  let f = fee.bps > 0 ? Math.floor((amountMinor * fee.bps) / 10000) : 0
  if (fee.minMinor) f = Math.max(f, fee.minMinor)
  if (fee.maxMinor != null) f = Math.min(f, fee.maxMinor)
  if (f > amountMinor) f = amountMinor
  return f
}

export default function LedgerView ({ group, wallet, groups, showAdd, setShowAdd }) {
  const me = group.me
  const [copied, setCopied] = useState(false)
  const [showQr, setShowQr] = useState(false)
  const [settling, setSettling] = useState(null)
  const [settleErr, setSettleErr] = useState(null)
  const [lastSettle, setLastSettle] = useState(null)
  const [cashing, setCashing] = useState(null)
  const [nudging, setNudging] = useState(null)
  const [nudged, setNudged] = useState({})
  const [stopping, setStopping] = useState(null)

  // A stable idempotency key per pending transfer, minted once and reused across retries until the
  // debt is actually recorded. Without this, a retry after a lost response (the transfer already
  // landed server-side) would mint a fresh key and pay the creditor a second time on-chain.
  const settleKeys = useRef({})
  const sigOf = (t) => `${t.to}:${t.amountMinor}`
  function keyFor (t) {
    const sig = sigOf(t)
    if (!settleKeys.current[sig]) settleKeys.current[sig] = newIdempotencyKey()
    return settleKeys.current[sig]
  }
  function retireKey (res, t) { if (res?.txHash && !res.recordError) delete settleKeys.current[sigOf(t)] }

  const canSettle = wallet?.ok && wallet?.online
  const online = !!wallet?.online
  const explorerTx = wallet?.network?.explorerTxUrl
  const fee = wallet?.fee
  const pro = wallet?.pro
  const insights = group.insights
  const balances = Object.entries(group.balances || {})
  const plan = group.plan || []
  const myTransfers = plan.filter((t) => t.from === me.memberId)
  const myNet = group.balances?.[me.memberId] ?? 0

  // "Paid N expenses" per member.
  const expenses = (group.entries || []).filter((e) => e.type === 'expense')
  const paidCount = {}
  for (const e of expenses) paidCount[e.payer] = (paidCount[e.payer] ?? 0) + 1

  // Spend trajectory — the most recent expenses (oldest→newest), scaled to the biggest bar.
  const traj = [...expenses].sort((a, b) => (a.ts || 0) - (b.ts || 0)).slice(-8)
  const trajMax = Math.max(1, ...traj.map((e) => e.amountMinor))

  async function settle (t, i) {
    setSettling(i); setSettleErr(null)
    try {
      const res = await post('settle', { to: t.to, amountMinor: t.amountMinor, idempotencyKey: keyFor(t) })
      setLastSettle(res)
      retireKey(res, t) // keep the key if recording failed so a retry dedupes instead of paying twice
    } catch (e) { setSettleErr(e.message) } finally { setSettling(null) }
  }
  async function settleAll () {
    setSettling('all'); setSettleErr(null)
    try {
      for (const t of myTransfers) {
        const res = await post('settle', { to: t.to, amountMinor: t.amountMinor, idempotencyKey: keyFor(t) })
        setLastSettle(res)
        retireKey(res, t)
      }
    } catch (e) { setSettleErr(e.message) } finally { setSettling(null) }
  }
  async function cashSettle (t, i) {
    setCashing(i); setSettleErr(null)
    try {
      const res = await post('settle/cash', { to: t.to, amountMinor: t.amountMinor })
      setLastSettle({ cash: true, ...res })
    } catch (e) { setSettleErr(e.message) } finally { setCashing(null) }
  }
  async function stopRecurring (id) {
    if (typeof window !== 'undefined' && !window.confirm('Stop this recurring expense? Past occurrences stay; no new ones are added.')) return
    setStopping(id); setSettleErr(null)
    try { await post('recurring/stop', { id }) } catch (e) { setSettleErr(e.message) } finally { setStopping(null) }
  }
  async function nudge (t) {
    const k = `${t.from}-${t.to}`
    setNudging(k); setSettleErr(null)
    try { await post('nudge', { to: t.from }); setNudged((m) => ({ ...m, [k]: true })) }
    catch (e) { setSettleErr(e.message) } finally { setNudging(null) }
  }
  function copyInvite () {
    navigator.clipboard?.writeText(group.group.invite)
    setCopied(true); setTimeout(() => setCopied(false), 1500)
  }

  return (
    <>
      <MobileHeader title={group.group.name} online={online} showWifi
        rightSlot={<GroupSwitcher groups={groups?.groups} activeId={groups?.activeId ?? group.group.id} activeName={group.group.name} />}
      />

      {showAdd && <div style={{ marginBottom: 12 }}><AddExpense group={group} onClose={() => setShowAdd(false)} /></div>}

      {/* Total ledger volume */}
      <div className="m-card accent">
        <div className="row spread">
          <span className="m-label">Total Ledger Volume</span>
          <span style={{ color: 'var(--muted)' }}><Icon name="bank" size={20} /></span>
        </div>
        <div className="m-hero-amt">{fmt(insights?.totalSpentMinor ?? 0)} <span className="cur">USD₮</span></div>
        <div className="muted small" style={{ marginTop: 4 }}>Across {insights?.expenseCount ?? 0} expense{(insights?.expenseCount ?? 0) === 1 ? '' : 's'}</div>
      </div>

      {/* My balance + peers */}
      <div className="m-grid2" style={{ marginTop: 12 }}>
        <div className="m-card">
          <span className="m-label">My Balance</span>
          <div className={`m-hero-amt mid ${myNet < 0 ? 'debt' : 'credit'}`}>{fmtSigned(myNet)}</div>
        </div>
        <div className="m-card">
          <span className="m-label">Peers</span>
          <div className="m-hero-amt mid">{group.peers}<span className="cur" style={{ marginLeft: 6 }}>{online ? 'online' : 'offline'}</span></div>
        </div>
      </div>

      {/* Invite */}
      <div className="m-card" style={{ marginTop: 12 }}>
        <div className="row spread" style={{ gap: 10 }}>
          <span className="m-label">Invite members</span>
          <div className="row" style={{ gap: 8 }}>
            <button className="lc-btn lc-btn-ghost lc-btn-sm" onClick={copyInvite}><Icon name="copy" size={14} /> {copied ? 'Copied' : 'Copy'}</button>
            <button className="lc-btn lc-btn-ghost lc-btn-sm" onClick={() => setShowQr((v) => !v)}><Icon name="qr" size={14} /> {showQr ? 'Hide' : 'QR'}</button>
          </div>
        </div>
        <div className="mono small wrap muted" style={{ marginTop: 10 }}>{group.group.invite}</div>
        {showQr && <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}><Qr text={group.group.invite} size={180} /></div>}
      </div>

      {/* Recurring expenses */}
      {group.recurring?.length > 0 && (
        <>
          <div className="m-section"><Icon name="activity" size={17} /> Recurring</div>
          <div className="m-stack">
            {group.recurring.map((r) => (
              <div key={r.id} className="m-brow">
                <div className="m-who">
                  <div className="m-who-name">{r.description || 'Recurring expense'}</div>
                  <div className="m-who-sub">{r.cadence} · {fmt(r.amountMinor)} USD₮ · {r.participants?.length ?? 0} people</div>
                </div>
                <div className="row" style={{ gap: 10 }}>
                  <span className="m-amt">{fmt(r.amountMinor)}</span>
                  {me.writable && (
                    <button className="lc-btn lc-btn-ghost lc-btn-sm" disabled={stopping === r.id} onClick={() => stopRecurring(r.id)}>
                      {stopping === r.id ? '…' : 'Stop'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Global balances */}
      <div className="m-section">Global Balances</div>
      <div className="m-stack">
        {balances.length === 0 && <div className="m-card"><span className="lc-empty">No balances yet. Add an expense to get started.</span></div>}
        {balances.map(([id, net]) => {
          const settled = net === 0
          const mine = id === me.memberId
          const tag = settled ? 'SETTLED' : net > 0 ? 'CREDIT' : 'DEBT'
          const cls = settled ? 'muted' : net > 0 ? 'credit' : 'debt'
          return (
            <div key={id} className={`m-brow ${settled ? 'settled' : (net > 0 || mine) ? 'accent' : ''}`}>
              <span className={`m-avatar ${mine ? 'me' : ''}`}>{mine ? 'You' : initials(nameOf(group, id))}</span>
              <div className="m-who">
                <div className="m-who-name">{mine ? 'You' : nameOf(group, id)}</div>
                <div className="m-who-sub">Paid {paidCount[id] ?? 0} expense{(paidCount[id] ?? 0) === 1 ? '' : 's'}</div>
              </div>
              <div className="row" style={{ gap: 10 }}>
                <span className={`m-tag ${settled ? '' : net > 0 ? 'credit' : 'debt'}`}>
                  {!settled && <span className={`m-dot ${net > 0 ? 'credit' : 'debt'}`} />}{tag}
                </span>
                <span className={`m-amt ${cls}`}>{settled ? fmt(0) : fmtSigned(net)}</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Optimized settlement */}
      <div className="m-section"><Icon name="sparkle" size={18} style={{ color: 'var(--primary)' }} /> Optimized Settlement</div>

      {plan.length === 0 ? (
        <div className="m-card"><span className="lc-empty">All settled — no transfers needed. ✅</span></div>
      ) : myTransfers.length === 0 ? (
        <div className="m-stack">
          <div className="m-card"><span className="lc-empty">You’re square. Others still owe:</span></div>
          {plan.map((t) => {
            const owedToMe = t.to === me.memberId
            const k = `${t.from}-${t.to}`
            return (
              <div key={`${t.from}-${t.to}-${t.amountMinor}`} className="m-brow">
                <div className="m-who"><div className="m-who-name">{nameOf(group, t.from)} → {nameOf(group, t.to)}</div><div className="m-who-sub">Pending settlement</div></div>
                <div className="row" style={{ gap: 10 }}>
                  <span className="m-amt">{fmt(t.amountMinor)}</span>
                  {owedToMe && (
                    <button className="lc-btn lc-btn-ghost lc-btn-sm" disabled={nudging === k || nudged[k] || !me.writable} onClick={() => nudge(t)}>
                      <Icon name="bell" size={14} /> {nudging === k ? '…' : nudged[k] ? 'Sent' : 'Remind'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="m-stack">
          {myTransfers.length > 1 && (
            <button className="lc-btn lc-btn-outline lc-btn-block lc-btn-lg" disabled={!canSettle || settling !== null} onClick={settleAll}>
              {settling === 'all' ? 'Settling all…' : `Pay all ${myTransfers.length} debts`}
            </button>
          )}
          {myTransfers.map((t, i) => {
            const estFee = pro?.active ? 0 : clientFee(t.amountMinor, fee)
            return (
              <div key={`${t.from}-${t.to}-${t.amountMinor}`} className="m-card accent">
                <div className="row spread">
                  <div>
                    <div className="m-label">To settle your debt</div>
                    <div style={{ marginTop: 6, fontSize: 15 }}>Pay <strong>{nameOf(group, t.to)}</strong></div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="m-hero-amt mid">{fmt(t.amountMinor)}</div>
                    {estFee > 0 && <div className="muted small mono">+{fmt(estFee)} fee</div>}
                    {pro?.active && fee?.enabled && <div className="credit small mono">Pro · no fee</div>}
                  </div>
                </div>
                <hr className="m-settle-line" />
                <button className="lc-btn lc-btn-primary lc-btn-block lc-btn-lg" disabled={!canSettle || settling !== null || cashing !== null} onClick={() => settle(t, i)}>
                  <Icon name="send" size={17} /> {settling === i ? 'Sending…' : 'Pay in USD₮'}
                </button>
                <button className="lc-btn lc-btn-ghost lc-btn-block" style={{ marginTop: 8 }} disabled={settling !== null || cashing !== null} onClick={() => cashSettle(t, i)}>
                  {cashing === i ? 'Recording…' : 'Mark as paid (cash)'}
                </button>
              </div>
            )
          })}
        </div>
      )}

      {(settleErr || lastSettle || (!canSettle && myTransfers.length > 0)) && (
        <div className="m-stack" style={{ marginTop: 12 }}>
          {!canSettle && myTransfers.length > 0 && (
            wallet?.ok === false
              ? <div className="lc-error">Wallet unavailable: {wallet.error || 'unknown error'}. On-chain settlement is disabled — you can still “Mark as paid (cash)”.</div>
              : <div className="lc-notice">Paying in USD₮ needs the internet (it writes to a blockchain). Offline, you can still “Mark as paid (cash)”.</div>
          )}
          {settleErr && <div className="lc-error">{settleErr}</div>}
          {lastSettle?.cash && <div className="lc-ok-notice">Recorded a cash payment — the debt is cleared for everyone once peers sync. No USD₮ moved on-chain.</div>}
          {lastSettle?.txHash && (
            lastSettle.recordError ? (
              <div className="lc-notice">
                Paid on-chain (tx{' '}
                {explorerTx ? <a href={`${explorerTx}${lastSettle.txHash}`} target="_blank" rel="noreferrer" className="lc-link mono">{lastSettle.txHash.slice(0, 18)}…</a> : <span className="mono">{lastSettle.txHash.slice(0, 18)}…</span>}
                ) but the ledger record didn’t save. <strong>Don’t pay again</strong> — it reconciles when peers sync, and a retry is safe (it won’t send twice).
              </div>
            ) : (
              <div className="lc-ok-notice">
                Sent! debt tx{' '}
                {explorerTx ? <a href={`${explorerTx}${lastSettle.txHash}`} target="_blank" rel="noreferrer" className="lc-link mono">{lastSettle.txHash.slice(0, 18)}…</a> : <span className="mono">{lastSettle.txHash.slice(0, 18)}…</span>}
                {lastSettle.feeMinor > 0 && <><br />Platform fee {fmt(lastSettle.feeMinor)} USD₮</>}
                {lastSettle.feeError && <><br /><span className="warnc small">Debt cleared; fee skim deferred.</span></>}
              </div>
            )
          )}
        </div>
      )}

      {/* Spend trajectory */}
      {traj.length > 0 && (
        <>
          <div className="m-section">Spend Trajectory</div>
          <div className="m-card">
            <div className="m-chart">
              {traj.map((e, i) => (
                <div
                  key={e.id}
                  className={`m-chart-bar ${e.amountMinor === trajMax ? 'max' : ''}`}
                  style={{ height: `${Math.max(6, Math.round((e.amountMinor / trajMax) * 100))}%` }}
                  title={`${e.description || 'Expense'} · ${fmt(e.amountMinor)} USD₮`}
                />
              ))}
            </div>
            <div className="m-chart-legend"><span className="m-dot credit" /> Recent expenses (last {traj.length})</div>
          </div>
        </>
      )}

      {/* Spend by category */}
      {insights?.byCategory?.length > 0 && (
        <>
          <div className="m-section">Spend by Category</div>
          <div className="m-card">
            {insights.byCategory.map((c) => (
              <div key={c.key} className="m-cat">
                <div className="m-cat-head">
                  <span className="m-cat-name"><span className="chip-emoji">{c.emoji}</span>{c.label}</span>
                  <span className="mono muted small">{fmt(c.amountMinor)} · {c.pct}%</span>
                </div>
                <div className="m-bar"><div className="m-bar-fill" style={{ width: `${c.pct}%` }} /></div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  )
}

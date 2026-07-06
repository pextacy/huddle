'use client'

import { useState } from 'react'
import { post } from '../lib/api'
import { fmt } from '../lib/format'
import MobileHeader from './MobileHeader'
import Qr from './Qr'
import Icon from './Icon'

export default function WalletView ({ group, wallet }) {
  const me = group?.me
  const [showQr, setShowQr] = useState(false)
  const [copied, setCopied] = useState(false)
  const [writerKey, setWriterKey] = useState('')
  const [approveErr, setApproveErr] = useState(null)
  const [proMonths, setProMonths] = useState(1)
  const [subBusy, setSubBusy] = useState(false)
  const [proErr, setProErr] = useState(null)
  const [proTx, setProTx] = useState(null)
  const [netBusy, setNetBusy] = useState(null)
  const [netErr, setNetErr] = useState(null)

  const online = !!wallet?.online
  const canPay = wallet?.ok && online
  const fee = wallet?.fee
  const pro = wallet?.pro
  const revenue = group?.revenue
  const explorerTx = wallet?.network?.explorerTxUrl
  const activeKey = wallet?.network?.key
  const networks = wallet?.networks || []
  const faucets = wallet?.faucets || []
  const isMainnet = wallet?.testnet === false
  const lowGas = wallet?.ok && online && wallet?.lowGas

  async function switchNetwork (key) {
    if (key === activeKey || netBusy) return
    setNetBusy(key); setNetErr(null)
    try { await post('network', { key }) } catch (e) { setNetErr(e.message) } finally { setNetBusy(null) }
  }

  async function subscribePro () {
    setSubBusy(true); setProErr(null)
    try { const res = await post('pro/subscribe', { months: proMonths }); setProTx(res.txHash) } catch (e) { setProErr(e.message) } finally { setSubBusy(false) }
  }
  async function approve () {
    setApproveErr(null)
    try { await post('writer/approve', { writerKey: writerKey.trim() }); setWriterKey('') } catch (e) { setApproveErr(e.message) }
  }
  function copyAddr () {
    if (!wallet?.address) return
    navigator.clipboard?.writeText(wallet.address)
    setCopied(true); setTimeout(() => setCopied(false), 1500)
  }

  return (
    <>
      <MobileHeader title="Wallet" online={online} showWifi />

      {/* Wallet USD₮ balance */}
      <div className="m-card accent">
        <div className="row spread">
          <span className="m-label">Total USD₮ Balance</span>
          <span className={`m-tag ${online ? 'credit' : 'warn'}`}>{online ? <><span className="m-dot credit" />ONLINE</> : 'OFFLINE'}</span>
        </div>
        {wallet?.ok ? (
          <>
            <div className="m-hero-amt">{wallet.usdt ?? '—'} <span className="cur">USD₮</span></div>
            <div className="muted small mono" style={{ marginTop: 4 }}>Gas: {wallet.gas ?? '—'} ETH</div>
            <div className="row" style={{ gap: 10, marginTop: 16 }}>
              <button className="lc-btn lc-btn-primary lc-btn-block" onClick={() => setShowQr((v) => !v)}><Icon name="qr" size={16} /> Receive</button>
              <button className="lc-btn lc-btn-outline lc-btn-block" onClick={copyAddr}><Icon name="copy" size={16} /> {copied ? 'Copied' : 'Copy'}</button>
            </div>
            {showQr && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginTop: 16 }}>
                <Qr text={wallet.address} size={190} />
                <div className="mono small wrap muted" style={{ textAlign: 'center' }}>{wallet.address}</div>
              </div>
            )}
          </>
        ) : (
          <div className="lc-error" style={{ marginTop: 12 }}>Wallet unavailable: {wallet?.error || 'unknown error'}</div>
        )}
        {lowGas && (
          <div className="lc-notice" style={{ marginTop: 12 }}>
            Low gas ({wallet.gas} ETH). A settlement may fail until you top up native {isMainnet ? 'ETH' : 'test ETH'}{!isMainnet ? ' from the faucet below' : ''}.
          </div>
        )}
      </div>

      {/* Network switcher — flip testnet ↔ mainnet live (no restart) */}
      <div className="m-section">Network</div>
      <div className="m-card">
        {networks.length > 0 && (
          <div className="lc-seg" style={{ marginBottom: 12 }}>
            {networks.map((n) => (
              <button
                key={n.key}
                className={`lc-seg-item ${n.key === activeKey ? 'active' : ''}`}
                disabled={netBusy !== null}
                onClick={() => switchNetwork(n.key)}
              >
                {netBusy === n.key ? 'Switching…' : `${n.name}${n.testnet ? ' · testnet' : ''}`}
              </button>
            ))}
          </div>
        )}
        <div className="row spread">
          <span className="m-label">Active</span>
          <span className="mono small">{wallet?.network?.name || '—'}{wallet?.network?.chainId ? ` · ${wallet.network.chainId}` : ''}</span>
        </div>
        <div className="row spread" style={{ marginTop: 8 }}>
          <span className="m-label">Settlement</span>
          <span className="row" style={{ gap: 8 }}>
            <span className={`lc-status-dot ${online ? 'on' : 'off'}`} />
            <span className={`mono small ${online ? 'credit' : 'warnc'}`}>{online ? 'ready' : 'local only'}</span>
          </span>
        </div>

        {isMainnet && (
          <div className="lc-danger" style={{ marginTop: 12 }}>
            <strong>Mainnet — real money.</strong> Settlements send real USD₮ on Ethereum and cannot be undone.
          </div>
        )}
        {netErr && <div className="lc-error" style={{ marginTop: 12 }}>{netErr}</div>}

        {faucets.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div className="m-label" style={{ marginBottom: 8 }}>Get test funds (free)</div>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              {faucets.map((f) => (
                <a key={f.url} className="lc-btn lc-btn-outline lc-btn-sm" href={f.url} target="_blank" rel="noreferrer">{f.label}</a>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Pro */}
      {pro?.enabled && (
        <>
          <div className="m-section">Pro Subscription</div>
          <div className="m-card">
            <div className="row spread">
              <span style={{ fontWeight: 700 }}>Pro</span>
              <span className={`m-tag ${pro.active ? 'credit' : ''}`}>{pro.active ? <><span className="m-dot credit" />ACTIVE</> : 'FREE PLAN'}</span>
            </div>
            <div className="lc-notice" style={{ margin: '12px 0' }}>Waives the {(fee.bps / 100).toFixed(2)}% settle fee for a flat {fmt(pro.pricePerMonthMinor)} USD₮/month.</div>
            {pro.active && pro.until && <div className="row spread small muted" style={{ marginBottom: 12 }}><span>Subscribed until</span><span className="mono">{new Date(pro.until).toLocaleDateString()}</span></div>}
            <div className="lc-field">
              <label className="m-label">Plan length</label>
              <select className="lc-select" value={proMonths} onChange={(e) => setProMonths(Number(e.target.value))}>
                {[1, 3, 6, 12].map((m) => <option key={m} value={m}>{m} month{m === 1 ? '' : 's'} · {fmt(m * pro.pricePerMonthMinor)} USD₮</option>)}
              </select>
            </div>
            {proErr && <div className="lc-error" style={{ marginBottom: 12 }}>{proErr}</div>}
            <button className="lc-btn lc-btn-primary lc-btn-block lc-btn-lg" disabled={!canPay || subBusy} onClick={subscribePro}>
              {subBusy ? 'Subscribing…' : `${pro.active ? 'Extend Pro' : 'Subscribe'} · ${fmt(proMonths * pro.pricePerMonthMinor)} USD₮`}
            </button>
            {!canPay && <div className="lc-notice" style={{ marginTop: 10 }}>Subscribing needs the internet — it's a real USD₮ transfer.</div>}
            {proTx && <div className="lc-ok-notice" style={{ marginTop: 10 }}>Subscribed! tx {explorerTx ? <a className="lc-link mono" href={`${explorerTx}${proTx}`} target="_blank" rel="noreferrer">{proTx.slice(0, 18)}…</a> : <span className="mono">{proTx.slice(0, 18)}…</span>}</div>}
          </div>
        </>
      )}

      {/* Platform revenue */}
      {fee?.enabled && (
        <>
          <div className="m-section">Platform Revenue</div>
          <div className="m-card">
            <div className="row spread">
              <span className="m-label">Fees collected</span>
              <span className="m-tag">{(fee.bps / 100).toFixed(2)}% / settle</span>
            </div>
            <div className="m-hero-amt mid credit">{fmt(revenue?.feesMinor ?? 0)} <span className="cur">USD₮</span></div>
            <div className="row spread small muted" style={{ marginTop: 8 }}>
              <span>{revenue?.count ?? 0} settlement{(revenue?.count ?? 0) === 1 ? '' : 's'} charged</span>
              <span className="mono">{fee.treasury?.slice(0, 8)}…{fee.treasury?.slice(-6)}</span>
            </div>
            {pro?.subscriptionRevenueMinor > 0 && <div className="row spread small muted" style={{ marginTop: 8 }}><span>Subscription revenue (device)</span><span className="credit mono">{fmt(pro.subscriptionRevenueMinor)} USD₮</span></div>}
          </div>
        </>
      )}

      {/* Writer access */}
      {me && !me.writable && (
        <>
          <div className="m-section">Writer Access</div>
          <div className="m-card">
            <div className="lc-notice" style={{ marginBottom: 12 }}>Share this writer key with a group member so they can approve you.</div>
            <div className="mono small wrap">{me.writerKey}</div>
          </div>
        </>
      )}
      {me && me.writable && (
        <>
          <div className="m-section">Approve a Member</div>
          <div className="m-card">
            <div className="lc-field">
              <label className="m-label">Their writer key (64 hex)</label>
              <input className="lc-input mono" value={writerKey} onChange={(e) => setWriterKey(e.target.value)} placeholder="paste writer key" />
            </div>
            {approveErr && <div className="lc-error" style={{ marginBottom: 12 }}>{approveErr}</div>}
            <button className="lc-btn lc-btn-outline lc-btn-block" onClick={approve} disabled={!writerKey.trim()}>Approve writer</button>
          </div>
        </>
      )}
    </>
  )
}

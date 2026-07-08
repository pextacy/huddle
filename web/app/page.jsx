'use client'

import { useEffect, useState } from 'react'
import { getState, subscribe } from '../lib/api'
import BottomNav from '../components/BottomNav'
import Onboarding from '../components/Onboarding'
import LedgerView from '../components/LedgerView'
import ActivityView from '../components/ActivityView'
import WalletView from '../components/WalletView'
import MobileHeader from '../components/MobileHeader'

export default function Page () {
  const [state, setState] = useState(null)
  const [connected, setConnected] = useState(true)
  const [tab, setTab] = useState('ledger')
  const [showAdd, setShowAdd] = useState(false)

  // Read an optional ?tab= after mount (in an effect, so server + first client render match).
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab')
    if (t === 'activity' || t === 'wallet') setTab(t)
  }, [])

  useEffect(() => {
    getState().then(setState).catch(() => setConnected(false))
    // `?static=1` fetches once and skips the live SSE stream (used for previews/screenshots,
    // where a persistent connection would keep the page from ever going network-idle).
    const staticMode = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('static') === '1'
    if (staticMode) return
    const unsub = subscribe(
      (s) => { setState(s); setConnected(true) },
      () => setConnected(false)
    )
    return () => unsub()
  }, [])

  const wallet = state?.wallet
  const group = state?.group
  const active = !!group?.active
  const online = !!wallet?.online
  const mainnet = wallet?.ok && wallet?.testnet === false

  function openAdd () { setTab('ledger'); setShowAdd(true) }

  return (
    <div className="m-app">
      <div className="m-screen">
        {mainnet && (
          <div className="m-mainnet-bar" role="alert">
            ⚠️ MAINNET — settlements move real USD₮
          </div>
        )}
        {!connected && (
          <div className="lc-error" style={{ margin: '10px 0' }}>
            Can’t reach the backend. Start it with <span className="mono">npm run server</span> (port 8787).
          </div>
        )}

        {!state ? (
          connected && <><MobileHeader title="Huddle" /><div className="m-card"><span className="lc-empty">Loading…</span></div></>
        ) : !active ? (
          <Onboarding />
        ) : (
          <>
            {tab === 'ledger' && <LedgerView group={group} wallet={wallet} groups={state.groups} showAdd={showAdd} setShowAdd={setShowAdd} />}
            {tab === 'activity' && <ActivityView group={group} wallet={wallet} />}
            {tab === 'wallet' && <WalletView group={group} wallet={wallet} />}
          </>
        )}
      </div>

      {active && (
        <button
          className="lc-btn lc-btn-primary"
          onClick={openAdd}
          aria-label="Add expense"
          style={{ position: 'fixed', right: 'max(16px, calc(50% - 240px + 16px))', bottom: 84, width: 52, height: 52, borderRadius: 26, padding: 0, zIndex: 61, boxShadow: '0 4px 14px rgba(0,0,0,.35)' }}
        >
          <span style={{ fontSize: 26, lineHeight: 1, marginTop: -2 }}>+</span>
        </button>
      )}

      <BottomNav tab={tab} setTab={setTab} enabled={active} />
    </div>
  )
}

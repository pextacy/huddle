'use client'

import { useEffect, useState } from 'react'
import { getState, subscribe } from '../lib/api'
import WalletCard from '../components/WalletCard'
import Onboarding from '../components/Onboarding'
import GroupLedger from '../components/GroupLedger'

export default function Page () {
  const [state, setState] = useState(null)
  const [connected, setConnected] = useState(true)

  useEffect(() => {
    let unsub = () => {}
    getState().then(setState).catch(() => setConnected(false))
    unsub = subscribe(
      (s) => { setState(s); setConnected(true) },
      () => setConnected(false)
    )
    return () => unsub()
  }, [])

  return (
    <main className="app">
      <div className="brand">
        <h1>SplitKick<span>+</span></h1>
        <span className="sub">offline-first splitting · self-custodial USD₮</span>
      </div>

      {!connected && (
        <div className="error">
          Can’t reach the backend. Start it with <span className="mono">npm run server</span> (port 8787).
        </div>
      )}

      {state ? (
        <>
          <WalletCard wallet={state.wallet} />
          {state.group?.active ? <GroupLedger group={state.group} /> : <Onboarding />}
        </>
      ) : (
        connected && <div className="card"><span className="muted">Loading…</span></div>
      )}
    </main>
  )
}

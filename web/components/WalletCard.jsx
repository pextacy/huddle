'use client'

import Qr from './Qr'

export default function WalletCard ({ wallet }) {
  if (!wallet) return null
  const online = wallet.online
  const net = wallet.network?.name || '—'
  const chainId = wallet.network?.chainId

  return (
    <div className="card">
      <div className="row spread">
        <h2 style={{ margin: 0 }}>Wallet</h2>
        <span className="badge">{net}{wallet.testnet ? ' · testnet' : ' · mainnet'} ({chainId})</span>
      </div>

      {wallet.ok ? (
        <>
          <div className="row" style={{ gap: 8, margin: '6px 0 10px' }}>
            <span className={`dot ${online ? 'status-online' : 'status-offline'}`} style={{ background: online ? 'var(--accent)' : 'var(--warn)' }} />
            <span className={online ? 'status-online small' : 'status-offline small'}>
              {online ? 'ONLINE · settlement available' : 'OFFLINE · settlement unavailable'}
            </span>
          </div>
          <div className="amount">{wallet.usdt ?? '—'} <span className="muted" style={{ fontSize: 16, fontWeight: 400 }}>USD₮</span></div>
          <div className="muted small" style={{ marginTop: 2 }}>Gas: {wallet.gas ?? '—'} ETH</div>
          <div className="row" style={{ gap: 14, marginTop: 14, alignItems: 'flex-start' }}>
            <Qr text={wallet.address} size={120} />
            <div className="field" style={{ flex: 1, marginBottom: 0 }}>
              <label>Receive address</label>
              <div className="mono small">{wallet.address}</div>
            </div>
          </div>
        </>
      ) : (
        <div className="error">Wallet unavailable: {wallet.error || 'unknown error'}</div>
      )}
    </div>
  )
}

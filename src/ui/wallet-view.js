/**
 * Wallet screen (Phase 1) — pure render, no I/O.
 *
 * Renders the PRD "Wallet" screen: USD₮ balance, receive address + QR, and an unmistakable
 * network/chain indicator. Solid colors only — NO gradients (docs/claude.md). The caller
 * supplies already-formatted, real on-chain values; this module never fetches.
 */

import { qrSvg } from './qr.js'

/** Solid-color palette for the wallet CLI preview. No gradients anywhere. */
export const THEME = {
  bg: '#0b0b0b',
  surface: '#161616',
  text: '#f2f2f2',
  muted: '#8a8a8a',
  accent: '#00b341',
  warn: '#e0a000'
}

/**
 * @typedef {Object} WalletViewState
 * @property {string} address
 * @property {string} networkName   e.g. "Sepolia"
 * @property {number} chainId
 * @property {boolean} testnet
 * @property {string} usdtText      formatted USD₮ balance, e.g. "12.500000"
 * @property {string} gasText       formatted native balance, e.g. "0.013000"
 * @property {boolean} online       whether the chain RPC is reachable
 */

/**
 * Render the wallet screen as an HTML fragment string.
 * @param {WalletViewState} s
 * @returns {string}
 */
export function renderWalletView (s) {
  const statusLabel = s.online ? 'ONLINE · settlement available' : 'OFFLINE · settlement unavailable'
  const statusColor = s.online ? THEME.accent : THEME.warn
  const netBadge = `${s.networkName}${s.testnet ? ' · testnet' : ''} (chainId ${s.chainId})`

  return `
<section class="wallet" style="background:${THEME.bg};color:${THEME.text}">
  <header class="wallet__net">
    <span class="dot" style="background:${statusColor}"></span>
    <span class="wallet__status" style="color:${statusColor}">${statusLabel}</span>
    <span class="wallet__badge" style="background:${THEME.surface};color:${THEME.muted}">${netBadge}</span>
  </header>

  <div class="wallet__balance" style="background:${THEME.surface}">
    <div class="wallet__label" style="color:${THEME.muted}">USD₮ balance</div>
    <div class="wallet__amount" style="color:${THEME.accent}">${s.usdtText}</div>
    <div class="wallet__gas" style="color:${THEME.muted}">Gas: ${s.gasText} ETH</div>
  </div>

  <div class="wallet__qr">${qrSvg(s.address, { cellSize: 5, margin: 2 })}</div>

  <div class="wallet__addr" style="background:${THEME.surface};color:${THEME.text}">
    <div class="wallet__label" style="color:${THEME.muted}">Receive address</div>
    <code class="wallet__addrtext">${s.address}</code>
  </div>
</section>`.trim()
}

/**
 * Wrap the fragment in a complete, standalone HTML document (used by the preview command).
 * @param {WalletViewState} state
 * @returns {string}
 */
export function renderWalletPage (state) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Huddle Wallet</title>
<style>
  /* Solid colors only — no gradients (docs/claude.md). */
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; background: ${THEME.bg}; }
  body { font-family: -apple-system, system-ui, sans-serif; color: ${THEME.text};
         display: flex; justify-content: center; padding: 20px; }
  .wallet { width: 100%; max-width: 420px; display: flex; flex-direction: column; gap: 16px; }
  .wallet__net { display: flex; align-items: center; gap: 8px; font-size: 13px; }
  .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
  .wallet__badge { margin-left: auto; padding: 4px 10px; border-radius: 6px; font-size: 12px; }
  .wallet__balance { padding: 20px; border-radius: 12px; text-align: center; }
  .wallet__label { font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
  .wallet__amount { font-size: 40px; font-weight: 700; margin: 6px 0; letter-spacing: -1px; }
  .wallet__gas { font-size: 12px; }
  .wallet__qr { display: flex; justify-content: center; background: #ffffff; padding: 14px;
                border-radius: 12px; align-self: center; }
  .wallet__addr { padding: 14px; border-radius: 12px; }
  .wallet__addrtext { font-size: 13px; word-break: break-all; }
</style>
</head>
<body>
${renderWalletView(state)}
</body>
</html>`
}

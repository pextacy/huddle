/**
 * Wallet screen render — pure, no network. Enforces the visual hard rules and that the
 * real on-chain fields are present (docs/claude.md).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { renderWalletView, renderWalletPage } from '../src/ui/wallet-view.js'

const state = {
  address: '0xF22E032C1314120C2741aC62Ed0606633ca15Bd0',
  networkName: 'Sepolia',
  chainId: 11155111,
  testnet: true,
  usdtText: '12.500000',
  gasText: '0.013000',
  online: true
}

test('wallet view shows balance, address, and network indicator', () => {
  const html = renderWalletView(state)
  assert.match(html, /12\.500000/)
  assert.match(html, /0xF22E032C1314120C2741aC62Ed0606633ca15Bd0/)
  assert.match(html, /Sepolia/)
  assert.match(html, /chainId 11155111/)
  assert.match(html, /<svg/) // QR rendered offline
})

test('wallet view contains NO gradients (hard visual rule)', () => {
  const page = renderWalletPage(state)
  // Strip the single explanatory CSS comment, then assert zero real gradient usage.
  const withoutComments = page.replace(/\/\*[\s\S]*?\*\//g, '')
  assert.doesNotMatch(withoutComments, /gradient/i)
})

test('offline state flips the status indicator', () => {
  const offline = renderWalletView({ ...state, online: false })
  assert.match(offline, /OFFLINE/)
  const online = renderWalletView({ ...state, online: true })
  assert.match(online, /ONLINE/)
})

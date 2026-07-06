/**
 * Runtime network switching — config mutates the live NETWORK/USDT/TREASURY objects in place, and
 * the bridge flips testnet ↔ mainnet without a restart while persisting the choice. Wallet + swarm
 * are disabled (no network); this exercises the same path the /api/network route uses.
 *
 * These files run in their own process (node --test isolates per file), so the config mutation here
 * does not leak into the fee/pro assertions in bridge.test.js.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { NETWORK, USDT, TREASURY, applyNetwork, networkChoices, getFaucets, DEFAULT_NETWORK } from '../src/wallet/config.js'
import { createBridge } from '../server/bridge.mjs'

test('config: applyNetwork rewrites NETWORK/USDT/TREASURY in place', () => {
  applyNetwork('sepolia')
  assert.equal(NETWORK.key, 'sepolia')
  assert.equal(NETWORK.testnet, true)
  assert.equal(NETWORK.chainId, 11155111)
  assert.ok(TREASURY.address, 'sepolia ships a demo treasury so the fee path is enabled')
  const sepoliaUsdt = USDT.address

  applyNetwork('mainnet')
  assert.equal(NETWORK.key, 'mainnet')
  assert.equal(NETWORK.testnet, false)
  assert.equal(NETWORK.chainId, 1)
  assert.notEqual(USDT.address, sepoliaUsdt) // canonical mainnet USD₮, not the test token
  assert.equal(TREASURY.address, null) // no default treasury on mainnet -> fee disabled

  applyNetwork(DEFAULT_NETWORK) // restore
})

test('config: networkChoices + getFaucets reflect the active network', () => {
  const choices = networkChoices()
  assert.deepEqual(choices.map((c) => c.key).sort(), ['mainnet', 'sepolia'])

  applyNetwork('sepolia')
  assert.ok(Array.isArray(getFaucets()) && getFaucets().length > 0, 'testnet exposes faucets')

  applyNetwork('mainnet')
  assert.equal(getFaucets(), null, 'mainnet has no faucets')

  applyNetwork(DEFAULT_NETWORK)
})

test('config: applyNetwork rejects an unknown key', () => {
  assert.throws(() => applyNetwork('polygon'), /Unknown network/)
})

test('bridge: setNetwork flips to mainnet, disables the fee, and persists the choice', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sk-net-'))
  const bridge = createBridge({ baseDir: dir, enableSwarm: false, enableWallet: false })
  try {
    // Starts on the default (sepolia) with the demo treasury -> fee enabled + faucets present.
    let w = await bridge.walletStatus()
    assert.equal(w.network.key, 'sepolia')
    assert.equal(w.testnet, true)
    assert.equal(w.fee.enabled, true)
    assert.ok(Array.isArray(w.faucets) && w.faucets.length > 0)
    assert.ok(w.networks.some((n) => n.key === 'mainnet'))

    // Flip to mainnet: real-money network, no default treasury -> fee auto-disables.
    w = await bridge.setNetwork({ key: 'mainnet' })
    assert.equal(w.network.key, 'mainnet')
    assert.equal(w.testnet, false)
    assert.equal(w.fee.enabled, false)
    assert.equal(w.faucets, null)

    // Persisted so a restart re-applies mainnet before the wallet opens.
    assert.ok(existsSync(join(dir, 'network.json')))
    assert.equal(JSON.parse(readFileSync(join(dir, 'network.json'), 'utf8')).key, 'mainnet')

    await assert.rejects(bridge.setNetwork({ key: 'dogechain' }), /Unknown network/)
  } finally {
    await bridge.teardown()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('bridge: a persisted network is re-applied on startup', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sk-net-restore-'))
  const first = createBridge({ baseDir: dir, enableSwarm: false, enableWallet: false })
  try {
    await first.setNetwork({ key: 'mainnet' })
  } finally {
    await first.teardown()
  }
  const second = createBridge({ baseDir: dir, enableSwarm: false, enableWallet: false })
  try {
    const w = await second.walletStatus()
    assert.equal(w.network.key, 'mainnet') // restored from network.json, no env var needed
  } finally {
    await second.teardown()
    rmSync(dir, { recursive: true, force: true })
    applyNetwork(DEFAULT_NETWORK) // leave the shared config on the default for any later tests
  }
})

#!/usr/bin/env node
/**
 * Poll the wallet until it has both gas (native ETH) and USD₮, so a real transfer can be
 * broadcast. Exits 0 when funded, 3 on timeout. Used while the user funds via faucet.
 *
 *   node scripts/wait-funds.mjs [timeoutMinutes=40] [intervalSeconds=20]
 */
import { generateSeed, openWallet, closeWallet, getNativeBalance, getUsdtBalance, NETWORK, USDT } from '../src/wallet/wdk.js'
import { loadOrCreateSeed } from '../src/wallet/seed-store.js'
import { formatUsdt } from '../src/wallet/units.js'

const timeoutMs = (Number(process.argv[2]) || 40) * 60_000
const intervalMs = (Number(process.argv[3]) || 20) * 1000
const deadline = Date.now() + timeoutMs

const { seed } = loadOrCreateSeed(generateSeed)
const handle = await openWallet(seed)
console.log(`Watching ${handle.address} on ${NETWORK.name} for gas + USD₮ (every ${intervalMs / 1000}s)...`)

function fmtEth (wei) { const s = 10n ** 18n; return `${wei / s}.${(wei % s).toString().padStart(18, '0').slice(0, 6)}` }

while (Date.now() < deadline) {
  let wei, usdt
  try {
    ;[wei, usdt] = await Promise.all([getNativeBalance(handle), getUsdtBalance(handle)])
  } catch (e) {
    console.log(`(rpc hiccup: ${e.shortMessage || e.message})`)
    await new Promise(r => setTimeout(r, intervalMs))
    continue
  }
  const ts = new Date().toISOString().slice(11, 19)
  console.log(`[${ts}] gas=${fmtEth(wei)} ETH · USD₮=${formatUsdt(usdt)}`)
  if (wei > 0n && usdt > 0n) {
    console.log('FUNDED — ready to send.')
    closeWallet(handle)
    process.exit(0)
  }
  await new Promise(r => setTimeout(r, intervalMs))
}

console.log('Timed out waiting for funds.')
closeWallet(handle)
process.exit(3)

#!/usr/bin/env node
/**
 * SplitKick+ wallet CLI — the real, runnable wallet path (Phase 1).
 *
 *   node scripts/wallet.mjs status            # address, network, native + USD₮ balances
 *   node scripts/wallet.mjs address           # just print the receive address
 *   node scripts/wallet.mjs send <to> <usdt>  # real on-chain USD₮ transfer -> tx hash
 *
 * Self-custody: the seed is loaded from device storage (or generated on first run) and is
 * NEVER printed. The transfer is a genuine ERC-20 transfer on the configured testnet.
 */

import {
  generateSeed, openWallet, closeWallet,
  getNativeBalance, getUsdtBalance, sendUsdt, quoteUsdt,
  NETWORK, USDT
} from '../src/wallet/wdk.js'
import { loadOrCreateSeed, defaultSeedPath } from '../src/wallet/seed-store.js'
import { formatUsdt, parseUsdtToMinor, formatMinor } from '../src/wallet/units.js'
import { FAUCETS } from '../src/wallet/config.js'
import { renderWalletPage } from '../src/ui/wallet-view.js'
import { writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

function formatEth (wei) {
  const scale = 10n ** 18n
  const whole = wei / scale
  const frac = (wei % scale).toString().padStart(18, '0').slice(0, 6)
  return `${whole}.${frac}`
}

async function main () {
  const [cmd, ...rest] = process.argv.slice(2)

  // Load (or create) the self-custodial seed — never logged.
  const { created, persisted, path } = loadOrCreateSeed(generateSeed)
  if (created) {
    console.log(`🔑 Generated a new 24-word wallet seed and stored it at:\n   ${path}`)
    console.log('   (kept on this device only — never logged, never replicated)\n')
  }
  const { seed } = loadOrCreateSeed(generateSeed)

  const handle = await openWallet(seed)
  const { address } = handle

  try {
    if (cmd === 'address') {
      console.log(address)
      return
    }

    if (!cmd || cmd === 'status') {
      const [wei, usdtBase] = await Promise.all([
        getNativeBalance(handle),
        getUsdtBalance(handle)
      ])
      console.log('SplitKick+ wallet')
      console.log('─'.repeat(48))
      console.log(`Network   : ${NETWORK.name} (chainId ${NETWORK.chainId}) · testnet`)
      console.log(`Address   : ${address}`)
      console.log(`Gas (ETH) : ${formatEth(wei)}`)
      console.log(`USD₮      : ${formatUsdt(usdtBase)}  [${USDT.address}]`)
      console.log('─'.repeat(48))
      console.log(`Explorer  : ${NETWORK.explorerAddressUrl}${address}`)
      if (wei === 0n || usdtBase === 0n) {
        console.log('\nTo settle on-chain, fund this address on Sepolia:')
        if (wei === 0n) console.log(`  • Gas  : ${FAUCETS.sepoliaEth}`)
        if (usdtBase === 0n) console.log(`  • USD₮ : ${FAUCETS.aaveUsdt}  (switch to Sepolia, mint USDT)`)
      }
      return
    }

    if (cmd === 'view') {
      const [wei, usdtBase] = await Promise.all([
        getNativeBalance(handle),
        getUsdtBalance(handle)
      ])
      const html = renderWalletPage({
        address,
        networkName: NETWORK.name,
        chainId: NETWORK.chainId,
        testnet: true,
        usdtText: formatUsdt(usdtBase),
        gasText: formatEth(wei),
        online: true
      })
      const root = join(dirname(fileURLToPath(import.meta.url)), '..')
      const out = join(root, 'wallet-preview.html')
      writeFileSync(out, html)
      console.log(`Wrote wallet screen with live on-chain data to:\n  ${out}`)
      console.log('Open it in a browser to see the Phase-1 wallet screen.')
      return
    }

    if (cmd === 'send') {
      const [to, amountUsdt] = rest
      if (!to || !amountUsdt) {
        console.error('Usage: node scripts/wallet.mjs send <toAddress> <amountUsdt>')
        process.exit(2)
      }
      const minor = parseUsdtToMinor(amountUsdt)
      console.log(`Sending ${formatMinor(minor)} USD₮ -> ${to} on ${NETWORK.name}...`)

      // Pre-flight quote so a clearly-unfunded send fails with a readable reason.
      try {
        const { fee } = await quoteUsdt(handle, to, minor)
        console.log(`Estimated gas fee: ${formatEth(fee)} ETH`)
      } catch (e) {
        console.error(`\n✖ Cannot send yet: ${e.shortMessage || e.message}`)
        console.error('  This usually means the wallet needs testnet gas and/or USD₮.')
        console.error(`  Gas : ${FAUCETS.sepoliaEth}`)
        console.error(`  USD₮: ${FAUCETS.aaveUsdt}`)
        process.exit(1)
      }

      const { hash, fee } = await sendUsdt(handle, to, minor)
      console.log('\n✓ USD₮ transfer broadcast')
      console.log(`  tx hash : ${hash}`)
      console.log(`  gas fee : ${formatEth(fee)} ETH`)
      console.log(`  explorer: ${NETWORK.explorerTxUrl}${hash}`)
      return
    }

    console.error(`Unknown command: ${cmd}. Use: status | address | view | send <to> <usdt>`)
    process.exit(2)
  } finally {
    closeWallet(handle)
  }
}

main().catch((e) => {
  console.error('Error:', e.shortMessage || e.message)
  process.exit(1)
})

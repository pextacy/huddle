/**
 * Self-custodial wallet via Tether WDK (docs/docs.md §8, verified against the installed
 * @tetherto/wdk@1.0.0-beta.12 + @tetherto/wdk-wallet-evm@1.0.0-beta.14 API).
 *
 * Real on-chain module — no mocks (docs/claude.md). It derives a real account from a BIP-39
 * seed, reads real balances from a live RPC, and sends a real USD₮ (ERC-20) transfer that
 * returns an on-chain tx hash.
 *
 * Verified API shape:
 *   WDK.getRandomSeedPhrase(24) -> string
 *   new WDK(seed).registerWallet('ethereum', WalletManagerEvm, { provider, chainId })
 *   const account = await wdk.getAccount('ethereum', 0)
 *   await account.getAddress()                         -> string
 *   await account.getBalance()                         -> bigint (native wei)
 *   await account.getTokenBalance(tokenAddr)           -> bigint (token base units)
 *   await account.quoteTransfer({ token, recipient, amount }) -> { fee }
 *   await account.transfer({ token, recipient, amount })      -> { hash, fee }
 *
 * The seed is supplied by the caller (see seed-store.js) and is NEVER logged here.
 * Minor<->base unit conversion lives in units.js and happens only at this boundary.
 */

import WDK from '@tetherto/wdk'
import WalletManagerEvm from '@tetherto/wdk-wallet-evm'

import { NETWORK, USDT } from './config.js'
import { toUsdtBaseUnits } from './units.js'

export { NETWORK, USDT }

/** Generate a fresh 24-word BIP-39 seed phrase. */
export function generateSeed (wordCount = 24) {
  return WDK.getRandomSeedPhrase(wordCount)
}

/** Validate a seed phrase. */
export function isValidSeed (seed) {
  return WDK.isValidSeed(seed)
}

/**
 * Open a wallet from a seed and connect it to the configured testnet.
 *
 * @param {string} seed - BIP-39 seed phrase (never logged).
 * @param {{ index?: number, rpcUrls?: string[], chainId?: number }} [opts]
 * @returns {Promise<{ wdk: WDK, account: object, address: string }>}
 */
export async function openWallet (seed, opts = {}) {
  if (!WDK.isValidSeed(seed)) throw new Error('Invalid seed phrase.')

  const provider = opts.rpcUrls ?? NETWORK.rpcUrls
  const chainId = opts.chainId ?? NETWORK.chainId

  const wdk = new WDK(seed).registerWallet(NETWORK.blockchain, WalletManagerEvm, {
    provider, // string | string[] — array enables automatic RPC failover
    chainId // skip auto-detection; we know the network
  })

  const account = await wdk.getAccount(NETWORK.blockchain, opts.index ?? 0)
  const address = await account.getAddress()

  return { wdk, account, address }
}

/** Native (gas) balance in wei. Used to check the account can pay for gas. */
export async function getNativeBalance (handle) {
  return handle.account.getBalance()
}

/** USD₮ balance in token base units (6 decimals). */
export async function getUsdtBalance (handle) {
  return handle.account.getTokenBalance(USDT.address)
}

/**
 * Quote a USD₮ transfer without sending it (gas/fee estimate).
 * @param {object} handle
 * @param {string} recipient - creditor address
 * @param {number|bigint} amountMinor - ledger minor units (cents)
 * @returns {Promise<{ fee: bigint }>}
 */
export async function quoteUsdt (handle, recipient, amountMinor) {
  const amount = toUsdtBaseUnits(amountMinor)
  return handle.account.quoteTransfer({ token: USDT.address, recipient, amount })
}

/**
 * Send a real USD₮ (ERC-20) transfer to a creditor and return the on-chain tx hash.
 *
 * @param {object} handle
 * @param {string} recipient - creditor address
 * @param {number|bigint} amountMinor - ledger minor units (cents); converted to USD₮ base units here
 * @returns {Promise<{ hash: string, fee: bigint, amountBase: bigint }>}
 */
export async function sendUsdt (handle, recipient, amountMinor) {
  const amount = toUsdtBaseUnits(amountMinor)
  const { hash, fee } = await handle.account.transfer({
    token: USDT.address,
    recipient,
    amount
  })
  return { hash, fee, amountBase: amount }
}

/** The active network parameters (for the UI's chain indicator). */
export function getNetwork () {
  return { name: NETWORK.name, chainId: NETWORK.chainId, blockchain: NETWORK.blockchain }
}

/** Dispose the wallet, clearing key material from memory. */
export function closeWallet (handle) {
  handle.wdk.dispose()
}

/**
 * Wallet network configuration — testnet (default) and mainnet, switchable at runtime.
 *
 * Default is **Sepolia testnet** so the demo is genuinely on-chain but costs nothing
 * (docs/claude.md). **Mainnet is opt-in** and moves real money — the UI warns loudly when it
 * is active. The active network can be selected at startup via `HUDDLE_NETWORK` *and* flipped
 * live from the app: `applyNetwork(key)` rewrites the exported NETWORK/USDT/TREASURY objects
 * **in place**, so every module that imported them (wdk.js, bridge.mjs) sees the switch without a
 * restart. The BIP-39 seed derives the same EVM address on both chains, so switching never
 * invalidates the wallet or the ledger's published addresses.
 *
 * Selection:  HUDDLE_NETWORK = 'sepolia' (default) | 'mainnet'
 * Overrides:  HUDDLE_RPC (single RPC url), HUDDLE_USDT (token address) — applied only to the
 *             startup-default network, so a live switch to the other chain uses its built-in params.
 *
 * Nothing secret lives here — only public network parameters. Both USD₮ contracts are
 * verified on-chain (symbol "USDT", 6 decimals).
 */

const env = (typeof process !== 'undefined' && process.env) ? process.env : {}

/** All supported networks. `blockchain` is the WDK registerWallet() label. */
export const NETWORKS = {
  sepolia: {
    key: 'sepolia',
    name: 'Sepolia',
    blockchain: 'ethereum',
    chainId: 11155111,
    testnet: true,
    rpcUrls: [
      'https://ethereum-sepolia-rpc.publicnode.com',
      'https://sepolia.drpc.org',
      'https://rpc.sepolia.org'
    ],
    explorerTxUrl: 'https://sepolia.etherscan.io/tx/',
    explorerAddressUrl: 'https://sepolia.etherscan.io/address/',
    usdt: {
      // Aave v3 Sepolia test USDT (checksummed, on-chain verified). Public faucet mints it.
      address: '0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0',
      symbol: 'USDT',
      decimals: 6
    },
    // Demo platform-fee treasury (testnet only): the burn address, so the fee-skim path runs
    // end-to-end out of the box without test funds going to a private party. Replace with your
    // company wallet via HUDDLE_TREASURY in production.
    treasury: '0x000000000000000000000000000000000000dEaD',
    faucets: [
      { label: 'Sepolia ETH (gas)', url: 'https://www.alchemy.com/faucets/ethereum-sepolia' },
      { label: 'Test USD₮ (Aave faucet)', url: 'https://app.aave.com/faucet/' }
    ]
  },
  mainnet: {
    key: 'mainnet',
    name: 'Ethereum',
    blockchain: 'ethereum',
    chainId: 1,
    testnet: false,
    rpcUrls: [
      'https://ethereum-rpc.publicnode.com',
      'https://eth.drpc.org',
      'https://rpc.ankr.com/eth'
    ],
    explorerTxUrl: 'https://etherscan.io/tx/',
    explorerAddressUrl: 'https://etherscan.io/address/',
    usdt: {
      // Canonical Tether USD₮ on Ethereum mainnet (on-chain verified).
      address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      symbol: 'USDT',
      decimals: 6
    },
    treasury: null, // real money — set HUDDLE_TREASURY explicitly to enable the fee/pro path
    faucets: null // real money — no faucets
  }
}

/** The startup-default network key (default: sepolia). Env RPC/USDT overrides apply only here. */
export const DEFAULT_NETWORK = normalizeKey(env.HUDDLE_NETWORK) || 'sepolia'
if (!NETWORKS[DEFAULT_NETWORK]) {
  throw new Error(`Unknown HUDDLE_NETWORK="${env.HUDDLE_NETWORK}". Use one of: ${Object.keys(NETWORKS).join(', ')}.`)
}

function normalizeKey (raw) {
  return (raw == null || raw === '') ? null : String(raw).toLowerCase()
}

// ── Live, mutated-in-place exports ────────────────────────────────────────────
// Importers (wdk.js, bridge.mjs) hold references to these objects. `applyNetwork` mutates their
// properties rather than reassigning, so a runtime switch is visible everywhere with no restart.

/** Active network parameters. */
export const NETWORK = {}

/** Active USD₮ token. */
export const USDT = {}

/**
 * Platform treasury — the wallet that collects settlement fees (the revenue model).
 * Sepolia ships a demo treasury (the burn address) so the fee path runs out of the box on testnet;
 * mainnet has no default — set HUDDLE_TREASURY, otherwise the fee is disabled (`FEE.enabled`).
 * `HUDDLE_TREASURY` env overrides the per-network default on every network.
 */
export const TREASURY = { address: null }

/** The active network key (kept in sync by applyNetwork). */
export let ACTIVE_NETWORK = DEFAULT_NETWORK

let activeFaucets = null

/** Parse a non-negative integer env var, falling back to `dflt` when unset/invalid. */
function intEnv (raw, dflt) {
  if (raw == null || raw === '') return dflt
  const n = Number(raw)
  return Number.isSafeInteger(n) && n >= 0 ? n : dflt
}

/**
 * Settlement fee policy (basis points + optional per-settle min/max), env-overridable. The fee is
 * only charged when a treasury address is configured (`enabled`), so it auto-disables on mainnet
 * unless HUDDLE_TREASURY is set.
 *   HUDDLE_FEE_BPS  fee in basis points (default 50 = 0.50%)
 *   HUDDLE_FEE_MIN  minimum fee per settle, in minor units / cents (default 0)
 *   HUDDLE_FEE_MAX  cap on the fee per settle, in minor units / cents (default: uncapped)
 */
export const FEE = {
  bps: intEnv(env.HUDDLE_FEE_BPS, 50),
  minMinor: intEnv(env.HUDDLE_FEE_MIN, 0),
  maxMinor: env.HUDDLE_FEE_MAX == null || env.HUDDLE_FEE_MAX === '' ? null : intEnv(env.HUDDLE_FEE_MAX, null),
  get enabled () { return !!TREASURY.address }
}

/**
 * Pro subscription pricing (the second revenue stream). A flat monthly USD₮ charge to the
 * treasury that waives the per-settle fee. Priced in minor units / cents.
 *   HUDDLE_PRO_PRICE  price per month, in minor units (default 500 = 5.00 USD₮/mo)
 * Available only when a treasury address is configured (`enabled`).
 */
export const PRO = {
  pricePerMonthMinor: intEnv(env.HUDDLE_PRO_PRICE, 500),
  get enabled () { return !!TREASURY.address }
}

/**
 * Switch the active network in place. Rewrites NETWORK/USDT/TREASURY and the faucet list so every
 * importer observes the change. Env HUDDLE_RPC/HUDDLE_USDT overrides are honored only for the
 * startup-default network (they're single-valued and would be wrong to carry onto the other chain).
 * HUDDLE_TREASURY applies to every network.
 *
 * @param {string} key  'sepolia' | 'mainnet'
 * @returns {typeof NETWORK} the freshly applied NETWORK object
 */
export function applyNetwork (key) {
  const k = normalizeKey(key) || DEFAULT_NETWORK
  const sel = NETWORKS[k]
  if (!sel) throw new Error(`Unknown network "${key}". Use one of: ${Object.keys(NETWORKS).join(', ')}.`)
  const isDefault = k === DEFAULT_NETWORK

  ACTIVE_NETWORK = k
  Object.assign(NETWORK, {
    key: sel.key,
    name: sel.name,
    blockchain: sel.blockchain,
    chainId: sel.chainId,
    testnet: sel.testnet,
    rpcUrls: (isDefault && env.HUDDLE_RPC) ? [env.HUDDLE_RPC] : sel.rpcUrls,
    explorerTxUrl: sel.explorerTxUrl,
    explorerAddressUrl: sel.explorerAddressUrl
  })
  Object.assign(USDT, {
    address: (isDefault && env.HUDDLE_USDT) ? env.HUDDLE_USDT : sel.usdt.address,
    symbol: sel.usdt.symbol,
    decimals: sel.usdt.decimals
  })
  // HUDDLE_TREASURY overrides on any network; otherwise the per-network default (null on mainnet).
  TREASURY.address = env.HUDDLE_TREASURY || sel.treasury || null
  activeFaucets = sel.faucets || null
  return NETWORK
}

/** Faucets for the active network (null on mainnet). */
export function getFaucets () {
  return activeFaucets
}

/** The list of selectable networks, for the UI's network switcher. */
export function networkChoices () {
  return Object.values(NETWORKS).map((n) => ({
    key: n.key,
    name: n.name,
    chainId: n.chainId,
    testnet: n.testnet
  }))
}

// Apply the startup default immediately so module-load consumers see a populated NETWORK/USDT.
applyNetwork(DEFAULT_NETWORK)

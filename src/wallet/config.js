/**
 * Wallet network configuration — testnet (default) and mainnet.
 *
 * Default is **Sepolia testnet** so the demo is genuinely on-chain but costs nothing
 * (docs/claude.md). **Mainnet is opt-in** via `SPLITKICK_NETWORK=mainnet` and moves real
 * money — the CLI/UI warn loudly when it is active.
 *
 * Selection:  SPLITKICK_NETWORK = 'sepolia' (default) | 'mainnet'
 * Overrides:  SPLITKICK_RPC (single RPC url), SPLITKICK_USDT (token address)
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
    faucets: {
      sepoliaEth: 'https://www.alchemy.com/faucets/ethereum-sepolia',
      aaveUsdt: 'https://app.aave.com/faucet/' // switch to Sepolia testnet mode, mint USDT
    }
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
    faucets: null // real money — no faucets
  }
}

/** The active network key (default: sepolia). */
export const ACTIVE_NETWORK = (env.SPLITKICK_NETWORK || 'sepolia').toLowerCase()

const selected = NETWORKS[ACTIVE_NETWORK]
if (!selected) {
  throw new Error(`Unknown SPLITKICK_NETWORK="${ACTIVE_NETWORK}". Use one of: ${Object.keys(NETWORKS).join(', ')}.`)
}

/** Active network parameters (RPC overridable via SPLITKICK_RPC). */
export const NETWORK = {
  key: selected.key,
  name: selected.name,
  blockchain: selected.blockchain,
  chainId: selected.chainId,
  testnet: selected.testnet,
  rpcUrls: env.SPLITKICK_RPC ? [env.SPLITKICK_RPC] : selected.rpcUrls,
  explorerTxUrl: selected.explorerTxUrl,
  explorerAddressUrl: selected.explorerAddressUrl
}

/** Active USD₮ token (address overridable via SPLITKICK_USDT). */
export const USDT = {
  address: env.SPLITKICK_USDT || selected.usdt.address,
  symbol: selected.usdt.symbol,
  decimals: selected.usdt.decimals
}

/** Faucets for the active network (null on mainnet). */
export const FAUCETS = selected.faucets

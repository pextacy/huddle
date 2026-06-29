/**
 * Testnet wallet configuration (docs/claude.md: testnet for the demo so settlement is
 * genuinely on-chain but costs nothing).
 *
 * Network: Ethereum Sepolia (chainId 11155111) — reliable public RPC, easy faucets.
 * USD₮: the Aave v3 Sepolia faucet token (real ERC-20, 6 decimals, mintable via a public
 * faucet). Verified on-chain: symbol "USDT", decimals 6. Override via env for any other
 * EVM testnet/token.
 *
 * Nothing secret lives here — only public network parameters.
 */

const env = (typeof process !== 'undefined' && process.env) ? process.env : {}

export const NETWORK = {
  name: 'Sepolia',
  blockchain: 'ethereum', // the WDK registerWallet() label
  chainId: 11155111,
  // Failover list — the EVM wallet rotates on connection errors (offline-honest: this is
  // the one part of the app that needs the internet).
  rpcUrls: env.SPLITKICK_RPC
    ? [env.SPLITKICK_RPC]
    : [
        'https://ethereum-sepolia-rpc.publicnode.com',
        'https://sepolia.drpc.org',
        'https://rpc.sepolia.org'
      ],
  explorerTxUrl: 'https://sepolia.etherscan.io/tx/',
  explorerAddressUrl: 'https://sepolia.etherscan.io/address/'
}

export const USDT = {
  // Aave v3 Sepolia test USDT (checksummed). Public faucet mints it.
  address: env.SPLITKICK_USDT || '0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0',
  symbol: 'USDT',
  decimals: 6
}

/** Where the demo can get testnet funds (the address must be funded to settle on-chain). */
export const FAUCETS = {
  sepoliaEth: 'https://www.alchemy.com/faucets/ethereum-sepolia',
  aaveUsdt: 'https://app.aave.com/faucet/' // switch to Sepolia testnet mode, mint USDT
}

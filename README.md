# SplitKick+

**Offline-first group expense splitter with self-custodial USD₮ settlement.**

A single [Pear](https://pears.com) / Bare app that combines a peer-to-peer ledger
(Holepunch) with a self-custodial wallet ([Tether WDK](https://docs.wdk.tether.io)).
Record shared matchday costs and compute who owes whom **completely offline**, then settle
debts in **USD₮ directly between self-custodial wallets** when you are back online.

- **Track:** WDK (Wallets) — load-bearing settlement.
- **Differentiator:** Pears P2P — the entire offline ledger.
- **Theme:** football / matchday cost-splitting.

Built for the Tether Developers Cup. See [`docs/`](docs/) for the PRD, architecture, build
plan, and phase breakdown.

## Status

Phase 1 (wallet path) complete: a real self-custodial wallet on Ethereum Sepolia that
reads live balances and sends real on-chain USD₮ (ERC-20) transfers. See
[`docs/phases.md`](docs/phases.md) for the full plan.

## Wallet (Phase 1)

The wallet is self-custodial: a 24-word seed is generated on first run and stored only on
this device (`~/Library/Application Support/splitkick-plus/wallet.seed`, owner-only). It is
never logged, never committed, never replicated.

```bash
npm run wallet:status                 # address, network, live native + USD₮ balances
node scripts/wallet.mjs address       # just the receive address
node scripts/wallet.mjs view          # render the wallet screen to wallet-preview.html
npm run wallet:send -- <to> <usdt>    # real on-chain USD₮ transfer -> prints the tx hash
```

### Networks

Default is **Ethereum Sepolia** (testnet, chainId 11155111) — genuinely on-chain but free.
**Mainnet is opt-in** and moves real money (the CLI/UI warn when active):

```bash
npm run wallet:status                              # Sepolia testnet (default)
SPLITKICK_NETWORK=mainnet npm run wallet:status    # Ethereum mainnet — REAL USD₮
```

| Network | chainId | USD₮ | Funding |
|---|---|---|---|
| `sepolia` (default) | 11155111 | Aave faucet test USDT (6 dp) | [ETH](https://www.alchemy.com/faucets/ethereum-sepolia) · [USD₮](https://app.aave.com/faucet/) |
| `mainnet` | 1 | Canonical Tether `0xdAC17…ec7` (6 dp) | real ETH + USD₮ |

Override the network, RPC, token, or seed with `SPLITKICK_NETWORK`, `SPLITKICK_RPC`,
`SPLITKICK_USDT`, `SPLITKICK_SEED`. The same seed derives the same address on every network.

## Architecture

The P2P ledger (Hyperswarm/Autobase/Hyperbee) and the self-custodial wallet (WDK) run in
**Node**, not the browser. So the app is two pieces:

- **Backend** (`server/`) — owns the live P2P ledger + wallet + domain logic and exposes a
  small REST + SSE API on `http://localhost:8787`.
- **Frontend** (`web/`) — a **Next.js / React** app that talks to the backend over HTTP/SSE.

The pure pieces live in `src/{domain,wallet,p2p}` and are shared by the backend, the CLI, and
the tests.

## Prerequisites

- [Node.js](https://nodejs.org) 18+.

## Run (backend + frontend)

```bash
npm install                  # backend deps (root)
npm run server               # backend on http://localhost:8787

cd web && npm install        # frontend deps
npm run dev                  # Next.js app on http://localhost:3000
```

Open http://localhost:3000 — create a group, add an expense, and watch balances + the minimal
settlement plan compute from the P2P ledger.

## Test

```bash
npm test                     # deterministic domain + p2p + wallet tests (node --test)
npm run p2p:verify           # two real peers converge + restart-safe
```

## Layout

```
/                 app entry (index.html), package.json
/src
  /p2p            swarm.js, ledger.js (Autobase + Hyperbee), topic.js
  /wallet         wdk.js (init, address, balance, sendUsdt)
  /domain         balances.js, settlement.js, entries.js (pure, deterministic)
  /ui             views / components (solid colors only — no gradients)
/test             deterministic domain tests
/docs             prd.md, docs.md, plan.md, phases.md, claude.md
```

## License

[MIT](LICENSE).

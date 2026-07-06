# SplitKick+

**Offline-first group expense splitter with self-custodial USD₮ settlement.**

A peer-to-peer ledger ([Holepunch](https://holepunch.to) — Hyperswarm/Autobase/Hyperbee)
combined with a self-custodial wallet ([Tether WDK](https://docs.wdk.tether.io)), served as a
Node backend + Next.js frontend. Record shared matchday costs and compute who owes whom
**completely offline**, then settle debts in **USD₮ directly between self-custodial wallets**
when you are back online.

- **Track:** WDK (Wallets) — load-bearing settlement.
- **Differentiator:** Pears P2P — the entire offline ledger.
- **Theme:** football / matchday cost-splitting.

Built for the Tether Developers Cup. See [`docs/`](docs/) for the PRD, architecture, build
plan, and phase breakdown.

## Status

All phases complete: real P2P group ledger (create/join via invite or QR, offline expense
tracking, categories), a real self-custodial wallet on Ethereum Sepolia, the full settle loop
(on-chain USD₮ send → payment entry clears the debt for every peer), group insights, and the
revenue model (per-settle platform fee + Pro subscription).
See [`docs/phases.md`](docs/phases.md) for the phase-by-phase history.

### Splitting & settlement (competitor-parity features)

Beyond equal splits, the ledger matches what Splitwise / Tricount / Settle Up offer:

- **Four split modes** — **equal**, **exact amounts**, **percentages** (must total 100%), and
  **shares/parts** (e.g. 2× vs 1×). Weighted splits are resolved to exact cents deterministically
  (largest-remainder), so every peer derives the identical split.
- **Edit & delete expenses** — append-only friendly: a delete records a `void` reversal that
  cancels the expense from balances + insights while preserving history; an edit is a void + a
  corrected expense in one operation. Removed expenses show struck-through in Activity.
- **Cash / off-chain settlement** — “Mark as paid (cash)” records a repayment made in cash or by
  bank transfer, clearing the debt with **no on-chain transfer and no wallet needed** (works
  offline). On-chain USD₮ payments dedup on their tx hash; cash payments dedup on their entry id.
  Either party can log it: pay a debt, or **“Mark received”** when someone pays *you* back.
- **Multiple groups** — hold many groups/trips on one device and switch between them; each is its
  own P2P ledger with its own members. Create, join by invite, switch, or leave from the group
  switcher. Legacy single-group installs migrate automatically.
- **Multi-currency** — enter an expense in EUR/GBP/TRY/JPY/… with an FX rate (best-effort live
  prefill when online, editable, manual-first offline). It converts to the USD₮ base **once at
  entry** with exact integer math, so balances stay deterministic and history never rewrites.
- **Recurring expenses** — daily / weekly / monthly templates (rent, subscriptions). Due
  occurrences materialize into real expenses with a **deterministic id + time**, so concurrent
  peers converge to one entry — never a double charge. Stop a template anytime.
- **Comments** — a threaded discussion hangs off each expense (“who had the extra beer?”),
  replicated P2P; purely social, never affects balances.
- **Reminders / nudges** — a creditor can nudge a debtor to settle up; nudges show in Activity.
- **Search & filters** — full-text search plus category and member filters over the activity feed.
- **CSV export** — download the whole ledger (expenses, payments, fees) from the Activity tab.

## Wallet

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
**Mainnet is opt-in** and moves real money (the UI shows a red mainnet bar + real-money warning
when active). Pick the startup network with an env var, **or flip testnet ↔ mainnet live** from the
wallet screen's network switcher — no restart. The choice is persisted (`network.json`) and the
same seed derives the same address on both chains, so switching never invalidates the ledger.

```bash
npm run wallet:status                              # Sepolia testnet (default)
SPLITKICK_NETWORK=mainnet npm run wallet:status    # Ethereum mainnet — REAL USD₮
# In the app: Wallet tab → Network → tap "Ethereum" / "Sepolia · testnet"
```

The wallet screen also surfaces one-tap **faucet links** on testnet and a **low-gas warning**
before a settlement can fail for lack of native ETH.

| Network | chainId | USD₮ | Funding |
|---|---|---|---|
| `sepolia` (default) | 11155111 | Aave faucet test USDT (6 dp) | [ETH](https://www.alchemy.com/faucets/ethereum-sepolia) · [USD₮](https://app.aave.com/faucet/) |
| `mainnet` | 1 | Canonical Tether `0xdAC17…ec7` (6 dp) | real ETH + USD₮ |

Override the network, RPC, token, or seed with `SPLITKICK_NETWORK`, `SPLITKICK_RPC`,
`SPLITKICK_USDT`, `SPLITKICK_SEED`. The same seed derives the same address on every network.

## Group insights — where the money went

Every expense is tagged with a **matchday category** — ⚽ Tickets, 🍔 Food & drinks, 🚗 Travel,
🏨 Stay, 🎽 Gear, 💸 Other — and the app rolls the shared ledger up into a **Group insights** card:
total spent, a per-category breakdown with bars, who fronted how much of the group's spend, and
the single biggest expense. It's computed by a pure, deterministic domain module
([`src/domain/insights.js`](src/domain/insights.js)) that reads only `expense` entries, so every
peer renders the identical dashboard offline — no server round-trip, no floats, integer minor units
throughout. Expenses written before categories existed fold into **Other**, so old ledgers still tally.

## Revenue model — settlement fee

SplitKick+ earns a small **platform fee on every on-chain settlement**, skimmed to a treasury
wallet. The fee is charged **on top** of the debt: the person you owe always receives the full
amount (so the group ledger clears exactly), and the payer additionally sends the fee to the
treasury as a separate USD₮ transfer. The fee is recorded on the shared ledger as a `fee` entry,
so every peer can audit total revenue, and it's idempotent on its tx hash (never double-counted).

| Setting | Env var | Default |
|---|---|---|
| Fee rate (basis points) | `SPLITKICK_FEE_BPS` | `50` (0.50%) |
| Minimum fee per settle (cents) | `SPLITKICK_FEE_MIN` | `0` |
| Maximum fee per settle (cents) | `SPLITKICK_FEE_MAX` | uncapped |
| Treasury address (collects fees) | `SPLITKICK_TREASURY` | testnet: demo burn address · **mainnet: required** |

The fee is only charged when a treasury address is configured. On **Sepolia** a demo treasury
(the burn address) ships so the fee path runs out of the box; on **mainnet** there is no default —
set `SPLITKICK_TREASURY` to your company wallet or the fee stays disabled (no real money is ever
sent to an unintended address). The UI shows the fee up front (`you pay X · +Y fee = Z`), prints
both tx hashes after settling, and surfaces accrued revenue in a **Platform revenue** card.

```bash
# Quote a settlement (fee breakdown, moves no money):
curl -s -X POST localhost:8787/api/settle/quote -d '{"to":"<memberId>","amountMinor":10000}'
# -> { amountMinor: 10000, feeMinor: 50, totalMinor: 10050, feeBps: 50, feeEnabled: true, ... }
```

### Pro subscription (second revenue stream)

Freemium pricing: casual users pay the per-settle fee above; **Pro** subscribers pay a flat
monthly USD₮ subscription to the same treasury and settle with **no per-settle fee**. The
subscription is a real on-chain USD₮ transfer; the active window is tracked per device and stacks
when renewed early (paying early never burns remaining time).

| Setting | Env var | Default |
|---|---|---|
| Price per month (cents) | `SPLITKICK_PRO_PRICE` | `500` (5.00 USD₮/mo) |

```bash
# Subscribe to Pro for N months (real on-chain USD₮ payment to the treasury):
curl -s -X POST localhost:8787/api/pro/subscribe -d '{"months":1}'
# -> { txHash, months: 1, priceMinor: 500, pro: { active: true, until, ... }, state }
```

The UI shows a **Pro** card (status, expiry, plan selector, subscribe/extend) and, while Pro is
active, the settle rows read `Pro · no fee`. Pro requires a configured treasury — same rule as the
settlement fee (testnet ships a demo treasury; mainnet must set `SPLITKICK_TREASURY`).

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

## Run

```bash
npm install && (cd web && npm install)   # one-time: backend + frontend deps
npm run app                              # backend :8787 + Next.js frontend :3000 together
```

Open http://localhost:3000 — create a group, add an expense, watch balances + the minimal
settlement plan compute from the P2P ledger, then "Pay in USD₮" to settle on-chain (testnet).

Prefer separate processes? `npm run server` and, in `web/`, `npm run dev`.

## Test

```bash
npm test                     # deterministic domain + p2p + wallet tests (node --test)
npm run p2p:verify           # two real peers converge + restart-safe
npm run settle:verify        # settle loop: a payment clears the debt for every peer
```

## Layout

```
/                 package.json
/server           bridge.mjs (live ledger + wallet), index.mjs (HTTP/SSE API)
/web              Next.js frontend (app/, components/, lib/api.js)
/src
  /p2p            swarm.js, ledger.js (Autobase + Hyperbee), topic.js
  /wallet         wdk.js, units.js, seed-store.js, config.js
  /domain         balances.js, settlement.js, entries.js, fees.js, pro.js, insights.js (pure, deterministic)
  /ui             wallet-view.js, qr.js (wallet CLI preview — solid colors, no gradients)
/scripts          dev.mjs (run backend + web), wallet.mjs, verify-*.mjs
/test             deterministic domain + p2p + wallet + bridge tests
/docs             prd.md, docs.md, plan.md, phases.md, claude.md
```

## License

[MIT](LICENSE).

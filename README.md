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

Phase 0 (scaffold) complete. The runnable build grows phase by phase — see
[`docs/phases.md`](docs/phases.md).

## Prerequisites

- [Node.js](https://nodejs.org) 18+ (used for the deterministic domain tests).
- The Pear runtime CLI:

  ```bash
  npm install -g pear
  ```

## Setup

```bash
npm install            # install pinned dependencies
```

## Run

```bash
npm run dev            # pear run --dev .  — launches the app
```

## Test

```bash
npm test               # run the deterministic domain tests (node --test)
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

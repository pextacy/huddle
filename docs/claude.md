# CLAUDE.md

Guidance for any AI assistant (and any human) working in this repository. Read this before
writing code. It encodes the non-negotiable conventions for SplitKick+.

## Project

SplitKick+ is an **offline-first group expense splitter with self-custodial USD₮ settlement**,
built for the Tether Developers Cup. It is a **single Bare/Pear app** that combines a
peer-to-peer ledger (Holepunch) with a wallet (Tether WDK).

- **Declared track:** WDK (Wallets). WDK moves the money and is load-bearing.
- **Differentiator:** Pears P2P provides the entire offline ledger (not a logo).
- **Theme:** football / matchday cost-splitting.

See `docs.md` for architecture, `prd.md` for requirements, `plan.md` for the build schedule.

## Tech stack

- Runtime: **Pear / Bare** (`pear` CLI). The app runs on Bare, not plain Node.
- P2P: `hyperswarm`, `corestore`, `autobase`, `hyperbee`, `hypercore-crypto`, `b4a`.
- Wallet: `@tetherto/wdk`, `@tetherto/wdk-wallet-evm`.
- Language: JavaScript (ESM, `import`/`export`). TypeScript types via JSDoc where useful.

Pin exact versions in `package.json`. Holepunch and WDK APIs are young; do not assume a method
exists — verify against the installed version's docs/README before using it.

## Repository layout (target)

```
/                      app entry (pear app), package.json
/src
  /p2p                 swarm.js, ledger.js (Autobase+Hyperbee), topic.js
  /wallet              wdk.js (init, address, balance, sendUsdt)
  /domain             balances.js, settlement.js, entries.js (pure, deterministic)
  /ui                  views/components (no gradients; see rules)
/test                  domain tests (pure functions first)
docs.md prd.md plan.md
```

## Commands

```bash
npm install                 # install deps (run after every dependency change)
pear run --dev .            # run the app in dev
pear stage <channel>        # stage a release build
pear release <channel>      # mark a release
npm test                    # run the deterministic domain tests
```

## Hard rules (do not violate)

### No mocks in delivered code
- No fake data, no stubbed wallets, no `setTimeout`-fake "transfers", no placeholder ledgers.
- The P2P sync must be **real** Hyperswarm/Autobase replication between real peers.
- The settlement must be a **real on-chain USD₮ transfer** (use a **testnet** for the demo so it
  costs nothing but is genuinely on-chain). A judge running it out of the box must see real
  peer-to-peer sync and a real transaction hash.
- Test fixtures in `/test` may use sample entries — that is fine. Shipped app paths may not.

### No gradients (visual)
- UI uses **solid colors only**. No CSS gradients, no gradient fills, no gradient text.
- Flat, high-contrast, fast. Solid background, solid surfaces, one accent color, clear typography.
- Dark-mode-friendly defaults. Legible at a glance (this gets used in a loud, bright stadium).

### Money correctness
- Store all amounts as **integer minor units**. Never use floating-point for money anywhere.
- Convert to the token's smallest unit (USD₮ has 6 decimals) **only at the WDK boundary**.
- Use the on-chain **tx hash as the idempotency key** for settlement entries — never double-count.

### Self-custody / secrets
- The seed phrase lives only in device secure storage.
- Never log it, never write it to the ledger, never replicate it, never send it anywhere.
- WDK is stateless: the app holds keys locally; no custodian, no backend holds funds.

### Determinism
- The Autobase `apply` function and everything in `/src/domain` must be **pure and
  deterministic**: same inputs → same view on every peer.
- No `Date.now()` inside `apply`. Timestamps come from the entry payload, set at append time.
- No reliance on object key/iteration order for correctness. Distribute split remainders
  deterministically.

### Offline honesty
- Do not claim the on-chain payment works offline. It does not, by design.
- The ledger, expense entry, splitting, and balance math **must** work with no internet.
- The UI must clearly tell the user when an action needs connectivity (settlement) vs not.

## Definition of done (per module)

- **p2p/topic**: deterministic 32-byte topic from a shared group secret; invite code round-trips.
- **p2p/swarm**: two real devices/processes join the same topic and replicate; teardown releases
  the DHT record.
- **p2p/ledger**: appends from multiple writers converge to an identical Hyperbee view; survives
  restart (persisted via Corestore).
- **domain/balances + settlement**: unit-tested; minimal-transfer plan verified on worked
  examples; remainders distributed deterministically.
- **wallet/wdk**: generates/loads a real account, reads a real balance, publishes its address to
  the ledger, and sends a real testnet USD₮ transfer returning a tx hash.
- **settlement loop**: paying down a debt produces a `payment` entry that, once replicated, shows
  the debt cleared on every peer.

## Working style for the assistant

- Verify external APIs before using them (Holepunch + WDK move fast). Prefer reading the
  installed version's README over memory.
- Build the de-risked order in `plan.md`: wallet path first, then P2P ledger, then the loop that
  joins them. Keep a runnable app at every checkpoint.
- Keep `/src/domain` free of I/O so it stays testable and deterministic.
- When unsure whether something needs connectivity, default to making the offline path work and
  surfacing a clear "needs internet" state for the online part.
- Small, reviewable commits. The Cup judges read public GitHub commits between rounds — commit
  often with clear messages that show the project growing.

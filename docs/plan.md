# Huddle — Build Plan

> **Packaging note (historical):** this plan predates the runtime change. The app originally targeted a single Bare/Pear app; it now ships as a Node backend (`server/`) + Next.js frontend (`web/`) because Pear v2 removed `pear run`. See `README.md` and `docs/claude.md` for the current architecture.

How we go from kickoff to the Final without ever holding a broken app. Maps directly to the
Tether Developers Cup schedule and the five judging criteria.

---

## 1. Strategy recap

- **Declared track: WDK.** WDK moves real USD₮ — it is load-bearing, which scores "real use of
  the platform."
- **Differentiator: Pears.** The offline P2P ledger is the whole product spine, not a logo. It
  scores "technical ambition" and "creativity."
- **One Bare app.** WDK runs on Bare (the Pears runtime), so the wallet and the P2P ledger live
  in one process — a clean, coherent story rather than two stitched demos.
- **Aim:** track win is the realistic floor; the offline-money angle is strong enough to push for
  the overall Cup. We optimize for a finished, runnable, real app over a flashy half-built one.

## 2. The golden rule of the build order

**Always have a runnable app.** Build in an order where, if we run out of time at any point, what
exists still demos something real.

Order of construction (de-risked):

1. **Wallet path first (WDK).** A real self-custodial wallet that reads a balance and sends a real
   testnet USD₮ transfer. If everything else slipped, this alone is a valid WDK submission.
2. **Pure domain logic.** Balances + minimal-transfer settlement as pure, tested functions. No
   network needed; provably correct.
3. **P2P ledger (Pears).** Hyperswarm discovery + Autobase/Hyperbee multi-writer view. Two peers
   converge on the same ledger.
4. **The loop.** Publish wallet address into the ledger; "Settle" sends USD₮ then writes a
   `payment` entry that clears the debt for all peers.
5. **UI + polish.** Solid-color, flat, fast UI over the working core. No gradients.

Never build the offline ledger first and leave payment for last — if payment slips, the demo has
no money movement and the WDK track requirement is unmet.

## 3. Cup schedule mapping

The Cup runs as a knockout. Building starts June 28; the field locks July 6; rounds cut the field
down to the July 15 Final. Public GitHub commits between rounds are the visible progress, so we
commit often.

| Date | Cup checkpoint | What we deliver |
|---|---|---|
| **Jun 28** | Kickoff / registration opens | Register on DoraHacks, declare **WDK** track + nation, post idea + this build plan. Repo created (MIT/Apache-2.0). |
| **Jun 28 – Jul 6** | Open building, no cuts | Phase 1–2 done: real wallet + tested domain logic. Begin Phase 3 (P2P). |
| **Jul 6** | Registration closes, field locks | Spot locked; idea + track + plan finalized on the project page. |
| **Jul 8** | Round of 16 (cut to 16) | **Working prototype:** wallet sends testnet USD₮; two peers sync a ledger; balances compute. |
| **Jul 10** | Quarter-Finals (16 → 8) | **Refined build + 3-min demo video:** full loop working (add expense offline → settle online → debt clears for all). |
| **Jul 12–13** | Semi-Finals (8 → 4) | **Short pitch:** tightened UX, the offline-on-local-network demo nailed, narrative crisp. |
| **Jul 14, 23:59 UTC+1** | Submission deadline (DoraHacks) | Final build locked: public repo, setup instructions, unlisted YouTube demo (≤3 min) linked. |
| **Jul 15** | Final (top 4) | **Live online pitch**, streamed publicly. |

## 4. Phase task checklists

### Phase 1 — Wallet path (WDK)  ▸ target: well before Round of 16
- [ ] `pear init` the app; set up ESM project; pin dependency versions.
- [ ] Integrate `@tetherto/wdk` + `@tetherto/wdk-wallet-evm`.
- [ ] Generate/restore a seed phrase; store in device secure storage; **never log it**.
- [ ] `getAddress()`, `getBalance()` against a **testnet** RPC.
- [ ] Send a real testnet **USD₮ (ERC-20) transfer**; surface the tx hash.
- [ ] Minimal wallet screen (solid colors): balance, address+QR, network indicator.
- ✅ Done = a real on-chain testnet USD₮ transfer from a self-custodial wallet.

### Phase 2 — Domain logic (pure, tested)  ▸ overlaps Phase 1
- [ ] Entry types and validation (`expense`, `payment`, `wallet`, `addWriter`).
- [ ] `computeBalances` (integer minor units; deterministic remainder distribution).
- [ ] `settlementPlan` (greedy min-cash-flow → minimal transfers).
- [ ] Unit tests with worked examples (5-person trip → ≤4 transfers).
- ✅ Done = balances + minimal settlement provably correct, no I/O.

### Phase 3 — P2P ledger (Pears)  ▸ target: Round of 16 prototype
- [ ] `topic.js`: deterministic 32-byte topic from a group secret; invite code round-trips.
- [ ] `swarm.js`: Hyperswarm join, `store.replicate(conn)`, `Pear.teardown(destroy)`.
- [ ] `ledger.js`: Autobase + Hyperbee view; `apply` handles `addWriter` + entries; persisted via
      Corestore.
- [ ] Two processes/devices join the same topic and converge on an identical view.
- [ ] Restart-safe (state persists locally).
- ✅ Done = real multi-writer sync, no server, survives restart.

### Phase 4 — The loop  ▸ target: Quarter-Finals
- [ ] Publish wallet address into the ledger on join.
- [ ] "Settle" maps a plan transfer → WDK USD₮ send → `payment` entry (idempotent on tx hash).
- [ ] Replicated `payment` clears the debt for all peers.
- [ ] Clear online/offline status in the UI (settlement gated on connectivity).
- ✅ Done = add expense offline → settle online → everyone sees it cleared.

### Phase 5 — UI + polish  ▸ through Semi-Finals
- [ ] Screens from the PRD (Home, Group ledger, Add expense, Settle up, Wallet, Onboarding).
- [ ] Solid-color, flat, high-contrast theme. **No gradients.** Dark-mode-friendly, large targets.
- [ ] Empty/error/loading states; offline indicator that's unmistakable.
- [ ] README with one-command setup so a judge runs it out of the box.
- ✅ Done = a stranger can install, run, and understand it in minutes.

## 5. Demo video script (≤ 3 minutes, two "wow" beats)

1. **Problem (0:00–0:20).** Stadium crowd; "no signal, and nobody knows who owes whom." Put a
   phone in airplane mode on camera.
2. **Offline sync — wow #1 (0:20–1:20).** Two/three devices, internet off, same local network.
   Add "Tickets — 50 USD, split 5 ways" on one device; it appears on the others. Say it plainly:
   "No server. No internet. The ledger is peer-to-peer."
3. **Minimal settlement (1:20–1:50).** Show the plan: "5 people, but only 3 payments clear
   everything." This is the smart, useful bit.
4. **On-chain settle — wow #2 (1:50–2:30).** Re-enable the internet. Tap "Pay in USD₮." Show the
   real (testnet) transaction hash. "Self-custodial. Wallet to wallet. No bank, no custodian."
5. **Close (2:30–3:00).** "Computed offline, settled on-chain. One Bare app, built on Pears and
   WDK." Show the debt cleared on every device.

Upload unlisted to YouTube; link it in the DoraHacks submission.

## 6. Scope cuts (if time runs short — cut from the bottom)

1. Custom (unequal) splits → ship equal-only first.
2. Multiple simultaneous groups → support one group well.
3. Fancy onboarding → minimal create/restore wallet + join code.
4. Mobile + desktop both → pick the single surface that demos offline sync best.

Never cut: the real USD₮ transfer, the real P2P sync, or money correctness. Those are the
submission.

## 7. Submission checklist (by Jul 14, 23:59 UTC+1)

- [ ] DoraHacks project complete; **WDK** track selected; nation declared; all team members listed.
- [ ] Public GitHub repo, **MIT or Apache-2.0**, runnable with clear setup instructions.
- [ ] Out-of-the-box run shows real P2P sync + a real testnet USD₮ transaction.
- [ ] Unlisted YouTube demo (≤ 3 min) linked.
- [ ] All third-party services/APIs/prebuilt components disclosed; prior work disclosed.
- [ ] Frequent public commits across rounds showing the project growing.

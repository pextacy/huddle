# SplitKick+ — Product Requirements Document (PRD)

> **Packaging note (historical):** this PRD predates the runtime change. The app originally targeted a single Bare/Pear app; it now ships as a Node backend (`server/`) + Next.js frontend (`web/`) because Pear v2 removed `pear run`. Product requirements are unchanged. See `README.md` and `docs/claude.md` for the current architecture.

**Version:** 1.0
**Track:** WDK (Wallets), with a Pears (P2P) offline ledger as the technical differentiator
**Theme:** Football / matchday cost-splitting
**Status:** Active — Tether Developers Cup build

---

## 1. Problem

Two real, overlapping problems collide on matchday:

1. **Group-cost chaos.** Friends go to a match or host a watch party. One person buys tickets,
   another covers food, a third pays for transport. Afterward nobody remembers who owes whom,
   and "I'll send it later" never happens cleanly. This is universal — it happens with or
   without football.
2. **No connectivity when you need it.** A packed stadium saturates the mobile network. The exact
   moment you want to split a bill or check who owes what, your apps can't reach a server.

Existing splitting apps are server-dependent (useless offline) and stop at "tracking" — they
don't actually move money, and they hold your data. Existing payment apps need banks, charge
fees, and are custodial.

## 2. Solution

A single peer-to-peer app where:

- The **ledger and all balance math run offline**, peer-to-peer, with no server. Every member's
  device holds a full, consistent copy.
- Debts are **settled in USD₮ directly between self-custodial wallets** when connectivity
  returns — no bank, no custodian, no fee middleman.
- The settlement is **recorded back into the same P2P ledger**, so everyone stays in sync.

The honest boundary: ledger/splitting is offline; the on-chain USD₮ transfer needs the internet
(it writes to a blockchain). Everything up to payment works with zero infrastructure.

## 3. Target users

- Primary: friend groups who attend matches or host watch parties together (3–6 people).
- Secondary: any small group that repeatedly shares costs (flatmates, five-a-side teams, trips).
  The football theme is the frame; the utility is general.

## 4. Goals and non-goals

### Goals
- Record shared expenses and compute who owes whom, fully offline.
- Minimize the number of payments needed to clear all debts.
- Settle debts in USD₮ between self-custodial wallets, with the result reflected for everyone.
- Make meaningful, load-bearing use of both WDK (settlement) and Pears (offline ledger).
- Be runnable out of the box by a judge, showing real P2P sync and a real on-chain tx.

### Non-goals (for the Cup build)
- Not a betting/gambling product. No pooled wagers, no odds.
- Not a custodial wallet or an exchange. We never hold user funds.
- No fiat on/off-ramp, no KYC flows.
- No global social graph or accounts server. Groups are local and peer-to-peer.
- Not multi-currency settlement beyond USD₮ in this version (USD₮ only on-chain).

## 5. User stories

1. As a group organizer, I create a group and share an invite code, so my friends can join with
   no account and no server.
2. As a member, I join a group from an invite code and the app derives my self-custodial wallet
   on first run.
3. As a member at a stadium with no internet, I add an expense ("tickets, 50 USD, split 5 ways")
   and everyone in range sees it appear.
4. As a member, I open the app and immediately see my net balance — who I owe and who owes me —
   without any connection.
5. As a member, I see the **minimal set of payments** that clears all debts, not a tangle of
   pairwise IOUs.
6. As a debtor back online, I tap "Settle," and USD₮ is sent from my wallet directly to my
   creditor's wallet.
7. As any member, once a settlement happens, my view updates to show the debt cleared.

## 6. Functional requirements

### Groups & identity
- **FR-1** Create a group; generate a shareable invite code (encodes the group secret).
- **FR-2** Join a group from an invite code; derive the same shared topic deterministically.
- **FR-3** On first run, generate a self-custodial wallet (seed phrase in device secure storage)
  and publish the public address into the group ledger.

### Offline ledger (Pears)
- **FR-4** Add an expense (payer, amount in minor units, currency, description, participants,
  equal or custom split). Works with no internet.
- **FR-5** Replicate entries peer-to-peer; all peers converge to an identical ledger view.
- **FR-6** Persist the ledger locally so it survives app restart.
- **FR-7** Compute net balances per member from the ledger, offline.
- **FR-8** Compute the minimal-transfer settlement plan, offline.

### Settlement (WDK)
- **FR-9** Show each debtor the exact USD₮ amount and recipient address for each owed transfer.
- **FR-10** Send USD₮ (ERC-20 transfer) from the user's self-custodial wallet to the creditor's
  published address, returning a transaction hash.
- **FR-11** Record a `payment` entry (with tx hash) into the ledger after the transfer; once
  replicated, the debt shows as cleared for everyone. Idempotent on tx hash.
- **FR-12** Display the user's USD₮ balance and the network/chain in use.

### Clarity
- **FR-13** The UI must clearly distinguish offline-capable actions (everything except payment)
  from the online-only action (settlement).

## 7. Non-functional requirements

- **NFR-1 Self-custody:** keys never leave the device; nothing custodial; seed never logged or
  replicated.
- **NFR-2 Determinism:** identical ledger view on all peers; pure domain logic; integer money.
- **NFR-3 Offline-first:** core flows function with zero infrastructure; no blocking on the
  network for anything but on-chain settlement.
- **NFR-4 Open source:** public GitHub repo under MIT or Apache-2.0, runnable from clear setup
  instructions.
- **NFR-5 Out-of-the-box demo:** a judge can run it and observe real peer sync and a real testnet
  transaction.
- **NFR-6 Performance:** balance and settlement computation are instant for typical groups
  (≤ ~20 members, hundreds of entries).

## 8. UX principles and screens

### Visual principles
- **Solid colors only — no gradients** anywhere (background, surfaces, buttons, text).
- Flat, high-contrast, fast; legible at a glance in bright, loud environments.
- One accent color; dark-mode-friendly defaults; large tap targets.
- Honest status: a persistent, unmistakable indicator for "offline — synced with peers nearby"
  vs "online — settlement available."

### Screens
1. **Home / Groups** — list of groups, net balance per group, create/join actions.
2. **Group ledger** — chronological expenses + payments; running "you owe / you're owed" summary;
   prominent "Add expense" and "Settle up" actions.
3. **Add expense** — amount, description, payer, participants, equal/custom split.
4. **Settle up** — the minimal-transfer plan; for the current user, each owed transfer with a
   one-tap "Pay in USD₮" (online only); shows tx hash on success.
5. **Wallet** — USD₮ balance, address (QR), chain/network indicator.
6. **Onboarding** — create/restore wallet (seed phrase), join/create first group.

## 9. Success metrics (for judging)

Mapped to the Cup's five criteria (each scored 1–5):

- **Technical ambition:** a real multi-writer CRDT ledger over Hyperswarm/Autobase plus on-chain
  settlement, in one Bare app.
- **User experience:** add an expense and read your balance in seconds, offline; one-tap settle.
- **Real-world utility:** solves a problem everyone has (group debts) and works where apps usually
  fail (no connectivity).
- **Creativity:** offline-first money app — the combination of zero-infra ledger + self-custodial
  settlement is the novel idea.
- **Real use of the platform:** WDK moves the money; Pears is the entire ledger. Neither is a logo.

## 10. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Combining two platforms balloons scope and nothing finishes | Build the **wallet path first** so there is always a working, payable app; add the P2P ledger as a layer; keep a runnable build at every checkpoint (see `plan.md`). |
| Autobase/WDK API drift between versions | Pin versions; verify signatures against installed READMEs; isolate I/O from pure domain logic. |
| "Offline" claim is challenged by judges | Document the precise connectivity model (ledger offline; on-chain payment online); demo on a local network with the uplink disabled. |
| Live on-chain demo risk | Use a **testnet** + testnet USD₮ so settlement is genuinely on-chain but costs nothing. |
| Money rounding bugs | Integer minor units everywhere; deterministic remainder distribution; convert only at the WDK boundary. |

## 11. Open questions

- Which EVM chain/testnet for the demo (pick one with reliable public RPC and easy testnet USD₮).
- Mobile (Bare mobile) vs desktop (pear-electron) for the primary demo surface — pick the one
  that demos the offline sync most convincingly with the hardware on hand.
- Whether to ship custom (unequal) splits in v1 or keep equal-only and add custom if time allows.

# Huddle — Technical Documentation

Offline-first group expense splitting and self-custodial USD₮ settlement, built as a
single peer-to-peer app on the Tether open-source stack.

**Primary track:** WDK (Wallets)
**Technical differentiator layer:** Pears (Peer-to-Peer)
**Theme:** Football / matchday — splitting tickets, food, and watch-party costs with friends.

---

## 1. One-paragraph summary

A group of friends goes to a match or hosts a watch party. Someone buys the tickets,
someone else covers the food. Huddle records every expense and computes who owes whom
**completely offline**, peer-to-peer, so it works even when a packed stadium has saturated
the mobile network. The shared ledger is a CRDT that every member's device holds a full copy
of, so balances are always available with no server. When connectivity returns, debts are
settled in **USD₮ directly between self-custodial wallets** — no bank, no custodian, no fee
middleman. The settlement is recorded back into the same P2P ledger so everyone's view stays
consistent.

The product is honest about the boundary: **ledger and balance math are offline; the on-chain
USD₮ transfer needs connectivity** (because it writes to a blockchain). Everything up to the
moment of payment works with zero infrastructure.

---

## 2. Why the combined stack is coherent (not two bolted-together demos)

WDK explicitly supports the **Bare runtime**, which is the runtime Pears apps run on. From the
WDK docs: *"For Node.js or Bare runtime: Use `@tetherto/wdk` as the orchestrator, then register
individual wallet modules."*

That means:

- The P2P ledger (Hyperswarm + Autobase + Hyperbee) and the wallet (WDK) run **in the same
  process, in the same Bare app**.
- The wallet address is published into the shared ledger as a normal ledger entry, so peers
  discover where to pay each other without any server.
- A single codebase covers both the WDK track requirement ("make meaningful use of the
  platform") and the Pears differentiator.

This is the strongest possible answer to the judging criterion *"Real use of the chosen Tether
platform."* WDK is the declared track and is load-bearing (it moves the money). Pears is not a
logo — it is the whole offline ledger.

---

## 3. Module / dependency list (real packages)

### Pears / Holepunch (P2P + local-first storage)

| Package | Role |
|---|---|
| Node + Next.js | App runtime: the Holepunch/WDK modules run in a Node backend (`server/`), the UI is Next.js (`web/`). (Pear packaging was dropped — Pear v2 removed `pear run`.) |
| `hyperswarm` | Peer discovery + encrypted connections by topic |
| `hypercore-crypto` | Key pairs, hashing, deriving the 32-byte group topic |
| `corestore` | Manages the collection of Hypercores per group |
| `autobase` | Multi-writer log → deterministic linearized view |
| `hyperbee` | Ordered key/value view that Autobase produces (the ledger state) |
| `b4a` | Buffer/Uint8Array helpers used across Holepunch modules |

### WDK (Wallets + USD₮ settlement)

| Package | Role |
|---|---|
| `@tetherto/wdk` | Core orchestrator: seed-phrase management, account derivation |
| `@tetherto/wdk-wallet-evm` | EVM wallet module (addresses, balances, transactions, ERC-20 USD₮) |

> All WDK packages are published under the `@tetherto` scope on npm. Pin exact versions in
> `package.json` and verify any method signature against the installed version's docs — the
> Holepunch and WDK APIs are young and can change between minor versions.

### Reference docs

- Pears: https://docs.pears.com
- Hyperswarm: https://github.com/holepunchto/hyperswarm
- Autobase: https://github.com/holepunchto/autobase (and `autobee` for the KV pattern)
- WDK: https://docs.wdk.tether.io

---

## 4. Architecture

```
+-------------------------------------------------------------+
|                    Huddle (one Bare app)                |
|                                                             |
|   UI layer (pear-electron / desktop, or Bare mobile)        |
|   - Groups, expenses, balances, "Settle" button            |
|                                                             |
|   +----------------------+      +------------------------+  |
|   |  P2P LEDGER (Pears)  |      |   WALLET (WDK)         |  |
|   |                      |      |                        |  |
|   |  Hyperswarm  ------- topic -|  @tetherto/wdk         |  |
|   |  Corestore           |      |  wdk-wallet-evm        |  |
|   |  Autobase (multi-    |      |                        |  |
|   |   writer log)        |      |  - derive account      |  |
|   |  Hyperbee (view =    |<-----|  - getAddress()        |  |
|   |   the ledger state)  | addr |  - getBalance()        |  |
|   |                      |      |  - send USD₮ (ERC-20)  |  |
|   +----------------------+      +------------------------+  |
|            |                              |                 |
+------------|------------------------------|-----------------+
             |                              |
   peer <-> peer (offline-capable)   blockchain RPC (online only)
```

**Data flow**

1. Group creation derives a 32-byte topic from a random group secret.
2. Members join the topic over Hyperswarm; each gets added as an Autobase writer.
3. Each member publishes their wallet address (from WDK) into the ledger.
4. Expenses are appended locally and replicated P2P; the Autobase `apply` function merges
   them deterministically into a Hyperbee view that is identical on every device.
5. Balances and the minimal settlement plan are computed from the view — offline.
6. On settlement, WDK sends USD₮ to the creditor's published address; the resulting tx hash
   is appended to the ledger as a `payment` entry so all peers see the debt as cleared.

---

## 5. Data model (ledger entries)

Every entry is a JSON object appended to the author's writer core. The `apply` function folds
them into the Hyperbee view. Keep entries small and **deterministic** — the same set of entries
must always produce the same view on every peer.

```js
// Member joins (authorizes a new writer)
{ type: 'addWriter', key: '<hex writer key>', member: { id, name } }

// A member publishes their payout address
{ type: 'wallet', member: '<memberId>', chain: 'ethereum', address: '0x...' }

// An expense
{
  type: 'expense',
  id: '<uuid>',
  payer: '<memberId>',
  amountMinor: 5000,          // integer minor units (e.g. 50.00 USD = 5000) — never floats
  currency: 'USD',
  description: 'Match tickets x5',
  participants: ['m1','m2','m3','m4','m5'], // who shares this cost
  split: 'equal',             // 'equal' | { m1: 2000, m2: 3000, ... } for custom
  ts: 1751000000000
}

// A settlement payment (recorded after on-chain success)
{
  type: 'payment',
  id: '<uuid>',
  from: '<memberId>',
  to: '<memberId>',
  amountMinor: 2500,
  currency: 'USDT',
  txHash: '0x...',
  chain: 'ethereum',
  ts: 1751000100000
}
```

**Money rule:** store integer minor units everywhere. Never use JavaScript floats for money.
USD₮ on-chain amounts are big integers in the token's smallest unit (6 decimals for USD₮), so
convert at the wallet boundary only.

---

## 6. P2P layer (real code)

### 6.1 Deriving a shared group topic

```js
import crypto from 'hypercore-crypto'
import b4a from 'b4a'

// At group creation: random 32-byte secret shared with members (QR / invite code)
const groupSecret = crypto.randomBytes(32)

// Everyone derives the same topic deterministically from the secret
const topic = crypto.hash(groupSecret) // 32-byte Buffer
const inviteCode = b4a.toString(groupSecret, 'hex') // share this out-of-band
```

### 6.2 Joining the swarm and replicating

```js
import Hyperswarm from 'hyperswarm'
import Corestore from 'corestore'
import b4a from 'b4a'

const store = new Corestore(Pear.config.storage) // persistent local-first storage
const swarm = new Hyperswarm()

// Clean shutdown so the DHT record is released
Pear.teardown(() => swarm.destroy())

// Replicate every connection into our Corestore
swarm.on('connection', (conn, info) => {
  store.replicate(conn)
})

// Join the group topic. server+client so any peer can connect to any peer.
const discovery = swarm.join(topic, { server: true, client: true })
await discovery.flushed() // announced on the DHT
```

### 6.3 The multi-writer ledger (Autobase + Hyperbee)

```js
import Autobase from 'autobase'
import Hyperbee from 'hyperbee'
import b4a from 'b4a'

const base = new Autobase(store, bootstrapKeyOrNull, {
  // The view shape: an ordered key/value store = our ledger state
  open (store) {
    return new Hyperbee(store.get('ledger-view'), {
      keyEncoding: 'utf-8',
      valueEncoding: 'json'
    })
  },

  // Deterministic fold of writer entries into the view
  async apply (nodes, view, host) {
    for (const node of nodes) {
      const op = node.value

      if (op.type === 'addWriter') {
        await host.addWriter(b4a.from(op.key, 'hex'))
        continue
      }

      // Store each entry under a stable, sortable key
      const key = `${op.type}:${op.ts}:${op.id ?? op.member}`
      await view.put(key, op)
    }
  }
})

await base.ready()

// Append a local entry (triggers an apply cycle and replicates to peers)
async function appendEntry (entry) {
  await base.append(entry)
}

// Read the whole ledger view
async function readLedger () {
  const entries = []
  for await (const { value } of base.view.createReadStream()) entries.push(value)
  return entries
}
```

> Note on versions: Autobase's exact constructor/host signature has shifted across releases
> (`apply(nodes, view, host)` with `host.addWriter(...)` is the current shape; older examples
> use `base.addWriter`). Pin the version you install and follow that version's README. The
> `autobee` package (`holepunchto/autobee`) ships this exact KV-over-Autobase pattern if you
> prefer to depend on it instead of hand-rolling `apply`.

---

## 7. Balances and minimal settlement

### 7.1 Net balances

```js
// Returns { memberId: netMinorUnits } — positive = is owed, negative = owes
function computeBalances (entries) {
  const net = {}
  const add = (m, v) => { net[m] = (net[m] ?? 0) + v }

  for (const e of entries) {
    if (e.type === 'expense') {
      const shares = splitShares(e) // { memberId: shareMinor }
      add(e.payer, e.amountMinor)            // payer fronted the money
      for (const [m, share] of Object.entries(shares)) add(m, -share)
    }
    if (e.type === 'payment') {
      add(e.from, e.amountMinor)  // paying down what you owe raises your balance
      add(e.to, -e.amountMinor)
    }
  }
  return net
}

function splitShares (e) {
  if (e.split === 'equal') {
    const n = e.participants.length
    const base = Math.floor(e.amountMinor / n)
    const rem = e.amountMinor - base * n // distribute the remainder deterministically
    const out = {}
    e.participants.forEach((m, i) => { out[m] = base + (i < rem ? 1 : 0) })
    return out
  }
  return e.split // explicit custom shares, already in minor units
}
```

### 7.2 Minimal-transfer settlement (the "20 payments → 4 payments" feature)

```js
// Greedy min-cash-flow: produce the smallest set of transfers that clears all debts.
function settlementPlan (net) {
  const creditors = [], debtors = []
  for (const [m, v] of Object.entries(net)) {
    if (v > 0) creditors.push({ m, v })
    else if (v < 0) debtors.push({ m, v: -v })
  }
  creditors.sort((a, b) => b.v - a.v)
  debtors.sort((a, b) => b.v - a.v)

  const transfers = []
  let i = 0, j = 0
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].v, creditors[j].v)
    transfers.push({ from: debtors[i].m, to: creditors[j].m, amountMinor: pay })
    debtors[i].v -= pay
    creditors[j].v -= pay
    if (debtors[i].v === 0) i++
    if (creditors[j].v === 0) j++
  }
  return transfers // each: { from, to, amountMinor }
}
```

This is fully deterministic and runs offline. It is also genuinely useful: naive splitting of a
5-person trip can produce up to 20 pairwise debts; this typically reduces them to 3–4 transfers.

---

## 8. Wallet layer (WDK, real code)

### 8.1 Create / load a self-custodial wallet

```js
import WDK from '@tetherto/wdk'
import WalletManagerEvm from '@tetherto/wdk-wallet-evm'

// First run: generate and securely persist a seed phrase on-device.
// NEVER log it, never sync it, never put it in the ledger.
const seedPhrase = WDK.getRandomSeedPhrase(24) // 24 words for stronger entropy

const wdk = new WDK(seedPhrase).registerWallet('ethereum', WalletManagerEvm, {
  provider: RPC_URL // testnet RPC for the demo; an L2 RPC for low-fee production
})

const account = await wdk.getAccount('ethereum', 0)
const myAddress = await account.getAddress()
const balance = await account.getBalance()
```

### 8.2 Publish the address into the P2P ledger

```js
await appendEntry({ type: 'wallet', member: myId, chain: 'ethereum', address: myAddress })
// Now every peer can look up where to pay me — no server, no directory.
```

### 8.3 Settle a debt in USD₮ (ERC-20 transfer)

USD₮ is an ERC-20 token, so a settlement is a token transfer to the creditor's published
address. Two valid paths:

```js
// Path A — wallet-module token transfer (preferred; verify the exact method name and
// signature against the installed @tetherto/wdk-wallet-evm version).
const result = await account.sendTransaction({
  to: creditorAddress,
  token: USDT_CONTRACT_ADDRESS, // the USD₮ token contract on the chosen chain
  value: amountInTokenUnits     // bigint, 6 decimals for USD₮
})

// Path B — universal ERC-20 transfer via raw calldata (works on any EVM chain even if
// the helper above differs). Encode transfer(address,uint256) and send to the token contract.
import { encodeFunctionData } from 'viem' // or ethers' Interface.encodeFunctionData
const data = encodeFunctionData({
  abi: [{ name: 'transfer', type: 'function', stateMutability: 'nonpayable',
          inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }],
          outputs: [{ type: 'bool' }] }],
  functionName: 'transfer',
  args: [creditorAddress, amountInTokenUnits]
})
const result2 = await account.sendTransaction({ to: USDT_CONTRACT_ADDRESS, value: 0n, data })

const txHash = result.hash ?? result2.hash
```

### 8.4 Record the settlement back into the ledger

```js
await appendEntry({
  type: 'payment', id: uuid(),
  from: myId, to: creditorId,
  amountMinor, currency: 'USDT',
  txHash, chain: 'ethereum', ts: Date.now()
})
// computeBalances() now shows the debt cleared on every peer once replicated.
```

---

## 9. Connectivity / offline model (read this carefully — it's the credibility of the demo)

Be precise about what "offline" means here, because judges will ask.

- **The ledger is local-first and CRDT-like.** Writes never block on connectivity. Each member
  appends to their own writer core; Autobase merges deterministically whenever peers can
  exchange data. There is no server and no single source of truth.
- **Peer discovery has two paths:**
  - *Internet available:* Hyperswarm's DHT finds peers anywhere in the world.
  - *No internet, shared local network (the stadium case):* peers on the same Wi-Fi/AP can still
    connect directly. Many venues keep a local network up even when the upstream link is
    saturated. For a guaranteed offline demo, peers exchange the topic + keys at group creation
    (QR/invite) and connect over the LAN.
- **What genuinely requires the internet:** the USD₮ on-chain transfer, because it writes to a
  blockchain. This is by design and is communicated in the UI ("you'll settle when you're back
  online"). Everything else — recording expenses, splitting, computing who owes whom — works
  with zero infrastructure.

For the live demo, the robust setup is: two or three devices on a local Wi-Fi network with the
internet uplink disabled. Add an expense on one device → it appears on the others. Re-enable the
internet → tap Settle → USD₮ moves on-chain.

---

## 10. Security & correctness notes

- **Self-custody:** the seed phrase lives only on the device, in secure storage. It is never
  logged, never written to the ledger, never replicated. WDK is stateless and never touches your
  keys off-device.
- **Determinism:** the `apply` function and all balance math must be pure and deterministic.
  No `Date.now()` inside `apply`, no map-iteration-order assumptions, no floats for money.
- **Writer authorization:** only entries from authorized Autobase writers affect the view. The
  group creator is the initial writer; new members are added via `addWriter` entries.
- **Idempotent settlement:** record a `payment` only after the transaction is confirmed (or at
  least broadcast and hash-known). Use the on-chain tx hash as the dedupe key so a retried
  settlement never double-counts.
- **Amounts:** integer minor units in the ledger; convert to the token's 6-decimal big-integer
  unit only at the WDK boundary.
- **Testnet for the demo:** use a testnet RPC and testnet USD₮ so the live demo moves real
  on-chain value with zero financial risk. Document the mainnet/L2 config separately.

---

## 11. Glossary

- **Topic** — 32-byte identifier that defines a Hyperswarm rendezvous; here, one per group.
- **Writer** — a peer whose appends are merged into the shared view (one per member).
- **View** — the Hyperbee key/value state derived from all writers; our ledger.
- **Minor units** — smallest integer unit of an amount (cents for USD, 6-decimal base for USD₮).
- **Settlement** — clearing a debt by an on-chain USD₮ transfer, then recording it in the ledger.

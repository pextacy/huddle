/**
 * Backend bridge — the single Node-side context the Next.js frontend talks to.
 *
 * Holepunch (Hyperswarm/Autobase/Corestore) and WDK run in Node, not the browser, so this
 * bridge owns the live P2P ledger + self-custodial wallet and exposes plain JSON operations.
 * The Next.js frontend (web/) consumes these over HTTP/SSE — no mocks, real modules.
 *
 * Group invite format: `<groupSecretHex>:<bootstrapKeyHex>` — the secret derives the swarm
 * topic (peer discovery), the bootstrap key bootstraps the shared Autobase.
 */

import Corestore from 'corestore'
import { homedir, platform } from 'node:os'
import { join } from 'node:path'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import crypto from 'hypercore-crypto'
import b4a from 'b4a'

import { createGroup, joinGroup } from '../src/p2p/topic.js'
import { openLedger, appendEntry, addWriter, readLedger, localWriterKey, bootstrapKey, isWritable } from '../src/p2p/ledger.js'
import { joinSwarm } from '../src/p2p/swarm.js'
import { computeBalances } from '../src/domain/balances.js'
import { settlementPlan } from '../src/domain/settlement.js'
import { groupInsights } from '../src/domain/insights.js'
import { makeExpense, makePayment, makeFee, makeVoid, makeCashPayment, makeComment, makeReminder, makeRecurring, COMMENT_MAX } from '../src/domain/entries.js'
import { latestTemplates, dueOccurrences, materializeOccurrence } from '../src/domain/recurring.js'
import { convertMinor, isCurrency } from '../src/domain/currency.js'
import { buildNotifications } from '../src/domain/notifications.js'
import { computeSettlement, platformRevenue } from '../src/domain/fees.js'
import { isProActive, extendPro, MAX_MONTHS } from '../src/domain/pro.js'
import { generateSeed, openWallet, closeWallet, getNativeBalance, getUsdtBalance, sendUsdt, getNetwork, NETWORK, USDT } from '../src/wallet/wdk.js'
import { TREASURY, FEE, PRO, ACTIVE_NETWORK, applyNetwork, getFaucets, networkChoices } from '../src/wallet/config.js'
import { loadOrCreateSeed } from '../src/wallet/seed-store.js'
import { formatUsdt } from '../src/wallet/units.js'

const APP_DIR = 'splitkick-plus'

const isNonEmptyStr = (s) => typeof s === 'string' && s.length > 0

/** Coerce + validate a minor-unit amount before it can move money or hit the ledger. */
function assertPosIntMinor (amountMinor, label = 'amount') {
  const n = Number(amountMinor)
  if (!Number.isSafeInteger(n) || n <= 0) {
    throw new Error(`${label} must be a positive whole number of minor units (got ${amountMinor}).`)
  }
  return n
}

/** Current platform fee policy (treasury + bps + caps), resolved from config. */
function feePolicy () {
  return {
    enabled: FEE.enabled,
    bps: FEE.bps,
    minMinor: FEE.minMinor,
    maxMinor: FEE.maxMinor,
    treasury: TREASURY.address
  }
}

function appDir () {
  const home = homedir()
  if (platform() === 'darwin') return join(home, 'Library', 'Application Support', APP_DIR)
  if (platform() === 'win32') return join(process.env.APPDATA || join(home, 'AppData', 'Roaming'), APP_DIR)
  return join(process.env.XDG_DATA_HOME || join(home, '.local', 'share'), APP_DIR)
}

export function createBridge (opts = {}) {
  const baseDir = opts.baseDir || appDir()
  const enableSwarm = opts.enableSwarm !== false // default on
  const enableWallet = opts.enableWallet !== false // default on
  mkdirSync(baseDir, { recursive: true })
  const groupMetaPath = join(baseDir, 'group.json')
  const proPath = join(baseDir, 'pro.json')
  const settlesPath = join(baseDir, 'settles.json')
  const networkPath = join(baseDir, 'network.json')
  const ratesPath = join(baseDir, 'rates.json')

  // Apply any persisted network choice BEFORE the wallet opens, so the first wallet connects to the
  // right chain. Falls back to the SPLITKICK_NETWORK / sepolia default already applied by config.js.
  ;(function restoreNetwork () {
    if (!existsSync(networkPath)) return
    try {
      const saved = JSON.parse(readFileSync(networkPath, 'utf8'))
      if (saved?.key) applyNetwork(saved.key)
    } catch { /* corrupt/unknown -> keep the default */ }
  })()
  function persistNetwork (key) { try { writeFileSync(networkPath, JSON.stringify({ key }, null, 2)) } catch { /* best-effort */ } }

  /** @type {{ store, base, swarm, group } | null} */
  let ledger = null
  let wallet = null
  let walletError = null
  const listeners = new Set() // SSE subscribers
  let memberId = null
  let memberName = null
  let publishedAddr // last wallet address (or null) we've appended for memberId
  let balCache = null // { at, usdt, gas, online } — throttles on-chain balance RPC
  const settleInFlight = new Set() // idempotency keys of settles currently sending on-chain

  // Durable settle receipts keyed by idempotency key: { txHash, amountMinor, ts }. Written the
  // instant an on-chain transfer succeeds — BEFORE the ledger append is attempted — so a retry
  // after a crash/timeout/failed-append returns the prior tx hash instead of paying twice. The
  // shared ledger clears the debt for everyone; this is only the local double-spend guard.
  let settleReceipts = loadSettleReceipts()
  function loadSettleReceipts () {
    if (!existsSync(settlesPath)) return {}
    try { return JSON.parse(readFileSync(settlesPath, 'utf8')) || {} } catch { return {} }
  }
  function persistSettleReceipts () { try { writeFileSync(settlesPath, JSON.stringify(settleReceipts, null, 2)) } catch { /* best-effort */ } }
  function recordSettleReceipt (key, txHash, amountMinor) {
    if (!key) return
    settleReceipts[key] = { txHash, amountMinor, ts: Date.now() }
    persistSettleReceipts()
  }

  // Best-effort FX rates to PREFILL the foreign-currency rate field (origin currency -> USD, in
  // micros). Real network fetch when online, cached to disk as the last-known fallback. Never
  // load-bearing: the offline expense path always lets the user type the rate by hand, and the
  // stored expense freezes the rate that was actually used — so this only saves typing.
  function loadRatesCache () {
    if (!existsSync(ratesPath)) return null
    try { return JSON.parse(readFileSync(ratesPath, 'utf8')) } catch { return null }
  }
  async function doRates () {
    const cached = loadRatesCache()
    try {
      const res = await Promise.race([
        fetch('https://open.er-api.com/v6/latest/USD'),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
      ])
      const json = await res.json()
      if (json?.result !== 'success' || !json.rates) throw new Error('bad rates response')
      // API gives USD->X (1 USD = rates[X] of X). We need X->USD micros = round(1e6 / rates[X]).
      const micros = {}
      for (const [code, r] of Object.entries(json.rates)) {
        if (typeof r === 'number' && r > 0) micros[code] = Math.round(1_000_000 / r)
      }
      micros.USD = 1_000_000
      const payload = { base: 'USD', online: true, ts: Date.now(), rates: micros }
      try { writeFileSync(ratesPath, JSON.stringify(payload)) } catch { /* best-effort */ }
      return payload
    } catch {
      if (cached) return { ...cached, online: false, stale: true }
      return { base: 'USD', online: false, ts: 0, rates: { USD: 1_000_000 } }
    }
  }

  function emit () {
    for (const fn of listeners) { try { fn() } catch {} }
  }

  // ── wallet ────────────────────────────────────────────────────────────────
  async function ensureWallet () {
    if (wallet || walletError) return
    if (!enableWallet) { walletError = 'wallet disabled'; return }
    try {
      const { seed } = loadOrCreateSeed(generateSeed)
      wallet = await openWallet(seed)
    } catch (e) {
      walletError = e.shortMessage || e.message
    }
  }

  // Below this much native balance we warn that a settlement may fail for lack of gas. 0.0003 ETH
  // comfortably covers an ERC-20 transfer on testnet; on mainnet it's a floor, not a guarantee.
  const LOW_GAS_WEI = 300000000000000n

  async function walletStatus () {
    await ensureWallet()
    // network descriptor shared by every branch: active key + list power the UI's network switcher.
    const net = {
      ...getNetwork(),
      key: ACTIVE_NETWORK,
      testnet: NETWORK.testnet,
      explorerTxUrl: NETWORK.explorerTxUrl,
      explorerAddressUrl: NETWORK.explorerAddressUrl
    }
    const networks = networkChoices()
    const faucets = getFaucets()
    // The fee/pro policy is independent of whether the wallet itself opened, so surface it even
    // when the wallet is unavailable — the UI still needs to show pricing.
    const fee = feePolicy()
    if (!wallet) return { ok: false, error: walletError, network: net, networks, faucets, testnet: NETWORK.testnet, fee, pro: proStatus() }
    let usdt = null; let gas = null; let online = true; let lowGas = false
    if (balCache && Date.now() - balCache.at < 8000) {
      ;({ usdt, gas, online, lowGas } = balCache)
    } else {
      try {
        const [u, w] = await Promise.all([getUsdtBalance(wallet), getNativeBalance(wallet)])
        usdt = formatUsdt(u); gas = (w / 10n ** 18n).toString() + '.' + (w % 10n ** 18n).toString().padStart(18, '0').slice(0, 6)
        lowGas = w < LOW_GAS_WEI
      } catch (e) { online = false }
      balCache = { at: Date.now(), usdt, gas, online, lowGas }
    }
    return {
      ok: true,
      address: wallet.address,
      network: net,
      networks,
      faucets,
      testnet: NETWORK.testnet,
      usdt,
      gas,
      lowGas,
      online,
      usdtToken: USDT.address,
      fee,
      pro: proStatus()
    }
  }

  /**
   * Switch the active blockchain network (testnet ↔ mainnet) at runtime. Applies the new params in
   * place (config.applyNetwork), reopens the wallet against the new RPC/chain, and persists the
   * choice so it survives restarts. The seed derives the same address on both chains, so the ledger
   * and its published member addresses stay valid — no membership republish is needed.
   */
  async function doSetNetwork ({ key }) {
    const k = String(key || '').toLowerCase()
    if (!networkChoices().some((n) => n.key === k)) {
      throw new Error(`Unknown network "${key}". Use one of: ${networkChoices().map((n) => n.key).join(', ')}.`)
    }
    if (k === ACTIVE_NETWORK && wallet) return walletStatus() // already there
    applyNetwork(k)
    persistNetwork(k)
    // Drop the old wallet handle (and its RPC connection) so ensureWallet() reopens on the new chain.
    if (wallet) { try { closeWallet(wallet) } catch {} }
    wallet = null
    walletError = null
    balCache = null
    await ensureWallet()
    emit()
    return walletStatus()
  }

  // ── pro subscription (second revenue stream) ────────────────────────────────
  function loadPro () {
    if (!existsSync(proPath)) return null
    try { return JSON.parse(readFileSync(proPath, 'utf8')) } catch { return null } // corrupt -> treat as not subscribed
  }
  function persistPro (pro) { writeFileSync(proPath, JSON.stringify(pro, null, 2)) }

  /** Current Pro status for the UI (active flag + expiry + price + cumulative subscription revenue). */
  function proStatus () {
    const pro = loadPro()
    return {
      enabled: PRO.enabled,
      active: isProActive(pro, Date.now()),
      until: pro?.until ?? null,
      pricePerMonthMinor: PRO.pricePerMonthMinor,
      maxMonths: MAX_MONTHS,
      subscriptionRevenueMinor: pro?.subscriptionRevenueMinor ?? 0
    }
  }

  /**
   * Subscribe (or extend) Pro: a real on-chain USD₮ payment to the treasury that waives the
   * per-settle fee for `months`. Online-only (writes to a blockchain). Treasury required.
   */
  async function doSubscribePro ({ months }) {
    const m = Number(months)
    if (!Number.isSafeInteger(m) || m <= 0 || m > MAX_MONTHS) throw new Error(`months must be a whole number between 1 and ${MAX_MONTHS}.`)
    if (!PRO.enabled || !TREASURY.address) throw new Error('Pro is unavailable: no treasury address is configured.')
    const priceMinor = m * PRO.pricePerMonthMinor
    // Validate the price BEFORE touching the chain — a zero/misconfigured price must not burn gas
    // on a 0-value transfer and then throw in extendPro, leaving the user charged-but-not-Pro.
    if (!Number.isSafeInteger(priceMinor) || priceMinor <= 0) throw new Error('Pro pricing is not configured (price per month must be positive).')
    await ensureWallet()
    if (!wallet) throw new Error(`Wallet unavailable: ${walletError || 'unknown'}`)
    // Real on-chain USD₮ transfer to the treasury — this is the subscription revenue.
    const { hash } = await sendUsdt(wallet, TREASURY.address, priceMinor)
    const next = extendPro(loadPro(), m, Date.now(), hash, priceMinor)
    persistPro(next)
    balCache = null // balance dropped; force a refresh
    emit()
    return { txHash: hash, months: m, priceMinor, pro: proStatus(), state: await fullState() }
  }

  // ── group / ledger ──────────────────────────────────────────────────────────
  // Group registry: a device can hold many groups (Splitwise-style) but keeps ONE active at a time
  // (the live ledger + swarm). The registry is `{ activeId, groups: [meta,...] }`. Legacy installs
  // that only have the old single `group.json` are migrated into the registry on first load.
  const registryPath = join(baseDir, 'groups.json')
  function loadRegistry () {
    if (existsSync(registryPath)) {
      try {
        const reg = JSON.parse(readFileSync(registryPath, 'utf8'))
        if (reg && Array.isArray(reg.groups)) return reg
      } catch { /* corrupt -> fall through to migration/empty */ }
    }
    // Migrate a legacy single-group install.
    if (existsSync(groupMetaPath)) {
      try {
        const meta = JSON.parse(readFileSync(groupMetaPath, 'utf8'))
        if (meta && meta.id) return { activeId: meta.id, groups: [meta] }
      } catch { /* ignore */ }
    }
    return { activeId: null, groups: [] }
  }
  function saveRegistry (reg) {
    try { writeFileSync(registryPath, JSON.stringify(reg, null, 2)) } catch { /* best-effort */ }
  }
  /** Add or replace a group meta in the registry; optionally make it the active group. */
  function upsertGroup (meta, { active = false } = {}) {
    const reg = loadRegistry()
    const i = reg.groups.findIndex((g) => g.id === meta.id)
    if (i >= 0) reg.groups[i] = { ...reg.groups[i], ...meta }
    else reg.groups.push(meta)
    if (active) reg.activeId = meta.id
    saveRegistry(reg)
  }
  function removeGroup (id) {
    const reg = loadRegistry()
    reg.groups = reg.groups.filter((g) => g.id !== id)
    if (reg.activeId === id) reg.activeId = reg.groups[0]?.id ?? null
    saveRegistry(reg)
    return reg
  }
  function persistGroup (meta) { upsertGroup(meta, { active: true }) }
  function loadGroupMeta () {
    const reg = loadRegistry()
    return reg.groups.find((g) => g.id === reg.activeId) || reg.groups[0] || null
  }
  /** The lightweight group list for the UI: id/name + which is active. */
  function groupList () {
    const reg = loadRegistry()
    return { activeId: reg.activeId, groups: reg.groups.map((g) => ({ id: g.id, name: g.name, active: g.id === reg.activeId })) }
  }

  async function startLedger ({ invite, secretHex, topic, bootstrap, meta }) {
    const store = new Corestore(join(baseDir, 'store', meta.id))
    const base = await openLedger(store, bootstrap || null)
    let swarm = null
    if (enableSwarm) {
      try {
        const res = await Promise.race([
          joinSwarm(topic, store),
          new Promise((resolve) => setTimeout(() => resolve(null), 8000)) // best-effort; don't hang
        ])
        swarm = res?.swarm ? res : null
      } catch (e) { /* offline-capable: ledger still works locally */ }
    }

    ledger = { store, base, swarm, group: meta }

    // Seed our last-published address from the persisted ledger so a restart doesn't
    // append a duplicate membership entry every launch.
    publishedAddr = undefined
    try {
      for (const e of await readLedger(base)) {
        if (e.type === 'wallet' && e.member === memberId) publishedAddr = e.address ?? null
      }
    } catch { /* fresh ledger */ }

    // Periodically pull updates so SSE pushes converge across peers. Emit only when the view
    // actually changed (or at most every 8s, to refresh wallet status) — idle groups shouldn't
    // hammer the chain RPC or re-render the UI on every tick.
    let lastVersion = -1
    let lastEmit = 0
    const tick = async () => {
      await base.update()
      await maybePublishMembership() // publishes once we're approved as a writer
      await materializeDue().catch(() => {}) // roll any newly-due recurring occurrences into expenses
      const v = base.view?.version ?? 0
      const now = Date.now()
      if (v !== lastVersion || now - lastEmit >= 8000) {
        lastVersion = v; lastEmit = now
        emit()
      }
    }
    tick().catch(() => {})
    const timer = setInterval(() => { tick().catch(() => {}) }, 1500)
    ledger.timer = timer
    return ledger
  }

  async function doCreateGroup ({ name, member }) {
    await teardownLedger()
    await ensureWallet()
    const { topic, inviteCode } = createGroup()
    const id = b4a.toString(crypto.randomBytes(8), 'hex')
    memberId = b4a.toString(crypto.randomBytes(8), 'hex')
    memberName = member || 'Me'
    const store = new Corestore(join(baseDir, 'store', id))
    const base = await openLedger(store, null)
    const bootstrap = bootstrapKey(base)
    const invite = `${inviteCode}:${bootstrap}`
    const meta = { id, name: name || 'Group', invite, bootstrap, secretHex: inviteCode, memberId, memberName, creator: true }
    await base.close(); await store.close()

    const joined = joinGroup(inviteCode)
    await startLedger({ invite, secretHex: inviteCode, topic: joined.topic, bootstrap, meta })
    persistGroup(meta)

    // Creator is the initial writer — publish our member + wallet address.
    await maybePublishMembership()
    emit()
    return groupState()
  }

  async function doJoinGroup ({ invite, member }) {
    await teardownLedger()
    await ensureWallet()
    const [secretHex, bootstrap] = String(invite).split(':')
    if (!secretHex || !bootstrap) throw new Error('Invalid invite (expected "<secret>:<bootstrap>").')
    const { topic } = joinGroup(secretHex)
    const id = b4a.toString(crypto.randomBytes(8), 'hex')
    memberId = b4a.toString(crypto.randomBytes(8), 'hex')
    memberName = member || 'Me'
    const meta = { id, name: 'Group', invite, bootstrap, secretHex, memberId, memberName, creator: false }
    await startLedger({ invite, secretHex, topic, bootstrap, meta })
    persistGroup(meta)
    emit()
    return groupState()
  }

  /**
   * Switch the active group (multi-group support). Tears down the current live ledger + swarm and
   * brings up the selected group's ledger with that group's own identity. No-op if already active.
   */
  async function doSwitchGroup ({ id }) {
    if (!isNonEmptyStr(id)) throw new Error('A group id is required.')
    if (ledger && ledger.group.id === id) return groupState()
    const meta = loadRegistry().groups.find((g) => g.id === id)
    if (!meta) throw new Error('That group is not on this device.')
    await teardownLedger()
    await ensureWallet()
    memberId = meta.memberId
    memberName = meta.memberName
    const { topic } = joinGroup(meta.secretHex)
    await startLedger({ invite: meta.invite, secretHex: meta.secretHex, topic, bootstrap: meta.bootstrap, meta })
    upsertGroup(meta, { active: true })
    await maybePublishMembership()
    emit()
    return groupState()
  }

  /**
   * Leave a group: drop it from this device's registry. If it was the active group, switch to
   * another remaining group (or fall back to no active group → onboarding). The group lives on for
   * other peers; this only forgets it locally.
   */
  async function doLeaveGroup ({ id }) {
    if (!isNonEmptyStr(id)) throw new Error('A group id is required.')
    const wasActive = ledger && ledger.group.id === id
    const reg = removeGroup(id)
    if (wasActive) {
      await teardownLedger()
      memberId = null; memberName = null
      if (reg.activeId) await doSwitchGroup({ id: reg.activeId })
    }
    emit()
    return fullState()
  }

  /**
   * Publish (or refresh) our membership entry — but only when we're an authorized writer and
   * only when our address actually changed. This is what makes a *joiner* visible to the group:
   * a joined device isn't writable until approved, so it must (re)publish its name + wallet
   * address the moment it gains write access — otherwise it never appears in `members`, can't be
   * picked as a payer, and can't be settled to. Idempotent on address to avoid ledger churn.
   */
  let membershipPublish = null // serializes concurrent callers (tick vs. create/join) so the address check can't race
  function maybePublishMembership () {
    if (membershipPublish) return membershipPublish
    membershipPublish = (async () => {
      if (!ledger || !isWritable(ledger.base)) return
      await ensureWallet()
      const addr = wallet?.address ?? null
      if (publishedAddr === addr) return
      await appendEntry(ledger.base, { type: 'wallet', member: memberId, name: memberName, chain: 'ethereum', address: addr, ts: Date.now() })
      publishedAddr = addr
      await ledger.base.update()
      emit()
    })().finally(() => { membershipPublish = null })
    return membershipPublish
  }

  /**
   * Build a validated expense entry from request fields (shared by add + edit). The base currency
   * is USD₮ (the settlement token). An expense entered in a foreign currency arrives with
   * origCurrency/origAmountMinor/rate; we convert to base minor units HERE (authoritative, integer
   * math) rather than trusting a client-supplied base amount, and record the origin for display.
   */
  function buildExpenseEntry ({ payer, amountMinor, description, participants, split, category, origCurrency, origAmountMinor, rate }) {
    const foreign = isNonEmptyStr(origCurrency) && origCurrency !== 'USD'
    let baseMinor = Number(amountMinor)
    const extra = {}
    if (foreign) {
      const oa = Number(origAmountMinor)
      const rm = Number(rate)
      baseMinor = convertMinor(oa, rm) // integer conversion; validateExpense re-checks consistency
      extra.origCurrency = origCurrency
      extra.origAmountMinor = oa
      extra.rate = rm
    }
    return makeExpense({
      id: b4a.toString(crypto.randomBytes(8), 'hex'),
      payer: payer || memberId,
      amountMinor: baseMinor,
      description: description || '',
      participants,
      split: split || 'equal',
      category: (typeof category === 'string' && category) ? category : 'other',
      ...extra,
      ts: Date.now()
    })
  }

  function requireWriter () {
    if (!ledger) throw new Error('No active group.')
    if (!isWritable(ledger.base)) throw new Error('This device is not yet an authorized writer. Ask a member to approve your writer key.')
  }

  /** Find an expense by id in the current ledger (null if absent). */
  async function findExpense (id) {
    for (const e of await readLedger(ledger.base)) {
      if (e.type === 'expense' && e.id === id) return e
    }
    return null
  }

  async function doAddExpense (fields) {
    requireWriter()
    const entry = buildExpenseEntry(fields)
    await appendEntry(ledger.base, entry)
    await ledger.base.update()
    emit()
    return groupState()
  }

  /**
   * Delete an expense (Splitwise/Tricount parity). Append-only, so we record a `void` reversal that
   * cancels the target expense's effect on balances + insights while preserving history.
   */
  async function doVoidExpense ({ target }) {
    requireWriter()
    if (!isNonEmptyStr(target)) throw new Error('An expense id to delete is required.')
    const exp = await findExpense(target)
    if (!exp) throw new Error('That expense no longer exists.')
    // Already voided? No-op rather than piling up reversals.
    const already = (await readLedger(ledger.base)).some((e) => e.type === 'void' && e.target === target)
    if (already) return groupState()
    await appendEntry(ledger.base, makeVoid({ id: b4a.toString(crypto.randomBytes(8), 'hex'), target, by: memberId, ts: Date.now() }))
    await ledger.base.update()
    emit()
    return groupState()
  }

  /**
   * Edit an expense: void the original and append a corrected one in a single operation, so every
   * peer converges on the new version and the balances update atomically from the group's view.
   */
  async function doEditExpense ({ target, ...fields }) {
    requireWriter()
    if (!isNonEmptyStr(target)) throw new Error('An expense id to edit is required.')
    const exp = await findExpense(target)
    if (!exp) throw new Error('That expense no longer exists.')
    const replacement = buildExpenseEntry(fields) // validates before we void anything
    if (!(await readLedger(ledger.base)).some((e) => e.type === 'void' && e.target === target)) {
      await appendEntry(ledger.base, makeVoid({ id: b4a.toString(crypto.randomBytes(8), 'hex'), target, by: memberId, ts: Date.now() }))
    }
    await appendEntry(ledger.base, replacement)
    await ledger.base.update()
    emit()
    return groupState()
  }

  /**
   * Add a comment to an expense (Splitwise-style discussion thread). Purely social — it replicates
   * so every peer sees the note, but never touches balances. Requires the target expense to exist.
   */
  async function doAddComment ({ target, text }) {
    requireWriter()
    if (!isNonEmptyStr(target)) throw new Error('An expense id to comment on is required.')
    const body = typeof text === 'string' ? text.trim() : ''
    if (!body) throw new Error('A comment cannot be empty.')
    if (body.length > COMMENT_MAX) throw new Error(`A comment must be ${COMMENT_MAX} characters or fewer.`)
    const exp = await findExpense(target)
    if (!exp) throw new Error('That expense no longer exists.')
    await appendEntry(ledger.base, makeComment({
      id: b4a.toString(crypto.randomBytes(8), 'hex'),
      target,
      by: memberId,
      text: body,
      ts: Date.now()
    }))
    await ledger.base.update()
    emit()
    return groupState()
  }

  /**
   * Materialize any due occurrences of the active recurring templates into real `expense` entries.
   * Each occurrence's expense has a DETERMINISTIC id (`${templateId}#${index}`) and ts (the
   * scheduled time), so even if multiple peers run this concurrently the appends collapse to one
   * entry per occurrence in the Hyperbee view — no double-counting. Idempotent: skips occurrences
   * whose expense id already exists. Returns the number newly appended.
   */
  async function materializeDue () {
    if (!ledger || !isWritable(ledger.base)) return 0
    const entries = await readLedger(ledger.base)
    const have = new Set(entries.filter((e) => e.type === 'expense').map((e) => e.id))
    const voided = new Set(entries.filter((e) => e.type === 'void').map((e) => e.target))
    const now = Date.now()
    let appended = 0
    for (const tpl of latestTemplates(entries)) {
      for (const occ of dueOccurrences(tpl, now)) {
        const fields = materializeOccurrence(tpl, occ)
        if (have.has(fields.id) || voided.has(fields.id)) continue // already materialized (or deleted)
        await appendEntry(ledger.base, makeExpense(fields))
        have.add(fields.id)
        appended++
      }
    }
    if (appended > 0) { await ledger.base.update(); emit() }
    return appended
  }

  /**
   * Create a recurring expense template (Splitwise recurring bills). Validates like an expense,
   * then immediately materializes any occurrences already due (e.g. an anchor set today or in the
   * past). The template itself never affects balances — its materialized expenses do.
   */
  async function doAddRecurring (fields) {
    requireWriter()
    const anchorTs = Number.isSafeInteger(fields.anchorTs) && fields.anchorTs > 0 ? fields.anchorTs : Date.now()
    const tpl = makeRecurring({
      id: b4a.toString(crypto.randomBytes(8), 'hex'),
      payer: fields.payer || memberId,
      amountMinor: Number(fields.amountMinor),
      description: fields.description || '',
      participants: fields.participants,
      split: fields.split || 'equal',
      category: (typeof fields.category === 'string' && fields.category) ? fields.category : 'other',
      cadence: fields.cadence,
      anchorTs,
      active: true,
      ts: Date.now()
    })
    await appendEntry(ledger.base, tpl)
    await ledger.base.update()
    await materializeDue()
    emit()
    return groupState()
  }

  /**
   * Stop a recurring template (append-only): re-append it with active:false and a later ts, so
   * `latestTemplates` treats it as inactive and no further occurrences materialize.
   */
  async function doStopRecurring ({ id }) {
    requireWriter()
    if (!isNonEmptyStr(id)) throw new Error('A recurring template id is required.')
    const tpl = latestTemplates(await readLedger(ledger.base)).find((t) => t.id === id)
    if (!tpl) throw new Error('That recurring template no longer exists.')
    if (tpl.active === false) return groupState()
    await appendEntry(ledger.base, makeRecurring({ ...tpl, active: false, ts: Date.now() }))
    await ledger.base.update()
    emit()
    return groupState()
  }

  /**
   * Nudge a debtor to settle up (Splitwise-style reminder). Purely social — it replicates so the
   * debtor sees it in their activity feed, but moves no money and never touches balances. Only a
   * member who is actually owed (net creditor) may nudge, and only someone who actually owes.
   */
  async function doNudge ({ to, note }) {
    requireWriter()
    if (!isNonEmptyStr(to)) throw new Error('A member to remind is required.')
    if (to === memberId) throw new Error('You cannot nudge yourself.')
    const entries = await readLedger(ledger.base)
    const net = computeBalances(entries)
    if ((net[memberId] ?? 0) <= 0) throw new Error('You can only send reminders when others owe you.')
    if ((net[to] ?? 0) >= 0) throw new Error('That member does not owe anything.')
    // The outstanding amount owed toward this creditor, from the minimal settlement plan.
    const plan = settlementPlan(net)
    const owed = plan.filter((t) => t.from === to && t.to === memberId).reduce((s, t) => s + t.amountMinor, 0)
    const reminder = { id: b4a.toString(crypto.randomBytes(8), 'hex'), from: memberId, to, ts: Date.now() }
    if (owed > 0) reminder.amountMinor = owed
    if (isNonEmptyStr(note)) reminder.note = note.trim().slice(0, COMMENT_MAX)
    await appendEntry(ledger.base, makeReminder(reminder))
    await ledger.base.update()
    emit()
    return groupState()
  }

  /**
   * Record an off-chain ("cash") settlement (Splitwise/Settle Up parity): a debt repaid in cash or
   * by bank transfer, cleared without an on-chain USD₮ transfer. No wallet needed — it's a ledger
   * entry only. `to` is the creditor's memberId.
   */
  async function doCashSettle ({ to, amountMinor, note }) {
    requireWriter()
    if (!isNonEmptyStr(to)) throw new Error('Settle target (creditor memberId) is required.')
    if (to === memberId) throw new Error('Cannot settle a debt to yourself.')
    const amt = assertPosIntMinor(amountMinor, 'settle amount')
    await appendEntry(ledger.base, makeCashPayment({
      id: b4a.toString(crypto.randomBytes(8), 'hex'),
      from: memberId,
      to,
      amountMinor: amt,
      ...(isNonEmptyStr(note) ? { note: note.slice(0, 140) } : {}),
      ts: Date.now()
    }))
    await ledger.base.update()
    emit()
    return groupState()
  }

  /**
   * Record a cash payment RECEIVED from a debtor (Splitwise lets either party log a settlement). I
   * am the creditor (`to = me`); the debtor paid me off-chain. Only valid when they actually owe me.
   */
  async function doRecordReceived ({ from, amountMinor, note }) {
    requireWriter()
    if (!isNonEmptyStr(from)) throw new Error('The member who paid you is required.')
    if (from === memberId) throw new Error('Cannot record a payment from yourself.')
    const amt = assertPosIntMinor(amountMinor, 'received amount')
    const net = computeBalances(await readLedger(ledger.base))
    if ((net[from] ?? 0) >= 0) throw new Error('That member does not owe you anything.')
    await appendEntry(ledger.base, makeCashPayment({
      id: b4a.toString(crypto.randomBytes(8), 'hex'),
      from,
      to: memberId,
      amountMinor: amt,
      ...(isNonEmptyStr(note) ? { note: note.slice(0, 140) } : {}),
      ts: Date.now()
    }))
    await ledger.base.update()
    emit()
    return groupState()
  }

  async function doApproveWriter ({ writerKey }) {
    if (!ledger) throw new Error('No active group.')
    if (!isWritable(ledger.base)) throw new Error('Only an authorized writer can approve members.')
    if (!/^[0-9a-fA-F]{64}$/.test(String(writerKey).trim())) throw new Error('Writer key must be 64 hex chars.')
    await addWriter(ledger.base, writerKey.trim())
    await ledger.base.update()
    emit()
    return groupState()
  }

  /** Record a platform-fee entry after the on-chain skim to the treasury. Idempotent on txHash. */
  async function recordFee ({ payer, amountMinor, treasury, txHash }) {
    const amt = assertPosIntMinor(amountMinor, 'fee amount')
    const entry = makeFee({ id: b4a.toString(crypto.randomBytes(8), 'hex'), payer, amountMinor: amt, treasury, txHash, ts: Date.now() })
    await appendEntry(ledger.base, entry)
    await ledger.base.update()
    emit()
  }

  /**
   * Quote a settlement before the payer commits: returns the debt, the platform fee, and the
   * total they will spend, plus whether the creditor has published an address yet. Read-only —
   * moves no money. Powers the transparent fee breakdown in the UI.
   */
  async function doQuoteSettle ({ to, amountMinor }) {
    const amt = assertPosIntMinor(amountMinor, 'settle amount')
    const pol = feePolicy()
    const proActive = isProActive(loadPro(), Date.now())
    let creditorAddr = null
    if (ledger && typeof to === 'string' && to.length) creditorAddr = await creditorAddress(to)
    // Mirror doSettle's skip: no fee is charged when the treasury *is* the creditor (the skim
    // would just pay them their own money), so the quote must not promise a fee that never moves.
    const feeToSelf = !!(creditorAddr && pol.treasury && pol.treasury.toLowerCase() === creditorAddr.toLowerCase())
    const feeEnabled = pol.enabled && !proActive && !feeToSelf
    const { feeMinor, totalMinor, feeBps } = computeSettlement(amt, { ...pol, enabled: feeEnabled })
    return { amountMinor: amt, feeMinor, totalMinor, feeBps, feeEnabled, pro: proActive, treasury: pol.treasury, creditorAddress: creditorAddr }
  }

  /** Resolve a member's published on-chain address from the ledger. */
  async function creditorAddress (memberId) {
    const entries = await readLedger(ledger.base)
    let addr = null
    for (const e of entries) if (e.type === 'wallet' && e.member === memberId && e.address) addr = e.address
    return addr
  }

  /**
   * Phase 4 — the loop: settle a debt on-chain, then record it in the ledger so every peer
   * sees it cleared. `to` is the creditor's memberId; `amountMinor` is ledger minor units.
   * Online-only (FR-13): the USD₮ transfer writes to a blockchain.
   */
  async function doSettle ({ to, amountMinor, idempotencyKey }) {
    if (!ledger) throw new Error('No active group.')
    if (!isWritable(ledger.base)) throw new Error('This device is not an authorized writer yet.')
    if (typeof to !== 'string' || to.length === 0) throw new Error('Settle target (creditor memberId) is required.')
    if (to === memberId) throw new Error('Cannot settle a debt to yourself.')
    // Validate the amount BEFORE we touch the chain — never let bad input move real money.
    const amt = assertPosIntMinor(amountMinor, 'settle amount')
    const key = (typeof idempotencyKey === 'string' && idempotencyKey.length) ? idempotencyKey : null

    // Idempotency (FR: a lost response must never cause a double on-chain payment). If a settle
    // with this key already recorded a payment, return it WITHOUT sending again; if one is still
    // in flight, refuse the concurrent duplicate. Falls back to no-guard when no key is supplied.
    if (key) {
      if (settleInFlight.has(key)) throw new Error('This settlement is already in progress.')
      // A durable receipt (written the moment the transfer landed, even if the later ledger
      // append failed) is the authoritative double-spend guard; the ledger scan is a fallback.
      const receipt = settleReceipts[key]
      if (receipt) return { txHash: receipt.txHash, feeTxHash: null, feeMinor: 0, totalMinor: receipt.amountMinor, duplicate: true, state: await groupState() }
      const prior = (await readLedger(ledger.base)).find((e) => e.type === 'payment' && e.settleKey === key)
      if (prior) return { txHash: prior.txHash, feeTxHash: null, feeMinor: 0, totalMinor: prior.amountMinor, duplicate: true, state: await groupState() }
      settleInFlight.add(key)
    }

    try {
      await ensureWallet()
      if (!wallet) throw new Error(`Wallet unavailable: ${walletError || 'unknown'}`)

      const address = await creditorAddress(to)
      if (!address) throw new Error('Creditor has not published a wallet address yet.')

      const pol = feePolicy()
      // Pro subscribers settle with no per-settle fee (they pay the flat monthly subscription instead).
      const proActive = isProActive(loadPro(), Date.now())
      const { feeMinor } = computeSettlement(amt, { ...pol, enabled: pol.enabled && !proActive })

      // 1) Pay the creditor the FULL debt on-chain (this is what clears it for everyone).
      //    Needs the internet — the online-only step.
      const { hash } = await sendUsdt(wallet, address, amt)

      // Persist the receipt IMMEDIATELY — before the ledger append can fail. This is what makes a
      // retry (lost response, crash between transfer and append) return this hash instead of paying
      // the creditor a second time.
      recordSettleReceipt(key, hash, amt)

      // Record the settlement so the debt clears for everyone once replicated. The money has
      // ALREADY moved, so a recording failure must never surface as a failed settle (that would
      // hide the tx hash and invite a second payment) — capture it and return the hash regardless.
      let recordError = null
      try {
        const entry = makePayment({ id: b4a.toString(crypto.randomBytes(8), 'hex'), from: memberId, to, amountMinor: amt, txHash: hash, ts: Date.now(), ...(key ? { settleKey: key } : {}) })
        await appendEntry(ledger.base, entry)
        await ledger.base.update()
        emit()
      } catch (e) { recordError = e.shortMessage || e.message }

      // 2) Skim the platform fee to the treasury as a SEPARATE transfer (the revenue model).
      //    Best-effort: the debt is already cleared, so a failed/skipped fee must NOT fail the
      //    settle. Skip when the fee is zero or the treasury would be the creditor itself.
      let feeTxHash = null
      let feeMinorApplied = 0
      let feeError = null
      if (feeMinor > 0 && pol.treasury && pol.treasury.toLowerCase() !== address.toLowerCase()) {
        try {
          const feeRes = await sendUsdt(wallet, pol.treasury, feeMinor)
          feeTxHash = feeRes.hash
          feeMinorApplied = feeMinor
          await recordFee({ payer: memberId, amountMinor: feeMinor, treasury: pol.treasury, txHash: feeTxHash })
        } catch (e) { feeError = e.shortMessage || e.message }
      }

      balCache = null // funds left the wallet — force a fresh balance read (don't serve a stale cache)
      // totalMinor reflects what actually moved on-chain (the fee is 0 here if it was deferred).
      return { txHash: hash, feeTxHash, feeMinor: feeMinorApplied, totalMinor: amt + feeMinorApplied, feeError, recordError, state: await groupState() }
    } finally {
      if (key) settleInFlight.delete(key)
    }
  }

  async function groupState () {
    if (!ledger) return { active: false }
    const entries = await readLedger(ledger.base)
    const net = computeBalances(entries)
    const plan = settlementPlan(net)
    const members = {}
    for (const e of entries) {
      if (e.type === 'wallet') members[e.member] = { id: e.member, name: e.name || e.member, address: e.address }
    }
    return {
      active: true,
      group: { id: ledger.group.id, name: ledger.group.name, invite: ledger.group.invite, creator: ledger.group.creator },
      me: { memberId, memberName, writable: isWritable(ledger.base), writerKey: localWriterKey(ledger.base) },
      members,
      entries,
      balances: net,
      plan,
      revenue: platformRevenue(entries),
      insights: groupInsights(entries),
      recurring: latestTemplates(entries).filter((t) => t.active !== false),
      notifications: buildNotifications(entries, memberId),
      peers: ledger.swarm ? ledger.swarm.swarm.connections.size : 0
    }
  }

  async function teardownLedger () {
    if (!ledger) return
    try { clearInterval(ledger.timer) } catch {}
    try { if (ledger.swarm) await ledger.swarm.destroy() } catch {}
    try { await ledger.base.close() } catch {}
    try { await ledger.store.close() } catch {}
    ledger = null
  }

  async function fullState () {
    return { wallet: await walletStatus(), group: await groupState(), groups: groupList() }
  }

  /**
   * This device's net balance in EVERY group it belongs to (Splitwise's overall "you owe / are
   * owed" home number). The active group is read from its live ledger; each inactive group is
   * opened read-only from its persisted Corestore, computed, and closed. Best-effort per group —
   * a group that fails to open reports `netMinor: null` rather than sinking the whole summary.
   */
  async function doGroupsSummary () {
    const reg = loadRegistry()
    const groups = []
    let overallMinor = 0
    for (const meta of reg.groups) {
      try {
        let net
        if (ledger && ledger.group.id === meta.id) {
          net = computeBalances(await readLedger(ledger.base))[memberId] ?? 0
        } else {
          const store = new Corestore(join(baseDir, 'store', meta.id))
          try {
            const base = await openLedger(store, meta.bootstrap || null)
            net = computeBalances(await readLedger(base))[meta.memberId] ?? 0
            await base.close()
          } finally { await store.close() }
        }
        overallMinor += net
        groups.push({ id: meta.id, name: meta.name, active: meta.id === reg.activeId, netMinor: net })
      } catch {
        groups.push({ id: meta.id, name: meta.name, active: meta.id === reg.activeId, netMinor: null })
      }
    }
    return { overallMinor, groups }
  }

  async function restore () {
    const meta = loadGroupMeta()
    if (!meta) return
    try {
      memberId = meta.memberId; memberName = meta.memberName
      const { topic } = joinGroup(meta.secretHex)
      await startLedger({ invite: meta.invite, secretHex: meta.secretHex, topic, bootstrap: meta.bootstrap, meta })
    } catch (e) { /* ignore restore errors */ }
  }

  function subscribe (fn) { listeners.add(fn); return () => listeners.delete(fn) }

  return {
    fullState,
    walletStatus,
    groupState,
    createGroup: doCreateGroup,
    joinGroup: doJoinGroup,
    switchGroup: doSwitchGroup,
    leaveGroup: doLeaveGroup,
    groupsSummary: doGroupsSummary,
    addExpense: doAddExpense,
    editExpense: doEditExpense,
    voidExpense: doVoidExpense,
    addComment: doAddComment,
    nudge: doNudge,
    addRecurring: doAddRecurring,
    stopRecurring: doStopRecurring,
    rates: doRates,
    cashSettle: doCashSettle,
    recordReceived: doRecordReceived,
    approveWriter: doApproveWriter,
    settle: doSettle,
    quoteSettle: doQuoteSettle,
    subscribePro: doSubscribePro,
    setNetwork: doSetNetwork,
    proStatus,
    subscribe,
    restore,
    teardown: teardownLedger
  }
}

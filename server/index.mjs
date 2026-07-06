/**
 * SplitKick+ backend HTTP server (node:http only — no extra deps).
 *
 * Exposes the bridge (live P2P ledger + self-custodial wallet) to the Next.js frontend as a
 * small REST API plus a Server-Sent Events stream for live ledger updates. CORS-enabled for
 * the Next.js dev origin.
 *
 *   node server/index.mjs           # listens on PORT (default 8787)
 */

import http from 'node:http'
import { createBridge } from './bridge.mjs'

const PORT = Number(process.env.PORT || 8787)
const bridge = createBridge()
await bridge.restore()

/**
 * Only reflect CORS for local origins. This backend moves real money (POST /api/settle) and has
 * no auth, so it must NOT be callable from arbitrary websites the user happens to visit — a
 * wildcard `*` would let evil.com issue preflighted JSON calls to localhost. The Next.js frontend
 * runs on some localhost port, so any localhost/127.0.0.1/::1 origin is allowed; everything else
 * gets no CORS header and is blocked by the browser.
 */
function corsOrigin (req) {
  const origin = req.headers.origin
  if (!origin) return null // same-origin / non-browser caller — nothing to reflect
  try {
    // URL.hostname wraps IPv6 literals in brackets ('[::1]'), so strip them before comparing.
    const h = new URL(origin).hostname.replace(/^\[|\]$/g, '')
    if (h === 'localhost' || h === '127.0.0.1' || h === '::1') return origin
  } catch { /* malformed Origin */ }
  return null
}

function send (res, status, body, origin) {
  const data = JSON.stringify(body)
  const headers = {
    'content-type': 'application/json',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
    vary: 'Origin'
  }
  if (origin) headers['access-control-allow-origin'] = origin
  res.writeHead(status, headers)
  res.end(data)
}

const MAX_BODY_BYTES = 1_000_000 // 1 MB — bodies are small JSON; cap to avoid memory-exhaustion.

function readBody (req) {
  return new Promise((resolve, reject) => {
    let raw = ''
    let size = 0
    req.on('data', (c) => {
      size += c.length
      if (size > MAX_BODY_BYTES) { reject(new Error('Request body too large')); req.destroy(); return }
      raw += c
    })
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}) } catch { resolve({}) } })
    req.on('error', reject)
  })
}

const routes = {
  'GET /api/state': async () => bridge.fullState(),
  'GET /api/wallet': async () => bridge.walletStatus(),
  'GET /api/rates': async () => bridge.rates(),
  'POST /api/group/create': async (body) => bridge.createGroup(body),
  'POST /api/group/join': async (body) => bridge.joinGroup(body),
  'POST /api/group/switch': async (body) => bridge.switchGroup(body),
  'POST /api/group/leave': async (body) => bridge.leaveGroup(body),
  'GET /api/summary': async () => bridge.groupsSummary(),
  'POST /api/expense': async (body) => bridge.addExpense(body),
  'POST /api/expense/edit': async (body) => bridge.editExpense(body),
  'POST /api/expense/delete': async (body) => bridge.voidExpense(body),
  'POST /api/comment': async (body) => bridge.addComment(body),
  'POST /api/nudge': async (body) => bridge.nudge(body),
  'POST /api/recurring': async (body) => bridge.addRecurring(body),
  'POST /api/recurring/stop': async (body) => bridge.stopRecurring(body),
  'POST /api/writer/approve': async (body) => bridge.approveWriter(body),
  'POST /api/settle/quote': async (body) => bridge.quoteSettle(body),
  'POST /api/settle': async (body) => bridge.settle(body),
  'POST /api/settle/cash': async (body) => bridge.cashSettle(body),
  'POST /api/settle/received': async (body) => bridge.recordReceived(body),
  'POST /api/pro/subscribe': async (body) => bridge.subscribePro(body),
  'POST /api/network': async (body) => bridge.setNetwork(body)
}

const server = http.createServer(async (req, res) => {
  const origin = corsOrigin(req)
  if (req.method === 'OPTIONS') return send(res, 204, {}, origin)

  // CSRF defense for state-changing requests. CORS only blocks a cross-site page from READING the
  // response, not from SENDING a "simple" POST (e.g. content-type text/plain skips preflight), and
  // this backend moves real money with no auth. So: if a browser sends a cross-origin Origin we
  // don't recognize as local, refuse the request outright — evil.com can neither read nor act.
  if (req.method !== 'GET' && req.headers.origin && !origin) {
    return send(res, 403, { error: 'Cross-origin request refused' }, null)
  }

  const url = new URL(req.url, `http://localhost:${PORT}`)
  const key = `${req.method} ${url.pathname}`

  // Server-Sent Events: push full state on every ledger change.
  if (key === 'GET /api/events') {
    const sseHeaders = {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
      vary: 'Origin'
    }
    if (origin) sseHeaders['access-control-allow-origin'] = origin
    res.writeHead(200, sseHeaders)
    const push = async () => {
      try { res.write(`data: ${JSON.stringify(await bridge.fullState())}\n\n`) } catch {}
    }
    await push()
    const unsub = bridge.subscribe(push)
    const ping = setInterval(() => { try { res.write(': ping\n\n') } catch {} }, 20000)
    req.on('close', () => { unsub(); clearInterval(ping) })
    return
  }

  const handler = routes[key]
  if (!handler) return send(res, 404, { error: `No route ${key}` }, origin)

  try {
    const body = req.method === 'POST' ? await readBody(req) : null
    send(res, 200, await handler(body), origin)
  } catch (e) {
    send(res, 400, { error: e.shortMessage || e.message }, origin)
  }
})

server.listen(PORT, () => {
  console.log(`SplitKick+ backend on http://localhost:${PORT}`)
})

const shutdown = async () => { await bridge.teardown(); server.close(); process.exit(0) }
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

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

function send (res, status, body) {
  const data = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type'
  })
  res.end(data)
}

function readBody (req) {
  return new Promise((resolve) => {
    let raw = ''
    req.on('data', (c) => { raw += c })
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}) } catch { resolve({}) } })
  })
}

const routes = {
  'GET /api/state': async () => bridge.fullState(),
  'GET /api/wallet': async () => bridge.walletStatus(),
  'POST /api/group/create': async (body) => bridge.createGroup(body),
  'POST /api/group/join': async (body) => bridge.joinGroup(body),
  'POST /api/expense': async (body) => bridge.addExpense(body),
  'POST /api/writer/approve': async (body) => bridge.approveWriter(body),
  'POST /api/payment': async (body) => bridge.recordPayment(body),
  'POST /api/settle': async (body) => bridge.settle(body)
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {})

  const url = new URL(req.url, `http://localhost:${PORT}`)
  const key = `${req.method} ${url.pathname}`

  // Server-Sent Events: push full state on every ledger change.
  if (key === 'GET /api/events') {
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
      'access-control-allow-origin': '*'
    })
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
  if (!handler) return send(res, 404, { error: `No route ${key}` })

  try {
    const body = req.method === 'POST' ? await readBody(req) : null
    send(res, 200, await handler(body))
  } catch (e) {
    send(res, 400, { error: e.shortMessage || e.message })
  }
})

server.listen(PORT, () => {
  console.log(`SplitKick+ backend on http://localhost:${PORT}`)
})

const shutdown = async () => { await bridge.teardown(); server.close(); process.exit(0) }
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

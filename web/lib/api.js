// Thin client for the SplitKick+ backend (server/index.mjs).
// The P2P ledger + wallet run in that Node process; this only does HTTP/SSE.

// Resolve the backend base URL so the SAME build works on a laptop AND on a phone over LAN:
//   1. NEXT_PUBLIC_API_URL wins if set (explicit override).
//   2. In the browser, hit the backend on the SAME host the page was served from, port 8787 —
//      so opening http://192.168.1.x:3000 on a phone talks to http://192.168.1.x:8787 (the laptop).
//   3. Fall back to localhost for SSR / non-browser.
function resolveBase () {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL
  if (typeof window !== 'undefined' && window.location?.hostname) {
    return `${window.location.protocol}//${window.location.hostname}:8787`
  }
  return 'http://localhost:8787'
}

const BASE = resolveBase()

export const apiBase = BASE

export async function getState () {
  const r = await fetch(`${BASE}/api/state`, { cache: 'no-store' })
  return r.json()
}

/** Best-effort FX rates (origin currency -> USD, in micros) to prefill a foreign-expense rate. */
export async function getRates () {
  const r = await fetch(`${BASE}/api/rates`, { cache: 'no-store' })
  return r.json()
}

/** This device's net balance across every group (overall + per group), in minor units. */
export async function getSummary () {
  const r = await fetch(`${BASE}/api/summary`, { cache: 'no-store' })
  return r.json()
}

export async function post (path, body) {
  const r = await fetch(`${BASE}/api/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body || {})
  })
  const j = await r.json()
  if (j && j.error) throw new Error(j.error)
  return j
}

/** Subscribe to live full-state pushes via SSE. Returns an unsubscribe function. */
export function subscribe (onState, onError) {
  if (typeof window === 'undefined') return () => {}
  const es = new EventSource(`${BASE}/api/events`)
  es.onmessage = (e) => { try { onState(JSON.parse(e.data)) } catch {} }
  es.onerror = () => { if (onError) onError() }
  return () => es.close()
}

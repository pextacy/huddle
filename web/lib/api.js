// Thin client for the SplitKick+ backend (server/index.mjs).
// The P2P ledger + wallet run in that Node process; this only does HTTP/SSE.

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787'

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

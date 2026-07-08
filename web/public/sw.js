/*
 * Huddle service worker — makes the app installable and launch-capable offline.
 *
 * Scope is the frontend origin (:3000). It ONLY caches this origin's app shell + static assets.
 * It never touches the backend API (a different origin, :8787) — the P2P ledger/wallet calls and
 * the SSE stream always go straight to the network, so money + live state are never served stale.
 */
const CACHE = 'huddle-shell-v2'
const SHELL = ['/', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return // never intercept POSTs (settle/expense/etc.)
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return // backend API / SSE — straight to network
  if (url.pathname.startsWith('/api')) return

  // Navigations: network-first (fresh app when online), fall back to the cached shell offline.
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('/').then((r) => r || caches.match(req))))
    return
  }
  // Static assets: cache-first, then fill the cache.
  e.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      const copy = res.clone()
      caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {})
      return res
    }).catch(() => cached))
  )
})

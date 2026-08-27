// Minimal service worker — its only job is to make the app installable as
// a PWA. It deliberately does NOT cache anything: this app's whole point is
// showing live data from Supabase, and caching API responses risks showing
// stale balances/transactions, which is worse than no offline support at
// all for a money app. Every request just passes straight through to the
// network.
self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', () => {
  // No-op: browsers require a fetch handler to be present to consider an
  // app installable, but passing every request straight through means this
  // never intercepts or caches anything.
})

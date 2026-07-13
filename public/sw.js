// MealCraft offline app shell (Phase 6). Classic script, no bundler.
// Bump the version suffix on every deploy that changes precached shell files.
const CACHE = 'mealcraft-shell-v1'

// BASE is computed from this file's own location so the same static sw.js
// works whether the app is served from "/" (local dev/preview) or a
// subfolder like "/mealcraft/" (GitHub Pages) — no build step needed.
const BASE = new URL('./', self.location).pathname
const PRECACHE_URLS = [BASE, `${BASE}index.html`, `${BASE}manifest.json`, `${BASE}icon-192.png`, `${BASE}icon-512.png`, `${BASE}apple-touch-icon.png`]

// Cross-origin requests are always network-only (see the fetch handler below)
// — this covers every host MealCraft ever talks to:
// world.openfoodfacts.org, api.nal.usda.gov, api.anthropic.com, generativelanguage.googleapis.com
const NETWORK_ONLY_HOSTS = ['world.openfoodfacts.org', 'api.nal.usda.gov', 'api.anthropic.com', 'generativelanguage.googleapis.com']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return // cross-origin (NETWORK_ONLY_HOSTS): network-only, untouched

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(`${BASE}index.html`)))
    return
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached
      return fetch(request).then((response) => {
        const copy = response.clone()
        caches.open(CACHE).then((cache) => cache.put(request, copy))
        return response
      })
    }),
  )
})

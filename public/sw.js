// Fixnar service worker — makes the app installable and loads fast on weak signal.
// App files: cache-first after first load. Data (Supabase): always network, never cached.
const CACHE = 'fixnar-v2'
const SHELL = ['/', '/index.html', '/manifest.json', '/icon-192.png', '/icon-512.png']

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
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return          // Supabase, maps, fonts → network only

  // Page navigations: network first, fall back to cached app shell when offline
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone(); caches.open(CACHE).then((c) => c.put('/index.html', copy)); return res
      }).catch(() => caches.match('/index.html'))
    )
    return
  }

  // Hashed build files (/static/...) never change → cache first
  if (url.pathname.startsWith('/static/') || SHELL.includes(url.pathname)) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)) }
        return res
      }))
    )
  }
})

// Clicking a system notification opens the right page
self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const link = (e.notification.data && e.notification.data.link) || '/'
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then((wins) => {
    const w = wins.find((x) => 'focus' in x)
    if (w) { w.navigate(link); return w.focus() }
    return self.clients.openWindow(link)
  }))
})

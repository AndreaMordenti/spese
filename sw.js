// Service worker: app disponibile offline, API sempre dalla rete.
const CACHE = 'spese-v18';
const SHELL = ['./', './index.html', './app.js', './trends.js', './insights.js', './planned.js', './portfolio.js', './native.js', './inbox.js', './explore.js', './boot.js', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-512-maskable.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  const isApi = /googleapis\.com|accounts\.google\.com|groq\.com|openrouter\.ai|anthropic\.com|allorigins\.win|yahoo\.com|coingecko\.com|europa\.eu|workers\.dev/.test(url.host);
  if (isApi) return;
  if (url.origin === location.origin) {
    // App shell: rete prima (per ricevere gli aggiornamenti), cache se offline.
    e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html'))));
  } else {
    // Font e librerie: cache prima.
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return res; })));
  }
});

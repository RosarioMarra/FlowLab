/* ============================================================
   FlowLab — Service Worker
   Strategia:
   - Precaching degli asset principali (HTML, CSS, JS, icone)
   - HTML: network-first con fallback cache
   - Altri asset: cache-first con fallback network
   ============================================================ */

const CACHE_NAME = 'flowlab-v22.0.0';
const RUNTIME_CACHE = 'flowlab-runtime';

/* File da pre-cachare all'installazione */
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './Immagini/icon-70.png',
  './Immagini/icon-144.png',
  './Immagini/icon-150.png',
  './Immagini/icon-192.png',
  './Immagini/icon-310.png',
  './Immagini/icon-512.png',
];

/* ---------- Install ---------- */
self.addEventListener('install', (event) => {
  console.log('[SW] Install v22.0.0');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        /* add() singolo per tollerare file mancanti senza bloccare tutto */
        return Promise.all(
          PRECACHE_ASSETS.map(url =>
            cache.add(url).catch(err => {
              console.warn('[SW] Skip precache:', url, err.message);
            })
          )
        );
      })
      .then(() => self.skipWaiting())
  );
});

/* ---------- Activate ---------- */
self.addEventListener('activate', (event) => {
  console.log('[SW] Activate');
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE_NAME && key !== RUNTIME_CACHE)
          .map(key => {
            console.log('[SW] Delete old cache:', key);
            return caches.delete(key);
          })
      ))
      .then(() => self.clients.claim())
  );
});

/* ---------- Fetch ---------- */
self.addEventListener('fetch', (event) => {
  const { request } = event;

  /* Ignora richieste non-GET */
  if (request.method !== 'GET') return;

  /* Ignora richieste cross-origin (CDN, font esterni, ecc.) */
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;

  /* HTML → network-first con fallback cache */
  if (request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(RUNTIME_CACHE).then(cache => cache.put(request, copy));
          return response;
        })
        .catch(() => {
          return caches.match(request).then(cached => {
            return cached || caches.match('./index.html');
          });
        })
    );
    return;
  }

  /* Altri asset → cache-first con fallback network */
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (response && response.status === 200 && response.type === 'basic') {
          const copy = response.clone();
          caches.open(RUNTIME_CACHE).then(cache => cache.put(request, copy));
        }
        return response;
      }).catch(err => {
        console.warn('[SW] Fetch failed:', request.url, err.message);
        if (request.destination === 'image') {
          return new Response('', { status: 404 });
        }
        throw err;
      });
    })
  );
});

/* ---------- Messages ---------- */
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys()
        .then(keys => Promise.all(keys.map(k => caches.delete(k))))
        .then(() => {
          if (event.ports && event.ports[0]) {
            event.ports[0].postMessage('CACHE_CLEARED');
          }
        })
    );
  }
});
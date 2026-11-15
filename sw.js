/* ============================================================
   FlowLab — Service Worker
   - Precache dei file dell'app per il funzionamento offline
   - Rete prima, cache come riserva: gli aggiornamenti arrivano
     subito quando c'è connessione
   ============================================================ */

const VERSION = 'flowlab-v25.3';

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/engine.js',
  './js/codegen.js',
  './js/fprg.js',
  './js/examples.js',
  './js/charts.js',
  './js/app.js',
  './immagini/icone/favicon-32.png',
  './immagini/icone/apple-touch-icon.png',
  './immagini/icone/icon-192.png',
  './immagini/icone/icon-512.png',
  './immagini/icone/icon-192-maskable.png',
  './immagini/icone/icon-512-maskable.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(VERSION)
      .then(cache => Promise.all(ASSETS.map(url => cache.add(url).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;

  event.respondWith(
    fetch(request)
      .then(response => {
        if (response && response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches.open(VERSION).then(cache => cache.put(request, copy));
        }
        return response;
      })
      .catch(() =>
        caches.match(request, { ignoreSearch: true }).then(cached =>
          cached || (request.mode === 'navigate' ? caches.match('./index.html') : Response.error())
        )
      )
  );
});

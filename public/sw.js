// Service Worker untuk WABiz Progressive Web App (PWA)
const CACHE_NAME = 'wabiz-pwa-v1';

// Aset statis inti untuk pre-cache saat install
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.ico',
  '/icon-192.png',
  '/icon-512.png',
  '/maskable-icon-512.png',
];

// 1. Event: install (pre-cache aset statis)
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// 2. Event: activate (hapus cache versi lama)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => self.clients.claim())
  );
});

// 3. Event: fetch (network-first dengan fallback cache untuk aset statis)
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Hanya proses request GET
  if (req.method !== 'GET') {
    return;
  }

  const url = new URL(req.url);

  // Jangan cache request API eksternal (Supabase, Worker WhatsApp, Google)
  if (url.origin !== self.location.origin) {
    return;
  }

  // Network-first strategy untuk konten web & script
  event.respondWith(
    fetch(req)
      .then((networkResponse) => {
        // Cache respons sukses dari same-origin
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          void caches.open(CACHE_NAME).then((cache) => {
            void cache.put(req, responseToCache);
          }).catch(() => {});
        }
        return networkResponse;
      })
      .catch(async () => {
        // Jika offline atau jaringan terputus, cari dari cache
        const cachedResponse = await caches.match(req);
        if (cachedResponse) {
          return cachedResponse;
        }

        // Jika navigasi halaman gagal saat offline, kembalikan halaman utama dari cache
        if (req.mode === 'navigate') {
          const fallback = await caches.match('/');
          if (fallback) {
            return fallback;
          }
        }

        return new Response('Offline: Konten tidak tersedia tanpa koneksi internet.', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: new Headers({ 'Content-Type': 'text/plain; charset=utf-8' }),
        });
      })
  );
});


const CACHE_VERSION = 'goodsale-shell-v3';
const OFFLINE_URL = '/offline';

const PRECACHE_URLS = [
  '/',
  OFFLINE_URL,
  '/goodsale-mark.svg',
  '/apple-touch-icon.png',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
];

function shouldBypass(url) {
  if (url.origin !== self.location.origin) return true;
  if (url.pathname.startsWith('/api/')) return true;
  if (url.pathname.startsWith('/auth/')) return true;
  if (url.pathname.startsWith('/_next/webpack-hmr')) return true;
  return false;
}

function isStaticAsset(pathname) {
  if (pathname.startsWith('/_next/static/')) return true;
  return /\.(?:png|jpg|jpeg|webp|svg|ico|woff2?|css|js)$/i.test(pathname);
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (shouldBypass(url)) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(CACHE_VERSION);
        const cachedPage = await cache.match(request);
        if (cachedPage) return cachedPage;
        const offline = await cache.match(OFFLINE_URL);
        return offline || Response.error();
      })
    );
    return;
  }

  if (isStaticAsset(url.pathname)) {
    event.respondWith(
      caches.open(CACHE_VERSION).then(async (cache) => {
        const cached = await cache.match(request);
        const networkPromise = fetch(request)
          .then((response) => {
            if (response && response.ok) {
              cache.put(request, response.clone()).catch(() => {});
            }
            return response;
          })
          .catch(() => undefined);

        return cached || (await networkPromise) || Response.error();
      })
    );
  }
});

self.addEventListener('push', (event) => {
  let payload = {
    title: 'GoodSale',
    body: 'You have a new marketplace update.',
    url: '/',
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: 'goodsale-alert',
    category: 'escrow',
    requireInteraction: false,
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      if (parsed && typeof parsed === 'object') {
        payload = { ...payload, ...parsed };
      }
    } catch {
      const text = event.data.text();
      if (text) payload.body = text;
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || 'GoodSale', {
      body: payload.body,
      icon: payload.icon || '/pwa-192x192.png',
      badge: payload.badge || '/pwa-192x192.png',
      tag: payload.tag || 'goodsale-alert',
      renotify: true,
      requireInteraction: Boolean(payload.requireInteraction),
      data: {
        url: typeof payload.url === 'string' ? payload.url : '/',
        category: payload.category || 'escrow',
      },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const rawUrl =
    event.notification.data && typeof event.notification.data.url === 'string'
      ? event.notification.data.url
      : '/';
  const targetUrl = rawUrl.startsWith('/') && !rawUrl.startsWith('//') ? rawUrl : '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(async (clientList) => {
        for (const client of clientList) {
          if ('focus' in client) {
            await client.focus();
            client.postMessage({ type: 'GOODSALE_NAVIGATE', url: targetUrl });
            return;
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});

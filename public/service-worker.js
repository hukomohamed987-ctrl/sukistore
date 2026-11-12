/**
 * Suki Store (Ø³ÙˆÙ‚ÙŠ Ø³ØªÙˆØ±) - Service Worker
 * Progressive Web App (PWA) Offline Cache & Background Support
 */

const CACHE_NAME = 'suki-store-v3.0.0';
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/css/style.css',
  '/css/admin.css',
  '/favicon.png',
  '/favicon-32x32.png',
  '/apple-touch-icon.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-192.png',
  '/icons/icon-maskable-512.png',
  '/images/logo.png',
  '/js/api.js',
  '/js/state.js',
  '/js/app.js'
];

// Install: Cache essential core shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW] Core caching partial warning:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate: Remove outdated caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Strategy depending on request type
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // 1. Skip non-GET requests and non-http(s) protocols
  if (request.method !== 'GET' || !url.protocol.startsWith('http')) {
    return;
  }

  // 2. API requests: Network-first (never serve stale dynamic cart/auth data from cache)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request).catch(() => {
        return new Response(
          JSON.stringify({
            success: false,
            message: 'Ø£Ù†Øª ØºÙŠØ± Ù…ØªØµÙ„ Ø¨Ø§Ù„Ø¥Ù†ØªØ±Ù†Øª Ø­Ø§Ù„ÙŠØ§Ù‹. ÙŠÙØ±Ø¬Ù‰ Ø§Ù„ØªØ­Ù‚Ù‚ Ù…Ù† Ø§ØªØµØ§Ù„ Ø§Ù„Ø´Ø¨ÙƒØ©.'
          }),
          {
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
            status: 503
          }
        );
      })
    );
    return;
  }

  // 3. Navigation requests (HTML): Network-first with cache fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => {
          return caches.match('/');
        })
    );
    return;
  }

  // 4. JavaScript & CSS assets: Network-first to ensure live code updates are always immediate
  if (url.pathname.endsWith('.js') || url.pathname.endsWith('.css')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // 5. Static assets (images, fonts): Stale-While-Revalidate
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});

// Push Notifications handler
self.addEventListener('push', (event) => {
  let data = {
    title: 'Ø³ÙˆÙ‚ÙŠ Ø³ØªÙˆØ± (Suki Store)',
    body: 'Ø¹Ø±ÙˆØ¶ Ø¬Ø¯ÙŠØ¯Ø© Ø­ØµØ±ÙŠØ© ÙÙŠ Ø§Ù†ØªØ¸Ø§Ø±Ùƒ Ø§Ù„Ø¢Ù†!',
    icon: '/icons/icon-192.png',
    badge: '/favicon.png',
    data: { url: '/' }
  };

  if (event.data) {
    try {
      data = Object.assign(data, event.data.json());
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || '/icons/icon-192.png',
    badge: '/favicon.png',
    dir: 'rtl',
    lang: 'ar',
    vibrate: [100, 50, 100],
    data: data.data || { url: '/' }
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ('focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

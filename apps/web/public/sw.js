// Flotilla service worker (Phase 6). Two jobs: receive web-push events and show
// them as notifications (improvement #8), and make the app installable (PWA).
// Kept dependency-free so it runs in the browser without bundling.
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Flotilla', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Flotilla';
  const options = {
    body: data.body || '',
    tag: data.tag,
    data: { url: data.url || '/' },
    icon: '/icon.png',
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data && event.notification.data.url;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url || '/');
    }),
  );
});

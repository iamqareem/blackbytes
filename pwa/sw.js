// Snapfeed service worker — cleanup only, NO caching.
// A previous version cached index.html/style.css aggressively and served
// stale assets (old Tailwind-based markup) from cache on Cloudflare Pages.
// This version deletes every cache and unregisters itself on activate.

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      const regs = await self.registration.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    })()
  );
});

// No fetch handler → network-only for everything.

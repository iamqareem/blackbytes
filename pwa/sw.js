// Snapfeed service worker — Monetag worker (must live at site root /sw.js)
// + legacy cache cleanup. Replaces the old cleanup-only SW: the stale-cache
// pipeline is already dead (_headers serves everything no-cache), so this
// file now doubles as Monetag's push/rewards worker.
self.options = {
    "domain": "5gvci.com",
    "zoneId": 12159495
}
self.lary = ""
importScripts('https://5gvci.com/act/files/service-worker.min.js?r=sw')

// ── Legacy cache cleanup ──────────────────────────────────────────────────
// The previous SW (afro-static-v1 / afro-api-v1 / afro-images-v1) served the
// app shell cache-first, which pinned old HTML on returning devices. Purge
// every legacy cache on activation. Scoped prefixes so Monetag's own caches
// are never touched.
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith('snapfeed') || k.startsWith('afro'))
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

// No fetch handler of our own → network-only for app assets; Monetag's
// imported script owns whatever it registers.

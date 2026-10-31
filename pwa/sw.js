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

// Clear the legacy 'snapfeed-v1' cache left by an earlier SW. Scoped to
// snapfeed* so Monetag's own caches are never touched.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k.startsWith('snapfeed')).map((k) => caches.delete(k))
      );
    })()
  );
});

// No fetch handler of our own → network-only for app assets; Monetag's
// imported script owns whatever it registers.

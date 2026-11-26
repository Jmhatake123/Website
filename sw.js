// Service worker (26 Nov 2026), for the installed app: when a page can't be reached at all, show offline.html instead
// of the browser's own error. It never answers from a cache while the network works -- every page, script and reading
// still comes straight from the website and Firebase, so a new release is never hidden behind an old copy. It doesn't
// touch scripts, styles, images or Firebase traffic at all: only page loads (navigations) go through it.
// Registered by registerOfflinePage() in script.js. Change OFFLINE_CACHE when offline.html changes.
const OFFLINE_CACHE = "offline-2026-11-26";
const OFFLINE_URL = "offline.html";

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(OFFLINE_CACHE);
    await cache.add(new Request(OFFLINE_URL, { cache: "reload" }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    // Start fetching a page while this worker wakes up, instead of after.
    if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith("offline-") && name !== OFFLINE_CACHE).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  if (event.request.mode !== "navigate") return;
  event.respondWith((async () => {
    try {
      const preloaded = await event.preloadResponse;
      if (preloaded) return preloaded;
      return await fetch(event.request);
    } catch (error) {
      const cached = await caches.match(OFFLINE_URL, { cacheName: OFFLINE_CACHE });
      return cached || Response.error();
    }
  })());
});

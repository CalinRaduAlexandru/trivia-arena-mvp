const CACHE = "trivia-arena-v4-mobile";
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        cache.addAll([
          "/",
          "/manifest.webmanifest",
          "/css/style.css",
          "/css/mobile.css",
          "/js/mobile.js",
          "/js/app.js",
          "/js/blobs.js",
          "/assets/icon-192.png",
          "/assets/icon-512.png",
        ]),
      ),
  );
  self.skipWaiting();
});
self.addEventListener("activate", (event) => event.waitUntil((async () => {
  for (const key of await caches.keys()) {
    if (key.startsWith('trivia-arena-') && key !== CACHE) await caches.delete(key);
  }
  await self.clients.claim();
})()));
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io/')) return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE).then((cache) => cache.put(event.request, copy)));
        }
        return response;
      })
      .catch(() => caches.match(event.request)),
  );
});

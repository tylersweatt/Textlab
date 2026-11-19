const CACHE = "textlab-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./css/app.css",
  "./manifest.webmanifest",
  "./js/app.js",
  "./js/view.js",
  "./js/relationships.js",
  "./js/words.js",
  "./js/model.js",
  "./js/history.js",
  "./js/passage.js",
  "./js/esv.js",
  "./js/esv-error.js",
  "./js/phrasing.js",
  "./js/diagram.js",
  "./js/storage.js",
  "./js/transfer.js",
  "./js/sample.js",
  "./icons/favicon-32.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetched = fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached || caches.match("./index.html"));
      return cached || fetched;
    }),
  );
});

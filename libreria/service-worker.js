// Service Worker exclusivo de Librería: runtime TTS y modelos bajo demanda.
const CACHE_NAME = "verbo-libreria-tts-v1";
const RUNTIME_ASSETS = [
  "/libreria/assets/tts/tts-worker.js",
  "/libreria/assets/tts/vendor/ort.min.js",
  "/libreria/assets/tts/vendor/ort-wasm-simd.wasm",
  "/libreria/assets/tts/vendor/piper_phonemize.js",
  "/libreria/assets/tts/vendor/piper_phonemize.wasm",
  "/libreria/assets/tts/vendor/piper_phonemize.data"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(RUNTIME_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys
        .filter(function (key) { return key.startsWith("verbo-libreria-tts-") && key !== CACHE_NAME; })
        .map(function (key) { return caches.delete(key); }));
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", function (event) {
  var request = event.request;
  if (request.method !== "GET") return;
  var url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith("/libreria/assets/tts/")) return;

  event.respondWith(
    caches.match(request).then(function (cached) {
      if (cached) return cached;
      return fetch(request).then(function (response) {
        if (response.ok) {
          var copy = response.clone();
          event.waitUntil(caches.open(CACHE_NAME).then(function (cache) {
            return cache.put(request, copy);
          }));
        }
        return response;
      });
    })
  );
});

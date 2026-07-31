// Service Worker de /libreria/ — cachea en el dispositivo del usuario los
// audiolibros (.mp3) ya reproducidos, para que una relectura no dependa de
// la red ni vuelva a pedirle audio al Worker. El Worker + R2 ya cachean el
// audio del lado del servidor (ver cloudflare/api-bible-worker/worker.js,
// /v1/tts/:libro/:capitulo) — esta caché es la capa de "ya lo escuché en
// este dispositivo, funciona sin conexión".
//
// Reemplaza el Service Worker legacy de Piper que reader.js desregistraba
// en cada carga (cleanupLegacyPiper) — ver libreria/assets/reader.js.
const AUDIO_CACHE = 'verbo-libreria-audio-v1';

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key.indexOf('verbo-libreria-') === 0 && key !== AUDIO_CACHE)
        .map(key => caches.delete(key))
    ))
  );
  self.clients.claim();
});

function isTtsAudioRequest(request) {
  if (request.method !== 'POST') return false;
  try {
    return new URL(request.url).pathname.indexOf('/v1/tts/') !== -1;
  } catch (e) {
    return false;
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (!isTtsAudioRequest(request)) return;

  // Las peticiones de audio son POST (llevan el texto del capítulo en el
  // body para el caso de generación); Cache API solo indexa por GET, así
  // que se usa la URL (libro/capítulo) como clave sintética.
  const cacheKey = new Request(request.url, { method: 'GET' });

  event.respondWith(
    caches.open(AUDIO_CACHE).then(cache =>
      cache.match(cacheKey).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          if (response && response.ok) cache.put(cacheKey, response.clone());
          return response;
        });
      })
    )
  );
});

// Service Worker de /biblia/ — cache-first para contenido ya visitado.
// Objetivo: (a) que la app funcione sin conexión con lo que el usuario ya
// leyó, y (b) sustento técnico real para la nota de revisión ante Apple
// (Guideline 4.2 — la app hace algo que un sitio envuelto sin más no hace).
//
// Regla de versión: subir CACHE_VERSION cada vez que cambie este archivo O
// biblia/index.html (los demás assets ya se invalidan solos por su propio
// "?v=" en las etiquetas <script>/<link> — ver CLAUDE.md, "Cache-busting de
// assets"). Sin ese bump, index.html cacheado puede quedar pegado a una
// versión vieja hasta el siguiente deploy de este archivo.
const CACHE_VERSION = 'verbo-biblia-v11-filipenses-verbo';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/style.css',
  './assets/app.js',
  './assets/module-loader.js',
  './assets/backup.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(APP_SHELL))
      .catch(() => {}) // no bloquear la instalación si algún asset del shell falla (p.ej. offline en el primer install)
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_VERSION).map(key => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Solo cachear lo propio de /biblia/ — no interceptar las llamadas a
  // traducción (translate.googleapis.com), API.Bible remoto, MyMemory, etc.
  // Esos siguen su camino normal de red, sin pasar por este Service Worker.
  if (url.origin !== self.location.origin || !url.pathname.startsWith('/biblia/')) return;

  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(request, copy));
        }
        return response;
      }).catch(() => cached);
    })
  );
});

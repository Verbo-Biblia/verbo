// Service Worker de /biblia/.
// Objetivo: (a) que la app funcione sin conexión con lo que el usuario ya
// leyó, y (b) sustento técnico real para la nota de revisión ante Apple
// (Guideline 4.2 — la app hace algo que un sitio envuelto sin más no hace).
//
// Estrategia por tipo de archivo (revisado 2026-08-01, ver diagnóstico en
// la sesión de esa fecha — un usuario tardó horas en ver un deploy nuevo
// porque el shell HTML quedaba atrapado en caché):
// - El shell (navegación / index.html) va SIEMPRE primero por red, con
//   fallback a caché solo si falla. Así el navegador se entera de un
//   deploy nuevo sin depender de que alguien se acuerde de bumpear
//   CACHE_VERSION — esa disciplina manual era la causa real del bug.
// - El resto de los assets (JS/CSS/JSON/etc.) sigue cache-first: ya se
//   auto-invalidan solos por su propio "?v=" en las etiquetas de
//   index.html (ver CLAUDE.md, "Cache-busting de assets"), y cache-first
//   ahí es lo correcto para velocidad y para el soporte offline real.
//
// Ciclo de vida: a propósito NO se llama self.skipWaiting() en install.
// El nuevo SW se queda "esperando" hasta que app.js le mande el mensaje
// SKIP_WAITING, cosa que solo pasa cuando el usuario hace clic en
// "Actualizar ahora" del aviso en pantalla — nunca se le cambia la app
// debajo de los pies a alguien que puede estar escribiendo una prédica sin
// guardar. CACHE_VERSION ya no es crítico para que la app se actualice
// (el network-first del shell resuelve eso solo); subirlo de vez en
// cuando sigue sirviendo para limpiar entradas de caché viejas.
const CACHE_VERSION = 'verbo-biblia-v14-resume-recheck-test';
const SHELL_NETWORK_TIMEOUT_MS = 4000;

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
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_VERSION).map(key => caches.delete(key))
    ))
  );
  self.clients.claim();
});

// app.js manda este mensaje solo cuando el usuario acepta explícitamente
// la actualización desde el aviso en pantalla (botón "Actualizar ahora").
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

function isShellRequest(request, url) {
  return request.mode === 'navigate' || url.pathname === '/biblia/' || url.pathname === '/biblia/index.html';
}

function networkFirst(request) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SHELL_NETWORK_TIMEOUT_MS);
  return fetch(request, { signal: controller.signal })
    .then(response => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_VERSION).then(cache => cache.put(request, copy));
      }
      return response;
    })
    .catch(() => caches.match(request))
    .finally(() => clearTimeout(timer));
}

function cacheFirst(request) {
  return caches.match(request).then(cached => {
    if (cached) return cached;
    return fetch(request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_VERSION).then(cache => cache.put(request, copy));
      }
      return response;
    }).catch(() => cached);
  });
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Solo cachear lo propio de /biblia/ — no interceptar las llamadas a
  // traducción (translate.googleapis.com), API.Bible remoto, MyMemory, etc.
  // Esos siguen su camino normal de red, sin pasar por este Service Worker.
  if (url.origin !== self.location.origin || !url.pathname.startsWith('/biblia/')) return;

  event.respondWith(isShellRequest(request, url) ? networkFirst(request) : cacheFirst(request));
});

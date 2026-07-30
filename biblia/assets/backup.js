/* Sistema de respaldo local unificado de Verbo.
   Una sola capa automática y silenciosa: IndexedDB, sin ningún diálogo de
   permiso. Exportar/importar sigue disponible como respaldo manual explícito
   (botón en el panel de Ajustes). Sin cuentas, sin backend — todo vive en la
   máquina del usuario. */
window.VerboBackup = (() => {
  const DB_NAME = 'verbo-db';
  const DB_VERSION = 1;
  const STORE = 'kv';
  const DATA_KEY = 'unified-data';
  const FILE_NAME = 'verbo-datos.json';

  let dbPromise = null;
  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }
  async function idbGet(key) {
    try {
      const db = await openDB();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).get(key);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => reject(req.error);
      });
    } catch { return null; }
  }
  async function idbSet(key, value) {
    try {
      const db = await openDB();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(value, key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
      });
    } catch { return false; }
  }

  function emptyData() {
    return { version: '1.0', fecha_guardado: null, notas: [], resaltados: [], marcadores: [], posicion_lectura: {} };
  }

  // Migración única desde el localStorage disperso que ya existía antes de
  // este sistema (resaltados, nota:BOOK-CAP, última posición de lectura).
  function migrateFromLocalStorage() {
    const data = emptyData();
    try {
      const rawHl = JSON.parse(localStorage.getItem('verbo:highlights') || '{}');
      data.resaltados = Object.entries(rawHl).map(([ref, color]) => ({
        id: ref, ubicacion: { tipo: 'biblia', ref }, color, texto: ''
      }));
    } catch {}
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('nota:')) {
          const ref = key.slice('nota:'.length);
          const texto = localStorage.getItem(key) || '';
          if (texto.trim()) data.notas.push({ id: ref, ubicacion: { tipo: 'biblia', ref }, texto, fecha: null });
        }
      }
    } catch {}
    const libro = localStorage.getItem('verbo:lastBook');
    const capitulo = localStorage.getItem('verbo:lastChapter');
    if (libro) data.posicion_lectura.biblia = { libro, capitulo: capitulo ? Number(capitulo) : 1 };
    return data;
  }

  let cached = null;
  let persistSubscribers = [];

  // Permite que otros módulos (ej. sync.js) se enteren de cada guardado local
  // para disparar una sincronización, sin acoplar backup.js a la red.
  function onPersist(cb) { persistSubscribers.push(cb); }

  async function init() {
    cached = await idbGet(DATA_KEY);
    if (!cached) {
      cached = migrateFromLocalStorage();
      await idbSet(DATA_KEY, cached);
    }
    for (const campo of ['notas', 'resaltados', 'marcadores']) if (!Array.isArray(cached[campo])) cached[campo] = [];
    if (!cached.posicion_lectura) cached.posicion_lectura = {};
    return cached;
  }

  function getData() { return cached; }

  // No toca fecha_guardado aquí: ese campo es el reloj que sync.js usa para
  // decidir qué dispositivo "gana" al reconciliar (último en escribir gana,
  // sin fusión). Si persist() lo bumpeara en cada llamada, cualquier guardado
  // sin cambios de contenido real —posición de lectura al cambiar de
  // capítulo, o el flush de "salir" en visibilitychange/pagehide— haría que
  // ESE dispositivo pareciera el más reciente y sobrescribiera un cambio
  // genuino más nuevo hecho en otro dispositivo. Bug real en producción
  // (2026-07-30): un resaltado nuevo en el celular se perdió porque la PC,
  // solo por seguir leyendo capítulos, quedó con fecha_guardado más nueva.
  // Los únicos que deben mover el reloj son los cambios de contenido real:
  // setAllResaltados/setNota lo hacen explícitamente antes de llamar aquí.
  async function persist() {
    await idbSet(DATA_KEY, cached);
    scheduleCapacitorWrite();
    persistSubscribers.forEach(cb => { try { cb(cached); } catch {} });
  }

  // Reemplaza los datos locales con un blob remoto más nuevo (sync). A
  // diferencia de persist(), no notifica a persistSubscribers: viene de la
  // red, no de un cambio local que haya que reenviar.
  async function replaceData(newData) {
    cached = { ...emptyData(), ...newData };
    for (const campo of ['notas', 'resaltados', 'marcadores']) if (!Array.isArray(cached[campo])) cached[campo] = [];
    if (!cached.posicion_lectura) cached.posicion_lectura = {};
    await idbSet(DATA_KEY, cached);
    scheduleCapacitorWrite();
    return cached;
  }

  // ---- Resaltados (mapa BOOK:CAP:VERSO -> clase de color, igual forma que ya usaba app.js) ----
  function getResaltadosMap() {
    const map = {};
    cached.resaltados.forEach(r => { if (r.ubicacion?.tipo === 'biblia') map[r.ubicacion.ref] = r.color; });
    return map;
  }
  function setAllResaltados(map) {
    cached.resaltados = Object.entries(map).map(([ref, color]) => ({
      id: ref, ubicacion: { tipo: 'biblia', ref }, color, texto: ''
    }));
    cached.fecha_guardado = new Date().toISOString();
    persist();
  }

  // ---- Notas (una por libro+capítulo, igual forma que ya usaba app.js) ----
  function getNota(ref) {
    return cached.notas.find(n => n.ubicacion?.tipo === 'biblia' && n.ubicacion.ref === ref)?.texto || '';
  }
  function setNota(ref, texto) {
    const existing = cached.notas.find(n => n.ubicacion?.tipo === 'biblia' && n.ubicacion.ref === ref);
    if (existing) { existing.texto = texto; existing.fecha = new Date().toISOString(); }
    else cached.notas.push({ id: ref, ubicacion: { tipo: 'biblia', ref }, texto, fecha: new Date().toISOString() });
    cached.fecha_guardado = new Date().toISOString();
    persist();
  }

  // ---- Posición de lectura ----
  function getPosicionBiblia() { return cached.posicion_lectura?.biblia || null; }
  function setPosicionBiblia(libro, capitulo) {
    cached.posicion_lectura.biblia = { libro, capitulo };
    persist();
  }

  // ---- Puente Filesystem nativo (solo dentro del wrapper Capacitor de
  // iOS/Android, NO es File System Access API). IndexedDB puede ser purgado
  // por iOS tras ~7 días sin uso (política antitracking de WKWebView); este
  // escrito en el sandbox nativo de la app no está sujeto a esa purga. No
  // pide ningún permiso ni muestra diálogo — es el sandbox propio de la app,
  // no una carpeta arbitraria del usuario.
  let capacitorSaveTimer = null;
  function isCapacitorNative() {
    return Boolean(window.Capacitor?.isNativePlatform?.());
  }
  async function writeToCapacitorFS() {
    const FS = window.Capacitor?.Plugins?.Filesystem;
    if (!FS) return false;
    try {
      await FS.writeFile({
        path: FILE_NAME,
        data: JSON.stringify(cached, null, 2),
        directory: 'DOCUMENTS',
        encoding: 'utf8'
      });
      return true;
    } catch { return false; }
  }
  function scheduleCapacitorWrite() {
    if (!isCapacitorNative()) return;
    clearTimeout(capacitorSaveTimer);
    capacitorSaveTimer = setTimeout(() => { writeToCapacitorFS().catch(() => {}); }, 3000);
  }

  async function saveNow() {
    await persist();
    if (isCapacitorNative()) return writeToCapacitorFS();
    return true;
  }

  // ---- Exportar / Importar (respaldo manual explícito, universal) ----
  function exportDownload() {
    const blob = new Blob([JSON.stringify(cached, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = FILE_NAME;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function importFromFile(file) {
    const text = await file.text();
    const parsed = JSON.parse(text);
    cached = { ...emptyData(), ...parsed };
    for (const campo of ['notas', 'resaltados', 'marcadores']) if (!Array.isArray(cached[campo])) cached[campo] = [];
    await idbSet(DATA_KEY, cached);
    return cached;
  }

  return {
    init, getData, saveNow,
    getResaltadosMap, setAllResaltados,
    getNota, setNota,
    getPosicionBiblia, setPosicionBiblia,
    exportDownload, importFromFile,
    isCapacitorNative,
    onPersist, replaceData
  };
})();

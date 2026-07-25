/* Sistema de respaldo local unificado de Verbo.
   Tres capas: IndexedDB (base universal) + File System Access API (persistencia
   real en disco, solo Chromium de escritorio) + exportar/importar (respaldo
   manual universal). Sin cuentas, sin backend — todo vive en la máquina del
   usuario. Ver prompt original para el diseño completo. */
const VerboBackup = (() => {
  const DB_NAME = 'verbo-db';
  const DB_VERSION = 1;
  const STORE = 'kv';
  const DATA_KEY = 'unified-data';
  const HANDLE_KEY = 'backup-dir-handle';
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
  let dirHandle = null;
  let saveTimer = null;

  async function init() {
    cached = await idbGet(DATA_KEY);
    if (!cached) {
      cached = migrateFromLocalStorage();
      await idbSet(DATA_KEY, cached);
    }
    for (const campo of ['notas', 'resaltados', 'marcadores']) if (!Array.isArray(cached[campo])) cached[campo] = [];
    if (!cached.posicion_lectura) cached.posicion_lectura = {};
    dirHandle = await idbGet(HANDLE_KEY);
    return cached;
  }

  function getData() { return cached; }

  async function persist() {
    cached.fecha_guardado = new Date().toISOString();
    await idbSet(DATA_KEY, cached);
    scheduleFolderWrite();
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
    persist();
  }

  // ---- Posición de lectura ----
  function getPosicionBiblia() { return cached.posicion_lectura?.biblia || null; }
  function setPosicionBiblia(libro, capitulo) {
    cached.posicion_lectura.biblia = { libro, capitulo };
    persist();
  }

  // ---- Capa 2: File System Access API ----
  function supportsFSA() { return typeof window.showDirectoryPicker === 'function'; }
  function hasFolderPermission() { return !!dirHandle; }

  async function verifyPermission(handle, mode = 'readwrite') {
    try {
      const opts = { mode };
      if ((await handle.queryPermission(opts)) === 'granted') return true;
      return (await handle.requestPermission(opts)) === 'granted';
    } catch { return false; }
  }

  async function requestFolderAccess() {
    if (!supportsFSA()) return false;
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      const ok = await verifyPermission(handle);
      if (!ok) return false;
      dirHandle = handle;
      await idbSet(HANDLE_KEY, handle);
      await writeToFolder();
      return true;
    } catch { return false; }
  }

  async function writeToFolder() {
    if (!dirHandle) return false;
    try {
      const ok = await verifyPermission(dirHandle);
      if (!ok) return false;
      const fileHandle = await dirHandle.getFileHandle(FILE_NAME, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(JSON.stringify(cached, null, 2));
      await writable.close();
      return true;
    } catch { return false; }
  }

  function scheduleFolderWrite() {
    if (!dirHandle) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { writeToFolder().catch(() => {}); }, 3000);
  }

  async function saveNow() {
    await persist();
    if (dirHandle) return writeToFolder();
    return false;
  }

  // ---- Capa 3: Exportar / Importar (universal) ----
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

  // ---- Aviso de consentimiento (cuándo ofrecerlo, sin insistir) ----
  function shouldOfferConsent() {
    if (!supportsFSA() || hasFolderPermission()) return false;
    const declinedAt = Number(localStorage.getItem('verbo:backup:declinedAt') || 0);
    if (!declinedAt) return true;
    const unaSemanaMs = 7 * 24 * 60 * 60 * 1000;
    return Date.now() - declinedAt > unaSemanaMs;
  }
  function recordConsentDeclined() {
    localStorage.setItem('verbo:backup:declinedAt', String(Date.now()));
  }

  return {
    init, getData, saveNow,
    getResaltadosMap, setAllResaltados,
    getNota, setNota,
    getPosicionBiblia, setPosicionBiblia,
    supportsFSA, hasFolderPermission, requestFolderAccess,
    exportDownload, importFromFile,
    shouldOfferConsent, recordConsentDeclined
  };
})();

(function(){
  'use strict';
  // Resuelto relativo a la ubicación de este script (no a la página que lo
  // incluye), para que el mismo archivo sirva tanto a /biblia/ como a
  // cualquier otra página del sitio (portal, misión, librería, etc.) sin
  // duplicar diccionarios — ej. <script src="../biblia/assets/i18n.js">.
  const scriptPath = (document.currentScript && document.currentScript.src || '').split('?')[0];
  const SCRIPT_BASE = scriptPath ? scriptPath.replace(/[^/]+$/, '') : './';
  const DICT_URLS = { es: SCRIPT_BASE + 'i18n/es.json', en: SCRIPT_BASE + 'i18n/en.json' };
  const SUPPORTED = Object.keys(DICT_URLS);
  const UI_LANG_KEY = 'verbo:uiLang';

  function detectBrowserLang(){
    const raw = String(navigator.language || navigator.userLanguage || 'es').slice(0,2).toLowerCase();
    return SUPPORTED.includes(raw) ? raw : 'es';
  }

  // Primera visita (sin preferencia guardada todavía): se detecta el idioma
  // del navegador y se persiste de inmediato, para que quede estable en
  // visitas futuras y para que app.js pueda leer el mismo valor al elegir la
  // Biblia por defecto (ver getDetectedLang/isFirstVisit). A partir de acá,
  // toda visita futura ya tiene un valor guardado — "detección automática" y
  // "elección manual" usan la misma clave; sólo cambia quién la escribió.
  let uiLang = localStorage.getItem(UI_LANG_KEY);
  const firstVisit = !uiLang;
  if(!uiLang){
    uiLang = detectBrowserLang();
    localStorage.setItem(UI_LANG_KEY, uiLang);
  }
  if(!SUPPORTED.includes(uiLang)) uiLang = 'es';

  let dict = {};
  let dictLang = null;

  function flatten(obj, prefix, out){
    out = out || {};
    for(const k in obj){
      if(!Object.prototype.hasOwnProperty.call(obj,k)) continue;
      const val = obj[k];
      const key = prefix ? `${prefix}.${k}` : k;
      if(val && typeof val === 'object' && !Array.isArray(val)) flatten(val, key, out);
      else out[key] = val;
    }
    return out;
  }

  async function loadDict(lang){
    const url = DICT_URLS[lang] || DICT_URLS.es;
    const res = await fetch(url);
    if(!res.ok) throw new Error(`No se pudo cargar el diccionario de interfaz: ${url}`);
    return flatten(await res.json());
  }

  async function ensureDict(lang){
    if(dictLang === lang) return dict;
    dict = await loadDict(lang);
    dictLang = lang;
    return dict;
  }

  function interpolate(str, vars){
    if(!vars) return str;
    return str.replace(/\{\{(\w+)\}\}/g, (match, key) => (key in vars ? String(vars[key]) : match));
  }

  function t(key, vars){
    const val = dict[key];
    if(val == null) return key;
    return interpolate(val, vars);
  }

  function applyStatic(root){
    root = root || document;
    root.querySelectorAll('[data-i18n]').forEach(el => {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    root.querySelectorAll('[data-i18n-attr]').forEach(el => {
      el.getAttribute('data-i18n-attr').split(',').forEach(pair => {
        const [attr, key] = pair.split(':').map(s => s && s.trim());
        if(attr && key) el.setAttribute(attr, t(key));
      });
    });
    document.documentElement.lang = dictLang || uiLang;
  }

  const ready = ensureDict(uiLang).then(() => applyStatic(document));

  async function setUiLang(lang){
    if(!SUPPORTED.includes(lang) || lang === uiLang) return;
    uiLang = lang;
    localStorage.setItem(UI_LANG_KEY, lang);
    await ensureDict(lang);
    applyStatic(document);
    document.dispatchEvent(new CustomEvent('verbo:uilang-changed', { detail:{ lang } }));
  }

  window.VerboI18n = {
    t,
    ready: () => ready,
    getUiLang: () => uiLang,
    setUiLang,
    applyStatic,
    isFirstVisit: () => firstVisit,
    detectBrowserLang,
    SUPPORTED
  };
})();

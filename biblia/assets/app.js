document.addEventListener('DOMContentLoaded', async () => {
  if (window.VerboI18n) await window.VerboI18n.ready();
  const t = (key, vars) => (window.VerboI18n ? window.VerboI18n.t(key, vars) : key);
  const els = {
    body: document.body,
    book: document.getElementById('bookSelect'),
    chapter: document.getElementById('chapterSelect'),
    prev: document.getElementById('prevChapter'),
    next: document.getElementById('nextChapter'),
    innerPrev: document.getElementById('innerPrev'),
    innerNext: document.getElementById('innerNext'),
    versionInput: document.getElementById('mainVersionInput'),
    versionDropdown: document.getElementById('versionDropdown'),
    nativeVersionSelect: document.getElementById('nativeVersionSelect'),
    list: document.getElementById('verseList'),
    attribution: document.getElementById('bibleAttribution'),
    eyebrow: document.querySelector('.chapter-eyebrow'),
    title: document.querySelector('.chapter-title'),
    side: document.getElementById('sidePanel'),
    panelTitle: document.getElementById('panelTitle'),
    panelToolbar: document.getElementById('panelToolbar'),
    panelBody: document.getElementById('panelBody'),
    close: document.getElementById('panelClose'),
    search: document.getElementById('searchTrigger'),
    tabs: [...document.querySelectorAll('.tab-rail__btn, .library-rail__btn')],
    verseActionBar: document.getElementById('verseActionBar'),
    copyVerseText: document.getElementById('copyVerseText'),
    copyVerseRef: document.getElementById('copyVerseRef'),
    closeVerseAction: document.getElementById('closeVerseAction'),
    backdrop: document.getElementById('sheetBackdrop'),
    sermonToggle: document.getElementById('sermonModeToggle'),
    readingPane: document.getElementById('readingPane'),
    editorPane: document.getElementById('editorPane'),
    editorSurface: document.getElementById('editorSurface'),
    editorToolbar: document.getElementById('editorToolbar')
  };

  const backupData = await VerboBackup.init();

  // Contenedor común para avisos discretos apilables (ver .app-banner-stack
  // en style.css) — evita que el recordatorio de exportación y el aviso de
  // actualización disponible se dibujen encima uno del otro si coinciden.
  function getBannerStack() {
    let stack = document.getElementById('appBannerStack');
    if (!stack) {
      stack = document.createElement('div');
      stack.id = 'appBannerStack';
      stack.className = 'app-banner-stack';
      document.body.appendChild(stack);
    }
    return stack;
  }

  // ---- Recordatorio de exportación mensual (red de seguridad aparte de la
  // sincronización en la nube). "Descartado" solo dura esta carga de página
  // (variable en memoria, no localStorage/sessionStorage): si sigue vencido,
  // vuelve a aparecer en la siguiente carga. ----
  let exportReminderDismissed = false;
  const EXPORT_REMINDER_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  function isExportOverdue(data) {
    const last = data?.ultima_exportacion;
    if (!last) return true;
    const elapsed = Date.now() - Date.parse(last);
    return !(elapsed < EXPORT_REMINDER_DAYS_MS);
  }
  function renderExportReminderBanner() {
    if (document.getElementById('exportReminder')) return;
    const el = document.createElement('div');
    el.id = 'exportReminder';
    el.className = 'export-reminder';
    el.innerHTML = `
      <div class="export-reminder__row">
        <p class="export-reminder__msg">${t('ajustes.exportReminderMsg')}</p>
        <button type="button" class="export-reminder__close" aria-label="${t('ajustes.exportReminderDismissAria')}">&times;</button>
      </div>
      <button type="button" class="export-reminder__btn">${t('ajustes.exportReminderBtn')}</button>`;
    getBannerStack().appendChild(el);
    el.querySelector('.export-reminder__close').addEventListener('click', () => {
      exportReminderDismissed = true;
      el.remove();
    });
    el.querySelector('.export-reminder__btn').addEventListener('click', () => {
      VerboBackup.exportDownload();
      toast(t('toast.descargando'));
      exportReminderDismissed = true;
      el.remove();
    });
  }
  if (!exportReminderDismissed && isExportOverdue(backupData)) renderExportReminderBanner();

  // ---- Service Worker: shell offline real + aviso de actualización no
  // intrusivo. El nuevo SW se queda "esperando" a propósito (no hay
  // skipWaiting() automático en service-worker.js) hasta que el usuario
  // acepta desde este aviso — así nunca se le cambia la app debajo de los
  // pies mientras escribe una prédica sin guardar. Si lo descarta, sigue
  // trabajando con la versión actual; el aviso vuelve a aparecer en la
  // próxima carga si la actualización sigue pendiente. ----
  if ('serviceWorker' in navigator) {
    let swReloadingForUpdate = false;
    function renderUpdateBanner(registration) {
      if (document.getElementById('swUpdateBanner')) return;
      const el = document.createElement('div');
      el.id = 'swUpdateBanner';
      el.className = 'export-reminder';
      el.innerHTML = `
        <div class="export-reminder__row">
          <p class="export-reminder__msg">${t('app.updateAvailableMsg')}</p>
          <button type="button" class="export-reminder__close" aria-label="${t('app.updateAvailableDismissAria')}">&times;</button>
        </div>
        <button type="button" class="export-reminder__btn">${t('app.updateAvailableBtn')}</button>`;
      getBannerStack().appendChild(el);
      el.querySelector('.export-reminder__close').addEventListener('click', () => el.remove());
      el.querySelector('.export-reminder__btn').addEventListener('click', () => {
        // Recién aquí, con un clic explícito del usuario, se le pide al SW en
        // espera que tome control — controllerchange (abajo) es lo único que
        // dispara el reload, y solo si esta bandera está en true.
        swReloadingForUpdate = true;
        registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
        el.remove();
      });
    }
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!swReloadingForUpdate) return;
      swReloadingForUpdate = false;
      location.reload();
    });
    const setupServiceWorker = async () => {
      try {
        // updateViaCache: 'none' es necesario porque GitHub Pages sirve
        // service-worker.js con Cache-Control: max-age=600 y no hay forma
        // de cambiar ese header ahí (sin backend/CDN propio) — sin esto, el
        // navegador podía comparar contra una copia de HASTA 10 minutos de
        // antigüedad guardada en su caché HTTP normal en vez de ir a la red.
        const registration = await navigator.serviceWorker.register('service-worker.js', { updateViaCache: 'none' });
        const checkWaiting = () => {
          if (registration.waiting && navigator.serviceWorker.controller) renderUpdateBanner(registration);
        };
        checkWaiting();
        registration.addEventListener('updatefound', () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) checkWaiting();
          });
        });
        // En Android, al reabrir la app instalada (TWA) desde segundo plano,
        // Chrome muchas veces reanuda la página congelada en vez de
        // recargarla — no dispara 'load' de nuevo, así que sin esto la app
        // podía quedar pegada en una versión vieja por días aunque el
        // usuario la reabriera seguido (solo borrar los datos de la app
        // forzaba una carga 100% desde cero y arreglaba el problema). Con
        // esto, cada vez que la app vuelve a primer plano se pregunta
        // activamente si hay una versión nueva.
        // Debounce: 'visibilitychange' y 'focus' suelen dispararse juntos en
        // un mismo resume, y cambiar de app varias veces seguidas (ej. al
        // revisar notificaciones) puede disparar el evento muchas veces en
        // segundos — sin este mínimo, cada una lanzaría su propia petición
        // de red redundante.
        const RECHECK_MIN_INTERVAL_MS = 60000;
        let lastRecheckAt = 0;
        const recheckOnResume = () => {
          if (document.visibilityState !== 'visible') return;
          const now = Date.now();
          if (now - lastRecheckAt < RECHECK_MIN_INTERVAL_MS) return;
          lastRecheckAt = now;
          registration.update().then(checkWaiting).catch(() => {});
        };
        document.addEventListener('visibilitychange', recheckOnResume);
        window.addEventListener('pageshow', recheckOnResume);
        window.addEventListener('focus', recheckOnResume);
      } catch {}
    };
    // 'load' puede haber disparado YA para cuando llegamos hasta acá — este
    // código corre dentro de un handler de DOMContentLoaded con varios
    // await (i18n, backup) antes de este punto, y en la práctica esa espera
    // alcanza para que 'load' ya haya pasado (confirmado: en una carga real,
    // domContentLoadedEventEnd y loadEventEnd quedaron a menos de 150ms de
    // diferencia). Un listener agregado a un evento que ya ocurrió nunca se
    // ejecuta, así que todo este bloque —incluido el aviso de actualización—
    // podía quedar como código muerto en cada carga. Por eso se corre de
    // inmediato si el documento ya terminó de cargar.
    if (document.readyState === 'complete') setupServiceWorker();
    else window.addEventListener('load', setupServiceWorker, { once: true });
  }

  if (window.VerboSync) {
    VerboSync.on('data-updated', () => location.reload());
    VerboSync.on('linked', () => { syncPending = false; if (activeTab === 'ajustes') renderAjustes(); });
    VerboSync.on('unlinked', () => { if (activeTab === 'ajustes') renderAjustes(); });
    VerboSync.on('link-error', () => { toast(t('toast.errorSync')); if (activeTab === 'ajustes') renderAjustes(); });
    VerboSync.init().catch(err => console.warn('[sync] init falló', err));
  }
  let catalog, data, activeTab = null, currentVersion = localStorage.getItem('verbo:lastVersion') || null, compareVersion = null;
  let xrefTarget = null, xrefData = null;
  function resetXrefMode(){ xrefTarget = null; xrefData = null; }
  let sermonMode = false;
  let sermonEditor = null;
  let sermonEditorContent = null;
  let sermonBible = null;
  let currentPredicaId = null;
  let selectedVerses = new Set();
  let highlights = VerboBackup.getResaltadosMap();
  let suppressCommentSync = false;
  let commentSyncTimer = null;
  let searchState = null;
  let currentCommentary = localStorage.getItem('verbo:lastCommentary') || null;
  let currentDictionary = localStorage.getItem('verbo:lastDictionary') || null;
  let currentExegesis = localStorage.getItem('verbo:lastExegesis') || null;
  let gospelData=null;
  let gospelOpenChapter=null;
  let patristicCatalog=null;
  let patristicOpenDoc=null;
  let patristicOpenSection=null;
  let patristicMode=localStorage.getItem('verbo:patristicMode') || 'docs';
  let patristicByVerseCatalog=null;
  let currentPatristicByVerse=null;
  // Fuente(s) que sí tienen fragmento para el versículo que el usuario acaba de
  // clickear (ver indicador 📜 por versículo) — se consume una sola vez al
  // abrir el panel, para saltar directo al documento correcto en vez de dejar
  // al usuario adivinar en el selector "Fuente".
  let pendingPatristicSources=null;
  const posicionBiblia = VerboBackup.getPosicionBiblia();
  let currentBook = posicionBiblia?.libro || 'ROM';
  let currentChapter = Number(posicionBiblia?.capitulo) || 7;
  const themes = [
    { id:'paper', label:'Papel cálido', sample:'#F1E3C8' },
    { id:'cream', label:'Crema dorada', sample:'#F5E7C8' },
    { id:'sage', label:'Verde oliva', sample:'#DDE8D1' },
    { id:'mist', label:'Azul noche suave', sample:'#DDEAF1' },
    { id:'pearl', label:'Gris perla', sample:'#ECE9E2' },
    { id:'sand', label:'Rosa arena', sample:'#F1DCD6' },
    { id:'mint', label:'Menta', sample:'#D8F3EA' },
    { id:'rosewood', label:'Palo rosa', sample:'#F2D7DF' }
  ];

  const emptyState = (icon, text) => `<div class="panel-empty"><div class="panel-empty__icon">${icon}</div><div class="panel-empty__text">${text}</div></div>`;
  const activeVerse = () => Number(document.querySelector('.verse--active')?.dataset.verseN) || null;
  const hlKey = (book, chapter, n) => `${book}:${chapter}:${n}`;
  const saveHighlights = () => { VerboBackup.setAllResaltados(highlights); };
  const HL_COLORS = ['hl-yellow','hl-green','hl-blue','hl-pink','hl-coral','hl-violet'];
  const escapeHTML = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[ch]));
  const bibleCatalog = () => catalog.bibles.map(item => ({ id:item.manifest.id, label:item.manifest.abbreviation || item.manifest.name, full:item.manifest.name, path:item.path, lang:item.manifest.language || 'es', remote:Boolean(item.remote || item.manifest.remote), manifest:item.manifest }));
  // Idioma de Strong/comentarios sigue a la Biblia activa: sin selector propio.
  // En modo sermón la Biblia "activa" es la de la pestaña Biblia (sermonBible), no la
  // principal (que queda oculta/congelada mientras se escribe).
  const contentLang = () => bibleCatalog().find(v => v.id === (sermonMode && sermonBible ? sermonBible.version : currentVersion))?.lang || 'es';
  const commentaryCatalog = () => (catalog.commentaries || []).map(item => ({ id:item.manifest.id, label:item.manifest.abbreviation || item.manifest.name, full:item.manifest.name, path:item.path, manifest:item.manifest }));
  // Léxico Strong: módulos numéricos (G1234 / H1234) consultados al tocar una etiqueta Strong en el texto.
  const isStrongLexicon = item => Boolean(item.manifest.strong);
  const dictionaryCatalog = () => (catalog.dictionaries || []).filter(isStrongLexicon).map(item => ({ id:item.manifest.id, label:item.manifest.abbreviation || item.manifest.name, full:item.manifest.name, path:item.path, manifest:item.manifest, linked:Boolean(item.manifest.books?.length) }));
  const exegesisCatalog = () => (catalog.exegesis || []).map(item => ({ id:item.manifest.id, label:item.manifest.abbreviation || item.manifest.name, full:item.manifest.name, path:item.path, manifest:item.manifest }));
  const bookAbbr = { GEN:'Gn', EXO:'Ex', LEV:'Lv', NUM:'Nm', DEU:'Dt', JOS:'Jos', JDG:'Jue', RUT:'Rt', '1SA':'1 S', '2SA':'2 S', '1KI':'1 R', '2KI':'2 R', '1CH':'1 Cr', '2CH':'2 Cr', EZR:'Esd', NEH:'Neh', EST:'Est', JOB:'Job', PSA:'Sal', PRO:'Pr', ECC:'Ec', SNG:'Cnt', ISA:'Is', JER:'Jer', LAM:'Lm', EZK:'Ez', DAN:'Dn', HOS:'Os', JOL:'Jl', AMO:'Am', OBA:'Abd', JON:'Jon', MIC:'Mi', NAM:'Nah', HAB:'Hab', ZEP:'Sof', HAG:'Hag', ZEC:'Zac', MAL:'Mal', MAT:'Mt', MRK:'Mc', LUK:'Lc', JHN:'Jn', ACT:'Hch', ROM:'Ro', '1CO':'1 Cor', '2CO':'2 Cor', GAL:'Gá', EPH:'Ef', PHP:'Fil', COL:'Col', '1TH':'1 Tes', '2TH':'2 Tes', '1TI':'1 Ti', '2TI':'2 Ti', TIT:'Tit', PHM:'Flm', HEB:'Heb', JAS:'Stg', '1PE':'1 P', '2PE':'2 P', '1JN':'1 Jn', '2JN':'2 Jn', '3JN':'3 Jn', JUD:'Jud', REV:'Ap' };
  const compactRef = (bookId=currentBook, chapter=currentChapter, verses=[]) => {
    const sorted=[...new Set(verses.map(Number))].sort((a,b)=>a-b);
    if(!sorted.length) return `${bookAbbr[bookId] || data?.meta?.book || bookId} ${chapter}`;
    const ranges=[]; let start=sorted[0], prev=sorted[0];
    for(const n of sorted.slice(1)){ if(n===prev+1){ prev=n; continue; } ranges.push(start===prev?`${start}`:`${start}-${prev}`); start=prev=n; }
    ranges.push(start===prev?`${start}`:`${start}-${prev}`);
    return `${bookAbbr[bookId] || data?.meta?.book || bookId} ${chapter}:${ranges.join(',')}`;
  };
  const copyToClipboard = async (text) => {
    // Dentro de la app nativa (Capacitor), usar la hoja de compartir del
    // sistema en vez de solo el portapapeles: incluye "Copiar" como una de
    // sus opciones, más Mensajes/Mail/etc. — integración nativa real, no solo
    // un sitio envuelto (Apple Guideline 4.2). En el sitio web normal
    // `window.Capacitor` no existe y este bloque no hace nada.
    if (window.Capacitor?.isNativePlatform?.() && window.Capacitor?.Plugins?.Share) {
      try { await window.Capacitor.Plugins.Share.share({ text }); return; } catch {}
    }
    try { await navigator.clipboard.writeText(text); toast(t('toast.copiado')); }
    catch { const area=document.createElement('textarea'); area.value=text; document.body.appendChild(area); area.select(); document.execCommand('copy'); area.remove(); toast(t('toast.copiado')); }
  };
  const toast = (message, duration=1400) => {
    let el=document.querySelector('.verbo-toast');
    if(!el){ el=document.createElement('div'); el.className='verbo-toast'; document.body.appendChild(el); }
    el.textContent=message; el.classList.add('verbo-toast--show');
    clearTimeout(el._timer); el._timer=setTimeout(()=>el.classList.remove('verbo-toast--show'),duration);
  };

  applyTheme(localStorage.getItem('verbo:theme') || 'paper');

  try {
    catalog = await VerboModules.getCatalog();
    // Primera visita (sin `verbo:lastVersion` guardado todavía): usar el
    // idioma detectado/guardado de interfaz (ver assets/i18n.js) para elegir
    // también la Biblia por defecto — una Biblia en ese idioma si existe, si
    // no RVA 1909 como respaldo. Es una decisión de arranque única: en
    // cuanto el usuario elige una Biblia (o esta corrida guarda una), queda
    // fijada en `verbo:lastVersion` como siempre y esta lógica no vuelve a
    // correr. No toca contentLang() ni el idioma de interfaz.
    if (!currentVersion && window.VerboI18n) {
      const detectedLang = window.VerboI18n.getUiLang();
      const bySameLang = bibleCatalog().find(v => v.lang === detectedLang);
      const fallback = detectedLang !== 'es' ? bibleCatalog().find(v => v.id === 'rva-1909') : null;
      const preferred = bySameLang || fallback;
      if (preferred) currentVersion = preferred.id;
    }
    await populateBooks();
    if (!commentaryCatalog().some(c => c.id === currentCommentary)) currentCommentary = commentaryCatalog()[0]?.id || null;
    if (!dictionaryCatalog().some(c => c.id === currentDictionary)) currentDictionary = dictionaryCatalog()[0]?.id || null;
    if (!exegesisCatalog().some(c => c.id === currentExegesis)) currentExegesis = exegesisCatalog()[0]?.id || null;
    if (!catalog.books.some(b => b.id === currentBook)) currentBook = catalog.books[0].id;
    els.book.value = currentBook;
    await refreshChapters();
    await loadPassage();
  } catch (error) {
    console.error(error);
    showFatal(error);
    return;
  }

  async function populateBooks() {
    // catalog.books es la lista canónica de IDs/orden (fija a la Biblia por
    // defecto) — el NOMBRE mostrado debe venir del manifiesto de la Biblia
    // activa (ej. ASV/KJV listan "Revelation", no "Apocalipsis"), si no,
    // el desplegable siempre muestra los nombres en español sin importar
    // qué versión esté seleccionada. Algunas Biblias (ej. kjv/manifest.json)
    // no listan "books" directamente, sino vía "dataManifest" — ver
    // VerboModules.resolveBibleBooks.
    const activeEntry = catalog.bibles.find(b => b.manifest.id === currentVersion);
    const activeManifestBooks = activeEntry ? await VerboModules.resolveBibleBooks(activeEntry) : null;
    const nameById = Array.isArray(activeManifestBooks)
      ? new Map(activeManifestBooks.map(b => [b.id, b.name]))
      : null;
    els.book.innerHTML = catalog.books.map(b => `<option value="${b.id}">${escapeHTML(nameById?.get(b.id) || b.name)}</option>`).join('');
  }

  async function refreshChapters() {
    const info = await VerboModules.getBookInfo(currentBook);
    currentChapter = Math.max(1, Math.min(currentChapter, info.chapterCount));
    els.chapter.innerHTML = Array.from({length: info.chapterCount}, (_, i) => `<option value="${i+1}">${i+1}</option>`).join('');
    els.chapter.value = String(currentChapter);
    updateNavButtons();
  }

  async function loadPassage({preserveVersion=true}={}) {
    setLoading(true);
    resetXrefMode();
    try {
      const previous = preserveVersion ? currentVersion : null;
      data = await VerboModules.buildChapterData({bookId: currentBook, chapter: currentChapter, commentaryId: currentCommentary, bibleId: previous || currentVersion});
      if (previous && bibleCatalog().some(version => version.id === previous)) {
        try { await ensureVersionLoaded(previous); }
        catch (error) { console.warn(`No se pudo restaurar ${previous}; se usará la Biblia local.`, error); }
      }
      currentVersion = previous && data.versions[previous] ? previous : data.meta.version;
      localStorage.setItem('verbo:lastVersion', currentVersion);
      const availableCompare = bibleCatalog();
      const preferredCompare = availableCompare.find(v => v.id !== currentVersion)?.id || currentVersion;
      compareVersion = compareVersion && availableCompare.some(v => v.id === compareVersion)
        ? compareVersion : preferredCompare;
      populateVersions();
      selectedVerses.clear();
      renderChapter();
      updateActionBar();
      VerboBackup.setPosicionBiblia(currentBook, currentChapter);
      gospelOpenChapter=null;
      if (activeTab) renderPanel(activeTab);
      window.scrollTo({top:0, behavior:'smooth'});
    } catch (error) {
      console.error(error);
      els.list.innerHTML = emptyState('⚠️', t('biblia.loadError'));
    } finally { setLoading(false); }
  }

  // targetData/bookId/chapter son parametrizables porque el modo sermón necesita
  // cargar bajo demanda una versión sobre sermonBible.data (su propio libro/capítulo),
  // no sobre la Biblia principal — ver loadSermonBibleData.
  async function ensureVersionLoaded(versionId, {targetData=null, bookId=currentBook, chapter=currentChapter}={}) {
    const target = targetData || data;
    if (target.versions[versionId]) return true;
    const selected = bibleCatalog().find(version => version.id === versionId);
    if (!selected) return false;
    let loaded, rawVerses=null, hasStrongs=false;
    if (selected.remote) {
      loaded = await VerboModules.loadRemoteBible(versionId, bookId, chapter);
    } else {
      const raw = await VerboModules.loadBible(selected.path, bookId, chapter);
      if (!raw) throw new Error(`Esta versión no contiene ${bookId} ${chapter}`);
      hasStrongs = Boolean(raw.manifest.hasStrongs);
      rawVerses = raw.verses;
      loaded = { manifest: raw.manifest, copyright:'', fumsToken:'' };
    }
    target.versions[versionId] = {
      label: loaded.manifest.abbreviation,
      full: loaded.manifest.name,
      hasStrongs,
      remote: Boolean(selected.remote),
      copyright: loaded.copyright,
      fumsToken: loaded.fumsToken
    };
    target.verses.forEach(verse => {
      if (rawVerses) {
        // Biblia local: puede traer texto plano o {text,segments} (Strong).
        const raw = rawVerses[String(verse.n)];
        verse.text[versionId] = raw ? (typeof raw === 'string' ? raw : raw.text) : '';
        if (hasStrongs && raw?.segments) { verse.segments = verse.segments || {}; verse.segments[versionId] = raw.segments; }
      } else {
        verse.text[versionId] = loaded.verses[String(verse.n)] || '';
      }
    });
    return true;
  }

  // buildChapterData() solo trae el texto completo (con HTML) del comentario
  // activo al momento de construir el capítulo; el resto quedan como índice
  // liviano (notes[id] con title/author/body vacíos). Al cambiar de comentario
  // en el panel hay que traer su contenido completo bajo demanda — mismo
  // patrón que ensureVersionLoaded para Biblias.
  async function ensureCommentaryLoaded(commentaryId, {targetData=null, bookId=currentBook, chapter=currentChapter}={}) {
    const target = targetData || data;
    target.loadedCommentaries = target.loadedCommentaries || new Set();
    if (!commentaryId || target.loadedCommentaries.has(commentaryId)) return true;
    const entry = commentaryCatalog().find(c => c.id === commentaryId);
    if (!entry) return false;
    const { entries } = await VerboModules.loadCommentary(entry.path, bookId, chapter);
    entries.forEach(e => {
      if (!e.id) return;
      const id = `${commentaryId}::${e.id}`;
      target.notes[id] = { ...(target.notes[id]||{}), title:e.title||'', author:e.author||'', body:e.content||'', commentaryId };
    });
    target.loadedCommentaries.add(commentaryId);
    return true;
  }

  function populateVersions() {
    const all = bibleCatalog();
    const cur = all.find(v => v.id === currentVersion);
    els.versionInput.value = cur?.label || currentVersion || '';
    // Select nativo en móvil
    if (els.nativeVersionSelect) {
      els.nativeVersionSelect.innerHTML = all.map(v =>
        `<option value="${escapeHTML(v.id)}"${v.id===currentVersion?' selected':''}>${escapeHTML(v.label)}</option>`
      ).join('');
    }
  }

  function openVersionDropdown() {
    const all = bibleCatalog(); // mostrar todas las versiones sin filtrar por idioma
    const raw = els.versionInput.value.toLowerCase();
    const list = raw ? all.filter(v => v.label.toLowerCase().includes(raw) || v.full.toLowerCase().includes(raw)) : all;
    els.versionDropdown.innerHTML = list.map(v =>
      `<li class="version-picker__option${v.id===currentVersion?' version-picker__option--active':''}" data-id="${escapeHTML(v.id)}">${escapeHTML(v.label)}<span class="version-picker__option-full">${escapeHTML(v.full)}</span></li>`
    ).join('');
    // En móvil el header tiene overflow:hidden — posicionar con fixed via JS para no ser recortado
    if (window.innerWidth <= 760) {
      const rect = els.versionInput.getBoundingClientRect();
      Object.assign(els.versionDropdown.style, {
        position: 'fixed',
        top: (rect.bottom + 4) + 'px',
        bottom: '',
        left: '8px',
        right: '8px',
        minWidth: 'auto',
        maxHeight: '50vh',
        zIndex: '2100'
      });
    } else {
      els.versionDropdown.style.cssText = '';
    }
    els.versionDropdown.hidden = !list.length;
    els.versionDropdown.querySelectorAll('li').forEach(li => {
      li.addEventListener('mousedown', e => { e.preventDefault(); selectBibleVersion(li.dataset.id); });
      li.addEventListener('touchend', e => { e.preventDefault(); selectBibleVersion(li.dataset.id); });
    });
  }

  function closeVersionDropdown() {
    els.versionDropdown.hidden = true;
    els.versionDropdown.style.cssText = '';
    const cur = bibleCatalog().find(v => v.id === currentVersion);
    els.versionInput.value = cur?.label || currentVersion || '';
    els.versionInput.readOnly = true;
  }

  async function selectBibleVersion(id) {
    const v = activeVerse();
    closeVersionDropdown();
    // Si la versión seleccionada no tiene el libro actual, navegar a su primer libro
    const bibleEntry = catalog.bibles.find(b => b.manifest.id === id);
    if (bibleEntry?.manifest.books?.length) {
      const hasCurrentBook = bibleEntry.manifest.books.some(b => b.id === currentBook);
      if (!hasCurrentBook) {
        currentBook = bibleEntry.manifest.books[0].id;
        currentChapter = 1;
        els.book.value = currentBook;
        refreshChapters().then(() => loadPassage());
        return;
      }
    }
    setLoading(true);
    try {
      await ensureVersionLoaded(id);
      currentVersion = id;
      localStorage.setItem('verbo:lastVersion', currentVersion);
      if (compareVersion === currentVersion) compareVersion = bibleCatalog().find(x => x.id !== currentVersion)?.id || currentVersion;
      populateVersions();
      await populateBooks();
      els.book.value = currentBook;
      renderChapter(v);
      if (activeTab === 'comparar') await renderCompare(v);
      if (activeTab === 'comentario') renderPanel('comentario');
    } catch (error) {
      console.error(error);
      toast(error.message || t('toast.noBibleOnline'));
      populateVersions();
    } finally { setLoading(false); }
  }

  function renderChapter(restoreVerse=null) {
    els.eyebrow.textContent = data.versions[currentVersion]?.full || data.meta.versionFull;
    els.title.textContent = `${data.meta.book} ${data.meta.chapter}`;
    els.list.innerHTML = '';
    data.verses.forEach(v => {
      const row = document.createElement('div'); row.className='verse'; row.dataset.verseN=v.n;
      if (v.n === restoreVerse) row.classList.add('verse--active');
      if (selectedVerses.has(v.n)) row.classList.add('verse--selected');
      const savedHl = highlights[hlKey(currentBook, currentChapter, v.n)];
      if (savedHl) row.classList.add(savedHl);
      const num=document.createElement('span'); num.className='verse__num'; num.textContent=v.n;
      const text=document.createElement('span'); text.className='verse__text'+(v.hasNote?' verse__text--has-note':''); text.tabIndex=0;
      const verseSegments=v.segments?.[currentVersion];
      if(verseSegments?.length){
        verseSegments.forEach((seg,index)=>{
          const word=document.createElement('span'); word.className='word-segment'; word.textContent=(index?' ':'')+(seg.text||'');
          text.appendChild(word);
          const strongCodes=[...(seg.strong?[seg.strong]:[]),...(Array.isArray(seg.strongs)?seg.strongs:[])].filter((code,pos,all)=>code&&all.indexOf(code)===pos);
          strongCodes.forEach((code,codeIndex)=>{ const tag=document.createElement('button'); tag.type='button'; tag.className='strongs-tag'; tag.textContent=code; tag.dataset.strongCode=code; const morphs=[...(seg.morph?[seg.morph]:[]),...(Array.isArray(seg.morphs)?seg.morphs:[])]; tag.title=morphs[codeIndex]?t('biblia.morfologiaTitle',{value:morphs[codeIndex]}):t('biblia.abrirDiccionarioTitle'); text.appendChild(tag); });
        });
      } else text.textContent=v.text[currentVersion] || Object.values(v.text)[0] || '';
      const margin=document.createElement('span'); margin.className='marginalia';
      row.append(num,text);
      row.appendChild(margin); els.list.appendChild(row);
      // Íconos de comentario/biblioteca/padres apostólicos: en vez de flotar
      // encimados sobre el texto del versículo (posición absoluta en el margen,
      // problemática en móvil por traslape con líneas envueltas), viven en la
      // misma fila que las referencias cruzadas, justo después del botón "+N
      // más" — fila que ya vive en flujo normal debajo del texto.
      const indicatorButtons=[];
      if(v.hasNote && (v.commentaries||[]).length){
        const indicator=document.createElement('button');
        indicator.type='button';
        indicator.className='verse__comment-indicator';
        const count=v.commentaries.length;
        indicator.innerHTML=`<span class="verse__comment-indicator__icon" aria-hidden="true">💬</span><span class="verse__comment-indicator__count">${count}</span>`;
        const plural=t(count===1?'biblia.comentarioSingular':'biblia.comentarioPlural');
        indicator.title=t('biblia.comentariosTitle',{count,plural});
        indicator.setAttribute('aria-label',t('biblia.verComentariosAria',{count,plural,ref:`${data.meta.book} ${data.meta.chapter}:${v.n}`}));
        indicator.addEventListener('click',(e)=>{
          e.stopPropagation();
          document.querySelectorAll('.verse--active').forEach(x=>x.classList.remove('verse--active'));
          row.classList.add('verse--active');
          openPanel('comentario', null, v.commentaries);
        });
        indicatorButtons.push(indicator);
      }
      if(v.patristicCount>0){
        const patristicIndicator=document.createElement('button');
        patristicIndicator.type='button';
        patristicIndicator.className='verse__comment-indicator verse__comment-indicator--patristic';
        patristicIndicator.innerHTML=`<span class="verse__comment-indicator__icon" aria-hidden="true">📜</span><span class="verse__comment-indicator__count">${v.patristicCount}</span>`;
        const patristicPlural=t(v.patristicCount===1?'biblia.fragmentoSingular':'biblia.fragmentoPlural');
        patristicIndicator.title=t('biblia.verPadresTitle',{count:v.patristicCount,plural:patristicPlural});
        patristicIndicator.setAttribute('aria-label',t('biblia.verPadresAria',{count:v.patristicCount,plural:patristicPlural,ref:`${data.meta.book} ${data.meta.chapter}:${v.n}`}));
        patristicIndicator.addEventListener('click',(e)=>{
          e.stopPropagation();
          document.querySelectorAll('.verse--active').forEach(x=>x.classList.remove('verse--active'));
          row.classList.add('verse--active');
          patristicMode='verse';
          localStorage.setItem('verbo:patristicMode','verse');
          pendingPatristicSources=(v.patristicSources && v.patristicSources.length) ? v.patristicSources : null;
          openPanel('padres', v.n);
        });
        indicatorButtons.push(patristicIndicator);
      }
      if((v.crossrefs||[]).length || indicatorButtons.length){
        const XREF_LIMIT=5;
        const xrefRow=document.createElement('div'); xrefRow.className='verse__xrefs';
        // Los íconos de comentario/biblioteca/padres van primero, en posición fija:
        // si se agregan DESPUÉS de las referencias, el botón "+N más" los deja
        // atravesados en medio de la fila al expandir (las nuevas chips se agregan
        // al final, detrás de los íconos que ya estaban ahí).
        indicatorButtons.forEach(btn=>xrefRow.appendChild(btn));
        const addChip=ref=>{
          const chip=document.createElement('button');
          chip.type='button'; chip.className='verse__xref-chip'; chip.textContent=ref.label;
          chip.title=t('biblia.verXrefTitle',{ref:ref.label});
          chip.addEventListener('click',(e)=>{ e.stopPropagation(); openCrossref(ref); });
          xrefRow.appendChild(chip);
        };
        (v.crossrefs||[]).slice(0,XREF_LIMIT).forEach(addChip);
        if((v.crossrefs||[]).length>XREF_LIMIT){
          const rest=v.crossrefs.slice(XREF_LIMIT);
          const more=document.createElement('button');
          more.type='button'; more.className='verse__xref-more'; more.textContent=t('biblia.masReferencias',{n:rest.length});
          more.addEventListener('click',(e)=>{
            e.stopPropagation();
            rest.forEach(addChip);
            more.remove();
          });
          xrefRow.appendChild(more);
        }
        els.list.appendChild(xrefRow);
      }
      text.addEventListener('click',()=>{ selectVerse(row,v); });
      text.addEventListener('contextmenu',(e)=>{ e.preventDefault(); selectVerse(row,v); });
      text.querySelectorAll('.strongs-tag').forEach(tag=>tag.addEventListener('click',e=>{e.stopPropagation(); openDictionary(tag.dataset.strongCode);}));
    });
    const version = data.versions[currentVersion];
    if (els.attribution) {
      els.attribution.hidden = !version?.copyright;
      els.attribution.textContent = version?.copyright || '';
    }
    if (version?.fumsToken && !version.fumsReported) {
      window.fums('trackView', version.fumsToken);
      version.fumsReported = true;
    }
  }

  function selectVerse(row, verse) {
    document.querySelectorAll('.verse--active').forEach(x=>x.classList.remove('verse--active'));
    row.classList.add('verse--active');
    if(selectedVerses.has(verse.n)) selectedVerses.delete(verse.n); else selectedVerses.add(verse.n);
    row.classList.toggle('verse--selected', selectedVerses.has(verse.n));
    updateActionBar();
    resetXrefMode();
    const firstNote=verse.commentaries?.find(c=>c.commentaryId===currentCommentary)?.noteIds?.[0]||null;
    if (activeTab === 'comentario') renderPanel('comentario', firstNote);
    if (activeTab === 'comparar') renderCompare(verse.n);
    if (activeTab === 'diccionario') renderPanel('diccionario', verse.n);
    if (activeTab === 'exegesis') renderPanel('exegesis', verse.n);
    if (activeTab === 'padres') renderPanel('padres', verse.n);
  }

  function updateActionBar(){
    if(!els.verseActionBar) return;
    els.verseActionBar.hidden = selectedVerses.size === 0;
  }

  function selectedVerseNumbers(){ return [...selectedVerses].sort((a,b)=>a-b); }

  // En modo sermón, "copiar" debe leer de la Biblia de la pestaña Biblia
  // (sermonBible), no de la Biblia principal, que queda oculta/congelada.
  function activeBibleContext(){
    if(sermonMode && sermonBible?.data) return { data: sermonBible.data, book: sermonBible.book, chapter: sermonBible.chapter, version: sermonBible.version };
    return { data, book: currentBook, chapter: currentChapter, version: currentVersion };
  }

  function copySelectedReferences(){
    const nums=selectedVerseNumbers();
    if(!nums.length) return;
    const ctx=activeBibleContext();
    copyToClipboard(compactRef(ctx.book,ctx.chapter,nums));
  }

  function copySelectedText(){
    const nums=selectedVerseNumbers();
    if(!nums.length) return;
    const ctx=activeBibleContext();
    const lines=nums.map(n=>{
      const verse=ctx.data.verses.find(v=>v.n===n);
      const text=verse?.text?.[ctx.version] || Object.values(verse?.text || {})[0] || '';
      return `${compactRef(ctx.book,ctx.chapter,[n])} ${String(text).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()}`;
    });
    copyToClipboard(lines.join('\n'));
  }

  // Antes solo Comentario/Comparar/Diccionario usaban la hoja parcial (72vh);
  // Biblioteca ya usaba el panel completo y a Juan le pareció que se veía mejor,
  // así que en mobile los tres pasan a comportarse igual que Biblioteca (2026-07-24).
  const SHEET_TABS = [];
  function isMobileSheet(){ return window.innerWidth<=760 && SHEET_TABS.includes(activeTab); }

  function openPanel(tab, focus=null, verseCommentaries=null) {
    const panelWasClosed=!els.side.classList.contains('side-panel--open');
    activeTab=tab;
    if(tab!=='historia') els.side.classList.remove('side-panel--history-expanded');
    const isSheet=window.innerWidth<=760 && SHEET_TABS.includes(tab);
    els.side.classList.toggle('side-panel--left', ['historia','padres','licencias'].includes(tab));
    if(isSheet){
      els.side.dataset.sheet='1';  // CSS aplica translateY(105%) inmediatamente
      els.side.offsetHeight;       // fuerza reflow para que el estado inicial esté fijo
    } else {
      delete els.side.dataset.sheet;
      els.side.style.transform='';
    }
    els.side.classList.add('side-panel--open'); // CSS transiciona a translateY(0) para sheets
    els.backdrop?.classList.toggle('sheet-backdrop--visible', isSheet);
    els.tabs.forEach(b=>b.classList.toggle('tab-rail__btn--active', b.dataset.tab===tab));
    renderPanel(tab,focus,verseCommentaries,panelWasClosed);
  }
  function closePanel(){
    const wasSheet=!!els.side.dataset.sheet;
    activeTab=null;
    // El visor de mapas usa position:fixed (pantalla completa) fuera del flujo
    // del panel: si se cierra el panel sin salir antes del fullscreen, hay que
    // forzar la limpieza aquí o el mapa queda "pegado" cubriendo la pantalla.
    document.getElementById('mapViewer')?.classList.remove('map-viewer--fullscreen');
    document.body.classList.remove('map-viewer-fullscreen-active');
    els.side.classList.remove('side-panel--open','side-panel--left','side-panel--history-expanded'); // CSS: translateY(105%) para sheets
    els.backdrop?.classList.remove('sheet-backdrop--visible');
    els.tabs.forEach(b=>b.classList.remove('tab-rail__btn--active'));
    if(wasSheet){
      // Esperar la animación de bajada (transform) antes de limpiar data-sheet.
      // Se deshabilita la transición de width antes de eliminar el atributo para
      // evitar que el colapso de width sea visible al volver al estado base.
      setTimeout(()=>{
        els.side.style.transition='none';
        delete els.side.dataset.sheet;
        els.side.style.transform='';
        requestAnimationFrame(()=>requestAnimationFrame(()=>{ els.side.style.transition=''; }));
      }, 310);
    } else {
      delete els.side.dataset.sheet;
      els.side.style.transform='';
    }
  }

  // ── Drag-to-dismiss para bottom sheet ────────────────────────────────────────
  let sheetDragY=null;
  els.side.addEventListener('touchstart',e=>{
    if(!isMobileSheet()) return;
    if(els.panelBody.scrollTop>2) return;
    sheetDragY=e.touches[0].clientY;
  },{passive:true});
  els.side.addEventListener('touchmove',e=>{
    if(!isMobileSheet()||sheetDragY===null) return;
    if(els.panelBody.scrollTop>2){ sheetDragY=null; return; }
    const dy=e.touches[0].clientY-sheetDragY;
    if(dy>0){ els.side.style.transform=`translateY(${dy}px)`; e.preventDefault(); }
  },{passive:false});
  els.side.addEventListener('touchend',e=>{
    if(sheetDragY===null) return;
    const dy=e.changedTouches[0].clientY-sheetDragY;
    sheetDragY=null;
    if(dy>110) closePanel(); else els.side.style.transform='';
  });
  els.backdrop?.addEventListener('click',()=>closePanel());
  // ─────────────────────────────────────────────────────────────────────────────

  function renderPanel(tab, focus=null, verseCommentaries=null, delayScroll=false) {
    els.panelToolbar.innerHTML='';
    if(tab==='comentario'){
      // Si el usuario seleccionó un versículo con el panel cerrado, al abrir Comentario
      // usamos ese versículo activo para ubicar el comentario correspondiente.
      // En modo sermón, "activo" es el versículo elegido en la pestaña Biblia (sermonBible),
      // no el de la Biblia principal, que queda oculta/congelada mientras se escribe.
      const commentCtx = commentaryContext();
      if(!focus && !verseCommentaries){
        const selectedVerseNumber = commentCtx.activeVerseN;
        const selectedVerse = commentCtx.data?.verses?.find(v => v.n === selectedVerseNumber);
        const moduleInfo=selectedVerse?.commentaries?.find(c=>c.commentaryId===currentCommentary);
        focus = moduleInfo?.noteIds?.[0] || null;
      }
      els.panelTitle.textContent=t('comentario.title');
      const installed=commentaryCatalog();
      const currentManifest=catalog?.commentaries?.find(c=>c.manifest.id===currentCommentary)?.manifest;
      const commentarySourceLang=currentManifest?.language||null;
      const needsCommentaryTranslation=Boolean(commentarySourceLang) && commentarySourceLang!==contentLang();
      if(installed.length){
        const options=installed.map(c=>`<option value="${c.id}" ${c.id===currentCommentary?'selected':''}>${escapeHTML(c.label)}</option>`).join('');
        els.panelToolbar.innerHTML=`<div class="compare-toolbar"><select class="compare-toolbar__select" id="commentarySelect">${options}</select></div>`;
        document.getElementById('commentarySelect')?.addEventListener('change', async e=>{
          currentCommentary=e.target.value;
          localStorage.setItem('verbo:lastCommentary', currentCommentary);
          const freshCtx = commentaryContext();
          try {
            await ensureCommentaryLoaded(currentCommentary, {
              targetData: freshCtx.data,
              bookId: sermonMode ? sermonBible.book : currentBook,
              chapter: sermonMode ? sermonBible.chapter : currentChapter
            });
          } catch (error) { console.warn(error); }
          const selectedVerse=freshCtx.data?.verses?.find(v=>v.n===freshCtx.activeVerseN);
          const moduleInfo=selectedVerse?.commentaries?.find(c=>c.commentaryId===currentCommentary);
          renderPanel('comentario', moduleInfo?.noteIds?.[0] || null);
        });
      }
      if(verseCommentaries && verseCommentaries.length && !focus){
        const curNote=verseCommentaries.find(c=>c.commentaryId===currentCommentary);
        focus=curNote?.noteIds?.[0]||null;
      }
      const entries=Object.entries(commentCtx.data.notes).filter(([,note])=>note.commentaryId===currentCommentary);
      els.panelBody.innerHTML=entries.length?entries.map(([id,n])=>{
        const cachedTranslation=needsCommentaryTranslation ? tcacheGet(translationCacheKey(id,n.body,contentLang())) : null;
        const cachedTitle=needsCommentaryTranslation ? tcacheGet(translationCacheKey(`${id}:title`,n.title,contentLang())) : null;
        const cachedAuthor=needsCommentaryTranslation ? tcacheGet(translationCacheKey(`${id}:author`,n.author,contentLang())) : null;
        const bodyHtml=needsCommentaryTranslation
          ? `${cachedTranslation||`<p class="note-card__translating">${t('comentario.traduciendo')}</p>`}${originalSourceDetailsHtml(n.body,commentarySourceLang)}`
          : n.body;
        return `<div class="note-card" data-note-id="${id}"><div class="note-card__ref">${commentCtx.data.meta.book} ${commentCtx.data.meta.chapter}</div><div class="note-card__title" data-commentary-header="title"${cachedTitle?` data-translated="${contentLang()}"`:''}>${escapeHTML(cachedTitle||n.title)}</div><div class="note-card__author" data-commentary-header="author"${cachedAuthor?` data-translated="${contentLang()}"`:''}>${escapeHTML(cachedAuthor||n.author)}</div><button class="note-card__copy" type="button" data-copy-note="${id}">${t('comentario.copiarComentario')}</button><div class="note-card__body">${bodyHtml}</div></div>`;
      }).join(''):emptyState('📖',t('comentario.sinComentarios'));
      els.panelBody.querySelectorAll('[data-copy-note]').forEach(btn=>btn.addEventListener('click',()=>{ const note=commentCtx.data.notes[btn.dataset.copyNote]; if(note) copyToClipboard(`${note.title}\n${String(note.body).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()}`); }));
      if(focus){ if(delayScroll) setTimeout(()=>scrollCommentToNote(focus),320); else scrollCommentToNote(focus); }
      if(needsCommentaryTranslation) setTimeout(()=>applyCommentaryTranslation(focus, commentarySourceLang), 150);
    }
    if(tab==='comparar'){
      if(sermonMode){ renderSermonBiblePanel(focus||activeVerse()); }
      else { els.panelTitle.textContent='Comparar versiones'; renderCompare(focus||activeVerse()); }
    }
    if(tab==='diccionario') renderDictionaryPanel(focus || activeVerse());
    if(tab==='historia') renderChurchHistoryPanel();
    if(tab==='padres') renderPadresPanel(focus || activeVerse());
    if(tab==='notas') renderNotes();
    if(tab==='predicas') renderPredicasPanel();
    if(tab==='exegesis') renderExegesis(focus || activeVerse());
    if(tab==='ajustes') renderAjustes();
    if(tab==='mapas') renderMapsPanel();
    if(tab==='licencias') renderLicensesPanel();
    if(tab==='buscar') renderSearch();
  }

  function renderLicensesPanel(){
    els.panelTitle.textContent='Fuentes y licencias';
    els.panelToolbar.innerHTML='';
    els.panelBody.innerHTML=`
      <section class="license-page">
        <div class="license-page__intro">
          <div class="license-page__seal" aria-hidden="true">V</div>
          <div>
            <h2>Verbo: fuentes y licencias</h2>
            <p>Verbo reúne textos bíblicos, datos lingüísticos y recursos de estudio respetando sus condiciones de uso. La integración Strong de esta aplicación fue preparada como una capa técnica propia sobre el texto bíblico.</p>
          </div>
        </div>

        <article class="license-card">
          <h3>King James Version con Strong</h3>
          <p>La versión <strong>KJV+</strong> procede del módulo KJV 3.1 de CrossWire Bible Society e incluye sus números Strong y datos morfológicos originales.</p>
          <p>CrossWire distribuye el módulo bajo GPL y concede una licencia pública general para utilizar el texto y su etiquetado para cualquier propósito.</p>
          <a href="https://wiki.crosswire.org/CrossWire_KJV" target="_blank" rel="noopener noreferrer">Consultar información de CrossWire KJV</a>
        </article>

        <article class="license-card">
          <h3>Biblia Verbo</h3>
          <p>Edición bíblica propia en español contemporáneo, con procedencia histórica en la Reina-Valera 1909 de dominio público. Actualmente se publica sin una capa Strong española.</p>
        </article>

        <article class="license-card">
          <h3>Biblias en línea de API.Bible</h3>
          <p>LBLA, NTV y NASB 2020 se consultan bajo demanda mediante API.Bible. Cada capítulo muestra junto al texto el aviso de copyright devuelto por el proveedor y reporta su visualización mediante FUMS.</p>
          <a href="https://api.bible" target="_blank" rel="noopener noreferrer">Consultar API.Bible</a>
        </article>

        <article class="license-card">
          <h3>Diccionarios Strong</h3>
          <p>Los diccionarios hebreo y griego de James Strong proceden de obras de dominio público. Los módulos base de CrossWire se distribuyen como <strong>Public Domain</strong>.</p>
          <div class="license-card__links">
            <a href="https://www.crosswire.org/sword/modules/ModInfo.jsp?modName=StrongsHebrew" target="_blank" rel="noopener noreferrer">Strong hebreo</a>
            <a href="https://www.crosswire.org/sword/modules/ModInfo.jsp?modName=StrongsGreek" target="_blank" rel="noopener noreferrer">Strong griego</a>
          </div>
        </article>

        <article class="license-card">
          <h3>Mapas bíblicos</h3>
          <p>14 de los 18 mapas del panel "Mapas bíblicos" fueron creados por <strong>churchmaps.info</strong> y publicados en dominio público. Se muestran en la versión recortada y en inglés distribuida por <strong>FreeBibleimages.org</strong> bajo licencia <strong>CC0 1.0 Universal</strong> (Public Domain Dedication).</p>
          <div class="license-card__links">
            <a href="https://churchmaps.info" target="_blank" rel="noopener noreferrer">churchmaps.info</a>
            <a href="https://www.freebibleimages.org/illustrations/church-maps/" target="_blank" rel="noopener noreferrer">FreeBibleimages.org</a>
          </div>
          <p>Los otros 4 mapas (reino dividido, doce tribus, tabernáculo y templo de Herodes) proceden de Wikimedia Commons. El reino dividido, las doce tribus y el tabernáculo están bajo licencia <strong>CC BY-SA 3.0</strong> (atribución visible en el propio visor de cada mapa; las dos primeras ya venían/se tradujeron al español, el tabernáculo se tradujo del diagrama original en polaco). El templo de Herodes es dominio público real, tomado de la <em>Encyclopædia Britannica</em> de 1911.</p>
          <div class="license-card__links">
            <a href="https://commons.wikimedia.org/wiki/File:Kingdoms_of_Israel_and_Judah_map_830-es.svg" target="_blank" rel="noopener noreferrer">Reino dividido (Commons)</a>
            <a href="https://commons.wikimedia.org/wiki/File:12_Tribes_of_Israel_Map.svg" target="_blank" rel="noopener noreferrer">Doce tribus (Commons)</a>
            <a href="https://commons.wikimedia.org/wiki/File:Przybytek_Moj%C5%BCeszowy.svg" target="_blank" rel="noopener noreferrer">Tabernáculo (Commons)</a>
            <a href="https://commons.wikimedia.org/wiki/File:EB1911_Temple_-_Plan_of_Herod%27s_Temple_and_Courts.jpg" target="_blank" rel="noopener noreferrer">Templo de Herodes (Commons)</a>
          </div>
        </article>

        <article class="license-card license-card--notice">
          <h3>Aviso de precisión</h3>
          <p>Los números Strong constituyen una ayuda de estudio y no sustituyen el análisis directo de los textos hebreo y griego. Si se detecta una asociación que necesite corrección, puede informarse al equipo de Verbo.</p>
        </article>

        <p class="license-page__footer">Verbo reconoce y agradece el trabajo de traductores, editores y proyectos bíblicos que hacen posible el estudio responsable de las Escrituras.</p>
      </section>`;
  }

  // ── Translation (EN→ES) ────────────────────────────────────────────────────
  const T_PREFIX = 'verbo:t:';
  function tcacheGet(key){ try{ return JSON.parse(localStorage.getItem(T_PREFIX+key)); }catch{ return null; } }
  function tcacheSet(key,val){ try{ localStorage.setItem(T_PREFIX+key, JSON.stringify(val)); }catch{} }
  // v4: la clave incluye el idioma destino y fuerza regenerar traducciones
  // con preservacion basica de bloques + acceso al original.
  // v3: la clave incluye el idioma destino — antes de agregar traduccion ES->EN
  // (Biblioteca Patristica + comentarios en espanol como Ireneo) solo existia una
  // direccion (EN->ES) y el destino era implicito. Las entradas v2 quedan huerfanas
  // (se regeneran solas), no rompe nada.
  function translationCacheKey(noteId, htmlContent, targetLang='es'){
    let hash=2166136261;
    const value=String(htmlContent||'');
    for(let i=0;i<value.length;i++){
      hash^=value.charCodeAt(i);
      hash=Math.imul(hash,16777619);
    }
    return `v4:${targetLang}:${noteId}:${(hash>>>0).toString(16)}`;
  }
  function htmlToPlainText(html){ return html.replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/\s+/g,' ').trim(); }
  function htmlToTranslationBlocks(html){
    const box=document.createElement('div');
    box.innerHTML=html;
    const nodes=[...box.querySelectorAll('p,li,blockquote,h1,h2,h3,h4,h5,h6')].filter(node=>node.textContent.trim());
    const blocks=nodes.length ? nodes.map(node=>htmlToPlainText(node.innerHTML)) : [htmlToPlainText(html)];
    return blocks.map(block=>block.trim()).filter(block=>block.length>=2);
  }
  function translatedBlocksToHtml(blocks){
    return blocks.map(block=>`<p>${escapeHTML(block)}</p>`).join('');
  }
  function originalSourceDetailsHtml(htmlContent, sourceLang='en'){
    const label=sourceLang==='en'?t('comentario.originalIngles'):t('comentario.textoOriginal');
    return `<details class="note-card__original"><summary>${label}</summary><div class="note-card__original-body">${htmlContent}</div></details>`;
  }
  function splitTextIntoChunks(text, maxLen=4500){
    const chunks=[];
    while(text.length>maxLen){
      let idx=text.lastIndexOf('. ',maxLen);
      if(idx<maxLen/2) idx=text.lastIndexOf(' ',maxLen);
      if(idx<0) idx=maxLen;
      chunks.push(text.slice(0,idx+1).trim());
      text=text.slice(idx+1).trim();
    }
    if(text) chunks.push(text);
    return chunks;
  }

  // Google traduce "Apocalipsis" (ES) literalmente como "Apocalypse" en vez
  // del nombre canónico del libro bíblico en inglés, "Revelation" — corrección
  // puntual aplicada a toda traducción ES→EN (comentarios, diccionario,
  // Padres Apostólicos comparten este mismo punto de entrada).
  const ES_EN_BOOK_NAME_FIXES=[[/\bApocalypse\b/g,'Revelation']];
  function fixKnownBookNameMistranslations(text, targetLang){
    if(targetLang!=='en' || !text) return text;
    return ES_EN_BOOK_NAME_FIXES.reduce((acc,[pattern,replacement])=>acc.replace(pattern,replacement), text);
  }

  async function googleTranslate(text, sourceLang='en', targetLang='es'){
    // El endpoint publico de Google Translate a veces falla o tarda de forma
    // transitoria (visto en Historia de la Iglesia: la misma entrada traduce
    // bien en un intento y falla en el siguiente) — reintenta un par de veces
    // con espera breve antes de rendirse y mostrar el original sin traducir.
    async function fetchTranslateOnce(chunk){
      try{
        const url=`https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(chunk)}`;
        const resp=await fetch(url);
        if(!resp.ok) return null;
        const json=await resp.json();
        if(!Array.isArray(json?.[0])) return null;
        return json[0].map(p=>p?.[0]||'').join('');
      }catch{ return null; }
    }
    async function fetchTranslate(chunk, attempts=3){
      for(let i=0;i<attempts;i++){
        const result=await fetchTranslateOnce(chunk);
        if(result!==null) return result;
        if(i<attempts-1) await new Promise(resolve=>setTimeout(resolve,300*(i+1)));
      }
      return null;
    }
    if(text.length<=4500){
      const result=await fetchTranslate(text);
      return fixKnownBookNameMistranslations(result, targetLang);
    }
    // Long text: translate in chunks sequentially to avoid URL limits
    const chunks=splitTextIntoChunks(text);
    const parts=[];
    for(const chunk of chunks){
      const r=await fetchTranslate(chunk);
      if(r===null) return null;
      parts.push(r);
    }
    return fixKnownBookNameMistranslations(parts.join(' '), targetLang);
  }

  async function translateEntry(noteId, htmlContent, sourceLang='en', targetLang='es'){
    const cacheKey=translationCacheKey(noteId,htmlContent,targetLang);
    const cached=tcacheGet(cacheKey); if(cached) return cached;
    const blocks=htmlToTranslationBlocks(htmlContent);
    const text=blocks.join('\n\n');
    if(!text || text.length<10) return htmlContent;
    try{
      const translatedBlocks=[];
      for(const block of blocks){
        const translated=await googleTranslate(block, sourceLang, targetLang);
        if(!translated) return htmlContent;
        translatedBlocks.push(translated);
      }
      const result=translatedBlocksToHtml(translatedBlocks);
      tcacheSet(cacheKey, result);
      return result;
    }catch{ return htmlContent; }
  }

  async function translateCommentaryHeader(noteId, field, text, sourceLang='en', targetLang='es'){
    if(!text) return text;
    const cacheKey=translationCacheKey(`${noteId}:${field}`,text,targetLang);
    const cached=tcacheGet(cacheKey);
    if(cached) return cached;
    const translated=await googleTranslate(text,sourceLang,targetLang);
    if(!translated) return text;
    tcacheSet(cacheKey,translated);
    return translated;
  }

  async function applyCommentaryTranslation(focusNoteId=null, sourceLang=null){
    const manifest=catalog?.commentaries?.find(c=>c.manifest.id===currentCommentary)?.manifest;
    const source=sourceLang||manifest?.language;
    const target=contentLang();
    if(!source || source===target) return;
    const cards=[...els.panelBody.querySelectorAll('.note-card[data-note-id]')];
    // Translate focused card first for immediate feedback
    const sorted = focusNoteId
      ? [...cards.filter(c=>c.dataset.noteId===focusNoteId), ...cards.filter(c=>c.dataset.noteId!==focusNoteId)]
      : cards;
    for(const card of sorted){
      const noteId=card.dataset.noteId;
      const bodyEl=card.querySelector('.note-card__body');
      if(!bodyEl||bodyEl.dataset.translated===target) continue;
      const note=commentaryContext().data.notes[noteId];
      if(!note) continue;
      for(const field of ['title','author']){
        const headerEl=card.querySelector(`[data-commentary-header="${field}"]`);
        if(!headerEl||headerEl.dataset.translated===target||!note[field]) continue;
        headerEl.dataset.translated='pending';
        const translatedHeader=await translateCommentaryHeader(noteId,field,note[field],source,target);
        if(headerEl.dataset.translated==='pending'){
          headerEl.textContent=translatedHeader;
          headerEl.dataset.translated=target;
        }
      }
      bodyEl.dataset.translated='pending';
      const translated=await translateEntry(noteId, note.body, source, target);
      if(bodyEl.dataset.translated==='pending'){
        const prevTop = noteId===focusNoteId ? card.getBoundingClientRect().top : null;
        bodyEl.innerHTML=`${translated}${originalSourceDetailsHtml(note.body,source)}`;
        bodyEl.dataset.translated=target;
        // Re-anchor scroll to keep focused card in place
        if(prevTop!==null){
          const newTop=card.getBoundingClientRect().top;
          els.panelBody.scrollTop += (newTop - prevTop);
        }
      }
    }
  }

  async function translateDictionaryEntry(code, htmlContent){
    const cacheKey=translationCacheKey(`strong:${code}`,htmlContent);
    const cached=tcacheGet(cacheKey); if(cached) return cached;
    const box=document.createElement('div'); box.innerHTML=htmlContent;
    const paragraphs=[...box.querySelectorAll('.lexicon-section > p')];
    for(const paragraph of paragraphs){
      // Traducir solo el texto fuente. Los enlaces Strong quedan como nodos
      // independientes para que sigan abriendo sus respectivas entradas.
      const textNodes=[];
      const walker=document.createTreeWalker(paragraph,NodeFilter.SHOW_TEXT);
      while(walker.nextNode()) if(walker.currentNode.textContent.trim()) textNodes.push(walker.currentNode);
      for(const node of textNodes){
        const translated=await googleTranslate(node.textContent);
        if(translated) node.textContent=translated;
      }
    }
    const result=`<p class="note-card__translation-note">Traducción automática al español.</p>${box.innerHTML}`;
    tcacheSet(cacheKey,result);
    return result;
  }
  // ─────────────────────────────────────────────────────────────────────────

  function scrollCommentToNote(noteId){
    const card = noteId ? els.panelBody.querySelector(`[data-note-id="${noteId}"]`) : null;
    if(!card) return;
    suppressCommentSync = true;
    const panelRect = els.panelBody.getBoundingClientRect();
    const cardRect  = card.getBoundingClientRect();
    els.panelBody.scrollTop += (cardRect.top - panelRect.top) - 8;
    setTimeout(()=>{ suppressCommentSync=false; }, 400);
  }

  function syncCommentToReading(){
    if(activeTab !== 'comentario' || suppressCommentSync || !data?.verses?.length) return;
    const rows=[...document.querySelectorAll('.verse')];
    const targetLine = window.innerHeight * 0.38;
    let best=null, bestDist=Infinity;
    rows.forEach(row=>{ const rect=row.getBoundingClientRect(); const dist=Math.abs(rect.top-targetLine); if(rect.bottom>90 && rect.top<window.innerHeight && dist<bestDist){ best=row; bestDist=dist; }});
    const n=Number(best?.dataset.verseN);
    if(!n) return;
    const verse=data.verses.find(v=>v.n===n);
    const noteId=verse?.commentaries?.find(c=>c.commentaryId===currentCommentary)?.noteIds?.[0];
    if(noteId) scrollCommentToNote(noteId);
  }

  async function renderCrossrefCompare() {
    const installed=bibleCatalog();
    if(!installed.length){ els.panelToolbar.innerHTML=''; els.panelBody.innerHTML=emptyState('📚','No hay otra Biblia instalada para comparar.'); return; }
    if(!installed.some(v=>v.id===compareVersion)) compareVersion=installed[0].id;
    const {book,chapter,verseStart,verseEnd,label}=xrefTarget;
    if(!xrefData){
      els.panelToolbar.innerHTML='';
      els.panelBody.innerHTML=emptyState('⌛','Cargando referencia cruzada…');
      try { xrefData=await VerboModules.buildChapterData({bookId:book,chapter}); }
      catch(error){ console.error(error); els.panelBody.innerHTML=emptyState('⚠️','No se pudo cargar la referencia cruzada.'); return; }
    }
    const options=installed.map(v=>`<option value="${v.id}" ${v.id===compareVersion?'selected':''}>${escapeHTML(v.label)}${v.id===currentVersion?' (actual)':''}</option>`).join('');
    els.panelToolbar.innerHTML=`<div class="compare-toolbar"><span class="compare-toolbar__label">Referencia cruzada · ${escapeHTML(label)}</span><select class="compare-toolbar__select" id="compareVersionSelect">${options}</select></div>`;
    let verses=xrefData.verses;
    if(!xrefData.versions[compareVersion]){
      els.panelBody.innerHTML=emptyState('⌛','Cargando versión para comparar…');
      const selected=installed.find(v=>v.id===compareVersion);
      if (selected?.remote) {
        try {
          const loaded=await VerboModules.loadRemoteBible(compareVersion,book,chapter);
          xrefData.versions[compareVersion]={label:loaded.manifest.abbreviation,full:loaded.manifest.name,hasStrongs:false,remote:true,copyright:loaded.copyright,fumsToken:loaded.fumsToken};
          xrefData.verses.forEach(v=>{ v.text[compareVersion]=loaded.verses[String(v.n)]||''; });
          verses=xrefData.verses;
        } catch (error) { console.error(error); els.panelBody.innerHTML=emptyState('⚠️',escapeHTML(error.message || 'No se pudo cargar la versión en línea.')); return; }
      } else {
        const loaded=selected ? await VerboModules.loadBible(selected.path,book,chapter) : null;
        if(!loaded){ els.panelBody.innerHTML=emptyState('⚠️','Esta versión no contiene el pasaje referenciado.'); return; }
        verses=xrefData.verses.map(v=>({ ...v, text:{...v.text,[compareVersion]:(typeof loaded.verses[String(v.n)]==='string'?loaded.verses[String(v.n)]:loaded.verses[String(v.n)]?.text)||''} }));
        xrefData.verses=verses;
      }
    }
    els.panelBody.innerHTML=verses.map(v=>`<div class="compare-verse${v.n>=verseStart&&v.n<=(verseEnd||verseStart)?' compare-verse--active':''}" data-verse-n="${v.n}"><span class="compare-verse__num">${v.n}</span><span class="compare-verse__text">${escapeHTML(v.text[compareVersion]||'')}</span></div>`).join('');
    document.getElementById('compareVersionSelect')?.addEventListener('change',async e=>{compareVersion=e.target.value;await renderCrossrefCompare();});
    els.panelBody.querySelector(`[data-verse-n="${verseStart}"]`)?.scrollIntoView({block:'center'});
  }

  async function renderCompare(focus) {
    if(xrefTarget){ await renderCrossrefCompare(); return; }
    const installed=bibleCatalog();
    if(!installed.length){ els.panelToolbar.innerHTML=''; els.panelBody.innerHTML=emptyState('📚','No hay otra Biblia instalada para comparar.'); return; }
    if(!installed.some(v=>v.id===compareVersion)) compareVersion=installed[0].id;
    const options=installed.map(v=>`<option value="${v.id}" ${v.id===compareVersion?'selected':''}>${escapeHTML(v.label)}${v.id===currentVersion?' (actual)':''}</option>`).join('');
    els.panelToolbar.innerHTML=`<div class="compare-toolbar"><span class="compare-toolbar__label">Biblia alterna</span><select class="compare-toolbar__select" id="compareVersionSelect">${options}</select></div>`;
    let verses=data.verses;
    if(!data.versions[compareVersion]){
      els.panelBody.innerHTML=emptyState('⌛','Cargando versión para comparar…');
      const selected=installed.find(v=>v.id===compareVersion);
      if (selected?.remote) {
        try { await ensureVersionLoaded(compareVersion); verses=data.verses; }
        catch (error) { console.error(error); els.panelBody.innerHTML=emptyState('⚠️',escapeHTML(error.message || 'No se pudo cargar la versión en línea.')); return; }
      } else {
        const loaded=selected ? await VerboModules.loadBible(selected.path,currentBook,currentChapter) : null;
        if(!loaded){ els.panelBody.innerHTML=emptyState('⚠️','Esta versión no contiene el pasaje seleccionado.'); return; }
        verses=data.verses.map(v=>({ ...v, text:{...v.text,[compareVersion]:(typeof loaded.verses[String(v.n)]==='string'?loaded.verses[String(v.n)]:loaded.verses[String(v.n)]?.text)||''} }));
      }
    }
    els.panelBody.innerHTML=verses.map(v=>`<div class="compare-verse${v.n===focus?' compare-verse--active':''}" data-verse-n="${v.n}"><span class="compare-verse__num">${v.n}</span><span class="compare-verse__text">${escapeHTML(v.text[compareVersion]||'')}</span></div>`).join('');
    document.getElementById('compareVersionSelect')?.addEventListener('change',async e=>{compareVersion=e.target.value;await renderCompare(activeVerse());});
    if(focus) els.panelBody.querySelector(`[data-verse-n="${focus}"]`)?.scrollIntoView({block:'center'});
  }

  function openCrossref(ref){
    xrefTarget=ref; xrefData=null;
    openPanel('comparar');
  }

  // ── Modo Preparación de Bosquejo/Estudio ───────────────────────────────────

  function updateBibleTabForSermonMode(active){
    document.querySelectorAll('[data-tab="comparar"]').forEach(btn=>{
      const label = active ? 'Biblia' : 'Comparar versiones';
      btn.title = label;
      btn.setAttribute('aria-label', label);
      const mobileLabel = btn.querySelector('.mobile-tool-label');
      if(mobileLabel) mobileLabel.textContent = active ? 'Biblia' : 'Comparar';
    });
  }

  async function toggleSermonMode(){
    sermonMode = !sermonMode;
    selectedVerses.clear();
    document.querySelectorAll('.verse--selected').forEach(x=>x.classList.remove('verse--selected'));
    updateActionBar();
    els.sermonToggle?.classList.toggle('sermon-mode-toggle--active', sermonMode);
    els.sermonToggle?.setAttribute('aria-pressed', String(sermonMode));
    document.body.classList.toggle('sermon-mode', sermonMode);
    if(els.readingPane) els.readingPane.hidden = sermonMode;
    if(els.editorPane) els.editorPane.hidden = !sermonMode;
    updateBibleTabForSermonMode(sermonMode);
    if(sermonMode) await initSermonEditor();
    if(data) renderChapter(activeVerse());
    if(activeTab) renderPanel(activeTab);
  }

  els.sermonToggle?.addEventListener('click', toggleSermonMode);

  // ── Editor de texto (TinyMCE autoalojado, cargado vía CDN) ─────────────────

  // El toolbar de TinyMCE puede envolverse en varias filas según el ancho
  // disponible; medimos su alto real para que la barra de Guardar/Exportar
  // (sticky) se pegue justo debajo sin taparlo ni dejar hueco.
  if(els.editorToolbar && els.editorPane){
    const syncToolbarHeight = ()=>{
      els.editorPane.style.setProperty('--editor-toolbar-h', els.editorToolbar.offsetHeight + 'px');
    };
    new ResizeObserver(syncToolbarHeight).observe(els.editorToolbar);
    syncToolbarHeight();
  }

  function loadScriptOnce(src){
    return new Promise((resolve,reject)=>{
      const existing=document.querySelector(`script[data-src="${src}"]`);
      if(existing){ existing.addEventListener('load',()=>resolve()); existing.addEventListener('error',()=>reject(new Error('No se pudo cargar '+src))); return; }
      const script=document.createElement('script');
      script.src=src; script.async=true; script.dataset.src=src;
      script.addEventListener('load',()=>resolve());
      script.addEventListener('error',()=>reject(new Error('No se pudo cargar '+src)));
      document.head.appendChild(script);
    });
  }

  async function initSermonEditor(){
    if(sermonEditor) return sermonEditor;
    if(!els.editorSurface) return null;
    try{
      const editorLang = window.VerboI18n?.getUiLang() === 'es' ? 'es' : 'en';
      if(!window.tinymce) await loadScriptOnce('https://cdn.jsdelivr.net/npm/tinymce@7.9.3/tinymce.min.js');
      if(editorLang === 'es') await loadScriptOnce('https://cdn.jsdelivr.net/npm/tinymce-i18n@26.7.13/langs7/es.js');
      await new Promise((resolve,reject)=>{
        window.tinymce.init({
          target: els.editorSurface,
          inline: true,
          license_key: 'gpl',
          language: editorLang === 'es' ? 'es' : undefined,
          menubar: false,
          statusbar: false,
          branding: false,
          promotion: false,
          plugins: 'lists link table',
          toolbar: 'undo redo | blocks fontfamily fontsize | bold italic underline strikethrough | forecolor backcolor | align | bullist numlist outdent indent | link table removeformat',
          toolbar_mode: 'wrap',
          fixed_toolbar_container_target: els.editorToolbar,
          toolbar_persist: true,
          // Menú propio de clic derecho desactivado: sin esto, TinyMCE lo reemplaza
          // por uno reducido (solo "Link..." del plugin de enlaces) sin Cortar/Copiar/
          // Pegar. Con contextmenu:false se usa el menú nativo del navegador.
          contextmenu: false,
          init_instance_callback: editor=>{
            sermonEditor=editor;
            if(sermonEditorContent) editor.setContent(sermonEditorContent);
            editor.on('input change undo redo', ()=>{ sermonEditorContent=editor.getContent(); });
            resolve();
          }
        });
      });
    }catch(error){
      console.error('No se pudo cargar el editor de texto', error);
      els.editorSurface.innerHTML = emptyState('⚠️','No se pudo cargar el editor de texto. Verifica tu conexión a internet.');
    }
    return sermonEditor;
  }

  // ── Exportar el bosquejo (Word y PDF, sin backend ni librerías nuevas) ─────

  function sermonDocTitle(){
    const h1 = sermonEditor?.getBody()?.querySelector('h1');
    return h1?.textContent?.trim() || 'Bosquejo';
  }

  function sermonFileSlug(title){
    return title.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\w]+/g,'_').replace(/^_+|_+$/g,'') || 'bosquejo';
  }

  function exportSermonToWord(){
    if(!sermonEditor) return;
    const title = sermonDocTitle();
    const html = `<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${escapeHTML(title)}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:DoNotOptimizeForBrowser/></w:WordDocument></xml><![endif]-->
<style>body{font-family:Calibri,Arial,sans-serif;font-size:12pt;} h1{font-size:22pt;} h2{font-size:16pt;} table,td,th{border:1px solid #999;border-collapse:collapse;padding:4px;}</style>
</head><body>${sermonEditor.getContent()}</body></html>`;
    const blob = new Blob(['﻿', html], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sermonFileSlug(title)}.doc`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 1000);
  }

  function exportSermonToPDF(){
    if(!sermonEditor) return;
    const previousTitle = document.title;
    document.title = sermonDocTitle();
    document.body.classList.add('sermon-print-mode');
    const cleanup = ()=>{
      document.body.classList.remove('sermon-print-mode');
      document.title = previousTitle;
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    window.print();
  }

  els.editorPane?.querySelector('#exportWordBtn')?.addEventListener('click', exportSermonToWord);
  els.editorPane?.querySelector('#exportPdfBtn')?.addEventListener('click', exportSermonToPDF);

  // ── Guardar (persistencia real de la prédica: local + push inmediato) ─────
  // Única vía de guardado hoy: no hay autoguardado por inactividad ni botón
  // "Salir" todavía (confirmado con Juan 2026-08-01) — mientras tanto, si el
  // pastor recarga sin haber tocado "Guardar", el contenido en el editor se
  // pierde (sermonEditorContent es solo memoria volátil).
  function setSermonSaveBtnState(state){
    const btn = document.getElementById('guardarSermonBtn');
    if(!btn) return;
    const labels = { idle:'Guardar', saving:'Guardando…', syncing:'Sincronizando…', saved:'Guardado ✓' };
    btn.textContent = labels[state] || labels.idle;
    btn.disabled = state==='saving' || state==='syncing';
  }
  async function handleSaveSermon(){
    const btn = document.getElementById('guardarSermonBtn');
    if(!sermonEditor || btn?.disabled) return;
    setSermonSaveBtnState('saving');
    try{
      const contenido = sermonEditor.getContent();
      const tituloInput = document.getElementById('predicaTituloInput');
      const saved = VerboBackup.savePredica({ id: currentPredicaId, titulo: tituloInput?.value || '', contenido, pasaje_base: '' });
      currentPredicaId = saved.id;
      if(tituloInput && !tituloInput.value) tituloInput.value = saved.titulo;
      if(window.VerboSync?.isLinked?.()){
        const result = await VerboSync.forcePush().catch(error=>{ console.warn('[sermon] no se pudo forzar la sincronización', error); return { synced:false, reason:'error' }; });
        if(result?.reason === 'pending-initial-pull'){
          setSermonSaveBtnState('syncing');
          await new Promise(resolve=>setTimeout(resolve, 900));
        }
      }
    } finally {
      setSermonSaveBtnState('saved');
      setTimeout(()=>setSermonSaveBtnState('idle'), 1500);
      if(activeTab==='predicas') renderPredicasPanel();
    }
  }
  els.editorPane?.querySelector('#guardarSermonBtn')?.addEventListener('click', handleSaveSermon);

  // ── Panel "Mis prédicas" (guardar/abrir/eliminar, modo sermón) ─────────────

  function newPredica(){
    if(!sermonEditor) return;
    currentPredicaId = null;
    sermonEditorContent = '';
    sermonEditor.setContent('');
    const tituloInput = document.getElementById('predicaTituloInput');
    if(tituloInput) tituloInput.value = '';
    closePanel();
  }

  function openPredica(id){
    const p = VerboBackup.getPredica(id);
    if(!p || !sermonEditor) return;
    currentPredicaId = p.id;
    sermonEditorContent = p.contenido || '';
    sermonEditor.setContent(sermonEditorContent);
    const tituloInput = document.getElementById('predicaTituloInput');
    if(tituloInput) tituloInput.value = p.titulo || '';
    closePanel();
  }

  function deletePredicaWithConfirm(id){
    const p = VerboBackup.getPredica(id);
    if(!p) return;
    if(!window.confirm(t('predicas.eliminarConfirm'))) return;
    VerboBackup.deletePredica(id);
    if(currentPredicaId === id) currentPredicaId = null;
    renderPredicasPanel();
  }

  function renderPredicasPanel(){
    els.panelTitle.textContent = t('predicas.title');
    const list = VerboBackup.getPredicas();
    const locale = window.VerboI18n?.getUiLang() === 'en' ? 'en-US' : 'es-ES';
    const fmtDate = (iso) => { try{ return iso ? new Date(iso).toLocaleDateString(locale, {day:'numeric',month:'short',year:'numeric'}) : ''; } catch { return ''; } };
    els.panelBody.innerHTML = `
      <button type="button" class="predicas-panel__new" id="predicasNewBtn">${t('predicas.nuevaBtn')}</button>
      ${list.length ? list.map(p=>`
        <div class="predicas-list__item" data-predica-id="${p.id}">
          <div class="predicas-list__info">
            <p class="predicas-list__title">${escapeHTML(p.titulo || '')}</p>
            <span class="predicas-list__date">${fmtDate(p.fecha_edicion)}</span>
          </div>
          <div class="predicas-list__actions">
            <button type="button" class="predicas-list__btn" data-open-predica="${p.id}">${t('predicas.abrirBtn')}</button>
            <button type="button" class="predicas-list__btn predicas-list__btn--danger" data-delete-predica="${p.id}">${t('predicas.eliminarBtn')}</button>
          </div>
        </div>`).join('') : emptyState('📝', t('predicas.vacio'))}
    `;
    document.getElementById('predicasNewBtn')?.addEventListener('click', newPredica);
    els.panelBody.querySelectorAll('[data-open-predica]').forEach(btn=>btn.addEventListener('click', ()=>openPredica(btn.dataset.openPredica)));
    els.panelBody.querySelectorAll('[data-delete-predica]').forEach(btn=>btn.addEventListener('click', ()=>deletePredicaWithConfirm(btn.dataset.deletePredica)));
  }

  // ── Panel lateral "Biblia" del modo sermón (con historial de referencias) ──

  function initSermonBibleState(){
    if(sermonBible) return;
    sermonBible = { book:currentBook, chapter:currentChapter, version:currentVersion, chapterCount:null, data:null, history:[], future:[], activeVerse:null };
  }

  // En modo sermón, Comentario debe seguir el libro/capítulo/versículo de la pestaña
  // Biblia (sermonBible), no el de la Biblia principal (que queda oculta/congelada).
  function commentaryContext(){
    if(sermonMode && sermonBible?.data) return { data: sermonBible.data, activeVerseN: sermonBible.activeVerse };
    return { data, activeVerseN: activeVerse() };
  }

  async function sermonRefreshChapterCount(){
    const info = await VerboModules.getBookInfo(sermonBible.book);
    sermonBible.chapterCount = info.chapterCount;
    if(sermonBible.chapter > info.chapterCount) sermonBible.chapter = info.chapterCount;
  }

  async function loadSermonBibleData(){
    sermonBible.data = await VerboModules.buildChapterData({bookId: sermonBible.book, chapter: sermonBible.chapter, bibleId: sermonBible.version, commentaryId: currentCommentary});
    if(!sermonBible.data.versions[sermonBible.version]){
      try{ await ensureVersionLoaded(sermonBible.version, {targetData: sermonBible.data, bookId: sermonBible.book, chapter: sermonBible.chapter}); }
      catch(error){ console.warn(error); sermonBible.version = sermonBible.data.meta.version; }
    }
  }

  function sermonBibleToolbarHtml(){
    const books = catalog.books.map(b=>`<option value="${b.id}" ${b.id===sermonBible.book?'selected':''}>${escapeHTML(b.name)}</option>`).join('');
    const chapters = Array.from({length: sermonBible.chapterCount||1}, (_,i)=>`<option value="${i+1}" ${i+1===sermonBible.chapter?'selected':''}>${i+1}</option>`).join('');
    const versions = bibleCatalog().map(v=>`<option value="${v.id}" ${v.id===sermonBible.version?'selected':''}>${escapeHTML(v.label)}</option>`).join('');
    return `<div class="sermon-bible-toolbar">
      <select class="sermon-bible-toolbar__select" id="sermonBookSelect" aria-label="Libro">${books}</select>
      <select class="sermon-bible-toolbar__select" id="sermonChapterSelect" aria-label="Capítulo">${chapters}</select>
      <select class="sermon-bible-toolbar__select" id="sermonVersionSelect" aria-label="Versión">${versions}</select>
      <div class="sermon-bible-toolbar__nav">
        <button type="button" class="sermon-bible-toolbar__navbtn" id="sermonBibleBack" title="Atrás" ${sermonBible.history.length?'':'disabled'}>‹</button>
        <button type="button" class="sermon-bible-toolbar__navbtn" id="sermonBibleForward" title="Adelante" ${sermonBible.future.length?'':'disabled'}>›</button>
      </div>
    </div>`;
  }

  function wireSermonBibleToolbar(){
    document.getElementById('sermonBookSelect')?.addEventListener('change', async e=>{
      sermonBible.book=e.target.value; sermonBible.chapter=1; sermonBible.chapterCount=null; sermonBible.activeVerse=null;
      await renderSermonBiblePanel();
    });
    document.getElementById('sermonChapterSelect')?.addEventListener('change', async e=>{
      sermonBible.chapter=Number(e.target.value); sermonBible.activeVerse=null;
      await renderSermonBiblePanel();
    });
    document.getElementById('sermonVersionSelect')?.addEventListener('change', async e=>{
      sermonBible.version=e.target.value;
      await loadSermonBibleData();
      els.panelToolbar.innerHTML=sermonBibleToolbarHtml();
      wireSermonBibleToolbar();
      renderSermonBibleVerses();
    });
    document.getElementById('sermonBibleBack')?.addEventListener('click', sermonGoBack);
    document.getElementById('sermonBibleForward')?.addEventListener('click', sermonGoForward);
  }

  async function renderSermonBiblePanel(focusVerse=null){
    els.panelTitle.textContent='Biblia';
    initSermonBibleState();
    // Se recalcula SIEMPRE que haga falta (no solo cuando cambia de capítulo):
    // una referencia cruzada al mismo capítulo pone chapterCount en null sin
    // que needsLoad se active, y si esto quedara adentro del "if(needsLoad)"
    // el selector de capítulo del toolbar se queda con un solo option falso.
    if(sermonBible.chapterCount==null || sermonBible.data?.meta?.bookId!==sermonBible.book) await sermonRefreshChapterCount();
    const needsLoad = !sermonBible.data || sermonBible.data.meta.bookId!==sermonBible.book || sermonBible.data.meta.chapter!==sermonBible.chapter;
    if(needsLoad){
      selectedVerses.clear();
      updateActionBar();
      els.panelToolbar.innerHTML=sermonBibleToolbarHtml();
      wireSermonBibleToolbar();
      els.panelBody.innerHTML=emptyState('⌛','Cargando pasaje…');
      await loadSermonBibleData();
    }
    els.panelToolbar.innerHTML=sermonBibleToolbarHtml();
    wireSermonBibleToolbar();
    renderSermonBibleVerses(focusVerse);
  }

  function renderSermonBibleVerses(focusVerse=null){
    const version = sermonBible.version;
    if(focusVerse) sermonBible.activeVerse = focusVerse;
    const container = document.createElement('div');
    container.className = 'sermon-bible-verses';
    sermonBible.data.verses.forEach(v=>{
      const row=document.createElement('div'); row.className='verse'; row.dataset.verseN=v.n;
      if(v.n===focusVerse) row.classList.add('verse--active');
      const num=document.createElement('span'); num.className='verse__num'; num.textContent=v.n;
      const text=document.createElement('span'); text.className='verse__text'; text.tabIndex=0;
      const segments=v.segments?.[version];
      if(segments?.length){
        segments.forEach((seg,index)=>{
          const word=document.createElement('span'); word.className='word-segment'; word.textContent=(index?' ':'')+(seg.text||'');
          text.appendChild(word);
          const codes=[...(seg.strong?[seg.strong]:[]),...(Array.isArray(seg.strongs)?seg.strongs:[])].filter((c,p,all)=>c&&all.indexOf(c)===p);
          codes.forEach(code=>{ const tag=document.createElement('button'); tag.type='button'; tag.className='strongs-tag'; tag.textContent=code; tag.dataset.strongCode=code; text.appendChild(tag); });
        });
      } else text.textContent = v.text[version] || Object.values(v.text)[0] || '';
      row.append(num,text);
      container.appendChild(row);
      text.querySelectorAll('.strongs-tag').forEach(tag=>tag.addEventListener('click',e=>{ e.stopPropagation(); openDictionary(tag.dataset.strongCode); }));
      if((v.crossrefs||[]).length){
        const xrefRow=document.createElement('div'); xrefRow.className='verse__xrefs';
        v.crossrefs.slice(0,10).forEach(ref=>{
          const chip=document.createElement('button');
          chip.type='button'; chip.className='verse__xref-chip'; chip.textContent=ref.label;
          chip.title=`Ver referencia cruzada: ${ref.label}`;
          chip.addEventListener('click',(e)=>{ e.stopPropagation(); sermonNavigateToXref(ref); });
          xrefRow.appendChild(chip);
        });
        container.appendChild(xrefRow);
      }
      text.addEventListener('click',()=>{
        document.querySelectorAll('.sermon-bible-verses .verse--active').forEach(x=>x.classList.remove('verse--active'));
        row.classList.add('verse--active');
        sermonBible.activeVerse = v.n;
        if(selectedVerses.has(v.n)) selectedVerses.delete(v.n); else selectedVerses.add(v.n);
        row.classList.toggle('verse--selected', selectedVerses.has(v.n));
        updateActionBar();
      });
    });
    els.panelBody.innerHTML='';
    els.panelBody.appendChild(container);
    if(focusVerse) container.querySelector(`[data-verse-n="${focusVerse}"]`)?.scrollIntoView({block:'center'});
  }

  // Guarda también el versículo activo de origen (no solo libro/capítulo/versión):
  // una referencia cruzada frecuentemente apunta al MISMO capítulo (ej. Mt 18:21→Mt
  // 18:15) — sin el versículo, "volver" no tenía nada que restaurar y parecía no
  // responder aunque el historial sí se movía internamente.
  function sermonPushHistory(){
    sermonBible.history.push({book:sermonBible.book, chapter:sermonBible.chapter, version:sermonBible.version, verse:sermonBible.activeVerse});
    if(sermonBible.history.length>10) sermonBible.history.shift();
    sermonBible.future=[];
  }

  async function sermonNavigateToXref(ref){
    sermonPushHistory();
    sermonBible.book=ref.book; sermonBible.chapter=ref.chapter; sermonBible.chapterCount=null;
    await renderSermonBiblePanel(ref.verseStart);
  }

  async function sermonGoBack(){
    if(!sermonBible.history.length) return;
    sermonBible.future.push({book:sermonBible.book, chapter:sermonBible.chapter, version:sermonBible.version, verse:sermonBible.activeVerse});
    if(sermonBible.future.length>10) sermonBible.future.shift();
    const prev=sermonBible.history.pop();
    sermonBible.book=prev.book; sermonBible.chapter=prev.chapter; sermonBible.version=prev.version;
    sermonBible.chapterCount=null; sermonBible.activeVerse=null;
    await renderSermonBiblePanel(prev.verse);
  }

  async function sermonGoForward(){
    if(!sermonBible.future.length) return;
    sermonBible.history.push({book:sermonBible.book, chapter:sermonBible.chapter, version:sermonBible.version, verse:sermonBible.activeVerse});
    if(sermonBible.history.length>10) sermonBible.history.shift();
    const next=sermonBible.future.pop();
    sermonBible.book=next.book; sermonBible.chapter=next.chapter; sermonBible.version=next.version;
    sermonBible.chapterCount=null; sermonBible.activeVerse=null;
    await renderSermonBiblePanel(next.verse);
  }

  async function openSearchResult(r, versionId){
    currentBook=r.bookId; currentChapter=r.chapter; currentVersion=versionId;
    els.book.value=currentBook; await refreshChapters(); els.chapter.value=String(currentChapter); await loadPassage();
    openPanel('buscar');
    const row=document.querySelector(`[data-verse-n="${r.verse}"]`);
    if(row){ document.querySelectorAll('.verse--active').forEach(x=>x.classList.remove('verse--active')); row.classList.add('verse--active'); row.scrollIntoView({behavior:'smooth',block:'center'}); }
  }

  function renderSavedSearchResults(){
    if(!searchState?.results?.length) return;
    const {results, versionId, scopeLabel, semantic}=searchState;
    const pageSize=semantic ? 30 : 100;
    let page=searchState.page || 0;
    const totalPages=Math.ceil(results.length/pageSize);
    const start=page*pageSize;
    const end=Math.min(start+pageSize,results.length);
    const visible=results.slice(start,end);
    els.panelBody.innerHTML=`
      <div class="search-summary">
        <strong>${t('busqueda.resultadosCount',{count:results.length})}</strong>
        <span>${t('busqueda.mostrando',{scope:escapeHTML(scopeLabel),start:start+1,end})}</span>
      </div>
      <div class="search-results-list">
        ${visible.map((r,i)=>`<button class="search-result" type="button" data-result="${start+i}"><span class="search-result__ref">${escapeHTML(r.book)} ${r.chapter}:${r.verse}${r.verseEnd && r.verseEnd!==r.verse ? `-${r.verseEnd}` : ''}${semantic ? ` · ${(r.score*100).toFixed(1)}%` : ''}</span><span class="search-result__text">${escapeHTML(r.text)}</span></button>`).join('')}
      </div>
      <nav class="search-pagination" aria-label="${t('busqueda.paginasAria')}">
        <button class="search-page-button" id="searchPrevPage" type="button" ${page===0?'disabled':''}>${t('busqueda.anterior')}</button>
        <span class="search-page-status">${t('busqueda.paginaEstado',{page:page+1,total:totalPages})}</span>
        <button class="search-page-button" id="searchNextPage" type="button" ${page>=totalPages-1?'disabled':''}>${t('busqueda.siguiente')}</button>
      </nav>`;
    els.panelBody.querySelectorAll('.search-result').forEach(btn=>btn.addEventListener('click',()=>openSearchResult(results[Number(btn.dataset.result)], versionId)));
    document.getElementById('searchPrevPage')?.addEventListener('click',()=>{ if(page>0){ searchState.page=page-1; renderSavedSearchResults(); els.panelBody.scrollTop=0;} });
    document.getElementById('searchNextPage')?.addEventListener('click',()=>{ if(page<totalPages-1){ searchState.page=page+1; renderSavedSearchResults(); els.panelBody.scrollTop=0;} });
  }

  function renderSearch(){
    els.panelTitle.textContent=t('busqueda.title');
    // "Perícopas" (bloques de ~6 versículos) es el modo por defecto porque el
    // modelo de embeddings da una similitud mucho más confiable a bloques con
    // contexto que a versículos sueltos muy cortos, que suelen quedar mal
    // rankeados (ver evaluación con "chisme": el versículo correcto quedaba
    // en el puesto ~9500/31000, pero la perícopa correcta en el puesto ~400/5700).
    const saved = searchState || { query:'', versionId:'rv-verbo', indexType:'pericopes', results:[], page:0, scopeLabel:t('busqueda.scopeInicial'), semantic:true };
    els.panelToolbar.innerHTML=`<form class="search-panel-form" id="searchForm">
      <input id="searchInput" class="search-panel-input" type="search" minlength="2" placeholder="${t('busqueda.placeholder')}" autocomplete="off" value="${escapeHTML(saved.query)}">
      <select id="searchIndexType" class="search-panel-select" aria-label="${t('busqueda.tipoIndiceAria')}">
        <option value="pericopes" ${saved.indexType!=='verses'?'selected':''}>${t('busqueda.bloques')}</option>
        <option value="verses" ${saved.indexType==='verses'?'selected':''}>${t('busqueda.versiculoIndividual')}</option>
      </select>
      <button class="search-panel-button" type="submit">${t('busqueda.boton')}</button>
    </form>`;
    els.panelBody.innerHTML=emptyState('⌕',t('busqueda.intro'));

    const form=document.getElementById('searchForm');
    const input=document.getElementById('searchInput');
    const indexTypeSelect=document.getElementById('searchIndexType');

    const clearWhenChanged=()=>{
      const q=input.value.trim();
      const indexType=indexTypeSelect.value;
      if(searchState && (q!==searchState.query || indexType!==searchState.indexType)){
        searchState=null;
        els.panelBody.innerHTML=q.length?emptyState('⌕',t('busqueda.pulsaBuscar')):emptyState('⌕',t('busqueda.minCaracteres'));
      }
    };

    input?.addEventListener('input', clearWhenChanged);
    indexTypeSelect?.addEventListener('change', clearWhenChanged);

    if(searchState?.results?.length) renderSavedSearchResults();
    setTimeout(()=>input?.focus(),0);

    form?.addEventListener('submit',async e=>{
      e.preventDefault();
      const query=input.value.trim();
      const versionId='rv-verbo';
      const indexType=indexTypeSelect.value === 'pericopes' ? 'pericopes' : 'verses';
      if(query.length<2){ searchState=null; els.panelBody.innerHTML=emptyState('⌕',t('busqueda.minCaracteres')); return; }
      els.panelBody.innerHTML=emptyState('⌛',t('busqueda.preparando'));
      try{
        const stageText={index:t('busqueda.stageIndex'),model:t('busqueda.stageModel'),embedding:t('busqueda.stageEmbedding'),ranking:t('busqueda.stageRanking')};
        const results=await VerboModules.searchSemanticBible(query,{
          indexType,
          limit:90,
          onProgress:p=>{els.panelBody.innerHTML=emptyState('⌛',stageText[p.stage] || t('busqueda.buscando'));}
        });
        const scopeLabel=t('busqueda.scopeDinamica',{tipo:t(indexType==='pericopes'?'busqueda.tipoPericopas':'busqueda.tipoVersiculos')});
        searchState={query, versionId, indexType, results, page:0, scopeLabel, semantic:true};
        if(!results.length){ els.panelBody.innerHTML=emptyState('🔎',t('busqueda.sinResultados',{query:escapeHTML(query)})); return; }
        renderSavedSearchResults();
      }catch(error){ console.error(error); els.panelBody.innerHTML=emptyState('⚠️',t('busqueda.errorBusqueda')); }
    });
  }

  function applyTheme(themeId){
    const safeTheme = themes.some(t => t.id === themeId) ? themeId : 'paper';
    document.body.dataset.theme = safeTheme;
    localStorage.setItem('verbo:theme', safeTheme);
  }

  let syncPending = false;
  let syncBusy = false;

  function renderSyncSection(){
    if (!window.VerboSync) {
      return `<div class="ajustes-section">
        <h3>${t('ajustes.syncTitle')}</h3>
        <p>${t('ajustes.syncDescripcion')}</p>
      </div>`;
    }
    if (VerboSync.isLinked()) {
      return `<div class="ajustes-section">
        <h3>${t('ajustes.syncTitle')}</h3>
        <p>${t('ajustes.syncLinkedMsg',{email:escapeHTML(VerboSync.getEmailMasked())})}</p>
        <button class="ajustes-backup-btn" type="button" id="ajustesUnlinkBtn">${t('ajustes.syncUnlinkBtn')}</button>
      </div>`;
    }
    return `<div class="ajustes-section">
      <h3>${t('ajustes.syncTitle')}</h3>
      <p>${t('ajustes.syncDescripcion')}</p>
      <form class="ajustes-sync-form" id="ajustesSyncForm">
        <input class="ajustes-sync-form__input" type="email" id="ajustesSyncEmail" placeholder="${t('ajustes.syncPlaceholder')}" required ${syncBusy?'disabled':''}>
        <button class="ajustes-sync-form__btn" type="submit" ${syncBusy?'disabled':''}>${t('ajustes.syncBtn')}</button>
      </form>
      ${syncPending?`<p class="ajustes-sync-pending">${t('ajustes.syncPendingMsg')}</p>`:''}
    </div>`;
  }

  function renderAjustes(){
    els.panelTitle.textContent=t('ajustes.titulo');
    els.panelToolbar.innerHTML='';
    const currentTheme = document.body.dataset.theme || 'paper';
    els.panelBody.innerHTML=`
      <section class="ajustes-panel">
        ${renderSyncSection()}
        <div class="ajustes-section">
          <h3>Tema</h3>
          <p>Elige un tono claro para descansar mejor la vista. Se guardará solo en este dispositivo.</p>
          <div class="theme-options">
            ${themes.map(th=>`<button class="theme-option${th.id===currentTheme?' theme-option--active':''}" type="button" data-theme="${th.id}">
              <span class="theme-option__sample" style="background:${th.sample}"></span>
              <span class="theme-option__label">${escapeHTML(th.label)}</span>
            </button>`).join('')}
          </div>
        </div>
        <div class="ajustes-section">
          <h3>Exportar / Importar datos</h3>
          <p>Descarga un archivo con tus notas, resaltados y marcadores, o restáuralos en otro dispositivo.</p>
          <div class="ajustes-backup-actions">
            <button class="ajustes-backup-btn" type="button" id="ajustesExportBtn">Exportar mis datos</button>
            <button class="ajustes-backup-btn" type="button" id="ajustesImportBtn">Importar mis datos</button>
            <input type="file" id="ajustesImportInput" accept="application/json" hidden>
          </div>
        </div>
      </section>`;
    els.panelBody.querySelectorAll('.theme-option').forEach(btn=>btn.addEventListener('click',()=>{
      applyTheme(btn.dataset.theme);
      renderAjustes();
    }));
    document.getElementById('ajustesExportBtn')?.addEventListener('click', ()=>{
      VerboBackup.exportDownload();
      toast(t('toast.descargando'));
    });
    const importInput=document.getElementById('ajustesImportInput');
    document.getElementById('ajustesImportBtn')?.addEventListener('click', ()=> importInput?.click());
    importInput?.addEventListener('change', async ()=>{
      const file=importInput.files?.[0];
      if(!file) return;
      try{ await VerboBackup.importFromFile(file); toast(t('toast.datosImportados')); setTimeout(()=>location.reload(), 900); }
      catch(error){ console.error(error); toast(t('toast.noImportar')); }
      importInput.value='';
    });
    document.getElementById('ajustesSyncForm')?.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const email=document.getElementById('ajustesSyncEmail')?.value.trim();
      if(!email || syncBusy) return;
      syncBusy=true; renderAjustes();
      try{ await VerboSync.requestLink(email); syncPending=true; }
      catch(error){ console.error(error); toast(t('toast.errorSync')); }
      syncBusy=false; renderAjustes();
    });
    document.getElementById('ajustesUnlinkBtn')?.addEventListener('click', async ()=>{
      await VerboSync.unlink();
      syncPending=false;
      renderAjustes();
    });
  }


  function referenceCoversVerse(entry, verseNumber){
    if(!verseNumber) return false;
    const ref = entry.reference || {};
    const chStart = Number(ref.chapterStart ?? currentChapter);
    const chEnd = Number(ref.chapterEnd ?? chStart);
    if(currentChapter < chStart || currentChapter > chEnd) return false;
    let start = Number(ref.verseStart);
    let end = Number(ref.verseEnd ?? ref.verseStart);
    if(!Number.isInteger(start) || start <= 0) start = 1;
    if(!Number.isInteger(end) || end <= 0) end = start;
    if(currentChapter > chStart) start = 1;
    if(currentChapter < chEnd) end = 999;
    return verseNumber >= start && verseNumber <= end;
  }

  function renderLinkedResourceEntries(resource, entries, focus, emptyIcon='📚', emptyText=t('linked.sinEntradas'), manifestPath=null){
    if(!entries.length){ els.panelBody.innerHTML=emptyState(emptyIcon, emptyText); return; }
    els.panelBody.innerHTML=entries.map((entry,index)=>{
      const id=entry.id || `${resource.manifest.id}-${currentBook}-${currentChapter}-${index}`;
      const title=entry.title || `${resource.manifest.name}: ${entry.reference?.verseStart || currentChapter}`;
      const body=entry.content || entry.excerpt || entry.html || entry.definition || entry.data || '';
      const active = referenceCoversVerse(entry, focus) ? ' note-card--active' : '';
      // Entradas de "biblioteca" tipo articulo (ver modules/library/biblioteca-verbo) traen
      // un excerpt corto + articleId en vez del contenido completo, para no duplicar articulos
      // largos en cada verso que citan. El boton carga el articulo completo bajo demanda.
      const readFullBtn = (entry.articleId && manifestPath)
        ? `<button class="note-card__copy" type="button" data-read-full="${index}">${t('linked.leerCompleto')}</button>`
        : '';
      return `<div class="note-card${active}" data-linked-id="${escapeHTML(id)}" data-linked-index="${index}">
        <div class="note-card__ref">${escapeHTML(data.meta.book)} ${data.meta.chapter}${entry.reference?.verseStart ? ':'+escapeHTML(entry.reference.verseStart) : ''}</div>
        <div class="note-card__title" data-linked-title="${index}">${escapeHTML(title)}</div>
        <div class="note-card__author" data-linked-author="${index}">${escapeHTML(entry.author || resource.manifest.name)}</div>
        <button class="note-card__copy" type="button" data-copy-linked="${index}">${t('linked.copiar')}</button>
        ${readFullBtn}
        <div class="note-card__body" data-linked-body="${index}">${body}</div>
      </div>`;
    }).join('');
    translateLinkedResourceEntries(resource, entries, focus);
    els.panelBody.querySelectorAll('[data-copy-linked]').forEach(btn=>btn.addEventListener('click',()=>{
      const entry=entries[Number(btn.dataset.copyLinked)];
      if(!entry) return;
      const body=entry.content || entry.excerpt || entry.html || entry.definition || entry.data || '';
      copyToClipboard(`${entry.title || resource.manifest.name}\n${String(body).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()}`);
    }));
    els.panelBody.querySelectorAll('[data-read-full]').forEach(btn=>btn.addEventListener('click', async ()=>{
      const entry=entries[Number(btn.dataset.readFull)];
      const bodyEl=els.panelBody.querySelector(`[data-linked-body="${btn.dataset.readFull}"]`);
      if(!entry || !bodyEl) return;
      if(btn.dataset.expanded==='1'){
        bodyEl.innerHTML=entry.excerpt || entry.content || '';
        btn.textContent=t('linked.leerCompleto');
        btn.dataset.expanded='0';
        return;
      }
      btn.textContent=t('linked.cargando'); btn.disabled=true;
      try{
        const article=await VerboModules.loadLinkedArticle(manifestPath, entry.articleId);
        bodyEl.innerHTML=article?.content || entry.excerpt || '';
        btn.textContent=t('linked.verExtracto');
        btn.dataset.expanded='1';
      }catch(error){
        console.error(error);
        btn.textContent=t('linked.errorArticulo');
      }finally{ btn.disabled=false; }
    }));
    if(focus){
      const target=[...els.panelBody.querySelectorAll('[data-linked-index]')].find(card=>referenceCoversVerse(entries[Number(card.dataset.linkedIndex)], focus));
      target?.scrollIntoView({block:'start'});
    }
  }

  // Traducción automática de recursos "enlazados por versículo" (Padres
  // Apostólicos en modo fragmento, Biblioteca, Exégesis) — antes solo el
  // panel "Comentario" y "Padres Apostólicos" en modo documento traducían
  // automáticamente; esta vista compartida se había quedado siempre en el
  // idioma original de la fuente (normalmente español) sin importar la
  // Biblia activa. Mismo patrón que applyCommentaryTranslation/
  // applyPatristicTranslation: título/autor vía translateCommentaryHeader,
  // cuerpo vía translateEntry, con caché en localStorage.
  async function translateLinkedResourceEntries(resource, entries, focus=null){
    const source=resource.manifest.language;
    const target=contentLang();
    if(!source || source===target) return;
    const focusIndex=focus ? entries.findIndex(entry=>referenceCoversVerse(entry, focus)) : -1;
    const order=[...entries.keys()].sort((a,b)=>(a===focusIndex?-1:0)-(b===focusIndex?-1:0));
    for(const index of order){
      const entry=entries[index];
      const id=entry.id || `${resource.manifest.id}-${currentBook}-${currentChapter}-${index}`;
      const titleEl=els.panelBody.querySelector(`[data-linked-title="${index}"]`);
      if(titleEl && titleEl.dataset.translated!==target && entry.title){
        titleEl.dataset.translated='pending';
        const translatedTitle=await translateCommentaryHeader(id,'title',entry.title,source,target);
        if(titleEl.dataset.translated==='pending'){ titleEl.textContent=translatedTitle; titleEl.dataset.translated=target; }
      }
      const authorEl=els.panelBody.querySelector(`[data-linked-author="${index}"]`);
      if(authorEl && authorEl.dataset.translated!==target && entry.author){
        authorEl.dataset.translated='pending';
        const translatedAuthor=await translateCommentaryHeader(id,'author',entry.author,source,target);
        if(authorEl.dataset.translated==='pending'){ authorEl.textContent=translatedAuthor; authorEl.dataset.translated=target; }
      }
      const bodyEl=els.panelBody.querySelector(`[data-linked-body="${index}"]`);
      const body=entry.content || entry.excerpt || entry.html || entry.definition || entry.data || '';
      if(bodyEl && bodyEl.dataset.translated!==target && body){
        bodyEl.dataset.translated='pending';
        const translatedBody=await translateEntry(id, body, source, target);
        if(bodyEl.dataset.translated==='pending'){
          bodyEl.innerHTML=`${translatedBody}${originalSourceDetailsHtml(body,source)}`;
          bodyEl.dataset.translated=target;
        }
      }
    }
  }

  const bibleNameAliases = {
    GEN:['gen','genesis','génesis','gn'], EXO:['exo','exodo','éxodo','ex'], LEV:['lev','levitico','levítico','lv'], NUM:['num','numeros','números','nm'], DEU:['deu','deuteronomio','dt'],
    JOS:['jos','josue','josué'], JDG:['jdg','jue','jueces'], RUT:['rut','rt'], '1SA':['1sa','1 sam','1sam','1 s'], '2SA':['2sa','2 sam','2sam','2 s'], '1KI':['1re','1 rey','1rey','1 r'], '2KI':['2re','2 rey','2rey','2 r'],
    '1CH':['1cr','1 cro','1cro'], '2CH':['2cr','2 cro','2cro'], EZR:['esd','esdras'], NEH:['neh','nehemias','nehemías'], EST:['est','ester'], JOB:['job'], PSA:['sal','salmo','salmos'], PRO:['pro','prov','proverbios','pr'], ECC:['ecl','ec','eclesiastes','eclesiastés'], SNG:['cnt','cant','cantares'],
    ISA:['isa','is','isaias','isaías'], JER:['jer','jeremias','jeremías'], LAM:['lam','lamentaciones','lm'], EZK:['eze','ez','ezequiel'], DAN:['dan','dn','daniel'], HOS:['hos','ose','oseas'], JOL:['joe','jl','joel'], AMO:['amo','am','amos'], OBA:['abd','abdias','abdías'], JON:['jon','jonas','jonás'], MIC:['miq','mi','miqueas'], NAM:['nah','nam','nahum'], HAB:['hab','habacuc'], ZEP:['sof','sofonias','sofonías'], HAG:['hag','ageo'], ZEC:['zac','zec','zacarias','zacarías'], MAL:['mal','malaquias','malaquías'],
    MAT:['mat','mt','mateo'], MRK:['mar','mc','mr','marcos'], LUK:['luc','lc','lu','lucas'], JHN:['jua','jn','juan'], ACT:['hch','hech','hechos'], ROM:['rom','ro','roman','romanos'], '1CO':['1co','1 cor','1cor','1 corintios'], '2CO':['2co','2 cor','2cor','2 corintios'], GAL:['gal','gál','galatas','gálatas'], EPH:['efe','ef','efesios'], PHP:['fil','flp','filipenses'], COL:['col','colosenses'], '1TH':['1ts','1 tes','1tes','1 tesalonicenses'], '2TH':['2ts','2 tes','2tes','2 tesalonicenses'], '1TI':['1ti','1 tim','1tim','1 timoteo'], '2TI':['2ti','2 tim','2tim','2 timoteo'], TIT:['tit','tito'], PHM:['flm','film','filemon','filemón'], HEB:['heb','hebreos'], JAS:['stg','sant','santiago'], '1PE':['1pe','1 ped','1ped','1 p','1 pedro'], '2PE':['2pe','2 ped','2ped','2 p','2 pedro'], '1JN':['1jn','1 jn','1 juan'], '2JN':['2jn','2 jn','2 juan'], '3JN':['3jn','3 jn','3 juan'], JUD:['jud','judas'], REV:['ap','apo','apoc','apocalipsis']
  };
  function normalizeBibleName(value){ return String(value||'').toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[._]/g,' ').replace(/\s+/g,' ').trim(); }
  function parseBibleReference(text){
    const clean=normalizeBibleName(text).replace(/[;,)]$/,'');
    const m=clean.match(/^(.+?)\s+(\d+)\s*:\s*(\d+)/);
    if(!m)return null;
    const alias=normalizeBibleName(m[1]);
    const bookId=Object.keys(bibleNameAliases).find(id=>bibleNameAliases[id].some(a=>normalizeBibleName(a)===alias));
    return bookId?{bookId,chapter:Number(m[2]),verse:Number(m[3])}:null;
  }
  async function goToBibleReference(ref){
    currentBook=ref.bookId; currentChapter=ref.chapter;
    els.book.value=currentBook; await refreshChapters(); els.chapter.value=String(currentChapter);
    await loadPassage();
    const row=document.querySelector(`[data-verse-n="${ref.verse}"]`);
    if(row){ document.querySelectorAll('.verse--active').forEach(x=>x.classList.remove('verse--active')); row.classList.add('verse--active'); row.scrollIntoView({behavior:'smooth',block:'center'}); }
  }
  function wireDictionaryLinks(root){
    root.querySelectorAll('a.strong').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();const m=((a.getAttribute('href')||'')+' '+a.textContent).match(/[GH]\d+/i);if(m)openDictionary(m[0].toUpperCase());}));
    root.querySelectorAll('a.bible').forEach(a=>{
      a.title=t('diccionario.abrirPasajeTitle');
      a.addEventListener('click',async e=>{e.preventDefault();const ref=parseBibleReference(a.textContent);if(ref)await goToBibleReference(ref);else toast(t('toast.refNoReconocida'));});
    });
  }
  // ── Historia de la Iglesia (buscador independiente, sin ancla a versículo) ──
  let churchHistoryEntries=null, churchHistoryQuery='', churchHistoryOpenId=null, churchHistoryResultsToken=0;
  let churchHistoryActiveFilter=null;
  let churchHistoryTranslatedQuery='', churchHistoryQueryToken=0, churchHistoryQueryDebounce=null;
  let churchHistorySemanticResults=[], churchHistorySemanticQuery='', churchHistorySemanticToken=0, churchHistorySemanticDebounce=null;

  function normalizeSearchText(value){
    return String(value||'').toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  }

  // Las 6 épocas de "Historia de la Iglesia" (taxonomía confirmada por Juan,
  // 2026-08-01) — id interno (usado en entries.json) → etiqueta corta ES,
  // en el mismo orden cronológico que CHURCH_HISTORY_EPOCA_ORDER.
  const CHURCH_HISTORY_EPOCA_LABELS={
    iglesia_primitiva: 'Iglesia primitiva',
    era_patristica: 'Era patrística',
    edad_media: 'Edad Media',
    reforma: 'Reforma',
    puritanos_post_reforma: 'Puritanos y post-Reforma',
    iglesia_moderna: 'Iglesia moderna',
  };

  // Texto de búsqueda de una entrada: personaje(s)/evento(s)/periodo (metadata
  // editorial) + etiqueta de época + título + cuerpo completo (texto real de
  // la fuente) — así el buscador funciona como texto completo real aunque
  // personas/eventos no estén poblados para una entrada (evita depender de
  // una extracción automática de entidades que podría etiquetar mal un lugar
  // como persona, por ejemplo), y un chip de época encuentra TODAS las
  // entradas de esa época (la etiqueta queda embebida en cada una).
  // Se cachea en el propio objeto (calculado una sola vez por entrada).
  function churchHistorySearchText(e){
    if(e._searchText==null){
      const parts=[...(e.personas||[]),...(e.eventos||[]),e.periodo||'',CHURCH_HISTORY_EPOCA_LABELS[e.epoca]||e.epoca||'',e.sourceLabel||'',e.sourceName||'',e.concilio||'',e.tipo||'',e.numero||'',e.title||'',htmlToPlainText(e.content||e.excerpt||'')];
      e._searchText=normalizeSearchText(parts.join(' '));
    }
    return e._searchText;
  }

  // Coincidencia por texto (ver churchHistorySearchText) o por año/rango numérico
  // contra anioInicio/anioFin — cualquiera de los dos que matchee incluye la
  // entrada, no hace falta que el usuario indique qué tipo de dato está buscando.
  // El texto fuente (título/cuerpo) está en inglés — un hispanohablante que
  // busque "persecución" no encontraría nada aunque el capítulo hable del tema
  // en inglés. `extraQuery` es la traducción al inglés de la búsqueda (ver
  // scheduleChurchHistoryQueryTranslation) y se combina con la búsqueda literal
  // para cubrir ambos casos sin tener que traducir las 581 entradas de antemano.
  function churchHistorySearchMatches(entries, rawQuery){
    const raw=String(rawQuery||'').trim();
    const q=normalizeSearchText(raw);
    if(!q) return [];
    const rangeMatch=raw.match(/^(\d{1,4})\s*-\s*(\d{1,4})$/);
    const yearMatch=raw.match(/^(\d{1,4})$/);
    let yearLo=null, yearHi=null;
    if(rangeMatch){ yearLo=Math.min(+rangeMatch[1],+rangeMatch[2]); yearHi=Math.max(+rangeMatch[1],+rangeMatch[2]); }
    else if(yearMatch){ yearLo=yearHi=+yearMatch[1]; }
    return entries.filter(e=>{
      if(churchHistorySearchText(e).includes(q)) return true;
      if(yearLo!=null){
        const eLo=e.anioInicio ?? e.anioFin, eHi=e.anioFin ?? e.anioInicio;
        if(eLo!=null && eHi!=null && eHi>=yearLo && eLo<=yearHi) return true;
      }
      return false;
    });
  }
  function churchHistorySearch(entries, query, extraQuery=''){
    const primary=churchHistorySearchMatches(entries, query);
    if(!extraQuery || normalizeSearchText(extraQuery)===normalizeSearchText(query)) return primary;
    const extra=churchHistorySearchMatches(entries, extraQuery);
    if(!extra.length) return primary;
    const seen=new Set(primary.map(e=>e.id));
    return [...primary, ...extra.filter(e=>!seen.has(e.id))];
  }
  // Traduce la búsqueda ES→EN (con debounce, para no llamar a Google Translate
  // en cada tecla) y vuelve a renderizar cuando resuelve — así una búsqueda en
  // español encuentra coincidencias en el texto fuente en inglés. Se salta
  // números/rangos de año (no tiene sentido traducirlos) y consultas muy
  // cortas. Un token descarta traducciones de búsquedas ya obsoletas.
  function scheduleChurchHistoryQueryTranslation(query){
    clearTimeout(churchHistoryQueryDebounce);
    const token=++churchHistoryQueryToken;
    const trimmed=String(query||'').trim();
    if(contentLang()!=='es' || trimmed.length<3 || /^\d{1,4}(\s*-\s*\d{1,4})?$/.test(trimmed)){
      churchHistoryTranslatedQuery='';
      return;
    }
    churchHistoryQueryDebounce=setTimeout(async ()=>{
      const translated=await translateCommentaryHeader('historia:searchQuery','q',trimmed,'es','en');
      if(token!==churchHistoryQueryToken) return;
      churchHistoryTranslatedQuery=translated||'';
      if(!churchHistoryOpenId) renderChurchHistoryBody();
    }, 400);
  }

  function scheduleChurchHistorySemanticSearch(query){
    clearTimeout(churchHistorySemanticDebounce);
    const token=++churchHistorySemanticToken;
    const trimmed=String(query||'').trim();
    churchHistorySemanticResults=[];
    churchHistorySemanticQuery='';
    if(trimmed.length<3 || /^\d{1,4}(\s*-\s*\d{1,4})?$/.test(trimmed)) return;
    churchHistorySemanticDebounce=setTimeout(async()=>{
      try{
        const ranked=await VerboModules.searchSemanticChurchHistory(trimmed,{limit:100});
        if(token!==churchHistorySemanticToken || churchHistoryActiveFilter) return;
        churchHistorySemanticResults=ranked;
        churchHistorySemanticQuery=trimmed;
        if(!churchHistoryOpenId) renderChurchHistoryBody();
      }catch(error){
        if(token===churchHistorySemanticToken) console.warn('Búsqueda semántica de Historia no disponible; se conserva la búsqueda textual.',error);
      }
    },350);
  }

  // ---- Exploración del panel vacío en dimensiones separadas. ----
  const CHURCH_HISTORY_EPOCA_ORDER=['iglesia_primitiva','era_patristica','edad_media','reforma','puritanos_post_reforma','iglesia_moderna'];
  const CHURCH_HISTORY_TOPIC_ORDER=['persecucion_martirio','concilios_doctrina','herejias_apologetica','iglesia_gobierno','biblia_canon','culto_sacramentos','mision_expansion','iglesia_estado','personajes_biografias','unidad_divisiones','disciplina_vida','milagros_providencia'];
  let churchHistorySuggestions={epocas:[],libros:[],temas:[]};
  let churchHistoryTopicsExpanded=false;
  function romanNumeral(value){
    const table=[[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']];
    let n=value, result='';
    table.forEach(([amount,symbol])=>{ while(n>=amount){ result+=symbol; n-=amount; } });
    return result;
  }
  function churchHistoryBookKey(entry){ return entry.concilio || entry.sourceCollectionLabel || entry.sourceLabel || entry.sourceName || ''; }
  function churchHistoryBookLabel(value){
    const clean=String(value||'').replace(/^Eusebio,\s*/,'');
    return clean==='Cánones Apostólicos'?`⚖ ${clean}`:clean;
  }
  function churchHistorySuggestionGroups(entries){
    const activeEpocas=[...new Set(entries.map(e=>e.epoca).filter(Boolean))];
    activeEpocas.sort((a,b)=>{
      const ai=CHURCH_HISTORY_EPOCA_ORDER.indexOf(a), bi=CHURCH_HISTORY_EPOCA_ORDER.indexOf(b);
      if(ai!==-1 || bi!==-1) return (ai===-1?999:ai)-(bi===-1?999:bi);
      const ay=Math.min(...entries.filter(e=>e.epoca===a).map(e=>e.anioInicio??9999));
      const by=Math.min(...entries.filter(e=>e.epoca===b).map(e=>e.anioInicio??9999));
      return ay-by;
    });
    const epocas=[];
    activeEpocas.forEach(epoca=>{
      epocas.push({label:CHURCH_HISTORY_EPOCA_LABELS[epoca]||epoca,type:'epoca',value:epoca});
      const centuries=new Map();
      entries.filter(e=>e.epoca===epoca).forEach(e=>{
        const year=e.anioInicio??e.anioFin;
        if(year!=null){ const century=Math.max(1,Math.ceil(year/100)); centuries.set(century,(centuries.get(century)||0)+1); }
      });
      const representative=[...centuries].sort((a,b)=>b[1]-a[1]||a[0]-b[0])[0]?.[0];
      if(representative) epocas.push({label:`Siglo ${romanNumeral(representative)}`,type:'siglo',value:String(representative)});
    });
    const uniqueEpocas=[];
    epocas.forEach(item=>{ if(!uniqueEpocas.some(x=>x.label===item.label)) uniqueEpocas.push(item); });
    const libros=[...new Set(entries.map(churchHistoryBookKey).filter(Boolean))]
      .map(value=>({label:churchHistoryBookLabel(value),type:'libro',value}));
    const activeTopics=new Set(entries.flatMap(entry=>entry.temas||[]));
    const temas=CHURCH_HISTORY_TOPIC_ORDER.filter(value=>activeTopics.has(value))
      .map(value=>({label:t(`historia.temas.${value}`),type:'tema',value}));
    return {epocas:uniqueEpocas.slice(0,8),libros,temas};
  }
  function churchHistoryFilterEntries(entries, filter){
    if(!filter) return entries;
    if(filter.type==='epoca') return entries.filter(e=>e.epoca===filter.value);
    if(filter.type==='libro') return entries.filter(e=>churchHistoryBookKey(e)===filter.value);
    if(filter.type==='siglo'){
      const century=Number(filter.value), lo=(century-1)*100+1, hi=century*100;
      return entries.filter(e=>{
        const eLo=e.anioInicio??e.anioFin, eHi=e.anioFin??e.anioInicio;
        return eLo!=null && eHi!=null && eHi>=lo && eLo<=hi;
      });
    }
    if(filter.type==='tema') return entries.filter(e=>(e.temas||[]).includes(filter.value));
    return entries;
  }

  async function renderChurchHistoryPanel(){
    els.panelTitle.textContent=t('historia.title');
    els.panelToolbar.innerHTML=`<form class="search-panel-form" id="churchHistorySearchForm">
      <input id="churchHistorySearchInput" class="search-panel-input" type="search" placeholder="${t('historia.buscarPlaceholder')}" autocomplete="off" value="${escapeHTML(churchHistoryQuery)}">
    </form>`;
    const input=document.getElementById('churchHistorySearchInput');
    document.getElementById('churchHistorySearchForm')?.addEventListener('submit',e=>e.preventDefault());
    input?.addEventListener('input',()=>{
      churchHistoryQuery=input.value;
      churchHistoryActiveFilter=null;
      churchHistoryTranslatedQuery='';
      churchHistorySemanticResults=[];
      churchHistorySemanticQuery='';
      renderChurchHistoryBody();
      scheduleChurchHistoryQueryTranslation(churchHistoryQuery);
      scheduleChurchHistorySemanticSearch(churchHistoryQuery);
    });

    if(!churchHistoryEntries){
      els.panelBody.innerHTML=emptyState('⌛',t('historia.cargando'));
      try{ churchHistoryEntries=await VerboModules.loadChurchHistory(); }
      catch(error){ console.error(error); churchHistoryEntries=[]; }
    }
    churchHistorySuggestions=churchHistoryEntries.length?churchHistorySuggestionGroups(churchHistoryEntries):{epocas:[],libros:[],temas:[]};
    renderChurchHistoryBody();
    if(!churchHistoryOpenId) setTimeout(()=>input?.focus(),0);
  }

  function renderChurchHistorySuggestionChips(){
    const group=(label,items)=>`<section class="history-suggestions__group">
      <div class="history-suggestions__label">${escapeHTML(label)}</div>
      ${items.length?`<div class="history-suggestions__list">${items.map(item=>
        `<button type="button" class="history-suggestions__chip" data-history-filter-type="${escapeHTML(item.type)}" data-history-filter-value="${escapeHTML(item.value)}" data-history-filter-label="${escapeHTML(item.label)}">${escapeHTML(item.label)}</button>`
      ).join('')}</div>`:''}
    </section>`;
    const visibleTopics=churchHistoryTopicsExpanded?churchHistorySuggestions.temas:churchHistorySuggestions.temas.slice(0,8);
    const topicToggle=churchHistorySuggestions.temas.length>8
      ?`<button type="button" class="history-suggestions__more" id="churchHistoryTopicsToggle">${churchHistoryTopicsExpanded?t('historia.verMenos'):t('historia.verTodos')}</button>`:'';
    return `<div class="history-suggestions">
      ${group(t('historia.porEpoca'),churchHistorySuggestions.epocas)}
      ${group(t('historia.porLibro'),churchHistorySuggestions.libros)}
      ${group(t('historia.porTema'),visibleTopics)}${topicToggle}
    </div>`;
  }
  function wireChurchHistorySuggestionChips(){
    document.getElementById('churchHistoryTopicsToggle')?.addEventListener('click',()=>{
      churchHistoryTopicsExpanded=!churchHistoryTopicsExpanded;
      renderChurchHistoryBody();
    });
    els.panelBody.querySelectorAll('[data-history-filter-type]').forEach(btn=>btn.addEventListener('click',()=>{
      const label=btn.dataset.historyFilterLabel||btn.textContent.trim();
      clearTimeout(churchHistorySemanticDebounce);
      churchHistorySemanticToken++;
      churchHistorySemanticResults=[];
      churchHistorySemanticQuery='';
      churchHistoryActiveFilter={type:btn.dataset.historyFilterType,value:btn.dataset.historyFilterValue,label};
      churchHistoryQuery=label;
      churchHistoryTranslatedQuery='';
      const input=document.getElementById('churchHistorySearchInput');
      if(input) input.value=label;
      renderChurchHistoryBody();
    }));
  }

  function renderChurchHistoryBody(){
    if(churchHistoryOpenId){ renderChurchHistoryEntry(churchHistoryOpenId); return; }
    if(!churchHistoryEntries.length){ els.panelBody.innerHTML=emptyState('⛪',t('historia.sinContenido')); return; }
    if(!churchHistoryQuery.trim()){
      els.panelBody.innerHTML=`<div class="panel-empty"><div class="panel-empty__icon">🔎</div><div class="panel-empty__text">${t('historia.intro')}</div>${renderChurchHistorySuggestionChips()}</div>`;
      wireChurchHistorySuggestionChips();
      return;
    }
    const semanticReady=!churchHistoryActiveFilter
      && normalizeSearchText(churchHistorySemanticQuery)===normalizeSearchText(churchHistoryQuery)
      && churchHistorySemanticResults.length;
    const entriesById=semanticReady?new Map(churchHistoryEntries.map(entry=>[entry.id,entry])):null;
    const results=churchHistoryActiveFilter
      ? churchHistoryFilterEntries(churchHistoryEntries,churchHistoryActiveFilter)
      : semanticReady
        ? churchHistorySemanticResults.map(result=>entriesById.get(result.id)).filter(Boolean)
        : churchHistorySearch(churchHistoryEntries, churchHistoryQuery, churchHistoryTranslatedQuery);
    if(!results.length){ els.panelBody.innerHTML=emptyState('🔎',t('historia.sinResultados',{query:escapeHTML(churchHistoryQuery)})); return; }
    els.panelBody.innerHTML=`<div class="search-results-list">${results.map(e=>{
      const years=e.anioInicio!=null?` · ${e.anioInicio}${e.anioFin && e.anioFin!==e.anioInicio?'–'+e.anioFin:''}`:'';
      const excerptText=htmlToPlainText(e.excerpt||e.content||'').slice(0,180);
      return `<button type="button" class="search-result" data-history-id="${escapeHTML(e.id)}">
        <span class="search-result__ref"><span data-history-title="${escapeHTML(e.id)}">${escapeHTML(e.title)}</span>${escapeHTML(years)}</span>
        <span class="search-result__text" data-history-excerpt="${escapeHTML(e.id)}">${escapeHTML(excerptText)}</span>
      </button>`;
    }).join('')}</div>`;
    els.panelBody.querySelectorAll('[data-history-id]').forEach(btn=>btn.addEventListener('click',()=>{
      churchHistoryOpenId=btn.dataset.historyId;
      renderChurchHistoryBody();
      els.panelBody.scrollTop=0;
    }));
    applyChurchHistoryResultsTranslation(results);
  }

  // Traduce título + extracto de cada resultado de la lista de búsqueda (antes
  // solo se traducía la entrada ya abierta, ver applyChurchHistoryTranslation).
  // Reutiliza el mismo noteId/caché ("historia:<id>") para que abrir la entrada
  // después no tenga que volver a traducir el título. Concurrencia limitada
  // para no disparar decenas de peticiones simultáneas con búsquedas amplias;
  // un token por render aborta el trabajo de búsquedas ya obsoletas (el usuario
  // sigue escribiendo y cada tecla vuelve a llamar a esta función).
  async function applyChurchHistoryResultsTranslation(results){
    const target=contentLang();
    const token=++churchHistoryResultsToken;
    let index=0;
    async function worker(){
      while(index<results.length){
        if(token!==churchHistoryResultsToken) return;
        const entry=results[index++];
        const source=entry.sourceLang||'en';
        if(!source||source===target) continue;
        const titleEl=els.panelBody.querySelector(`[data-history-title="${CSS.escape(entry.id)}"]`);
        const excerptEl=els.panelBody.querySelector(`[data-history-excerpt="${CSS.escape(entry.id)}"]`);
        if(titleEl && titleEl.dataset.translated!==target){
          const translatedTitle=await translateCommentaryHeader(`historia:${entry.id}`,'title',entry.title,source,target);
          if(token!==churchHistoryResultsToken) return;
          titleEl.textContent=translatedTitle;
          titleEl.dataset.translated=target;
        }
        if(excerptEl && excerptEl.dataset.translated!==target){
          const originalExcerpt=excerptEl.textContent;
          const translatedExcerpt=await translateCommentaryHeader(`historia:${entry.id}`,'excerpt',originalExcerpt,source,target);
          if(token!==churchHistoryResultsToken) return;
          excerptEl.textContent=translatedExcerpt;
          excerptEl.dataset.translated=target;
        }
      }
    }
    await Promise.all(Array.from({length:Math.min(4,results.length)},worker));
  }

  function renderChurchHistoryEntry(id){
    const entry=churchHistoryEntries.find(e=>e.id===id);
    if(!entry){ churchHistoryOpenId=null; els.panelBody.innerHTML=emptyState('⚠️',t('historia.entradaNoEncontrada')); return; }
    const sourceKey=churchHistoryBookKey(entry);
    const sourceEntries=churchHistoryEntries.filter(candidate=>churchHistoryBookKey(candidate)===sourceKey);
    const sourceIndex=sourceEntries.findIndex(candidate=>candidate.id===entry.id);
    const previous=sourceIndex>0?sourceEntries[sourceIndex-1]:null;
    const next=sourceIndex>=0&&sourceIndex<sourceEntries.length-1?sourceEntries[sourceIndex+1]:null;
    const metaParts=[
      entry.personas?.length?`${t('historia.personajes')}: ${entry.personas.map(escapeHTML).join(', ')}`:null,
      entry.eventos?.length?`${t('historia.eventos')}: ${entry.eventos.map(escapeHTML).join(', ')}`:null,
      entry.periodo?`${t('historia.periodo')}: ${escapeHTML(entry.periodo)}`:null,
      entry.anioInicio!=null?`${t('historia.anio')}: ${entry.anioInicio}${entry.anioFin && entry.anioFin!==entry.anioInicio?'–'+entry.anioFin:''}`:null,
      entry.tipo?`${t('historia.tipo')}: ${escapeHTML(entry.tipo.replaceAll('_',' '))}`:null,
    ].filter(Boolean).join(' · ');
    els.panelBody.innerHTML=`<article class="dict-entry">
      <div class="dict-entry__term" data-entry-id="${escapeHTML(entry.id)}">${escapeHTML(entry.title)}</div>
      <div class="dict-entry__source">${escapeHTML(churchHistoryBookLabel(sourceKey))}</div>
      ${metaParts?`<p class="note-card__translation-note">${metaParts}</p>`:''}
      <div class="history-entry-actions">
        <button class="note-card__copy" id="backToChurchHistoryResults" type="button">← ${t('historia.volverResultados')}</button>
        <button id="churchHistoryExpand" class="history-panel-expand" type="button" aria-pressed="${els.side.classList.contains('side-panel--history-expanded')?'true':'false'}">${els.side.classList.contains('side-panel--history-expanded')?t('historia.vistaCompacta'):t('historia.ampliarLectura')}</button>
      </div>
      <div class="dict-entry__def" data-entry-id="${escapeHTML(entry.id)}">${entry.content||entry.excerpt||''}</div>
      <nav class="history-entry-nav" aria-label="${t('historia.navegacionLectura')}">
        ${previous?`<button type="button" class="history-entry-nav__button" data-history-neighbor="${escapeHTML(previous.id)}">← ${t('historia.anterior')}</button>`:'<span></span>'}
        ${next?`<button type="button" class="history-entry-nav__button" data-history-neighbor="${escapeHTML(next.id)}">${t('historia.siguiente')} →</button>`:'<span></span>'}
      </nav>
    </article>`;
    document.getElementById('backToChurchHistoryResults')?.addEventListener('click',()=>{
      els.side.classList.remove('side-panel--history-expanded');
      churchHistoryOpenId=null;
      renderChurchHistoryBody();
      els.panelBody.scrollTop=0;
    });
    document.getElementById('churchHistoryExpand')?.addEventListener('click',event=>{
      const scrollTop=els.panelBody.scrollTop;
      const expanded=els.side.classList.toggle('side-panel--history-expanded');
      event.currentTarget.setAttribute('aria-pressed',String(expanded));
      event.currentTarget.textContent=expanded?t('historia.vistaCompacta'):t('historia.ampliarLectura');
      requestAnimationFrame(()=>{ els.panelBody.scrollTop=scrollTop; });
    });
    els.panelBody.querySelectorAll('[data-history-neighbor]').forEach(button=>button.addEventListener('click',()=>{
      churchHistoryOpenId=button.dataset.historyNeighbor;
      renderChurchHistoryEntry(churchHistoryOpenId);
      els.panelBody.scrollTop=0;
    }));
    applyChurchHistoryTranslation(entry);
  }

  // Traduce título+cuerpo de una entrada de Historia de la Iglesia reusando el
  // mismo motor de traducción de Comentario (translateEntry/translateCommentaryHeader),
  // así el resultado de traducción automática tiene la misma calidad/caché. Solo
  // corre si el idioma de la entrada (normalmente inglés, ver manifest.language)
  // difiere del idioma de la Biblia activa.
  async function applyChurchHistoryTranslation(entry){
    const source=entry.sourceLang||'en';
    const target=contentLang();
    if(!source || source===target) return;
    const termEl=els.panelBody.querySelector(`.dict-entry__term[data-entry-id="${CSS.escape(entry.id)}"]`);
    const defEl=els.panelBody.querySelector(`.dict-entry__def[data-entry-id="${CSS.escape(entry.id)}"]`);
    if(!termEl||!defEl) return;
    if(termEl.dataset.translated!==target){
      termEl.dataset.translated='pending';
      const translatedTitle=await translateCommentaryHeader(`historia:${entry.id}`,'title',entry.title,source,target);
      if(termEl.dataset.translated==='pending'){ termEl.textContent=translatedTitle; termEl.dataset.translated=target; }
    }
    if(defEl.dataset.translated!==target){
      defEl.dataset.translated='pending';
      const original=entry.content||entry.excerpt||'';
      const translated=await translateEntry(`historia:${entry.id}`, original, source, target);
      if(defEl.dataset.translated==='pending'){
        defEl.innerHTML=`${translated}${originalSourceDetailsHtml(original,source)}`;
        defEl.dataset.translated=target;
      }
    }
  }

  function getStrongDictionary(code=null){
    const installed=dictionaryCatalog();
    return installed.find(d=>d.id==='strong-verbo') || installed[0] || null;
  }

  function formatStrongEntryHtml(code, entry, html){
    if(!/^G\d+$/i.test(code) || !entry?.term) return html;
    const box=document.createElement('div');
    box.innerHTML=html;
    const heading=box.querySelector('.lexicon-entry-head h3');
    if(!heading || box.querySelector('.lexicon-transliteration')) return html;
    const transliteration=String(entry.term).trim();
    const suffix=` — ${transliteration}`;
    if(heading.textContent.endsWith(suffix)) heading.textContent=heading.textContent.slice(0,-suffix.length);
    const line=document.createElement('p');
    line.className='lexicon-transliteration';
    const label=document.createElement('strong');
    label.textContent='Transliteración:';
    line.append(label,` ${transliteration}`);
    heading.insertAdjacentElement('afterend',line);
    return box.innerHTML;
  }

  async function renderDictionaryPanel(focus=null){
    els.panelToolbar.innerHTML='';
    const selected=getStrongDictionary();
    els.panelTitle.textContent=selected?.full || 'Léxico Strong';
    if(!selected){ els.panelBody.innerHTML=emptyState('📚','No hay diccionario Strong/Multiléxico instalado todavía.'); return; }
    currentDictionary=selected.id;
    localStorage.setItem('verbo:lastDictionary', currentDictionary);
    els.panelBody.innerHTML=emptyState('🔤','Pulsa un código Strong en una Biblia compatible para consultar el Multiléxico.');
  }



  async function renderGospelPanel(){
    els.panelTitle.textContent='Evangelio cronológico de Jesús';
    els.panelToolbar.innerHTML='';
    if(!gospelData){
      els.panelBody.innerHTML=emptyState('⌛','Cargando Evangelio armonizado…');
      try{
        gospelData=await VerboModules.loadGospel();
      }catch(error){console.error(error);}
    }
    if(!gospelData){
      els.panelBody.innerHTML=emptyState('✝️','El Evangelio armonizado está listo para recibir contenido (modules/gospel).');
      return;
    }
    // ¿Hay un capítulo del Evangelio cuya referencia coincide con el libro/capítulo
    // que se está leyendo ahora en la Biblia principal? Si sí, lo destacamos arriba.
    const matching=gospelData.chapters.filter(c=>(c.references||[]).some(r=>r.book===currentBook && r.chapter===currentChapter));

    const matchBanner=matching.length?`
      <div class="gospel-match">
        <div class="gospel-match__label">Relacionado con esta lectura</div>
        ${matching.map(c=>`<button type="button" class="gospel-match__item" data-gospel-chapter="${c.n}">Cap. ${c.n} — ${escapeHTML(c.title)}</button>`).join('')}
      </div>` : '';

    if(gospelOpenChapter){
      renderGospelChapter(gospelOpenChapter, matchBanner);
      return;
    }

    const list=gospelData.chapters.map(c=>`
      <button type="button" class="dictionary-library__item" data-gospel-chapter="${c.n}">
        <span>${c.n}. ${escapeHTML(c.title)}</span>
        <small>${escapeHTML(c.reference_label)}</small>
      </button>`).join('');

    els.panelBody.innerHTML=`
      ${matchBanner}
      <div class="dictionary-library">
        <input class="dictionary-library__search" id="gospelSearch" type="search" placeholder="Buscar capítulo o pasaje…">
        <div class="dictionary-library__count">${gospelData.chapters.length} capítulos</div>
        <div id="gospelList">${list}</div>
      </div>`;

    wireGospelChapterButtons();

    const searchInput=document.getElementById('gospelSearch');
    searchInput?.addEventListener('input', e=>{
      const q=normalizeBibleName(e.target.value);
      const items=document.querySelectorAll('#gospelList [data-gospel-chapter]');
      items.forEach(btn=>{
        const text=normalizeBibleName(btn.textContent);
        btn.style.display=!q||text.includes(q)?'':'none';
      });
    });
  }

  function wireGospelChapterButtons(){
    document.querySelectorAll('[data-gospel-chapter]').forEach(btn=>{
      btn.addEventListener('click',()=>{
        gospelOpenChapter=Number(btn.dataset.gospelChapter);
        renderGospelPanel();
        els.panelBody.scrollTop=0;
      });
    });
  }

  function renderGospelChapter(n, matchBanner=''){
    const chapter=gospelData.chapters.find(c=>c.n===n);
    if(!chapter){ els.panelBody.innerHTML=emptyState('⚠️','No se encontró este capítulo.'); return; }
    els.panelToolbar.innerHTML=`<button class="note-card__copy" id="backToGospelIndex" type="button">← Índice del Evangelio</button>`;
    document.getElementById('backToGospelIndex')?.addEventListener('click',()=>{ gospelOpenChapter=null; renderGospelPanel(); els.panelBody.scrollTop=0; });

    const paralelosBlock=chapter.paralelos?`<div class="note-card__title" style="margin-top:18px;">Paralelos íntegros</div><div class="note-card__body">${nl2p(chapter.paralelos)}</div>`:'';

    els.panelBody.innerHTML=`
      <article class="dict-entry">
        <div class="dict-entry__term">Cap. ${chapter.n} — ${escapeHTML(chapter.title)}</div>
        <div class="dict-entry__source">${escapeHTML(chapter.reference_label)}</div>
        <div class="note-card__title" style="margin-top:14px;">Texto base</div>
        <div class="dict-entry__def">${nl2p(chapter.texto_base)}</div>
        ${paralelosBlock}
        <div class="note-card__title" style="margin-top:18px;">Notas</div>
        <div class="note-card__body">${nl2p(chapter.notas)}</div>
      </article>`;
  }

  // Convierte texto plano con saltos de línea en párrafos HTML simples,
  // sin alterar ni una palabra del contenido — solo estructura visual.
  function nl2p(text){
    if(!text) return '';
    return text.split(/\n\s*\n/).map(p=>`<p>${escapeHTML(p.trim()).replace(/\n/g,'<br>')}</p>`).join('');
  }

  // ── Mapas bíblicos ───────────────────────────────────────────────────────────
  // Mapas 01-14: churchmaps.info (dominio público), recorte y distribución vía
  // FreeBibleimages.org bajo CC0. Los rótulos de esos mapas están en inglés
  // (única versión disponible); los títulos aquí son una traducción propia
  // solo de la ficha, no del contenido cartográfico.
  // Mapas 15-18 (agregados 2026-07-28): Wikimedia Commons. 15 y 16 son
  // CC BY-SA 3.0 (rótulos traducidos al español donde aplicaba) y llevan
  // `credit` con atribución visible obligatoria; 17 también CC BY-SA 3.0
  // (mismo autor tradujo del original en polaco); 18 es dominio público real
  // (Encyclopædia Britannica 1911), `credit` ahí es solo referencia de fuente,
  // no una obligación legal. Ver "Fuentes y licencias".
  const CHURCH_MAPS=[
    {id:'01', title:'El mundo antiguo en tiempos de los patriarcas', subtitle:'2000–1600 a.C.'},
    {id:'02', title:'Canaán y Egipto en tiempos de los patriarcas', subtitle:'2000–1600 a.C.'},
    {id:'03', title:'Mesopotamia en tiempos de los patriarcas', subtitle:'2000–1600 a.C.'},
    {id:'04', title:'Ruta del éxodo y la conquista de Canaán', subtitle:'Recorrido tradicional propuesto'},
    {id:'05', title:'Ruta del éxodo de Israel desde Egipto', subtitle:'Recorrido tradicional propuesto'},
    {id:'06', title:'La conquista de Canaán'},
    {id:'07', title:'Israel en tiempos de Jesús'},
    {id:'08', title:'Norte de Israel, Fenicia y Siria', subtitle:'En tiempos de Jesús'},
    {id:'09', title:'Galilea, Samaria y Judea', subtitle:'En tiempos de Jesús'},
    {id:'10', title:'Samaria, Judea e Idumea', subtitle:'En tiempos de Jesús'},
    {id:'11', title:'Los viajes del apóstol Pablo', subtitle:'Vista general'},
    {id:'12', title:'Primer viaje misionero de Pablo'},
    {id:'13', title:'Los tres viajes misioneros de Pablo'},
    {id:'14', title:'Viajes misioneros de Pablo y su travesía a Roma'},
    {id:'15', title:'El reino dividido: Israel y Judá', subtitle:'Siglo IX a.C.',
      credit:'Mapa de Kordas, Richardprins y FinnWikiNo — Wikimedia Commons, CC BY-SA 3.0'},
    {id:'16', title:'El reparto de las doce tribus de Israel', subtitle:'Según el libro de Josué',
      credit:'Mapa de Richardprins, Kordas, יוסי y Janz — Wikimedia Commons, CC BY-SA 3.0 (tribus traducidas al español)'},
    {id:'17', title:'El tabernáculo de Moisés', subtitle:'Planta del santuario en el desierto',
      credit:'Diagrama de Adik86 — Wikimedia Commons, CC BY-SA 3.0 (etiquetas traducidas al español)'},
    {id:'18', title:'El templo de Herodes en Jerusalén', subtitle:'Planta del templo y sus atrios',
      credit:'Encyclopædia Britannica, 11.ª edición (1911) — dominio público'},
  ];
  const MAPS_BASE='assets/maps/churchmaps';
  let mapsOpenId=null;

  function renderMapsPanel(){
    if(mapsOpenId){ renderMapViewer(mapsOpenId); return; }
    els.panelTitle.textContent='Mapas bíblicos';
    els.panelToolbar.innerHTML='';
    els.panelBody.innerHTML=`
      <div class="maps-gallery">
        <div class="dictionary-library__count">${CHURCH_MAPS.length} mapas disponibles</div>
        <div class="maps-gallery__grid">
          ${CHURCH_MAPS.map(m=>`
            <button type="button" class="maps-gallery__item" data-map-id="${m.id}">
              <span class="maps-gallery__thumb"><img src="${MAPS_BASE}/thumb/${m.id}.jpg" alt="" loading="lazy"></span>
              <span class="maps-gallery__label">${escapeHTML(m.title)}</span>
            </button>`).join('')}
        </div>
      </div>`;
    els.panelBody.querySelectorAll('[data-map-id]').forEach(btn=>{
      btn.addEventListener('click',()=>{ mapsOpenId=btn.dataset.mapId; renderMapViewer(mapsOpenId); });
    });
  }

  function renderMapViewer(id){
    const map=CHURCH_MAPS.find(m=>m.id===id);
    if(!map){ mapsOpenId=null; renderMapsPanel(); return; }
    els.panelTitle.textContent=map.title;
    els.panelToolbar.innerHTML=`<button class="note-card__copy" id="backToMapsIndex" type="button">← Mapas bíblicos</button>`;
    document.getElementById('backToMapsIndex')?.addEventListener('click',()=>{ mapsOpenId=null; renderMapsPanel(); });
    els.panelBody.innerHTML=`
      <div class="map-viewer-page">
        <div class="map-viewer" id="mapViewer">
          <div class="map-viewer__frame" id="mapViewerFrame">
            <img class="map-viewer__img" id="mapViewerImg" src="${MAPS_BASE}/full/${map.id}.jpg" alt="${escapeHTML(map.title)}" draggable="false">
            <button type="button" class="map-viewer__btn map-viewer__expand" id="mapExpandBtn" aria-label="Ver a pantalla completa">⛶</button>
            <div class="map-viewer__controls">
              <button type="button" class="map-viewer__btn" id="mapZoomOut" aria-label="Alejar">−</button>
              <button type="button" class="map-viewer__btn" id="mapZoomReset" aria-label="Restablecer vista">⟲</button>
              <button type="button" class="map-viewer__btn" id="mapZoomIn" aria-label="Acercar">+</button>
            </div>
          </div>
        </div>
        ${map.subtitle?`<div class="maps-gallery__subtitle">${escapeHTML(map.subtitle)}</div>`:''}
        ${map.credit?`<div class="maps-gallery__credit">${escapeHTML(map.credit)}</div>`:''}
        <p class="maps-gallery__hint">Toca ⛶ para ver el mapa a pantalla completa. Ahí puedes acercar/alejar con los botones, la rueda del mouse o pellizcando con dos dedos, y arrastrar para moverte.</p>
      </div>`;
    initMapViewer();
  }

  // Zoom/pan con CSS transform puro (translate + scale), sin librerías.
  // `viewerEl` (#mapViewer) es solo el fondo de pantalla completa; `frame`
  // (#mapViewerFrame) es la caja que de verdad mantiene la proporción 4:3
  // del mapa y contiene la imagen y los botones — así el botón de cerrar
  // queda pegado a la esquina del mapa visible, no de la ventana entera.
  function initMapViewer(){
    const viewerEl=document.getElementById('mapViewer');
    const frame=document.getElementById('mapViewerFrame');
    const img=document.getElementById('mapViewerImg');
    if(!viewerEl||!frame||!img) return;
    const MIN_SCALE=1, MAX_SCALE=5, STEP=1.5;
    let scale=1, tx=0, ty=0;

    function apply(){ img.style.transform=`translate(${tx}px, ${ty}px) scale(${scale})`; }

    function clamp(){
      const cw=frame.clientWidth, ch=frame.clientHeight;
      const iw=img.clientWidth*scale, ih=img.clientHeight*scale;
      const maxX=Math.max(0,(iw-cw)/2), maxY=Math.max(0,(ih-ch)/2);
      tx=Math.min(maxX,Math.max(-maxX,tx));
      ty=Math.min(maxY,Math.max(-maxY,ty));
    }

    function setScale(newScale, anchorX, anchorY){
      newScale=Math.min(MAX_SCALE,Math.max(MIN_SCALE,newScale));
      if(anchorX!==undefined){
        // Mantiene el punto bajo el cursor/dedo fijo mientras cambia la escala.
        const rect=frame.getBoundingClientRect();
        const cx=anchorX-rect.left-rect.width/2;
        const cy=anchorY-rect.top-rect.height/2;
        const ratio=newScale/scale;
        tx=cx-(cx-tx)*ratio;
        ty=cy-(cy-ty)*ratio;
      }
      scale=newScale;
      if(scale===MIN_SCALE){ tx=0; ty=0; }
      clamp();
      apply();
    }

    function reset(){ scale=1; tx=0; ty=0; apply(); }

    // Pantalla completa: el fondo cubre toda la ventana, pero `frame` se
    // encoge para mantener la proporción 4:3 del mapa dentro de ese fondo
    // (ver CSS .map-viewer--fullscreen .map-viewer__frame). Se cierra con
    // el mismo botón o Escape.
    const expandBtn=document.getElementById('mapExpandBtn');
    let isFullscreen=false;
    function setFullscreen(v){
      isFullscreen=v;
      viewerEl.classList.toggle('map-viewer--fullscreen', v);
      document.body.classList.toggle('map-viewer-fullscreen-active', v);
      if(expandBtn){
        expandBtn.textContent=v?'✕':'⛶';
        expandBtn.setAttribute('aria-label', v?'Salir de pantalla completa':'Ver a pantalla completa');
      }
      clamp(); apply();
    }
    expandBtn?.addEventListener('click', ()=>setFullscreen(!isFullscreen));
    function onKeydown(e){
      if(!document.body.contains(viewerEl)){ document.removeEventListener('keydown', onKeydown); return; }
      if(e.key==='Escape' && isFullscreen) setFullscreen(false);
    }
    document.addEventListener('keydown', onKeydown);

    document.getElementById('mapZoomIn')?.addEventListener('click',()=>{
      const r=frame.getBoundingClientRect();
      setScale(scale*STEP, r.left+r.width/2, r.top+r.height/2);
    });
    document.getElementById('mapZoomOut')?.addEventListener('click',()=>{
      const r=frame.getBoundingClientRect();
      setScale(scale/STEP, r.left+r.width/2, r.top+r.height/2);
    });
    document.getElementById('mapZoomReset')?.addEventListener('click', reset);

    // Zoom, arrastre y gestos táctiles solo tienen efecto a pantalla completa
    // (ver setFullscreen arriba) — en el panel chico el mapa es solo vista
    // previa estática, no hay espacio real para explorar con zoom.

    // Rueda del mouse en escritorio.
    frame.addEventListener('wheel', e=>{
      if(!isFullscreen) return;
      e.preventDefault();
      setScale(scale*(e.deltaY<0?1.15:1/1.15), e.clientX, e.clientY);
    }, {passive:false});

    // Doble clic/doble tap: alterna entre vista completa y zoom 2.5x.
    let lastTapTime=0, lastTapX=0, lastTapY=0;
    function toggleZoom(x,y){
      if(scale>MIN_SCALE) reset(); else setScale(2.5,x,y);
    }
    frame.addEventListener('dblclick', e=>{
      if(!isFullscreen) return;
      e.preventDefault(); toggleZoom(e.clientX,e.clientY);
    });

    // Arrastre con mouse (solo aporta cuando hay zoom aplicado).
    let dragging=false, dragStartX=0, dragStartY=0, startTx=0, startTy=0;
    frame.addEventListener('mousedown', e=>{
      if(!isFullscreen || scale<=MIN_SCALE) return;
      dragging=true; dragStartX=e.clientX; dragStartY=e.clientY; startTx=tx; startTy=ty;
      frame.classList.add('map-viewer--dragging');
    });
    window.addEventListener('mousemove', e=>{
      if(!dragging) return;
      tx=startTx+(e.clientX-dragStartX);
      ty=startTy+(e.clientY-dragStartY);
      clamp(); apply();
    });
    window.addEventListener('mouseup', ()=>{ dragging=false; frame.classList.remove('map-viewer--dragging'); });

    // Touch: un dedo para arrastrar, dos dedos para pellizcar y hacer zoom.
    let touchMode=null; // 'pan' | 'pinch'
    let pinchStartDist=0, pinchStartScale=1;
    let panStartX=0, panStartY=0, panStartTx=0, panStartTy=0;

    function touchDist(t0,t1){ return Math.hypot(t1.clientX-t0.clientX, t1.clientY-t0.clientY); }
    function touchMid(t0,t1){ return {x:(t0.clientX+t1.clientX)/2, y:(t0.clientY+t1.clientY)/2}; }

    frame.addEventListener('touchstart', e=>{
      if(!isFullscreen) return;
      if(e.touches.length===2){
        touchMode='pinch';
        pinchStartDist=touchDist(e.touches[0],e.touches[1]);
        pinchStartScale=scale;
      } else if(e.touches.length===1){
        const now=Date.now();
        const t=e.touches[0];
        if(now-lastTapTime<320 && Math.hypot(t.clientX-lastTapX,t.clientY-lastTapY)<24){
          toggleZoom(t.clientX,t.clientY);
          lastTapTime=0;
          touchMode=null;
          return;
        }
        lastTapTime=now; lastTapX=t.clientX; lastTapY=t.clientY;
        touchMode='pan';
        panStartX=t.clientX; panStartY=t.clientY; panStartTx=tx; panStartTy=ty;
      }
    }, {passive:true});

    frame.addEventListener('touchmove', e=>{
      if(touchMode==='pinch' && e.touches.length===2){
        e.preventDefault();
        const dist=touchDist(e.touches[0],e.touches[1]);
        const mid=touchMid(e.touches[0],e.touches[1]);
        setScale(pinchStartScale*(dist/pinchStartDist), mid.x, mid.y);
      } else if(touchMode==='pan' && e.touches.length===1){
        if(scale<=MIN_SCALE) return;
        e.preventDefault();
        const t=e.touches[0];
        tx=panStartTx+(t.clientX-panStartX);
        ty=panStartTy+(t.clientY-panStartY);
        clamp(); apply();
      }
    }, {passive:false});

    frame.addEventListener('touchend', e=>{
      if(e.touches.length<2) touchMode = e.touches.length===1 ? 'pan' : null;
    });

    apply();
  }

  function patristicModeToggleHtml(){
    return `<button type="button" class="note-card__copy${patristicMode==='docs'?' sermon-mode-toggle--active':''}" data-patristic-mode="docs">📖 ${t('padres.modoDocumentos')}</button>
      <button type="button" class="note-card__copy${patristicMode==='verse'?' sermon-mode-toggle--active':''}" data-patristic-mode="verse">🔗 ${t('padres.modoVersiculo')}</button>`;
  }
  function wirePatristicModeToggle(){
    document.querySelectorAll('[data-patristic-mode]').forEach(btn=>btn.addEventListener('click',()=>{
      const mode=btn.dataset.patristicMode;
      if(mode===patristicMode) return;
      patristicMode=mode;
      localStorage.setItem('verbo:patristicMode',mode);
      renderPadresPanel(activeVerse());
    }));
  }

  async function renderPatristicByVerse(focus=null){
    if(!patristicByVerseCatalog){
      els.panelToolbar.innerHTML=`<div class="compare-toolbar">${patristicModeToggleHtml()}</div>`;
      wirePatristicModeToggle();
      els.panelBody.innerHTML=emptyState('⌛',t('padres.cargandoFuentes'));
      try{
        const registry=await VerboModules.getCatalog();
        patristicByVerseCatalog=(registry.patristicByVerse||[]).map(item=>({id:item.manifest.id,label:item.manifest.abbreviation||item.manifest.name,full:item.manifest.name,path:item.path,manifest:item.manifest}));
      }catch(error){console.error(error);}
    }
    if(!patristicByVerseCatalog || !patristicByVerseCatalog.length){
      els.panelToolbar.innerHTML=`<div class="compare-toolbar">${patristicModeToggleHtml()}</div>`;
      wirePatristicModeToggle();
      els.panelBody.innerHTML=emptyState('🔗',t('padres.sinAncladas'));
      return;
    }

    if(pendingPatristicSources && pendingPatristicSources.length){
      // Preferir, en orden del catálogo, la primera fuente que sí tiene un
      // fragmento anclado a este versículo — así se abre directo (una sola
      // fuente => esa; varias => la primera) sin pasar por el selector.
      const preferred=patristicByVerseCatalog.find(x=>pendingPatristicSources.includes(x.id));
      if(preferred){
        currentPatristicByVerse=preferred.id;
        localStorage.setItem('verbo:lastPatristicByVerse', preferred.id);
      }
      pendingPatristicSources=null;
    } else if(!currentPatristicByVerse || !patristicByVerseCatalog.some(x=>x.id===currentPatristicByVerse)){
      const saved=localStorage.getItem('verbo:lastPatristicByVerse');
      currentPatristicByVerse=patristicByVerseCatalog.some(x=>x.id===saved) ? saved : patristicByVerseCatalog[0].id;
    }
    const selected=patristicByVerseCatalog.find(x=>x.id===currentPatristicByVerse) || patristicByVerseCatalog[0];

    const sourceOptions=patristicByVerseCatalog.map(x=>`<option value="${x.id}" ${x.id===currentPatristicByVerse?'selected':''}>${escapeHTML(x.label)}</option>`).join('');
    els.panelToolbar.innerHTML=`<div class="compare-toolbar">${patristicModeToggleHtml()}</div><div class="compare-toolbar"><span class="compare-toolbar__label">${t('padres.fuenteLabel')}</span><select class="compare-toolbar__select" id="patristicByVerseSelect">${sourceOptions}</select></div>`;
    wirePatristicModeToggle();
    document.getElementById('patristicByVerseSelect')?.addEventListener('change', e=>{
      localStorage.setItem('verbo:lastPatristicByVerse', e.target.value);
      currentPatristicByVerse=e.target.value;
      renderPatristicByVerse(activeVerse());
    });

    els.panelBody.innerHTML=emptyState('⌛',t('padres.cargandoFragmento'));
    try{
      const resource=await VerboModules.loadLinkedEntries(selected.path,currentBook,currentChapter);
      renderLinkedResourceEntries(resource, resource.entries, focus, '🔗', t('padres.sinFragmentos'), selected.path);
    }catch(error){ console.error(error); els.panelBody.innerHTML=emptyState('⚠️',t('padres.errorRecurso')); }
  }

  async function renderPadresPanel(focus=null){
    els.panelTitle.textContent=t('padres.title');

    if(patristicMode==='verse'){
      await renderPatristicByVerse(focus);
      return;
    }

    els.panelToolbar.innerHTML='';

    if(!patristicCatalog){
      els.panelBody.innerHTML=emptyState('⌛',t('padres.cargandoColeccion'));
      try{
        const registry=await VerboModules.getCatalog();
        patristicCatalog=(registry.patristic||[]).map(item=>({id:item.manifest.id,label:item.manifest.abbreviation||item.manifest.name,full:item.manifest.name,manifest:item.manifest}));
      }catch(error){console.error(error);}
    }
    if(!patristicCatalog || !patristicCatalog.length){
      els.panelBody.innerHTML=emptyState('📜',t('padres.coleccionPreparacion'));
      return;
    }

    // Nivel 3: leyendo una sección específica
    if(patristicOpenDoc && patristicOpenSection!=null){
      renderPatristicSection();
      return;
    }

    // Nivel 2: índice de secciones de un documento ya elegido
    if(patristicOpenDoc){
      await renderPatristicIndex();
      return;
    }

    // Nivel 1: lista de documentos disponibles en la colección
    els.panelToolbar.innerHTML=`<div class="compare-toolbar">${patristicModeToggleHtml()}</div>`;
    wirePatristicModeToggle();
    els.panelBody.innerHTML=`<div class="dictionary-library">${patristicCatalog.map(d=>`
      <button type="button" class="dictionary-library__item" data-patristic-doc="${d.id}">
        <span data-patristic-doc-name="${d.id}">${escapeHTML(d.full)}</span>
        <small>${escapeHTML(d.manifest.year||'')}</small>
      </button>`).join('')}</div>`;
    document.querySelectorAll('[data-patristic-doc]').forEach(btn=>{
      btn.addEventListener('click',()=>{ patristicOpenDoc=btn.dataset.patristicDoc; renderPadresPanel(); els.panelBody.scrollTop=0; });
    });
    translatePatristicDocNames();
  }

  // Traduce los nombres de los documentos patrísticos de nivel 1 (ej. "Epístola
  // de Bernabé") — antes solo el cuerpo de cada sección se traducía; el nombre
  // del documento se quedaba siempre en su idioma original. Se agrupa por
  // idioma fuente y se traduce en un solo request por grupo (documentos
  // suficientemente pocos y cortos para no necesitar troceo).
  async function translatePatristicDocNames(){
    const target=contentLang();
    const pending=patristicCatalog.filter(d=>(d.manifest.language||'es')!==target);
    if(!pending.length) return;
    const bySource=new Map();
    pending.forEach(d=>{
      const source=d.manifest.language||'es';
      if(!bySource.has(source)) bySource.set(source,[]);
      bySource.get(source).push(d);
    });
    const DELIM='\n@@@\n';
    for(const [source,docs] of bySource){
      const cacheKey=translationCacheKey(`patristic-doclist:${source}`, docs.map(d=>d.full).join(DELIM), target);
      let translatedNames=tcacheGet(cacheKey);
      if(!translatedNames){
        const translated=await googleTranslate(docs.map(d=>d.full).join(DELIM), source, target);
        if(!translated) continue;
        const parts=translated.split(/\s*@@@\s*/).map(x=>x.trim());
        if(parts.length!==docs.length) continue; // el delimitador se rompió en la traducción; no aplicar nada
        translatedNames=parts;
        tcacheSet(cacheKey, translatedNames);
      }
      docs.forEach((d,i)=>{
        const el=els.panelBody.querySelector(`[data-patristic-doc-name="${d.id}"]`);
        if(el){ el.textContent=translatedNames[i]; el.dataset.translated=target; }
      });
    }
  }

  let patristicDocData=null;

  async function renderPatristicIndex(){
    if(!patristicDocData || patristicDocData.manifest.id!==patristicOpenDoc){
      els.panelBody.innerHTML=emptyState('⌛',t('padres.cargandoDocumento'));
      try{
        patristicDocData=await VerboModules.loadPatristic(patristicOpenDoc);
      }catch(error){console.error(error);}
    }
    if(!patristicDocData){
      els.panelBody.innerHTML=emptyState('⚠️',t('padres.errorDocumento'));
      return;
    }
    els.panelToolbar.innerHTML=`<button class="note-card__copy" id="backToPatristicDocs" type="button">← ${t('padres.volverColeccion')}</button>`;
    document.getElementById('backToPatristicDocs')?.addEventListener('click',()=>{ patristicOpenDoc=null; patristicDocData=null; renderPadresPanel(); els.panelBody.scrollTop=0; });

    const statusBanner=patristicDocData.manifest.status?`<div class="gospel-match"><div class="gospel-match__label">${t('padres.estadoLabel')}</div><div style="padding:4px 2px;">${escapeHTML(patristicDocData.manifest.status)}</div></div>`:'';

    const list=patristicDocData.sections.map(s=>`
      <button type="button" class="dictionary-library__item" data-patristic-section="${s.n}">
        <span data-patristic-section-title="${s.n}">${escapeHTML(s.title)}</span>
      </button>`).join('');

    els.panelBody.innerHTML=`${statusBanner}<div class="dictionary-library"><div class="dictionary-library__count">${t('padres.seccionesCount',{count:patristicDocData.sections.length})}</div><div>${list}</div></div>`;
    document.querySelectorAll('[data-patristic-section]').forEach(btn=>{
      btn.addEventListener('click',()=>{ patristicOpenSection=Number(btn.dataset.patristicSection); renderPadresPanel(); els.panelBody.scrollTop=0; });
    });
    translatePatristicSectionTitles(patristicDocData);
  }

  // Traduce los títulos de sección del índice de nivel 2 (ej. "Capítulo 5 — La
  // nueva alianza..."). Un solo request para todo el índice (join con
  // delimitador) en vez de uno por sección — documentos como Ireneo tienen
  // decenas de secciones.
  async function translatePatristicSectionTitles(docData){
    const source=docData.manifest.language||'es';
    const target=contentLang();
    if(source===target) return;
    const DELIM='\n@@@\n';
    const cacheKey=translationCacheKey(`patristic-index:${docData.manifest.id}`, docData.sections.map(s=>s.title).join(DELIM), target);
    let translatedTitles=tcacheGet(cacheKey);
    if(!translatedTitles){
      const translated=await googleTranslate(docData.sections.map(s=>s.title).join(DELIM), source, target);
      if(!translated) return;
      const parts=translated.split(/\s*@@@\s*/).map(x=>x.trim());
      if(parts.length!==docData.sections.length) return; // el delimitador se rompió en la traducción; no aplicar nada
      translatedTitles=parts;
      tcacheSet(cacheKey, translatedTitles);
    }
    docData.sections.forEach((s,i)=>{
      const el=els.panelBody.querySelector(`[data-patristic-section-title="${s.n}"]`);
      if(el){ el.textContent=translatedTitles[i]; el.dataset.translated=target; }
    });
  }

  function renderPatristicSection(){
    const section=patristicDocData.sections.find(s=>s.n===patristicOpenSection);
    if(!section){ els.panelBody.innerHTML=emptyState('⚠️',t('padres.seccionNoEncontrada')); return; }
    els.panelToolbar.innerHTML=`
      <button class="note-card__copy" id="backToPatristicIndex" type="button">← ${t('padres.volverIndice')}</button>
      <button class="note-card__copy" id="copyPatristicSection" type="button">${t('padres.copiarSeccion')}</button>`;
    document.getElementById('backToPatristicIndex')?.addEventListener('click',()=>{ patristicOpenSection=null; renderPadresPanel(); els.panelBody.scrollTop=0; });
    const source=patristicDocData.manifest.language||'es';
    const target=contentLang();
    const needsTranslation=source!==target;
    const contentHtml=nl2p(section.content);
    const bodyHtml=needsTranslation
      ? (tcacheGet(translationCacheKey(`patristic:${patristicOpenDoc}:${section.n}`,section.content,target))||`<p class="note-card__translating">${t('comentario.traduciendo')}</p>${contentHtml}`)
      : contentHtml;
    const translationNote=needsTranslation
      ? `<p class="note-card__translation-note">${t('padres.traduccionAuto',{source:source.toUpperCase(),target:target.toUpperCase()})}</p>`
      : '';
    els.panelBody.innerHTML=`<article class="dict-entry">
      <div class="dict-entry__term" data-patristic-title="1">${escapeHTML(section.title)}</div>
      <div class="dict-entry__source" data-patristic-docname="1">${escapeHTML(patristicDocData.manifest.name)}</div>
      ${translationNote}
      <div class="dict-entry__def" data-patristic-body="1">${bodyHtml}</div>
    </article>`;
    document.getElementById('copyPatristicSection')?.addEventListener('click',()=>{
      const visible=els.panelBody.querySelector('[data-patristic-body]')?.innerText || section.content;
      copyToClipboard(`${section.title}\n${patristicDocData.manifest.name}\n\n${visible.trim()}`);
    });
    if(needsTranslation) setTimeout(()=>applyPatristicTranslation(section,source,target), 150);
  }

  async function applyPatristicTranslation(section, sourceLang, targetLang){
    const titleEl=els.panelBody.querySelector('[data-patristic-title]');
    if(titleEl && titleEl.dataset.translated!==targetLang){
      titleEl.dataset.translated='pending';
      const translatedTitle=await translateCommentaryHeader(`patristic-title:${patristicOpenDoc}:${section.n}`,'title',section.title,sourceLang,targetLang);
      if(titleEl.dataset.translated==='pending'){ titleEl.textContent=translatedTitle; titleEl.dataset.translated=targetLang; }
    }
    const docNameEl=els.panelBody.querySelector('[data-patristic-docname]');
    if(docNameEl && docNameEl.dataset.translated!==targetLang){
      docNameEl.dataset.translated='pending';
      const translatedName=await translateCommentaryHeader(`patristic-docname:${patristicOpenDoc}`,'name',patristicDocData.manifest.name,sourceLang,targetLang);
      if(docNameEl.dataset.translated==='pending'){ docNameEl.textContent=translatedName; docNameEl.dataset.translated=targetLang; }
    }
    const bodyEl=els.panelBody.querySelector('[data-patristic-body]');
    if(!bodyEl || bodyEl.dataset.translated===targetLang) return;
    bodyEl.dataset.translated='pending';
    const translated=await translateEntry(`patristic:${patristicOpenDoc}:${section.n}`, section.content, sourceLang, targetLang);
    // El usuario pudo haber navegado a otra sección mientras se traducía.
    const stillSameBody=els.panelBody.querySelector('[data-patristic-body]');
    if(stillSameBody===bodyEl && bodyEl.dataset.translated==='pending'){
      bodyEl.innerHTML=translated;
      bodyEl.dataset.translated=targetLang;
    }
  }

  async function renderExegesis(focus=null){
    els.panelTitle.textContent='Exégesis';
    const installed=exegesisCatalog();
    if(!installed.length){
      els.panelToolbar.innerHTML='';
      els.panelBody.innerHTML=emptyState('✍️','La sección Exégesis está lista. Cuando agregues módulos en modules/exegesis, aparecerán aquí.');
      return;
    }
    if(!installed.some(e=>e.id===currentExegesis)) currentExegesis=installed[0].id;
    const selected=installed.find(e=>e.id===currentExegesis) || installed[0];
    const options=installed.map(e=>`<option value="${e.id}" ${e.id===currentExegesis?'selected':''}>${escapeHTML(e.label)}</option>`).join('');
    els.panelToolbar.innerHTML=`<div class="compare-toolbar"><span class="compare-toolbar__label">Exégesis</span><select class="compare-toolbar__select" id="exegesisSelect">${options}</select></div>`;
    document.getElementById('exegesisSelect')?.addEventListener('change', e=>{
      currentExegesis=e.target.value;
      localStorage.setItem('verbo:lastExegesis', currentExegesis);
      renderExegesis(activeVerse());
    });
    els.panelBody.innerHTML=emptyState('⌛','Cargando exégesis…');
    try{
      const resource=await VerboModules.loadLinkedEntries(selected.path,currentBook,currentChapter);
      renderLinkedResourceEntries(resource, resource.entries, focus, '✍️', 'Este capítulo todavía no tiene exégesis cargada.');
    }catch(error){ console.error(error); els.panelBody.innerHTML=emptyState('⚠️','No se pudo abrir esta exégesis.'); }
  }

  function renderNotes(){
    els.panelTitle.textContent=t('notas.title');
    const key=`${data.meta.bookId}-${data.meta.chapter}`, saved=VerboBackup.getNota(key);
    els.panelBody.innerHTML=`<label class="personal-note-form__label">${t('notas.label',{ref:`${data.meta.book} ${data.meta.chapter}`})}</label><textarea id="personalNoteArea" class="personal-note-form__area" placeholder="${t('notas.placeholder')}">${saved}</textarea><div class="personal-note-form__status" id="noteSaveStatus">${saved?t('notas.guardado'):''}</div>`;
    const area=document.getElementById('personalNoteArea'), status=document.getElementById('noteSaveStatus'); let timer;
    area.addEventListener('input',()=>{status.textContent=t('notas.escribiendo');clearTimeout(timer);timer=setTimeout(()=>{VerboBackup.setNota(key,area.value);status.textContent=t('notas.guardado');},400);});
  }

  async function openDictionary(code){
    openPanel('diccionario');
    const selected=getStrongDictionary(code);
    currentDictionary=selected?.id || null;
    if(currentDictionary) localStorage.setItem('verbo:lastDictionary', currentDictionary);
    els.panelTitle.textContent=`${selected?.full || t('diccionario.lexicoStrong')} · ${code}`;
    els.panelToolbar.innerHTML='';
    els.panelBody.innerHTML=emptyState('⌛',t('diccionario.buscandoEntrada'));
    try{
      const result=await VerboModules.getDictionaryEntry(code, currentDictionary);
      if(!result){ els.panelBody.innerHTML=emptyState('🔎',t('diccionario.sinEntrada',{code})); return; }
      const rawHtml=result.entry.html||result.entry.definition||result.entry.content||'';
      const html=formatStrongEntryHtml(result.code,result.entry,rawHtml);
      const renderEntry=async()=>{
        const showEnglish=contentLang()==='en';
        els.panelToolbar.innerHTML='';
        els.panelBody.innerHTML=`<article class="dict-entry"><div class="dict-entry__term">${result.code}</div><div class="dict-entry__source">${escapeHTML(result.manifest.name)}</div><button class="note-card__copy" id="copyDictEntry" type="button">${t('diccionario.copiarDiccionario')}</button><div class="dict-entry__def" id="dictionaryEntryBody">${showEnglish?html:`<p class="note-card__translating">${t('diccionario.traduciendoEspanol')}</p>${html}`}</div></article>`;
        const body=document.getElementById('dictionaryEntryBody');
        if(!showEnglish && body){
          const translated=await translateDictionaryEntry(result.code,html);
          if(contentLang()==='es' && document.getElementById('dictionaryEntryBody')===body){
            body.innerHTML=translated;
            wireDictionaryLinks(body);
          }
        } else if(body) wireDictionaryLinks(body);
        document.getElementById('copyDictEntry')?.addEventListener('click',()=>{
          const visible=document.getElementById('dictionaryEntryBody')?.innerHTML||html;
          copyToClipboard(`${result.code}\n${String(visible).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()}`);
        });
      };
      await renderEntry();
    }catch(error){console.error(error);els.panelBody.innerHTML=emptyState('⚠️',t('diccionario.errorEntrada'));}
  }
  function updateNavButtons(){ const idx=catalog.books.findIndex(b=>b.id===currentBook); const atStart=idx===0&&currentChapter===1; const atEnd=idx===catalog.books.length-1&&currentChapter===els.chapter.options.length; els.prev.disabled=atStart; els.next.disabled=atEnd; if(els.innerPrev) els.innerPrev.disabled=atStart; if(els.innerNext) els.innerNext.disabled=atEnd; }
  async function moveChapter(delta){
    const idx=catalog.books.findIndex(b=>b.id===currentBook), count=els.chapter.options.length;
    if(delta<0&&currentChapter>1) currentChapter--; else if(delta>0&&currentChapter<count) currentChapter++; else {
      const nextIdx=idx+delta; if(nextIdx<0||nextIdx>=catalog.books.length)return;
      currentBook=catalog.books[nextIdx].id; els.book.value=currentBook; currentChapter=delta>0?1:(await VerboModules.getBookInfo(currentBook)).chapterCount; await refreshChapters();
    }
    els.chapter.value=String(currentChapter); updateNavButtons(); await loadPassage();
  }
  function setLoading(on){ els.body.classList.toggle('app-loading',on); }
  function showFatal(error){ els.list.innerHTML=emptyState('⚠️',t('biblia.moduloJsonError',{message:error.message})); }

  els.book.addEventListener('change',async()=>{currentBook=els.book.value;currentChapter=1;await refreshChapters();await loadPassage();});
  els.chapter.addEventListener('change',async()=>{currentChapter=Number(els.chapter.value);updateNavButtons();await loadPassage();});
  els.nativeVersionSelect?.addEventListener('change',()=>{ if(els.nativeVersionSelect.value) selectBibleVersion(els.nativeVersionSelect.value); });
  els.prev.addEventListener('click',()=>moveChapter(-1)); els.next.addEventListener('click',()=>moveChapter(1));
  els.innerPrev?.addEventListener('click',()=>moveChapter(-1));
  els.innerNext?.addEventListener('click',()=>moveChapter(1));

  // ── Swipe horizontal para cambiar capítulo en móvil ─────────────────────────
  let swipeStartX=null, swipeStartY=null;
  els.list.addEventListener('touchstart',e=>{
    swipeStartX=e.touches[0].clientX; swipeStartY=e.touches[0].clientY;
  },{passive:true});
  els.list.addEventListener('touchend',e=>{
    if(swipeStartX===null) return;
    const dx=e.changedTouches[0].clientX-swipeStartX;
    const dy=Math.abs(e.changedTouches[0].clientY-swipeStartY);
    swipeStartX=null; swipeStartY=null;
    // Solo activar si gesto principalmente horizontal (dx>60, dy<dx/2) y sin panel abierto
    if(Math.abs(dx)<60||dy>Math.abs(dx)/2||activeTab) return;
    if(window.innerWidth>760) return;
    moveChapter(dx<0?1:-1);
  });
  // ─────────────────────────────────────────────────────────────────────────────

  // ── Teclado en desktop ───────────────────────────────────────────────────────
  document.addEventListener('keydown', e => {
    if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA'||e.target.tagName==='SELECT'||e.target.isContentEditable) return;
    if(e.altKey||e.ctrlKey||e.metaKey) return;
    if(e.key==='ArrowLeft') { e.preventDefault(); moveChapter(-1); }
    else if(e.key==='ArrowRight') { e.preventDefault(); moveChapter(1); }
    else if(e.key==='ArrowUp'||e.key==='ArrowDown') {
      e.preventDefault();
      const rows=[...document.querySelectorAll('.verse')];
      if(!rows.length) return;
      const cur=document.querySelector('.verse--active');
      const curIdx=cur?rows.indexOf(cur):-1;
      const nextIdx=e.key==='ArrowDown'?Math.min(curIdx+1,rows.length-1):Math.max(curIdx-1,0);
      const nextRow=rows[nextIdx];
      document.querySelectorAll('.verse--active').forEach(x=>x.classList.remove('verse--active'));
      nextRow.classList.add('verse--active');
      nextRow.scrollIntoView({block:'nearest'});
      if(activeTab==='comentario'||activeTab==='comparar'||activeTab==='diccionario'||activeTab==='exegesis'){
        const n=Number(nextRow.dataset.verseN);
        const verse=data?.verses?.find(v=>v.n===n);
        if(verse) selectVerse(nextRow,verse);
      }
    }
    else if(e.key==='Enter') {
      const cur=document.querySelector('.verse--active');
      if(!cur) return;
      const n=Number(cur.dataset.verseN);
      const verse=data?.verses?.find(v=>v.n===n);
      if(verse) selectVerse(cur,verse);
    }
    else if(e.key==='Escape') { if(activeTab) closePanel(); }
    else if(e.key==='/') { e.preventDefault(); openPanel('buscar'); }
  });
  // ─────────────────────────────────────────────────────────────────────────────

  els.versionInput.addEventListener('click',()=>{ els.versionInput.readOnly=false; els.versionInput.value=''; openVersionDropdown(); });
  els.versionInput.addEventListener('input',openVersionDropdown);
  els.versionInput.addEventListener('blur',()=>setTimeout(closeVersionDropdown,150));
  els.versionInput.addEventListener('keydown',e=>{
    if(e.key==='Escape'){ closeVersionDropdown(); els.versionInput.blur(); }
    if(e.key==='Enter'){ const first=els.versionDropdown.querySelector('li'); if(first) selectBibleVersion(first.dataset.id); }
  });

  let armedMobileTool = null;
  let armedMobileTimer = null;

  function clearMobileToolArm(){
    if(armedMobileTimer){ clearTimeout(armedMobileTimer); armedMobileTimer=null; }
    els.tabs.forEach(btn=>btn.classList.remove('mobile-tool-btn--armed'));
    armedMobileTool=null;
  }

  els.tabs.forEach(b=>b.addEventListener('click',()=>{
    const isMobileTool = b.classList.contains('mobile-tool-btn') && window.matchMedia('(max-width: 760px)').matches;
    if(isMobileTool){
      if(armedMobileTool !== b){
        clearMobileToolArm();
        armedMobileTool=b;
        b.classList.add('mobile-tool-btn--armed');
        b.scrollIntoView({behavior:'smooth', block:'nearest', inline:'center'});
        armedMobileTimer=setTimeout(clearMobileToolArm, 3500);
        return;
      }
      clearMobileToolArm();
    }
    resetXrefMode();
    activeTab===b.dataset.tab ? closePanel() : openPanel(b.dataset.tab);
  }));
  els.search.addEventListener('click',()=>openPanel('buscar'));
  els.close.addEventListener('click',closePanel);
  els.copyVerseText?.addEventListener('click', copySelectedText);
  els.copyVerseRef?.addEventListener('click', copySelectedReferences);
  els.closeVerseAction?.addEventListener('click', ()=>{
    selectedVerses.clear();
    document.querySelectorAll('.verse--selected').forEach(x=>x.classList.remove('verse--selected'));
    updateActionBar();
  });
  document.querySelectorAll('.verse-swatch').forEach(swatch=>{
    swatch.addEventListener('click', ()=>{
      if(sermonMode) return; // el resaltado por color no aplica en la Biblia del modo sermón
      const color = swatch.dataset.color;
      selectedVerses.forEach(n=>{
        const key = hlKey(currentBook, currentChapter, n);
        if(color){ highlights[key]=color; } else { delete highlights[key]; }
        const row = els.list.querySelector(`[data-verse-n="${n}"]`);
        if(row){
          row.classList.remove(...HL_COLORS);
          if(color) row.classList.add(color);
        }
      });
      saveHighlights();
    });
  });
  window.addEventListener('scroll',()=>{ clearTimeout(commentSyncTimer); commentSyncTimer=setTimeout(syncCommentToReading,120); }, {passive:true});

  // ---- Respaldo local: guardado automático y silencioso en IndexedDB, sin
  // ningún diálogo de permiso. Se refuerza el volcado (incluye el puente
  // nativo de Capacitor, que va debounced) cuando la app pasa a segundo
  // plano o se cierra la pestaña — el equivalente a un botón "Salir" en
  // esta SPA, que no tiene uno explícito.
  (function initBackupAutoSave(){
    const flush=()=>{ VerboBackup.saveNow().catch(()=>{}); };
    document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='hidden') flush(); });
    window.addEventListener('pagehide', flush);
  })();

  // ---- Selector de idioma de interfaz: independiente del selector de Biblia ----
  // Cambiar acá NO toca currentVersion/verbo:lastVersion, y elegir una Biblia
  // en el version-picker tampoco toca esto — ver VerboI18n.setUiLang (assets/i18n.js).
  (function initUiLangSwitcher(){
    if(!window.VerboI18n) return;
    const buttons=[...document.querySelectorAll('#uiLangSwitcher [data-lang]')];
    if(!buttons.length) return;
    const markActive=()=>{
      const current=VerboI18n.getUiLang();
      buttons.forEach(btn=>btn.classList.toggle('is-active', btn.dataset.lang===current));
    };
    // Los rótulos estáticos del HTML (data-i18n) ya se re-aplican solos
    // dentro de setUiLang(); lo que queda por refrescar acá es lo que app.js
    // arma con t() en tiempo de render (título del capítulo, panel lateral
    // abierto) — sin esto quedarían en el idioma anterior hasta el próximo
    // cambio de versículo/pestaña.
    const refreshDynamicText=()=>{
      if(data) renderChapter(activeVerse());
      if(activeTab) renderPanel(activeTab);
    };
    buttons.forEach(btn=>btn.addEventListener('click',()=>VerboI18n.setUiLang(btn.dataset.lang)));
    document.addEventListener('verbo:uilang-changed', ()=>{ markActive(); refreshDynamicText(); });
    markActive();
  })();
});

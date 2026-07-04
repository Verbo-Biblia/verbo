document.addEventListener('DOMContentLoaded', async () => {
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
    backdrop: document.getElementById('sheetBackdrop')
  };

  let catalog, data, activeTab = null, currentVersion = null, compareVersion = null;
  let selectedVerses = new Set();
  let highlights = JSON.parse(localStorage.getItem('verbo:highlights') || '{}');
  let suppressCommentSync = false;
  let commentSyncTimer = null;
  let searchState = null;
  let currentCommentary = localStorage.getItem('verbo:lastCommentary') || null;
  let commentaryLangPref = localStorage.getItem('verbo:commentaryLang') || 'es';
  let currentDictionary = localStorage.getItem('verbo:lastDictionary') || null;
  let currentExegesis = localStorage.getItem('verbo:lastExegesis') || null;
  let gospelData=null;
  let gospelOpenChapter=null;
  let patristicCatalog=null;
  let patristicOpenDoc=null;
  let patristicOpenSection=null;
  let currentBook = localStorage.getItem('verbo:lastBook') || 'ROM';
  let currentChapter = Number(localStorage.getItem('verbo:lastChapter')) || 7;
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
  const saveHighlights = () => localStorage.setItem('verbo:highlights', JSON.stringify(highlights));
  const HL_COLORS = ['hl-yellow','hl-green','hl-blue','hl-pink','hl-coral','hl-violet'];
  const escapeHTML = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[ch]));
  const bibleCatalog = () => catalog.bibles.map(item => ({ id:item.manifest.id, label:item.manifest.abbreviation || item.manifest.name, full:item.manifest.name, path:item.path, lang:item.manifest.language || 'es' }));
  const commentaryCatalog = () => (catalog.commentaries || []).map(item => ({ id:item.manifest.id, label:item.manifest.abbreviation || item.manifest.name, full:item.manifest.name, path:item.path, manifest:item.manifest }));
  // Léxico Strong: módulos numéricos (G1234 / H1234) consultados al tocar una etiqueta Strong en el texto.
  const isStrongLexicon = item => Boolean(item.manifest.strong);
  const dictionaryCatalog = () => (catalog.dictionaries || []).filter(isStrongLexicon).map(item => ({ id:item.manifest.id, label:item.manifest.abbreviation || item.manifest.name, full:item.manifest.name, path:item.path, manifest:item.manifest, linked:Boolean(item.manifest.books?.length) }));
  // Biblioteca: todo lo demás — recursos de consulta libre por palabra/tema, sin ancla a versículo
  // (ej. Diccionario Nelson), más Padres Apostólicos y libros adicionales.
  const libraryCatalog = () => [ ...(catalog.library || []), ...(catalog.dictionaries || []).filter(item => !isStrongLexicon(item)) ].map(item => ({ id:item.manifest.id, label:item.manifest.abbreviation || item.manifest.name, full:item.manifest.name, path:item.path, manifest:item.manifest, linked:Boolean(item.manifest.books?.length), type:item.manifest.type || 'resource' }));
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
    try { await navigator.clipboard.writeText(text); toast('Copiado'); }
    catch { const area=document.createElement('textarea'); area.value=text; document.body.appendChild(area); area.select(); document.execCommand('copy'); area.remove(); toast('Copiado'); }
  };
  const toast = (message) => {
    let el=document.querySelector('.verbo-toast');
    if(!el){ el=document.createElement('div'); el.className='verbo-toast'; document.body.appendChild(el); }
    el.textContent=message; el.classList.add('verbo-toast--show');
    clearTimeout(el._timer); el._timer=setTimeout(()=>el.classList.remove('verbo-toast--show'),1400);
  };

  applyTheme(localStorage.getItem('verbo:theme') || 'paper');

  try {
    catalog = await VerboModules.getCatalog();
    populateBooks();
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

  function populateBooks() {
    els.book.innerHTML = catalog.books.map(b => `<option value="${b.id}">${b.name}</option>`).join('');
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
    try {
      const previous = preserveVersion ? currentVersion : null;
      data = await VerboModules.buildChapterData({bookId: currentBook, chapter: currentChapter, commentaryId: currentCommentary});
      currentVersion = previous && data.versions[previous] ? previous : data.meta.version;
      const availableCompare = bibleCatalog();
      const preferredCompare = availableCompare.find(v => v.id !== currentVersion)?.id || currentVersion;
      compareVersion = compareVersion && availableCompare.some(v => v.id === compareVersion)
        ? compareVersion : preferredCompare;
      populateVersions();
      selectedVerses.clear();
      renderChapter();
      updateActionBar();
      localStorage.setItem('verbo:lastBook', currentBook);
      localStorage.setItem('verbo:lastChapter', String(currentChapter));
      gospelOpenChapter=null;
      if (activeTab) renderPanel(activeTab);
      window.scrollTo({top:0, behavior:'smooth'});
    } catch (error) {
      console.error(error);
      els.list.innerHTML = emptyState('⚠️', 'No se pudo cargar este pasaje.');
    } finally { setLoading(false); }
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

  function selectBibleVersion(id) {
    const v = activeVerse();
    currentVersion = id;
    if (compareVersion === currentVersion) compareVersion = Object.keys(data.versions).find(x => x !== currentVersion) || currentVersion;
    closeVersionDropdown();
    populateVersions();
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
    renderChapter(v);
    if (activeTab === 'comparar') renderCompare(v);
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
          strongCodes.forEach((code,codeIndex)=>{ const tag=document.createElement('button'); tag.type='button'; tag.className='strongs-tag'; tag.textContent=code; tag.dataset.strongCode=code; const morphs=[...(seg.morph?[seg.morph]:[]),...(Array.isArray(seg.morphs)?seg.morphs:[])]; tag.title=morphs[codeIndex]?`Morfología: ${morphs[codeIndex]}`:'Abrir diccionario'; text.appendChild(tag); });
        });
      } else text.textContent=v.text[currentVersion] || Object.values(v.text)[0] || '';
      const margin=document.createElement('span'); margin.className='marginalia';
      row.append(num,text);
      if(v.hasNote && (v.commentaries||[]).length){
        const indicator=document.createElement('button');
        indicator.type='button';
        indicator.className='verse__comment-indicator';
        const count=v.commentaries.length;
        indicator.innerHTML=`<span class="verse__comment-indicator__icon" aria-hidden="true">◆</span><span class="verse__comment-indicator__count">${count}</span>`;
        const plural=count===1?'comentario disponible':'comentarios disponibles';
        indicator.title=`${count} ${plural} para este versículo`;
        indicator.setAttribute('aria-label',`Ver ${count} ${plural} en ${data.meta.book} ${data.meta.chapter}:${v.n}`);
        indicator.addEventListener('click',(e)=>{
          e.stopPropagation();
          document.querySelectorAll('.verse--active').forEach(x=>x.classList.remove('verse--active'));
          row.classList.add('verse--active');
          openPanel('comentario', null, v.commentaries);
        });
        row.appendChild(indicator);
      }
      row.appendChild(margin); els.list.appendChild(row);
      text.addEventListener('click',()=>{ selectVerse(row,v); });
      text.addEventListener('contextmenu',(e)=>{ e.preventDefault(); selectVerse(row,v); });
      text.querySelectorAll('.strongs-tag').forEach(tag=>tag.addEventListener('click',e=>{e.stopPropagation(); openDictionary(tag.dataset.strongCode);}));
    });
  }

  function selectVerse(row, verse) {
    document.querySelectorAll('.verse--active').forEach(x=>x.classList.remove('verse--active'));
    row.classList.add('verse--active');
    if(selectedVerses.has(verse.n)) selectedVerses.delete(verse.n); else selectedVerses.add(verse.n);
    row.classList.toggle('verse--selected', selectedVerses.has(verse.n));
    updateActionBar();
    const firstNote=verse.commentaries?.find(c=>c.commentaryId===currentCommentary)?.noteIds?.[0]||null;
    if (activeTab === 'comentario') renderPanel('comentario', firstNote);
    if (activeTab === 'comparar') renderCompare(verse.n);
    if (activeTab === 'diccionario') renderPanel('diccionario', verse.n);
    if (activeTab === 'exegesis') renderPanel('exegesis', verse.n);
  }

  function updateActionBar(){
    if(!els.verseActionBar) return;
    els.verseActionBar.hidden = selectedVerses.size === 0;
  }

  function selectedVerseNumbers(){ return [...selectedVerses].sort((a,b)=>a-b); }

  function copySelectedReferences(){
    const nums=selectedVerseNumbers();
    if(!nums.length) return;
    copyToClipboard(compactRef(currentBook,currentChapter,nums));
  }

  function copySelectedText(){
    const nums=selectedVerseNumbers();
    if(!nums.length) return;
    const lines=nums.map(n=>{
      const verse=data.verses.find(v=>v.n===n);
      const text=verse?.text?.[currentVersion] || Object.values(verse?.text || {})[0] || '';
      return `${compactRef(currentBook,currentChapter,[n])} ${String(text).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()}`;
    });
    copyToClipboard(lines.join('\n'));
  }

  const SHEET_TABS = ['comentario','comparar','diccionario'];
  function isMobileSheet(){ return window.innerWidth<=760 && SHEET_TABS.includes(activeTab); }

  function openPanel(tab, focus=null, verseCommentaries=null) {
    const panelWasClosed=!els.side.classList.contains('side-panel--open');
    activeTab=tab;
    const isSheet=window.innerWidth<=760 && SHEET_TABS.includes(tab);
    els.side.classList.toggle('side-panel--left', ['biblioteca','padres','evangelio','licencias'].includes(tab));
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
    els.side.classList.remove('side-panel--open','side-panel--left'); // CSS: translateY(105%) para sheets
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
      if(!focus && !verseCommentaries){
        const selectedVerseNumber = activeVerse();
        const selectedVerse = data?.verses?.find(v => v.n === selectedVerseNumber);
        const moduleInfo=selectedVerse?.commentaries?.find(c=>c.commentaryId===currentCommentary);
        focus = moduleInfo?.noteIds?.[0] || null;
      }
      els.panelTitle.textContent='Comentario';
      const installed=commentaryCatalog();
      const currentManifest=catalog?.commentaries?.find(c=>c.manifest.id===currentCommentary)?.manifest;
      const isEnglishCommentary=currentManifest?.language==='en';
      if(installed.length){
        const options=installed.map(c=>`<option value="${c.id}" ${c.id===currentCommentary?'selected':''}>${escapeHTML(c.label)}</option>`).join('');
        const langBtn=isEnglishCommentary
          ?`<button class="commentary-lang-btn ${commentaryLangPref==='en'?'commentary-lang-btn--active':''}" id="commentaryLangToggle" title="${commentaryLangPref==='en'?'Ver en español':'Ver en inglés'}">${commentaryLangPref==='en'?'ES ↩':'EN ↗'}</button>`
          :'';
        els.panelToolbar.innerHTML=`<div class="compare-toolbar"><select class="compare-toolbar__select" id="commentarySelect">${options}</select>${langBtn}</div>`;
        document.getElementById('commentarySelect')?.addEventListener('change', e=>{
          currentCommentary=e.target.value;
          localStorage.setItem('verbo:lastCommentary', currentCommentary);
          const selectedVerseNumber=activeVerse();
          const selectedVerse=data?.verses?.find(v=>v.n===selectedVerseNumber);
          const moduleInfo=selectedVerse?.commentaries?.find(c=>c.commentaryId===currentCommentary);
          renderPanel('comentario', moduleInfo?.noteIds?.[0] || null);
        });
        document.getElementById('commentaryLangToggle')?.addEventListener('click', ()=>{
          commentaryLangPref=commentaryLangPref==='es'?'en':'es';
          localStorage.setItem('verbo:commentaryLang', commentaryLangPref);
          renderPanel('comentario', focus, verseCommentaries, false);
        });
      }
      if(verseCommentaries && verseCommentaries.length && !focus){
        const curNote=verseCommentaries.find(c=>c.commentaryId===currentCommentary);
        focus=curNote?.noteIds?.[0]||null;
      }
      const entries=Object.entries(data.notes).filter(([,note])=>note.commentaryId===currentCommentary);
      els.panelBody.innerHTML=entries.length?entries.map(([id,n])=>{
        const bodyHtml=isEnglishCommentary&&commentaryLangPref==='es'
          ? (tcacheGet(translationCacheKey(id,n.body))||`<p class="note-card__translating">Traduciendo…</p>${n.body}`)
          : n.body;
        return `<div class="note-card" data-note-id="${id}"><div class="note-card__ref">${data.meta.book} ${data.meta.chapter}</div><div class="note-card__title">${n.title}</div><div class="note-card__author">${n.author}</div><button class="note-card__copy" type="button" data-copy-note="${id}">Copiar comentario</button><div class="note-card__body">${bodyHtml}</div></div>`;
      }).join(''):emptyState('📖','Este capítulo todavía no tiene comentarios cargados.');
      els.panelBody.querySelectorAll('[data-copy-note]').forEach(btn=>btn.addEventListener('click',()=>{ const note=data.notes[btn.dataset.copyNote]; if(note) copyToClipboard(`${note.title}\n${String(note.body).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()}`); }));
      if(focus){ if(delayScroll) setTimeout(()=>scrollCommentToNote(focus),320); else scrollCommentToNote(focus); }
      if(isEnglishCommentary && commentaryLangPref==='es') setTimeout(()=>applyCommentaryTranslation(focus), 150);
    }
    if(tab==='comparar'){ els.panelTitle.textContent='Comparar versiones'; renderCompare(focus||activeVerse()); }
    if(tab==='diccionario') renderDictionaryPanel(focus || activeVerse());
    if(tab==='biblioteca') renderLibraryPanel(focus || activeVerse());
    if(tab==='evangelio') renderGospelPanel();
    if(tab==='padres') renderPadresPanel();
    if(tab==='notas') renderNotes();
    if(tab==='exegesis') renderExegesis(focus || activeVerse());
    if(tab==='tema') renderTheme();
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
          <h3>Biblia Verbo RV2026</h3>
          <p>Edición Verbo basada en la Reina-Valera 1909 de dominio público. Actualmente se publica sin una capa Strong española.</p>
        </article>

        <article class="license-card">
          <h3>Diccionarios Strong</h3>
          <p>Los diccionarios hebreo y griego de James Strong proceden de obras de dominio público. Los módulos base de CrossWire se distribuyen como <strong>Public Domain</strong>.</p>
          <div class="license-card__links">
            <a href="https://www.crosswire.org/sword/modules/ModInfo.jsp?modName=StrongsHebrew" target="_blank" rel="noopener noreferrer">Strong hebreo</a>
            <a href="https://www.crosswire.org/sword/modules/ModInfo.jsp?modName=StrongsGreek" target="_blank" rel="noopener noreferrer">Strong griego</a>
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
  function translationCacheKey(noteId, htmlContent){
    let hash=2166136261;
    const value=String(htmlContent||'');
    for(let i=0;i<value.length;i++){
      hash^=value.charCodeAt(i);
      hash=Math.imul(hash,16777619);
    }
    return `v2:${noteId}:${(hash>>>0).toString(16)}`;
  }
  function htmlToPlainText(html){ return html.replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/\s+/g,' ').trim(); }

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

  async function googleTranslate(text){
    async function fetchTranslate(chunk){
      try{
        const url=`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=es&dt=t&q=${encodeURIComponent(chunk)}`;
        const resp=await fetch(url);
        if(!resp.ok) return null;
        const json=await resp.json();
        if(!Array.isArray(json?.[0])) return null;
        return json[0].map(p=>p?.[0]||'').join('');
      }catch{ return null; }
    }
    if(text.length<=4500) return fetchTranslate(text);
    // Long text: translate in chunks sequentially to avoid URL limits
    const chunks=splitTextIntoChunks(text);
    const parts=[];
    for(const chunk of chunks){
      const r=await fetchTranslate(chunk);
      if(r===null) return null;
      parts.push(r);
    }
    return parts.join(' ');
  }

  async function translateEntry(noteId, htmlContent){
    const cacheKey=translationCacheKey(noteId,htmlContent);
    const cached=tcacheGet(cacheKey); if(cached) return cached;
    const text=htmlToPlainText(htmlContent);
    if(!text || text.length<10) return htmlContent;
    try{
      const translated=await googleTranslate(text);
      if(!translated) return htmlContent;
      // Rebuild as paragraphs — split on sentences ending with period + space
      const sentences=translated.split(/(?<=\.)\s+/);
      const paras=[];
      let para='';
      for(const s of sentences){
        para+=(para?' ':'')+s;
        if(para.length>300){ paras.push(para); para=''; }
      }
      if(para) paras.push(para);
      const result=paras.map(p=>`<p>${p}</p>`).join('');
      tcacheSet(cacheKey, result);
      return result;
    }catch{ return htmlContent; }
  }

  async function applyCommentaryTranslation(focusNoteId=null){
    if(commentaryLangPref==='en') return;
    const manifest=catalog?.commentaries?.find(c=>c.manifest.id===currentCommentary)?.manifest;
    if(manifest?.language!=='en') return;
    const cards=[...els.panelBody.querySelectorAll('.note-card[data-note-id]')];
    // Translate focused card first for immediate feedback
    const sorted = focusNoteId
      ? [...cards.filter(c=>c.dataset.noteId===focusNoteId), ...cards.filter(c=>c.dataset.noteId!==focusNoteId)]
      : cards;
    for(const card of sorted){
      const noteId=card.dataset.noteId;
      const bodyEl=card.querySelector('.note-card__body');
      if(!bodyEl||bodyEl.dataset.translated==='1') continue;
      const note=data.notes[noteId];
      if(!note) continue;
      bodyEl.dataset.translated='pending';
      const translated=await translateEntry(noteId, note.body);
      if(bodyEl.dataset.translated==='pending'){
        const prevTop = noteId===focusNoteId ? card.getBoundingClientRect().top : null;
        bodyEl.innerHTML=translated;
        bodyEl.dataset.translated='1';
        // Re-anchor scroll to keep focused card in place
        if(prevTop!==null){
          const newTop=card.getBoundingClientRect().top;
          els.panelBody.scrollTop += (newTop - prevTop);
        }
      }
    }
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

  async function renderCompare(focus) {
    const installed=bibleCatalog();
    if(!installed.length){ els.panelToolbar.innerHTML=''; els.panelBody.innerHTML=emptyState('📚','No hay otra Biblia instalada para comparar.'); return; }
    if(!installed.some(v=>v.id===compareVersion)) compareVersion=installed[0].id;
    const options=installed.map(v=>`<option value="${v.id}" ${v.id===compareVersion?'selected':''}>${escapeHTML(v.label)}${v.id===currentVersion?' (actual)':''}</option>`).join('');
    els.panelToolbar.innerHTML=`<div class="compare-toolbar"><span class="compare-toolbar__label">Biblia alterna</span><select class="compare-toolbar__select" id="compareVersionSelect">${options}</select></div>`;
    let verses=data.verses;
    if(!data.versions[compareVersion]){
      els.panelBody.innerHTML=emptyState('⌛','Cargando versión para comparar…');
      const selected=installed.find(v=>v.id===compareVersion);
      const loaded=selected ? await VerboModules.loadBible(selected.path,currentBook,currentChapter) : null;
      if(!loaded){ els.panelBody.innerHTML=emptyState('⚠️','Esta versión no contiene el pasaje seleccionado.'); return; }
      verses=data.verses.map(v=>({ ...v, text:{...v.text,[compareVersion]:(typeof loaded.verses[String(v.n)]==='string'?loaded.verses[String(v.n)]:loaded.verses[String(v.n)]?.text)||''} }));
    }
    els.panelBody.innerHTML=verses.map(v=>`<div class="compare-verse${v.n===focus?' compare-verse--active':''}" data-verse-n="${v.n}"><span class="compare-verse__num">${v.n}</span><span class="compare-verse__text">${escapeHTML(v.text[compareVersion]||'')}</span></div>`).join('');
    document.getElementById('compareVersionSelect')?.addEventListener('change',async e=>{compareVersion=e.target.value;await renderCompare(activeVerse());});
    if(focus) els.panelBody.querySelector(`[data-verse-n="${focus}"]`)?.scrollIntoView({block:'center'});
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
    const {results, versionId, scopeLabel}=searchState;
    const pageSize=100;
    let page=searchState.page || 0;
    const totalPages=Math.ceil(results.length/pageSize);
    const start=page*pageSize;
    const end=Math.min(start+pageSize,results.length);
    const visible=results.slice(start,end);
    els.panelBody.innerHTML=`
      <div class="search-summary">
        <strong>${results.length} resultados</strong>
        <span>${escapeHTML(scopeLabel)} · mostrando ${start+1}–${end}</span>
      </div>
      <div class="search-results-list">
        ${visible.map((r,i)=>`<button class="search-result" type="button" data-result="${start+i}"><span class="search-result__ref">${escapeHTML(r.book)} ${r.chapter}:${r.verse}</span><span class="search-result__text">${escapeHTML(r.text)}</span></button>`).join('')}
      </div>
      <nav class="search-pagination" aria-label="Páginas de resultados">
        <button class="search-page-button" id="searchPrevPage" type="button" ${page===0?'disabled':''}>‹ Anterior</button>
        <span class="search-page-status">Página ${page+1} de ${totalPages}</span>
        <button class="search-page-button" id="searchNextPage" type="button" ${page>=totalPages-1?'disabled':''}>Siguiente ›</button>
      </nav>`;
    els.panelBody.querySelectorAll('.search-result').forEach(btn=>btn.addEventListener('click',()=>openSearchResult(results[Number(btn.dataset.result)], versionId)));
    document.getElementById('searchPrevPage')?.addEventListener('click',()=>{ if(page>0){ searchState.page=page-1; renderSavedSearchResults(); els.panelBody.scrollTop=0;} });
    document.getElementById('searchNextPage')?.addEventListener('click',()=>{ if(page<totalPages-1){ searchState.page=page+1; renderSavedSearchResults(); els.panelBody.scrollTop=0;} });
  }

  function renderSearch(){
    els.panelTitle.textContent='Buscar en la Biblia';
    const saved = searchState || { query:'', versionId:currentVersion, testament:'nt', results:[], page:0, scopeLabel:'NT' };
    const options=bibleCatalog().map(v=>`<option value="${v.id}" ${v.id===saved.versionId?'selected':''}>${escapeHTML(v.label)}</option>`).join('');
    els.panelToolbar.innerHTML=`<form class="search-panel-form" id="searchForm">
      <input id="searchInput" class="search-panel-input" type="search" minlength="2" placeholder="Palabra o frase…" autocomplete="off" value="${escapeHTML(saved.query)}">
      <select id="searchVersion" class="search-panel-select" aria-label="Versión bíblica">${options}</select>
      <select id="searchScope" class="search-panel-scope" aria-label="Ámbito de búsqueda">
        <option value="nt" ${saved.testament==='nt'?'selected':''}>NT</option>
        <option value="ot" ${saved.testament==='ot'?'selected':''}>AT</option>
        <option value="all" ${saved.testament==='all'?'selected':''}>Biblia</option>
      </select>
      <button class="search-panel-button" type="submit">Buscar</button>
    </form>`;
    els.panelBody.innerHTML=emptyState('⌕','Escribe al menos dos caracteres. Los resultados aparecerán en orden bíblico, 100 por página.');

    const form=document.getElementById('searchForm');
    const input=document.getElementById('searchInput');
    const versionSelect=document.getElementById('searchVersion');
    const scopeSelect=document.getElementById('searchScope');

    const clearWhenChanged=()=>{
      const q=input.value.trim();
      const v=versionSelect.value;
      const t=scopeSelect.value;
      if(searchState && (q!==searchState.query || v!==searchState.versionId || t!==searchState.testament)){
        searchState=null;
        els.panelBody.innerHTML=q.length?emptyState('⌕','Pulsa Buscar para ver nuevos resultados.'):emptyState('⌕','Escribe al menos dos caracteres.');
      }
    };

    input?.addEventListener('input', clearWhenChanged);
    versionSelect?.addEventListener('change', clearWhenChanged);
    scopeSelect?.addEventListener('change', clearWhenChanged);

    if(searchState?.results?.length) renderSavedSearchResults();
    setTimeout(()=>input?.focus(),0);

    form?.addEventListener('submit',async e=>{
      e.preventDefault();
      const query=input.value.trim();
      const versionId=versionSelect.value;
      const testament=scopeSelect.value;
      if(query.length<2){ searchState=null; els.panelBody.innerHTML=emptyState('⌕','Escribe al menos dos caracteres.'); return; }
      const selected=bibleCatalog().find(v=>v.id===versionId);
      els.panelBody.innerHTML=emptyState('⌛','Buscando…');
      try{
        const results=await VerboModules.searchBible(selected.path,query,{
          testament,
          onProgress:p=>{els.panelBody.innerHTML=emptyState('⌛',`Buscando en ${escapeHTML(p.book)} · ${p.current}/${p.total}`);}
        });
        const scopeLabel={nt:'NT',ot:'AT',all:'Biblia'}[testament];
        searchState={query, versionId, testament, results, page:0, scopeLabel};
        if(!results.length){ els.panelBody.innerHTML=emptyState('🔎',`No se encontraron resultados para “${escapeHTML(query)}”.`); return; }
        renderSavedSearchResults();
      }catch(error){ console.error(error); els.panelBody.innerHTML=emptyState('⚠️','No se pudo completar la búsqueda.'); }
    });
  }

  function applyTheme(themeId){
    const safeTheme = themes.some(t => t.id === themeId) ? themeId : 'paper';
    document.body.dataset.theme = safeTheme;
    localStorage.setItem('verbo:theme', safeTheme);
  }

  function renderTheme(){
    els.panelTitle.textContent='Tema';
    els.panelToolbar.innerHTML='';
    const currentTheme = document.body.dataset.theme || 'paper';
    els.panelBody.innerHTML=`
      <section class="theme-panel">
        <div class="theme-panel__intro">Elige un tono claro para descansar mejor la vista. Se guardará solo en este dispositivo.</div>
        <div class="theme-options">
          ${themes.map(t=>`<button class="theme-option${t.id===currentTheme?' theme-option--active':''}" type="button" data-theme="${t.id}">
            <span class="theme-option__sample" style="background:${t.sample}"></span>
            <span class="theme-option__label">${escapeHTML(t.label)}</span>
          </button>`).join('')}
        </div>
      </section>`;
    els.panelBody.querySelectorAll('.theme-option').forEach(btn=>btn.addEventListener('click',()=>{
      applyTheme(btn.dataset.theme);
      renderTheme();
    }));
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

  function renderLinkedResourceEntries(resource, entries, focus, emptyIcon='📚', emptyText='Este capítulo todavía no tiene entradas cargadas.'){
    if(!entries.length){ els.panelBody.innerHTML=emptyState(emptyIcon, emptyText); return; }
    els.panelBody.innerHTML=entries.map((entry,index)=>{
      const id=entry.id || `${resource.manifest.id}-${currentBook}-${currentChapter}-${index}`;
      const title=entry.title || `${resource.manifest.name}: ${entry.reference?.verseStart || currentChapter}`;
      const body=entry.content || entry.html || entry.definition || entry.data || '';
      const active = referenceCoversVerse(entry, focus) ? ' note-card--active' : '';
      return `<div class="note-card${active}" data-linked-id="${escapeHTML(id)}" data-linked-index="${index}">
        <div class="note-card__ref">${escapeHTML(data.meta.book)} ${data.meta.chapter}${entry.reference?.verseStart ? ':'+escapeHTML(entry.reference.verseStart) : ''}</div>
        <div class="note-card__title">${escapeHTML(title)}</div>
        <div class="note-card__author">${escapeHTML(entry.author || resource.manifest.name)}</div>
        <button class="note-card__copy" type="button" data-copy-linked="${index}">Copiar</button>
        <div class="note-card__body">${body}</div>
      </div>`;
    }).join('');
    els.panelBody.querySelectorAll('[data-copy-linked]').forEach(btn=>btn.addEventListener('click',()=>{
      const entry=entries[Number(btn.dataset.copyLinked)];
      if(!entry) return;
      const body=entry.content || entry.html || entry.definition || entry.data || '';
      copyToClipboard(`${entry.title || resource.manifest.name}\n${String(body).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()}`);
    }));
    if(focus){
      const target=[...els.panelBody.querySelectorAll('[data-linked-index]')].find(card=>referenceCoversVerse(entries[Number(card.dataset.linkedIndex)], focus));
      target?.scrollIntoView({block:'start'});
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
      a.title='Abrir pasaje en Verbo';
      a.addEventListener('click',async e=>{e.preventDefault();const ref=parseBibleReference(a.textContent);if(ref)await goToBibleReference(ref);else toast('No se pudo reconocer esta referencia');});
    });
  }
  function dictionaryEntryTitle(code,entry){
    const html=entry.html||entry.definition||entry.content||'';
    const box=document.createElement('div'); box.innerHTML=html;
    const first=box.querySelector('strong')?.textContent||box.textContent||code;
    return first.replace(/super\s*\d+/gi,'').replace(/\b[GH]?\d{2,5}\b/g,'').replace(/\\u\w+/g,'').replace(/\s+/g,' ').trim()||code;
  }
  async function renderDictionaryLibrary(selected){
    els.panelBody.innerHTML=emptyState('⌛','Cargando índice del diccionario…');
    try{
      const resource=await VerboModules.loadDictionaryIndex(selected.id);
      if(!resource){els.panelBody.innerHTML=emptyState('⚠️','No se pudo cargar este diccionario.');return;}
      const items=Object.entries(resource.entries).map(([code,entry])=>({code,entry,title:dictionaryEntryTitle(code,entry)})).sort((a,b)=>a.title.localeCompare(b.title,'es'));
      els.panelBody.innerHTML=`<div class="dictionary-library"><input class="dictionary-library__search" id="dictionaryLibrarySearch" type="search" placeholder="Buscar palabra o tema…"><div class="dictionary-library__count">${items.length} estudios disponibles</div><div id="dictionaryLibraryList"></div></div>`;
      const list=document.getElementById('dictionaryLibraryList');
      const draw=(query='')=>{
        const q=normalizeBibleName(query);
        const filtered=!q?items:items.filter(x=>normalizeBibleName(x.title).includes(q));
        list.innerHTML=filtered.map(x=>`<button type="button" class="dictionary-library__item" data-dict-code="${escapeHTML(x.code)}"><span>${escapeHTML(x.title)}</span><small>${escapeHTML(x.code)}</small></button>`).join('')||emptyState('🔎','No hay resultados.');
        list.querySelectorAll('[data-dict-code]').forEach(btn=>btn.addEventListener('click',()=>openLibraryDictionaryEntry(selected, btn.dataset.dictCode)));
      };
      draw(); document.getElementById('dictionaryLibrarySearch')?.addEventListener('input',e=>draw(e.target.value));
    }catch(error){console.error(error);els.panelBody.innerHTML=emptyState('⚠️','No se pudo abrir el índice del diccionario.');}
  }


  async function openLibraryDictionaryEntry(selected, code){
    els.panelTitle.textContent=`Biblioteca · ${selected.label}`;
    els.panelToolbar.innerHTML=`<button class="note-card__copy" id="backToLibraryIndex" type="button">← Índice</button>`;
    document.getElementById('backToLibraryIndex')?.addEventListener('click',()=>renderLibraryPanel(activeVerse()));
    els.panelBody.innerHTML=emptyState('⌛','Abriendo entrada de biblioteca…');
    try{
      const result=await VerboModules.getDictionaryEntry(code, selected.id);
      if(!result){ els.panelBody.innerHTML=emptyState('🔎',`No se encontró esta entrada en ${selected.label}.`); return; }
      const html=result.entry.html||result.entry.definition||result.entry.content||'';
      const title=dictionaryEntryTitle(result.code,result.entry);
      els.panelBody.innerHTML=`<article class="dict-entry"><div class="dict-entry__term">${escapeHTML(title)}</div><div class="dict-entry__source">${escapeHTML(result.manifest.name)}</div><button class="note-card__copy" id="copyLibraryEntry" type="button">Copiar entrada</button><div class="dict-entry__def">${html}</div></article>`;
      document.getElementById('copyLibraryEntry')?.addEventListener('click',()=>copyToClipboard(`${title}\n${String(html).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()}`));
      wireDictionaryLinks(els.panelBody);
    }catch(error){console.error(error);els.panelBody.innerHTML=emptyState('⚠️','No se pudo abrir esta entrada de biblioteca.');}
  }

  function getStrongDictionary(code=null){
    const installed=dictionaryCatalog();
    return installed.find(d=>d.id==='strong-verbo') || installed[0] || null;
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



  async function renderLibraryPanel(focus=null){
    els.panelTitle.textContent='Biblioteca';
    const installed=libraryCatalog();
    if(!installed.length){
      els.panelToolbar.innerHTML='';
      els.panelBody.innerHTML=emptyState('📚','La Biblioteca está lista. Aquí aparecerán diccionarios de referencia, Padres Apostólicos y libros adicionales.');
      return;
    }
    let currentLibrary=localStorage.getItem('verbo:lastLibrary');
    if(!installed.some(x=>x.id===currentLibrary)) currentLibrary=installed[0].id;
    const selected=installed.find(x=>x.id===currentLibrary) || installed[0];
    const options=installed.map(x=>`<option value="${x.id}" ${x.id===currentLibrary?'selected':''}>${escapeHTML(x.label)}</option>`).join('');
    els.panelToolbar.innerHTML=`<div class="compare-toolbar"><span class="compare-toolbar__label">Recurso</span><select class="compare-toolbar__select" id="librarySelect">${options}</select></div>`;
    document.getElementById('librarySelect')?.addEventListener('change', e=>{
      localStorage.setItem('verbo:lastLibrary', e.target.value);
      renderLibraryPanel(activeVerse());
    });

    if(selected.linked){
      els.panelBody.innerHTML=emptyState('⌛','Cargando recurso del pasaje…');
      try{
        const resource=await VerboModules.loadLinkedEntries(selected.path,currentBook,currentChapter);
        renderLinkedResourceEntries(resource, resource.entries, focus, '📚', 'Este capítulo no tiene entradas en este recurso.');
      }catch(error){ console.error(error); els.panelBody.innerHTML=emptyState('⚠️','No se pudo abrir este recurso.'); }
      return;
    }

    if(selected.manifest.entriesFile || selected.manifest.entryFiles){
      await renderDictionaryLibrary(selected);
      return;
    }

    els.panelBody.innerHTML=emptyState('📚','Este recurso está registrado, pero aún no tiene índice compatible.');
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

  async function renderPadresPanel(){
    els.panelTitle.textContent='Padres Apostólicos';
    els.panelToolbar.innerHTML='';

    if(!patristicCatalog){
      els.panelBody.innerHTML=emptyState('⌛','Cargando colección…');
      try{
        const registry=await VerboModules.getCatalog();
        patristicCatalog=(registry.patristic||[]).map(item=>({id:item.manifest.id,label:item.manifest.abbreviation||item.manifest.name,full:item.manifest.name,manifest:item.manifest}));
      }catch(error){console.error(error);}
    }
    if(!patristicCatalog || !patristicCatalog.length){
      els.panelBody.innerHTML=emptyState('📜','La colección de Padres Apostólicos está en preparación. Pronto encontrarás aquí la Didaché, las cartas de Clemente, Ignacio, Policarpo y más.');
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
    els.panelBody.innerHTML=`<div class="dictionary-library">${patristicCatalog.map(d=>`
      <button type="button" class="dictionary-library__item" data-patristic-doc="${d.id}">
        <span>${escapeHTML(d.full)}</span>
        <small>${escapeHTML(d.manifest.year||'')}</small>
      </button>`).join('')}</div>`;
    document.querySelectorAll('[data-patristic-doc]').forEach(btn=>{
      btn.addEventListener('click',()=>{ patristicOpenDoc=btn.dataset.patristicDoc; renderPadresPanel(); els.panelBody.scrollTop=0; });
    });
  }

  let patristicDocData=null;

  async function renderPatristicIndex(){
    if(!patristicDocData || patristicDocData.manifest.id!==patristicOpenDoc){
      els.panelBody.innerHTML=emptyState('⌛','Cargando documento…');
      try{
        patristicDocData=await VerboModules.loadPatristic(patristicOpenDoc);
      }catch(error){console.error(error);}
    }
    if(!patristicDocData){
      els.panelBody.innerHTML=emptyState('⚠️','No se pudo cargar este documento.');
      return;
    }
    els.panelToolbar.innerHTML=`<button class="note-card__copy" id="backToPatristicDocs" type="button">← Colección</button>`;
    document.getElementById('backToPatristicDocs')?.addEventListener('click',()=>{ patristicOpenDoc=null; patristicDocData=null; renderPadresPanel(); els.panelBody.scrollTop=0; });

    const statusBanner=patristicDocData.manifest.status?`<div class="gospel-match"><div class="gospel-match__label">Estado</div><div style="padding:4px 2px;">${escapeHTML(patristicDocData.manifest.status)}</div></div>`:'';

    const list=patristicDocData.sections.map(s=>`
      <button type="button" class="dictionary-library__item" data-patristic-section="${s.n}">
        <span>${escapeHTML(s.title)}</span>
      </button>`).join('');

    els.panelBody.innerHTML=`${statusBanner}<div class="dictionary-library"><div class="dictionary-library__count">${patristicDocData.sections.length} secciones</div><div>${list}</div></div>`;
    document.querySelectorAll('[data-patristic-section]').forEach(btn=>{
      btn.addEventListener('click',()=>{ patristicOpenSection=Number(btn.dataset.patristicSection); renderPadresPanel(); els.panelBody.scrollTop=0; });
    });
  }

  function renderPatristicSection(){
    const section=patristicDocData.sections.find(s=>s.n===patristicOpenSection);
    if(!section){ els.panelBody.innerHTML=emptyState('⚠️','No se encontró esta sección.'); return; }
    els.panelToolbar.innerHTML=`<button class="note-card__copy" id="backToPatristicIndex" type="button">← Índice del documento</button>`;
    document.getElementById('backToPatristicIndex')?.addEventListener('click',()=>{ patristicOpenSection=null; renderPadresPanel(); els.panelBody.scrollTop=0; });
    els.panelBody.innerHTML=`<article class="dict-entry">
      <div class="dict-entry__term">${escapeHTML(section.title)}</div>
      <div class="dict-entry__source">${escapeHTML(patristicDocData.manifest.name)}</div>
      <div class="dict-entry__def">${nl2p(section.content)}</div>
    </article>`;
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
    els.panelTitle.textContent='Mis notas';
    const key=`nota:${data.meta.bookId}-${data.meta.chapter}`, saved=localStorage.getItem(key)||'';
    els.panelBody.innerHTML=`<label class="personal-note-form__label">Nota sobre ${data.meta.book} ${data.meta.chapter}</label><textarea id="personalNoteArea" class="personal-note-form__area" placeholder="Escribe aquí tu observación...">${saved}</textarea><div class="personal-note-form__status" id="noteSaveStatus">${saved?'Guardado':''}</div>`;
    const area=document.getElementById('personalNoteArea'), status=document.getElementById('noteSaveStatus'); let timer;
    area.addEventListener('input',()=>{status.textContent='Escribiendo…';clearTimeout(timer);timer=setTimeout(()=>{localStorage.setItem(key,area.value);status.textContent='Guardado';},400);});
  }

  async function openDictionary(code){
    openPanel('diccionario');
    const selected=getStrongDictionary(code);
    currentDictionary=selected?.id || null;
    if(currentDictionary) localStorage.setItem('verbo:lastDictionary', currentDictionary);
    els.panelTitle.textContent=`${selected?.full || 'Léxico Strong'} · ${code}`;
    els.panelToolbar.innerHTML='';
    els.panelBody.innerHTML=emptyState('⌛','Buscando entrada en Multiléxico…');
    try{
      const result=await VerboModules.getDictionaryEntry(code, currentDictionary);
      if(!result){ els.panelBody.innerHTML=emptyState('🔎',`No se encontró una entrada para ${code} en el diccionario seleccionado.`); return; }
      const html=result.entry.html||result.entry.definition||result.entry.content||'';
      els.panelBody.innerHTML=`<article class="dict-entry"><div class="dict-entry__term">${result.code}</div><div class="dict-entry__source">${result.manifest.name}</div><button class="note-card__copy" id="copyDictEntry" type="button">Copiar diccionario</button><div class="dict-entry__def">${html}</div></article>`;
      document.getElementById('copyDictEntry')?.addEventListener('click',()=>copyToClipboard(`${result.code}\n${String(html).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()}`));
      wireDictionaryLinks(els.panelBody);
    }catch(error){console.error(error);els.panelBody.innerHTML=emptyState('⚠️','No se pudo abrir esta entrada del diccionario.');}
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
  function showFatal(error){ els.list.innerHTML=emptyState('⚠️',`No se pudieron cargar los módulos JSON. Ejecuta la app desde un servidor local. ${error.message}`); }

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
    if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA'||e.target.tagName==='SELECT') return;
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
});

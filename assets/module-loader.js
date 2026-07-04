/* Cargador de módulos JSON de Verbo — esquema v2 */
const VerboModules = (() => {
  const cache = new Map();
  async function getJSON(url) {
    if (cache.has(url)) return cache.get(url);
    const response = await fetch(url, { cache:'no-cache' });
    if (!response.ok) throw new Error(`No se pudo cargar ${url} (${response.status})`);
    const json = await response.json(); cache.set(url, json); return json;
  }
  function resolveFromManifest(manifestPath, relativePath) {
    return manifestPath.slice(0, manifestPath.lastIndexOf('/') + 1) + relativePath;
  }
  async function tryLoadModule(path) {
    const manifestPath = `modules/${path}`;
    try {
      return { path: manifestPath, manifest: await getJSON(manifestPath) };
    } catch (error) {
      console.warn(`Módulo omitido: ${manifestPath}`, error);
      return null;
    }
  }
  async function loadModuleList(paths = []) {
    return (await Promise.all(paths.map(tryLoadModule))).filter(Boolean);
  }
  async function getCatalog() {
    const registry = await getJSON('modules/registry.json');
    const bibles = await loadModuleList(registry.bibles || []);
    if (!bibles.length) throw new Error('No hay Biblias disponibles en modules/registry.json');
    const primary = bibles.find(x => x.manifest.id === registry.defaultBible) || bibles[0];
    const commentaries = await loadModuleList(registry.commentaries || []);
    const dictionaries = await loadModuleList(registry.dictionaries || []);
    const exegesis = await loadModuleList(registry.exegesis || []);
    const library = await loadModuleList(registry.library || []);
    const gospel = await loadModuleList(registry.gospel || []);
    const patristic = await loadModuleList(registry.patristic || []);
    return { registry, bibles, commentaries, dictionaries, exegesis, library, gospel, patristic, primary, books: primary.manifest.books };
  }
  async function getBookInfo(bookId) {
    const catalog = await getCatalog();
    const info = catalog.primary.manifest.books.find(b => b.id === bookId);
    if (!info) throw new Error(`Libro no encontrado: ${bookId}`);
    const data = await getJSON(resolveFromManifest(catalog.primary.path, info.file));
    return { info, chapterCount:Object.keys(data.chapters).length };
  }
  async function loadBible(manifestPath, bookId, chapter) {
    const manifest = await getJSON(manifestPath);
    const bookInfo = manifest.books.find(book => book.id === bookId);
    if (!bookInfo) return null;
    const bookData = await getJSON(resolveFromManifest(manifestPath, bookInfo.file));
    const verses = bookData.chapters[String(chapter)];
    return verses ? { manifest, bookInfo, verses } : null;
  }
  async function loadCommentary(manifestPath, bookId, chapter) {
    const manifest = await getJSON(manifestPath);
    const bookInfo = manifest.books.find(book => book.id === bookId);
    if (!bookInfo) return { manifest, entries:[] };
    if (manifest.chapterSplit) {
      const base = manifestPath.slice(0, manifestPath.lastIndexOf('/') + 1);
      try {
        const bookData = await getJSON(`${base}books/${bookId}/${chapter}.json`);
        return { manifest, entries: bookData.entries || [] };
      } catch { return { manifest, entries:[] }; }
    }
    const bookData = await getJSON(resolveFromManifest(manifestPath, bookInfo.file));
    return { manifest, entries:(bookData.entries || []).filter(entry => {
      const start=entry.reference.chapterStart, end=entry.reference.chapterEnd ?? start;
      return (chapter >= start && chapter <= end) || (chapter === 1 && start === 0);
    }) };
  }
  async function getDictionaryEntry(code, dictionaryId=null) {
    const registry = await getJSON('modules/registry.json');
    const rawCode = String(code || '');
    const isStrongCode = /^[GH]\d+$/i.test(rawCode);
    const normalized = isStrongCode ? rawCode.toUpperCase() : rawCode;
    const prefix = isStrongCode ? normalized[0] : 'OTHER';
    const allPaths = [...(registry.dictionaries || []), ...(registry.library || [])];
    const dictionaryPaths = dictionaryId
      ? allPaths.filter(path => path.includes(`/` + dictionaryId + `/`) || path.endsWith(`/` + dictionaryId + `/manifest.json`))
      : allPaths;
    for (const path of dictionaryPaths) {
      const manifestPath=`modules/${path}`;
      let manifest;
      try {
        manifest = await getJSON(manifestPath);
      } catch (error) {
        console.warn(`Diccionario omitido: ${manifestPath}`, error);
        continue;
      }
      if (manifest.entryFiles) {
        const file=manifest.entryFiles[prefix] || manifest.entryFiles.OTHER;
        if (!file) continue;
        const data=await getJSON(resolveFromManifest(manifestPath,file));
        const entry=(data.entries || data)?.[normalized];
        if (entry) return { manifest, code:normalized, entry:typeof entry==='string'?{html:entry}:entry };
      } else if (manifest.entriesFile) {
        const data=await getJSON(resolveFromManifest(manifestPath,manifest.entriesFile));
        const entry=(data.entries || data)?.[normalized];
        if (entry) return { manifest, code:normalized, entry:typeof entry==='string'?{html:entry}:entry };
      }
    }
    return null;
  }

  // Carga solo el índice liviano (código + término) para mostrar la lista navegable
  // sin descargar el contenido completo (que puede pesar varios MB). Si el módulo
  // no declara indexFile, cae de vuelta a cargar las entradas completas (compatibilidad).
  async function loadDictionaryIndex(dictionaryId) {
    const registry = await getJSON('modules/registry.json');
    const allPaths = [...(registry.dictionaries || []), ...(registry.library || [])];
    const paths = allPaths.filter(path => path.includes(`/` + dictionaryId + `/`) || path.endsWith(`/` + dictionaryId + `/manifest.json`));
    for (const path of paths) {
      const manifestPath = `modules/${path}`;
      try {
        const manifest = await getJSON(manifestPath);
        if (manifest.indexFile) {
          const data = await getJSON(resolveFromManifest(manifestPath, manifest.indexFile));
          return { manifest, entries: data.entries || data || {}, lightweight: true };
        }
        // Sin índice declarado: respaldo a cargar el archivo completo.
        if (manifest.entriesFile) {
          const data = await getJSON(resolveFromManifest(manifestPath, manifest.entriesFile));
          return { manifest, entries: data.entries || data || {}, lightweight: false };
        }
      } catch (error) {
        console.warn(`Índice omitido: ${manifestPath}`, error);
      }
    }
    return null;
  }

  async function loadDictionaryEntries(dictionaryId=null) {
    const registry = await getJSON('modules/registry.json');
    const allPaths = [...(registry.dictionaries || []), ...(registry.library || [])];
    const paths = dictionaryId
      ? allPaths.filter(path => path.includes(`/` + dictionaryId + `/`) || path.endsWith(`/` + dictionaryId + `/manifest.json`))
      : allPaths;
    const resources=[];
    for (const path of paths) {
      const manifestPath=`modules/${path}`;
      try {
        const manifest=await getJSON(manifestPath);
        const entries={};
        if(manifest.entryFiles){
          for(const file of Object.values(manifest.entryFiles)){
            const data=await getJSON(resolveFromManifest(manifestPath,file));
            Object.assign(entries,data.entries||data||{});
          }
        } else if(manifest.entriesFile){
          const data=await getJSON(resolveFromManifest(manifestPath,manifest.entriesFile));
          Object.assign(entries,data.entries||data||{});
        }
        resources.push({manifest,entries});
      } catch(error){ console.warn(`Diccionario omitido: ${manifestPath}`,error); }
    }
    return resources;
  }

  async function loadLinkedEntries(manifestPath, bookId, chapter) {
    const manifest = await getJSON(manifestPath);
    const bookInfo = manifest.books?.find(book => book.id === bookId);
    if (!bookInfo) return { manifest, entries:[] };
    const bookData = await getJSON(resolveFromManifest(manifestPath, bookInfo.file));
    const entries = (bookData.entries || []).filter(entry => {
      const ref = entry.reference || {};
      const start = Number(ref.chapterStart ?? chapter);
      const end = Number(ref.chapterEnd ?? start);
      return (chapter >= start && chapter <= end) || (chapter === 1 && start === 0);
    });
    return { manifest, entries };
  }

  async function searchBible(manifestPath, query, { testament='all', onProgress=null }={}) {
    const manifest = await getJSON(manifestPath);
    const needle = String(query || '').trim().toLocaleLowerCase('es');
    if (needle.length < 2) return [];

    const matthewIndex = manifest.books.findIndex(book => book.id === 'MAT');
    const books = manifest.books.filter((book, index) => {
      if (testament === 'ot') return matthewIndex < 0 ? index < 39 : index < matthewIndex;
      if (testament === 'nt') return matthewIndex < 0 ? index >= 39 : index >= matthewIndex;
      return true;
    });

    const results = [];
    for (let i=0; i<books.length; i++) {
      const bookInfo = books[i];
      const bookData = await getJSON(resolveFromManifest(manifestPath, bookInfo.file));
      const chapters = Object.entries(bookData.chapters || {}).sort((a,b) => Number(a[0]) - Number(b[0]));
      for (const [chapter, verses] of chapters) {
        const orderedVerses = Object.entries(verses || {}).sort((a,b) => Number(a[0]) - Number(b[0]));
        for (const [verse, raw] of orderedVerses) {
          const text = typeof raw === 'string' ? raw : (raw.text || '');
          const plain = String(text).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          if (plain.toLocaleLowerCase('es').includes(needle)) {
            results.push({ bookId:bookInfo.id, book:bookInfo.name, chapter:Number(chapter), verse:Number(verse), text:plain });
          }
        }
      }
      if (onProgress) onProgress({ current:i+1, total:books.length, book:bookInfo.name });
    }
    return results;
  }
  async function buildChapterData({ bookId='ROM', chapter=7, commentaryId=null }={}) {
    const registry = await getJSON('modules/registry.json');
    const bibleResults=(await Promise.all((registry.bibles || []).map(async path=>{
      try { return await loadBible(`modules/${path}`,bookId,chapter); }
      catch (error) { console.warn(`Biblia omitida: modules/${path}`, error); return null; }
    }))).filter(Boolean);
    if (!bibleResults.length) throw new Error(`No hay Biblias disponibles para ${bookId} ${chapter}`);

    // Se cargan TODOS los comentarios que contienen este capítulo. Esto permite
    // indicar en cada versículo qué módulos tienen contenido, aunque no estén activos.
    const commentaryResults=(await Promise.all((registry.commentaries || []).map(async path=>{
      try { return await loadCommentary(`modules/${path}`,bookId,chapter); }
      catch (error) { console.warn(`Comentario omitido: modules/${path}`, error); return null; }
    }))).filter(Boolean);

    const versions={};
    bibleResults.forEach(({manifest:m})=>versions[m.id]={label:m.abbreviation,full:m.name,year:m.year,hasStrongs:Boolean(m.hasStrongs)});
    const allVerseNumbers=[...new Set(bibleResults.flatMap(b=>Object.keys(b.verses).map(Number)))].sort((a,b)=>a-b);
    const notes={}, notesByVerse=new Map();
    const firstVerse=allVerseNumbers[0] || 1;
    const lastVerse=allVerseNumbers[allVerseNumbers.length-1] || firstVerse;

    commentaryResults.forEach(c=>c.entries.forEach(entry=>{
      const ref=entry.reference || {};
      const chStart=Number(ref.chapterStart ?? chapter);
      const chEnd=Number(ref.chapterEnd ?? chStart);
      if((chapter < chStart || chapter > chEnd) && !(chapter === 1 && chStart === 0)) return;

      let start=Number(ref.verseStart);
      let end=Number(ref.verseEnd ?? ref.verseStart);
      if(!Number.isInteger(start) || start <= 0) start = firstVerse;
      if(!Number.isInteger(end) || end <= 0) end = start;
      if(chapter > chStart) start = firstVerse;
      if(chapter < chEnd) end = lastVerse;
      start=Math.max(firstVerse, Math.min(start,lastVerse));
      end=Math.max(start, Math.min(end,lastVerse));

      const commentaryId=c.manifest.id;
      const rawId=entry.id||`${bookId}-${chapter}-${start}-${end}`;
      const id=`${commentaryId}::${rawId}`;
      notes[id]={
        title:entry.title||`${c.manifest.name}: ${start}${end!==start?'–'+end:''}`,
        author:entry.author||c.manifest.name,
        body:entry.content||'',
        commentaryId,
        commentaryName:c.manifest.name,
        commentaryLabel:c.manifest.abbreviation || c.manifest.name
      };
      for(let v=start;v<=end;v++){
        if(!notesByVerse.has(v)) notesByVerse.set(v,new Map());
        const byModule=notesByVerse.get(v);
        if(!byModule.has(commentaryId)) byModule.set(commentaryId,[]);
        byModule.get(commentaryId).push(id);
      }
    }));

    const verses=allVerseNumbers.map(n=>{
      const text={}, segments={};
      bibleResults.forEach(b=>{ const v=b.verses[String(n)]; if(!v)return; text[b.manifest.id]=typeof v==='string'?v:v.text; if(v.segments) segments[b.manifest.id]=v.segments; });
      const byModule=notesByVerse.get(n) || new Map();
      const commentaries=[...byModule.entries()].map(([commentaryId,noteIds])=>{
        const note=notes[noteIds[0]];
        return { commentaryId, noteIds, label:note?.commentaryLabel || commentaryId, name:note?.commentaryName || commentaryId };
      });
      const noteIds=commentaries.flatMap(item=>item.noteIds);
      return {n,text,segments,hasNote:noteIds.length>0,noteIds,commentaries};
    });
    const first=bibleResults.find(b=>b.manifest.id===registry.defaultBible)||bibleResults[0];
    return {meta:{book:first.bookInfo.name,bookId,chapter,version:first.manifest.id,versionFull:first.manifest.name},versions,verses,notes};
  }
  // Carga el módulo de Evangelio armonizado (capítulos temáticos propios,
  // no ligados 1:1 a capítulo bíblico, sino a una o más referencias).
  async function loadGospel(gospelId = null) {
    const registry = await getJSON('modules/registry.json');
    const paths = gospelId
      ? (registry.gospel || []).filter(p => p.includes('/' + gospelId + '/') || p.endsWith('/' + gospelId + '/manifest.json'))
      : (registry.gospel || []);
    for (const path of paths) {
      const manifestPath = `modules/${path}`;
      try {
        const manifest = await getJSON(manifestPath);
        const data = await getJSON(resolveFromManifest(manifestPath, manifest.chaptersFile));
        return { manifest, chapters: data.chapters || [] };
      } catch (error) {
        console.warn(`Evangelio omitido: ${manifestPath}`, error);
      }
    }
    return null;
  }

  // Carga un documento patrístico de lectura libre (Padres Apostólicos).
  // Misma idea que loadGospel: índice de secciones navegable, sin atar
  // cada sección a un único capítulo bíblico.
  async function loadPatristic(docId = null) {
    const registry = await getJSON('modules/registry.json');
    const paths = docId
      ? (registry.patristic || []).filter(p => p.includes('/' + docId + '/') || p.endsWith('/' + docId + '/manifest.json'))
      : (registry.patristic || []);
    for (const path of paths) {
      const manifestPath = `modules/${path}`;
      try {
        const manifest = await getJSON(manifestPath);
        const data = await getJSON(resolveFromManifest(manifestPath, manifest.sectionsFile));
        return { manifest, sections: data.sections || [] };
      } catch (error) {
        console.warn(`Documento patrístico omitido: ${manifestPath}`, error);
      }
    }
    return null;
  }

  return { getCatalog,getBookInfo,buildChapterData,loadBible,loadCommentary,loadLinkedEntries,getDictionaryEntry,loadDictionaryEntries,loadDictionaryIndex,loadGospel,loadPatristic,searchBible };
})();

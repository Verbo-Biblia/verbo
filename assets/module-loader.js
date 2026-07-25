/* Cargador de módulos JSON de Verbo — esquema v2 */
const VerboModules = (() => {
  const cache = new Map();
  const semanticSearch = {
    basePath: 'modules/semantic-search/gospels-rva-1909',
    model: 'Xenova/paraphrase-multilingual-MiniLM-L12-v2',
    transformerUrl: 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/+esm',
    indexes: new Map(),
    extractorPromise: null
  };
  async function getJSON(url) {
    if (cache.has(url)) return cache.get(url);
    const response = await fetch(url, { cache:'no-cache' });
    if (!response.ok) throw new Error(`No se pudo cargar ${url} (${response.status})`);
    const json = await response.json(); cache.set(url, json); return json;
  }
  async function getArrayBuffer(url) {
    if (cache.has(url)) return cache.get(url);
    const response = await fetch(url, { cache:'no-cache' });
    if (!response.ok) throw new Error(`No se pudo cargar ${url} (${response.status})`);
    const buffer = await response.arrayBuffer(); cache.set(url, buffer); return buffer;
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
    const localBibles = await loadModuleList(registry.bibles || []);
    if (!localBibles.length) throw new Error('No hay Biblias disponibles en modules/registry.json');
    const primary = localBibles.find(x => x.manifest.id === registry.defaultBible) || localBibles[0];
    const remoteBibles = (registry.apiBible?.bibles || []).map(item => ({
      path: null,
      remote: true,
      manifest: {
        id: item.id,
        abbreviation: item.abbreviation,
        name: item.name,
        language: item.language,
        books: primary.manifest.books,
        remote: { provider:'apiBible', bibleId:item.bibleId }
      }
    }));
    const bibles = [...localBibles, ...remoteBibles];
    const commentaries = await loadModuleList(registry.commentaries || []);
    const dictionaries = await loadModuleList(registry.dictionaries || []);
    const exegesis = await loadModuleList(registry.exegesis || []);
    const library = await loadModuleList(registry.library || []);
    const gospel = await loadModuleList(registry.gospel || []);
    const patristic = await loadModuleList(registry.patristic || []);
    const patristicByVerse = await loadModuleList(registry.patristicByVerse || []);
    const crossrefs = await loadModuleList(registry.crossrefs || []);
    return { registry, bibles, commentaries, dictionaries, exegesis, library, gospel, patristic, patristicByVerse, crossrefs, primary, books: primary.manifest.books };
  }

  function apiBibleProxy(registry) {
    const value = String(registry.apiBible?.proxyUrl || '').trim().replace(/\/+$/, '');
    if (!value) throw new Error('API.Bible todavía no está configurada: falta apiBible.proxyUrl en modules/registry.json');
    return value;
  }

  function apiBibleEntry(registry, versionId) {
    const entry = (registry.apiBible?.bibles || []).find(item => item.id === versionId);
    if (!entry) throw new Error(`Versión remota desconocida: ${versionId}`);
    return entry;
  }

  function parseApiBibleChapter(content) {
    if (typeof DOMParser === 'undefined') throw new Error('El contenido remoto requiere un navegador con DOMParser');
    const document = new DOMParser().parseFromString(String(content || ''), 'text/html');
    const markers = [...document.querySelectorAll('.v[data-number], [data-number].v')];
    const verses = {};
    markers.forEach((marker, index) => {
      const number = String(marker.dataset.number || '').trim();
      if (!number) return;
      const range = document.createRange();
      range.setStartAfter(marker);
      if (markers[index + 1]) range.setEndBefore(markers[index + 1]);
      else range.setEndAfter(document.body.lastChild || document.body);
      const text = range.cloneContents().textContent.replace(/\s+/g, ' ').trim();
      if (text) verses[number] = text;
    });
    if (!Object.keys(verses).length) throw new Error('API.Bible devolvió un capítulo sin marcadores de versículo');
    return verses;
  }

  async function apiBibleRequest(path, params={}) {
    const registry = await getJSON('modules/registry.json');
    const url = new URL(`${apiBibleProxy(registry)}${path}`);
    Object.entries(params).forEach(([key,value]) => {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    });
    const response = await fetch(url.toString(), { headers:{ Accept:'application/json' } });
    if (!response.ok) {
      const message = response.status === 429 ? 'Se alcanzó el límite de API.Bible' : `API.Bible respondió ${response.status}`;
      throw new Error(message);
    }
    return response.json();
  }

  async function loadRemoteBible(versionId, bookId, chapter) {
    const registry = await getJSON('modules/registry.json');
    const entry = apiBibleEntry(registry, versionId);
    const result = await apiBibleRequest(`/v1/bibles/${encodeURIComponent(entry.bibleId)}/chapters/${encodeURIComponent(`${bookId}.${chapter}`)}`, {
      'content-type':'html',
      'include-notes':'false',
      'include-titles':'false',
      'include-chapter-numbers':'false',
      'include-verse-numbers':'true',
      'include-verse-spans':'true',
      'fums-version':'3'
    });
    return {
      manifest: { id:entry.id, abbreviation:entry.abbreviation, name:entry.name, language:entry.language, remote:true },
      verses: parseApiBibleChapter(result.data?.content),
      copyright: result.data?.copyright || '',
      fumsToken: result.meta?.fumsToken || ''
    };
  }

  async function searchRemoteBible(versionId, query, { testament='all' }={}) {
    const registry = await getJSON('modules/registry.json');
    const entry = apiBibleEntry(registry, versionId);
    const range = testament === 'nt' ? 'MAT-REV' : testament === 'ot' ? 'GEN-MAL' : '';
    const result = await apiBibleRequest(`/v1/bibles/${encodeURIComponent(entry.bibleId)}/search`, {
      query, limit:100, offset:0, sort:'canonical', range
    });
    return (result.data?.verses || []).map(verse => {
      const parts = String(verse.id || verse.orgId || '').split('.');
      return {
        bookId: parts[0],
        book: verse.reference?.replace(/\s+\d+:.*/, '') || parts[0],
        chapter: Number(parts[1]),
        verse: Number(parts[2]),
        text: String(verse.text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      };
    }).filter(item => item.bookId && item.chapter && item.verse);
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
    const dataManifestPath = manifest.dataManifest
      ? resolveFromManifest(manifestPath, manifest.dataManifest)
      : manifestPath;
    const dataManifest = dataManifestPath === manifestPath
      ? manifest
      : await getJSON(dataManifestPath);
    const bookInfo = dataManifest.books.find(book => book.id === bookId);
    if (!bookInfo) return null;
    const bookData = await getJSON(resolveFromManifest(dataManifestPath, bookInfo.file));
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
  async function loadCrossrefs(manifestPath, bookId, chapter) {
    const manifest = await getJSON(manifestPath);
    const bookInfo = manifest.books.find(book => book.id === bookId);
    if (!bookInfo) return {};
    try {
      const bookData = await getJSON(resolveFromManifest(manifestPath, bookInfo.file));
      return bookData[String(chapter)] || {};
    } catch { return {}; }
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

  // Carga el texto completo de un articulo referenciado por una entrada de
  // "biblioteca" (ver modules/library/biblioteca-verbo/articles/*.json). Las
  // entries del libro solo traen un excerpt corto + articleId para no duplicar
  // articulos largos en cada verso que citan; esto trae el contenido completo
  // bajo demanda, cuando el usuario pulsa "Leer articulo completo".
  async function loadLinkedArticle(manifestPath, articleId) {
    if (!articleId) return null;
    const articlePath = resolveFromManifest(manifestPath, `articles/${articleId}.json`);
    return await getJSON(articlePath);
  }

  // Quita tildes/diacríticos y normaliza espacios/puntuación, para que la
  // búsqueda no falle por variantes de acentuación entre versiones (ej.
  // "así"/"asi") ni por puntuación pegada a la palabra.
  function normalizeSearchText(value) {
    return String(value || '')
      .toLocaleLowerCase('es')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // 2 = coincide la frase completa y en orden (mejor rango); 1 = están todas
  // las palabras buscadas en el versículo pero en cualquier orden/posición
  // (cubre el caso de una frase redactada distinto entre versiones); 0 = no coincide.
  function searchMatchScore(plainNormalized, phraseNormalized, words) {
    if (!words.length) return 0;
    if (words.length > 1 && plainNormalized.includes(phraseNormalized)) return 2;
    return words.every(w => plainNormalized.includes(w)) ? 1 : 0;
  }

  async function searchBible(manifestPath, query, { testament='all', onProgress=null }={}) {
    const manifest = await getJSON(manifestPath);
    const phraseNormalized = normalizeSearchText(query);
    const words = phraseNormalized.split(' ').filter(Boolean);
    if (phraseNormalized.length < 2 || !words.length) return [];

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
          const score = searchMatchScore(normalizeSearchText(plain), phraseNormalized, words);
          if (score > 0) {
            results.push({ bookId:bookInfo.id, book:bookInfo.name, chapter:Number(chapter), verse:Number(verse), text:plain, score });
          }
        }
      }
      if (onProgress) onProgress({ current:i+1, total:books.length, book:bookInfo.name });
    }
    // Orden estable: primero coincidencias de frase exacta, luego por-todas-las-palabras;
    // dentro de cada grupo se conserva el orden bíblico en que se recorrió el texto.
    results.sort((a, b) => b.score - a.score);
    results.forEach(r => delete r.score);
    return results;
  }

  async function loadSemanticIndex(indexType='verses') {
    const type = indexType === 'pericopes' ? 'pericopes' : 'verses';
    if (semanticSearch.indexes.has(type)) return semanticSearch.indexes.get(type);
    const meta = await getJSON(`${semanticSearch.basePath}/${type}.meta.json`);
    const buffer = await getArrayBuffer(`${semanticSearch.basePath}/${meta.vectorFile}`);
    const index = { meta, vectors:new Int8Array(buffer) };
    semanticSearch.indexes.set(type, index);
    return index;
  }

  async function getSemanticExtractor() {
    if (!semanticSearch.extractorPromise) {
      semanticSearch.extractorPromise = import(semanticSearch.transformerUrl).then(async ({ env, pipeline }) => {
        env.allowLocalModels = false;
        env.useBrowserCache = true;
        return pipeline('feature-extraction', semanticSearch.model);
      });
    }
    return semanticSearch.extractorPromise;
  }

  function semanticTensorVector(tensor) {
    return tensor.data || tensor;
  }

  function semanticResultFromRecord(record, score, indexType) {
    return {
      bookId: record.book,
      book: record.bookName,
      chapter: Number(record.chapterStart),
      verse: Number(record.verseStart),
      chapterEnd: Number(record.chapterEnd),
      verseEnd: Number(record.verseEnd),
      text: record.text,
      score,
      semantic: true,
      indexType
    };
  }

  const semanticStopwords = new Set([
    'a','al','ante','bajo','con','contra','de','del','desde','el','en','entre','es','la','las','lo','los','mas','me','mi','no','o','para','por','que','se','sin','sobre','su','sus','te','tu','un','una','y',
    'como','cual','cuando','dijo','dios','jesus','senor','sobre','todos'
  ]);
  const semanticQueryExpansions = [
    { test:/\bdivorci|\brepudi/i, terms:['divorcio','repudiar','repudiarla','repudiare','repudiada','mujer','adulterio'] },
    { test:/\bperdon|\bofend/i, terms:['perdon','perdona','perdonados','perdonareis','perdonale','misericordia','deudas','ofensas'] },
    { test:/\bperdid|\bsalvar|\bsalvaci/i, terms:['perdido','perdidos','salvar','salvo','salvacion','misericordia','pecadores'] },
    { test:/\bdinero|\briquez|\brico|\btesoro/i, terms:['dinero','riquezas','ricos','rico','tesoro','pobres','ofrenda','mammon'] },
    { test:/\bcansad|\bdescans/i, terms:['cansados','trabajados','cargados','descanso','descansar','venid'] },
    { test:/\boraci|\borar|\bsolas|\bsecreto/i, terms:['orar','oracion','orando','aposento','secreto','padre','hipocritas'] },
    { test:/\bnuevo nacimiento|\bnacer|\bnacim/i, terms:['nacer','nacido','nacimiento','nicodemo','otra','vez','agua','espiritu'] },
    { test:/\bpecador|\bmargin|\bpublican|\benfer/i, terms:['pecadores','publicanos','misericordia','enfermos','samaritano','zacheo'] },
    { test:/\bfals[oa]s? profet|\bengañ/i, terms:['falsos','profetas','enganaran','enganar','lobos','Cristos'] },
    { test:/\bcruz|\bcrucific/i, terms:['cruz','crucificado','crucificar','calvario','golgota','madero'] },
    { test:/\bdijo\b.*\bcruz|\bcruz\b.*\bdijo|\bpalabras?\b.*\bcruz/i, terms:['padre','perdonalos','paraiso','encomiendo','espiritu','sed','consumado','madre','hijo'] }
  ];

  function normalizeSemanticText(value) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9ñ\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function semanticTokens(query) {
    const normalized = normalizeSemanticText(query);
    const tokens = normalized.split(' ').filter(token => token.length > 2 && !semanticStopwords.has(token));
    const expanded = new Set(tokens);
    semanticQueryExpansions.forEach(rule => {
      if (!rule.test.test(query)) return;
      rule.terms.forEach(term => expanded.add(normalizeSemanticText(term)));
    });
    return [...expanded].filter(Boolean);
  }

  function semanticLexicalBoost(record, tokens) {
    if (!tokens.length) return 0;
    const haystack = ` ${normalizeSemanticText(`${record.label} ${record.text}`)} `;
    let hits = 0;
    let strongHits = 0;
    tokens.forEach(token => {
      if (haystack.includes(` ${token} `)) {
        hits += 1;
        strongHits += 1;
      } else if (token.length > 4 && haystack.includes(token.slice(0, -1))) {
        hits += 0.55;
      }
    });
    const coverage = hits / tokens.length;
    return Math.min(0.28, coverage * 0.18 + strongHits * 0.018);
  }

  function semanticSpecialAdjustment(record, cleanQuery) {
    const query = normalizeSemanticText(cleanQuery);
    const text = normalizeSemanticText(record.text);
    let adjustment = 0;
    if (/\b(cansados|descanso|descansar)\b/.test(query) && text.includes('trabajados y cargados')) adjustment += 0.2;
    if (/\b(oracion|orar|solas|secreto)\b/.test(query) && (text.includes('entra en tu camara') || text.includes('entrate en tu camara'))) adjustment += 0.6;
    if (/\b(dijo|palabras)\b.*\bcruz\b|\bcruz\b.*\b(dijo|palabras)\b/.test(query)) {
      if (/\b(tome|tomar)\b.*\bcruz\b|\bnieguese\b/.test(text)) adjustment -= 0.16;
      if (/(encomiendo mi espiritu|paraiso|tengo sed|consumado|mujer he ahi tu hijo|dios mio dios mio|perdonalos)/.test(text)) adjustment += 0.2;
    }
    return adjustment;
  }

  async function searchSemanticGospels(query, { indexType='verses', limit=50, onProgress=null }={}) {
    const clean = String(query || '').trim();
    if (clean.length < 2) return [];
    onProgress?.({ stage:'index' });
    const index = await loadSemanticIndex(indexType);
    onProgress?.({ stage:'model' });
    const extractor = await getSemanticExtractor();
    onProgress?.({ stage:'embedding' });
    const output = await extractor(clean, { pooling:'mean', normalize:true });
    const queryVector = semanticTensorVector(output);
    const dimensions = Number(index.meta.dimensions);
    const records = index.meta.records || [];
    const results = [];
    const tokens = semanticTokens(clean);
    onProgress?.({ stage:'ranking' });
    for (let recordIndex=0; recordIndex<records.length; recordIndex++) {
      const offset = recordIndex * dimensions;
      let score = 0;
      for (let dim=0; dim<dimensions; dim++) {
        score += queryVector[dim] * (index.vectors[offset + dim] / 127);
      }
      score += semanticLexicalBoost(records[recordIndex], tokens);
      score += semanticSpecialAdjustment(records[recordIndex], clean);
      results.push(semanticResultFromRecord(records[recordIndex], score, indexType));
    }
    results.sort((a,b)=>b.score-a.score);
    return results.slice(0, limit);
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

    const crossrefsByVerse=(registry.crossrefs || []).length
      ? await (async()=>{ try { return await loadCrossrefs(`modules/${registry.crossrefs[0]}`,bookId,chapter); } catch (error) { console.warn('Referencias cruzadas omitidas', error); return {}; } })()
      : {};

    // Recursos de "biblioteca" (ej. modules/library/biblioteca-verbo) que mencionan
    // este capitulo. Es un campo aparte de "commentaries" para no tocar esa logica:
    // solo indica cuantos articulos distintos hay por verso, el panel Biblioteca ya
    // sabe cargar el detalle via loadLinkedEntries cuando el usuario lo abre.
    const libraryResults=(await Promise.all((registry.library || []).map(async path=>{
      try { return await loadLinkedEntries(`modules/${path}`,bookId,chapter); }
      catch (error) { console.warn(`Biblioteca omitida: modules/${path}`, error); return null; }
    }))).filter(Boolean);

    // Fragmentos patrísticos anclados a versículo (ver FASE 9 en PLAN.md):
    // mismo patrón que "biblioteca", solo indica cuántos fragmentos distintos
    // hay por verso — el panel Padres Apostólicos (modo "Por versículo") carga
    // el detalle vía loadLinkedEntries cuando el usuario lo abre.
    const patristicByVerseResults=(await Promise.all((registry.patristicByVerse || []).map(async path=>{
      try { return await loadLinkedEntries(`modules/${path}`,bookId,chapter); }
      catch (error) { console.warn(`Padre apostólico omitido: modules/${path}`, error); return null; }
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

    const libraryByVerse=new Map();
    libraryResults.forEach(lib=>lib.entries.forEach(entry=>{
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

      for(let v=start;v<=end;v++){
        if(!libraryByVerse.has(v)) libraryByVerse.set(v, new Set());
        libraryByVerse.get(v).add(entry.articleId || entry.id);
      }
    }));

    const patristicByVerse=new Map();
    patristicByVerseResults.forEach(res=>res.entries.forEach(entry=>{
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

      for(let v=start;v<=end;v++){
        if(!patristicByVerse.has(v)) patristicByVerse.set(v, new Set());
        patristicByVerse.get(v).add(entry.id);
      }
    }));

    const verses=allVerseNumbers.map(n=>{
      const text={}, segments={};
      bibleResults.forEach(b=>{ const v=b.verses[String(n)]; if(!v)return; text[b.manifest.id]=typeof v==='string'?v:v.text; if(b.manifest.hasStrongs && v.segments) segments[b.manifest.id]=v.segments; });
      const byModule=notesByVerse.get(n) || new Map();
      const commentaries=[...byModule.entries()].map(([commentaryId,noteIds])=>{
        const note=notes[noteIds[0]];
        return { commentaryId, noteIds, label:note?.commentaryLabel || commentaryId, name:note?.commentaryName || commentaryId };
      });
      const noteIds=commentaries.flatMap(item=>item.noteIds);
      const crossrefs=crossrefsByVerse[String(n)] || [];
      const libraryCount=(libraryByVerse.get(n) || new Set()).size;
      const patristicCount=(patristicByVerse.get(n) || new Set()).size;
      return {n,text,segments,hasNote:noteIds.length>0,noteIds,commentaries,crossrefs,libraryCount,patristicCount};
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

  return { getCatalog,getBookInfo,buildChapterData,loadBible,loadRemoteBible,loadCommentary,loadLinkedEntries,loadLinkedArticle,getDictionaryEntry,loadDictionaryEntries,loadDictionaryIndex,loadGospel,loadPatristic,searchBible,searchRemoteBible,searchSemanticGospels };
})();

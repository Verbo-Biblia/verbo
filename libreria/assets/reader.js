(function () {
  "use strict";

  var cfg = window.__LIBRERIA_BOOK__;
  if (!cfg) return;

  var root = document.getElementById("reader-root");
  if (!root) return;

  // ":hl2" — formato con rangos de texto libres (start/end de caracteres).
  // Distinto del formato viejo (":hl", párrafo completo sí/no) para no
  // heredar datos incompatibles de la primera versión del lector.
  var HL_KEY = "verbo:libreria:" + cfg.id + ":hl2";
  var BM_KEY = "verbo:libreria:" + cfg.id + ":bookmark";

  var chapters = [];
  var current = 0;
  var highlights = loadJSON(HL_KEY, {});
  var bookmark = loadJSON(BM_KEY, null);
  var paraTexts = []; // texto plano de cada párrafo del capítulo actual
  var speech = {
    ui: null,
    playing: false,
    loading: false,
    generation: 0,
    continueAfterRender: false,
    currentChapterForAudio: -1,
    lastBookmarkSave: 0
  };

  // ---------- traducción ES->EN on-demand (estrategia_traduccion) ----------
  // "auto" (default): se traduce el capítulo completo vía el mismo
  // mecanismo que usa el resto del sitio (Google Translate no oficial +
  // caché en localStorage), cuando el idioma de interfaz activo no es
  // español. "manual": nunca se traduce, se muestra un aviso discreto.
  var strategy = cfg.estrategiaTraduccion || "auto";
  var translatedMode = false; // true si el capítulo actual se está mostrando traducido
  var renderToken = 0; // evita que una traducción vieja pise una más nueva al cambiar de capítulo/idioma rápido

  function currentLang() {
    return window.VerboI18n ? window.VerboI18n.getUiLang() : "es";
  }

  function canAutoTranslate() {
    return strategy === "auto" && currentLang() !== "es" && !!window.VerboSiteTranslate;
  }

  function resolveChapterText(ch) {
    if (!canAutoTranslate()) return Promise.resolve({ text: ch.text, title: ch.title, translated: false });
    var lang = currentLang();
    var idBase = cfg.id + ":" + ch.n;
    return Promise.all([
      window.VerboSiteTranslate.translateText(ch.text, idBase, "es", lang),
      window.VerboSiteTranslate.translateText(ch.title, idBase + ":title", "es", lang)
    ]).then(function (r) {
      return { text: r[0], title: r[1], translated: r[0] !== ch.text };
    });
  }

  // Título del libro, autor y la palabra de unidad ("Capítulo" -> "Chapter")
  // — se traducen una sola vez por idioma (cacheadas), independiente de en
  // qué capítulo esté el lector.
  function resolveBookStrings() {
    if (!canAutoTranslate()) return Promise.resolve({ title: cfg.title, author: cfg.author, unitLabel: cfg.unitLabel });
    var lang = currentLang();
    return Promise.all([
      window.VerboSiteTranslate.translateText(cfg.title, cfg.id + ":booktitle", "es", lang),
      window.VerboSiteTranslate.translateText(cfg.author, cfg.id + ":author", "es", lang),
      window.VerboSiteTranslate.translateText(cfg.unitLabel, cfg.id + ":unitlabel", "es", lang)
    ]).then(function (r) {
      return { title: r[0], author: r[1], unitLabel: r[2] };
    });
  }

  function updateManualBanner(ui) {
    if (!ui.manualNote) return;
    var show = strategy === "manual" && currentLang() !== "es";
    ui.manualNote.hidden = !show;
    if (show && window.VerboI18n) {
      window.VerboI18n.ready().then(function () {
        ui.manualNote.textContent = window.VerboI18n.t("site.translationPending");
      });
    }
  }

  // Chrome fijo del lector (título del libro, autor, textos de ayuda,
  // botones) — se resuelve aparte del cuerpo del capítulo porque no cambia
  // al navegar entre capítulos, solo al cambiar de idioma.
  function applyChrome(ui) {
    var t = window.VerboI18n ? window.VerboI18n.t : function (k) { return k; };
    ui.hint.textContent = t("reader.hint");
    ui.resumeLink.textContent = t("reader.continue");
    ui.resumeDismiss.textContent = t("reader.discard");
    ui.bmBtn.textContent = (bookmark && bookmark.chapter === current) ? t("reader.marked") : t("reader.markChapter");
    return resolveBookStrings().then(function (book) {
      ui.badge.textContent = "Librería · " + book.author;
      ui.title.textContent = book.title;
      ui.unitLabel = book.unitLabel; // usado por render()/foot/resume/opciones
      buildChapterOptions(ui);
      if (ui.resume && !ui.resume.hidden && bookmark) {
        ui.resumeText.textContent = t("reader.resumeBookmark", { unit: book.unitLabel.toLowerCase(), n: bookmark.chapter + 1 });
      }
    });
  }

  function loadJSON(key, fallback) {
    try {
      var raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }
  function saveJSON(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      /* almacenamiento no disponible, se ignora silenciosamente */
    }
  }

  // Retiro de Piper (2026-07): limpia los modelos que hayan quedado
  // cacheados en dispositivos que probaron el TTS anterior a Web Speech.
  // Ya NO desregistra el Service Worker de /libreria/ — ese path ahora aloja
  // uno legítimo (libreria/service-worker.js, cachea audiolibros pregenerados).
  function cleanupLegacyPiperCache() {
    if (!("caches" in window)) return;
    window.caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (key) {
        return key.indexOf("verbo-libreria-tts-") === 0;
      }).map(function (key) {
        return window.caches.delete(key);
      }));
    }).catch(function () {});
  }

  function registerAudioServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/libreria/service-worker.js").catch(function () {});
  }

  cleanupLegacyPiperCache();
  registerAudioServiceWorker();

  // ---------- audiolibro pregenerado (Google Cloud TTS vía Worker + R2) ----------
  // Piper y Web Speech API (voz nativa del dispositivo) quedaron archivados
  // como referencia en reader-speech-legacy.js — no se cargan aquí. El
  // idioma de la voz se toma SIEMPRE de cfg.language (metadata explícita del
  // libro, ver tools/import_library_batch.py), nunca de detección automática
  // de texto ni de convenciones de id — así se evita el error de leer un
  // libro en el idioma equivocado.
  var audioEl = (typeof Audio !== "undefined") ? new Audio() : null;
  var ttsBaseUrlPromise = null;

  function audioSupported() {
    return !!audioEl;
  }

  function resolveTtsBaseUrl() {
    if (!ttsBaseUrlPromise) {
      ttsBaseUrlPromise = fetch("/biblia/modules/registry.json")
        .then(function (r) { return r.json(); })
        .then(function (registry) {
          return String((registry.apiBible && registry.apiBible.proxyUrl) || "").replace(/\/+$/, "");
        })
        .catch(function () { return ""; });
    }
    return ttsBaseUrlPromise;
  }

  function ttsLang() {
    return cfg.language === "en" ? "en" : "es";
  }

  function chapterAudioKey(index) {
    var ch = chapters[index];
    return ch ? String(ch.n) : String(index + 1);
  }

  function updateSpeechButton() {
    if (!speech.ui) return;
    var btn = speech.ui.speechBtn;
    btn.classList.toggle("is-active", speech.playing);
    btn.classList.toggle("is-loading", speech.loading);
    if (speech.loading) {
      btn.textContent = "…";
      btn.title = "Generando audio…";
    } else {
      btn.textContent = speech.playing ? "❚❚" : "▶";
      btn.title = speech.playing ? "Pausar" : "Reproducir";
    }
    btn.setAttribute("aria-label", btn.title);
  }

  function showSpeechError() {
    if (!speech.ui || !speech.ui.speechError) return;
    var t = window.VerboI18n ? window.VerboI18n.t : function (k) { return k; };
    speech.ui.speechError.textContent = t("reader.audioError");
    speech.ui.speechError.hidden = false;
    window.setTimeout(function () { if (speech.ui) speech.ui.speechError.hidden = true; }, 4000);
  }

  function saveAudioBookmark() {
    if (!audioEl) return;
    bookmark = {
      chapter: current,
      audioTime: Math.max(0, audioEl.currentTime || 0),
      ts: Date.now()
    };
    saveJSON(BM_KEY, bookmark);
    if (speech.ui) {
      speech.ui.bmBtn.classList.add("is-active");
      speech.ui.bmBtn.textContent = window.VerboI18n ? window.VerboI18n.t("reader.marked") : "★ Marcado";
    }
  }

  function stopSpeech(savePosition) {
    if (!audioEl) return;
    if (savePosition && (speech.playing || speech.loading)) saveAudioBookmark();
    speech.generation++;
    audioEl.pause();
    speech.playing = false;
    speech.loading = false;
    updateSpeechButton();
  }

  function loadAndPlayChapterAudio(index, startAt) {
    if (!audioEl) return;
    var generation = ++speech.generation;
    speech.loading = true;
    speech.playing = false;
    updateSpeechButton();

    resolveTtsBaseUrl().then(function (base) {
      if (generation !== speech.generation) return null;
      if (!base) throw new Error("tts-no-base-url");
      var ch = chapters[index];
      var endpoint = base + "/v1/tts/" + encodeURIComponent(cfg.id) + "/" + encodeURIComponent(chapterAudioKey(index));
      return fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: ch.text, lang: ttsLang() })
      });
    }).then(function (response) {
      if (generation !== speech.generation || !response) return null;
      if (!response.ok) throw new Error("tts-fetch-failed");
      return response.blob();
    }).then(function (blob) {
      if (generation !== speech.generation || !blob) return;
      audioEl.src = URL.createObjectURL(blob);
      audioEl.currentTime = startAt || 0;
      speech.loading = false;
      speech.playing = true;
      speech.currentChapterForAudio = index;
      updateSpeechButton();
      audioEl.play().catch(function () {
        if (generation !== speech.generation) return;
        speech.playing = false;
        updateSpeechButton();
      });
    }).catch(function () {
      if (generation !== speech.generation) return;
      speech.loading = false;
      speech.playing = false;
      updateSpeechButton();
      showSpeechError();
    });
  }

  function toggleSpeech() {
    if (!audioEl || speech.loading) return;
    if (speech.playing) {
      saveAudioBookmark();
      audioEl.pause();
      speech.playing = false;
      updateSpeechButton();
      return;
    }
    if (audioEl.src && speech.currentChapterForAudio === current && !audioEl.ended) {
      speech.generation++;
      speech.playing = true;
      updateSpeechButton();
      audioEl.play().catch(function () {
        speech.playing = false;
        updateSpeechButton();
      });
      return;
    }
    var startAt = bookmark && bookmark.chapter === current ? (bookmark.audioTime || 0) : 0;
    loadAndPlayChapterAudio(current, startAt);
  }

  if (audioEl) {
    audioEl.addEventListener("ended", function () {
      if (!speech.playing) return;
      speech.playing = false;
      if (current < chapters.length - 1) {
        bookmark = { chapter: current + 1, audioTime: 0, ts: Date.now() };
        saveJSON(BM_KEY, bookmark);
        speech.continueAfterRender = true;
        goTo(speech.ui, current + 1);
      } else {
        bookmark = { chapter: current, audioTime: 0, ts: Date.now() };
        saveJSON(BM_KEY, bookmark);
        updateSpeechButton();
      }
    });
    audioEl.addEventListener("timeupdate", function () {
      if (!speech.playing) return;
      var now = Date.now();
      if (now - speech.lastBookmarkSave > 5000) {
        speech.lastBookmarkSave = now;
        saveAudioBookmark();
      }
    });
    audioEl.addEventListener("error", function () {
      if (!speech.loading && !speech.playing) return;
      speech.loading = false;
      speech.playing = false;
      updateSpeechButton();
    });
  }

  // Agrupa el texto continuo de una sección/capítulo en "párrafos" de
  // tamaño legible, dividiendo por oraciones. El agrupamiento es
  // determinista (mismo texto de entrada -> mismos párrafos siempre),
  // así los índices de párrafo sirven como clave estable para el resaltado.
  function splitIntoParagraphs(text) {
    if (!text) return [];
    var sentences = text.match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g) || [text];
    var paras = [];
    var buf = "";
    for (var i = 0; i < sentences.length; i++) {
      var s = sentences[i].trim();
      if (!s) continue;
      buf = buf ? buf + " " + s : s;
      if (buf.length >= 320) {
        paras.push(buf);
        buf = "";
      }
    }
    if (buf) paras.push(buf);
    return paras.length ? paras : [text];
  }

  // Convierte HTML de origen (ej. Matthew Henry, con <p>/<b>/<i>) a texto
  // plano legible, conservando saltos de párrafo. El resaltado por rangos
  // de caracteres (ver más abajo) solo funciona sobre texto plano, así que
  // el marcado se descarta aquí en vez de intentar resaltar dentro de HTML.
  function htmlToPlainText(html) {
    var withBreaks = html.replace(/<\/p>|<br\s*\/?>|<BR\s*\/?>/gi, "\n\n");
    var div = document.createElement("div");
    div.innerHTML = withBreaks;
    return (div.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
  }

  function normalize(raw) {
    var arr = raw[cfg.dataKey] || [];
    return arr.map(function (item, i) {
      var text = item[cfg.textField] || "";
      if (cfg.htmlSource) text = htmlToPlainText(text);
      return {
        n: item.n || i + 1,
        title: item[cfg.titleField] || (cfg.unitLabel + " " + (item.n || i + 1)),
        text: text
      };
    });
  }

  function loadBibleContent(manifestUrl) {
    return fetch(manifestUrl)
      .then(function (r) {
        if (!r.ok) throw new Error("No se pudo cargar la edición bíblica.");
        return r.json();
      })
      .then(function (manifest) {
        var base = new URL(".", new URL(manifestUrl, window.location.href));
        return Promise.all(manifest.books.map(function (book) {
          return fetch(new URL(book.file, base))
            .then(function (r) {
              if (!r.ok) throw new Error("No se pudo cargar " + book.name + ".");
              return r.json();
            })
            .then(function (data) {
              return Object.keys(data.chapters).map(function (chapter) {
                var verses = data.chapters[chapter];
                return {
                  n: book.number + "." + chapter,
                  title: book.name + " " + chapter,
                  content: Object.keys(verses).map(function (verse) {
                    return verse + " " + verses[verse].text;
                  }).join("\n\n")
                };
              });
            });
        })).then(function (books) {
          return { sections: books.reduce(function (all, book) { return all.concat(book); }, []) };
        });
      });
  }

  function el(tag, className, text) {
    var e = document.createElement(tag);
    if (className) e.className = className;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  // ---------- resaltado por rangos de texto libres ----------

  function mergeRanges(ranges) {
    ranges.sort(function (a, b) { return a[0] - b[0]; });
    var out = [];
    ranges.forEach(function (r) {
      var last = out[out.length - 1];
      if (last && r[0] <= last[1]) {
        last[1] = Math.max(last[1], r[1]);
      } else {
        out.push(r.slice());
      }
    });
    return out;
  }

  function hlKey(paraIndex) { return current + ":" + paraIndex; }

  function addHighlightRange(paraIndex, start, end) {
    var key = hlKey(paraIndex);
    var ranges = highlights[key] || [];
    ranges.push([start, end]);
    highlights[key] = mergeRanges(ranges);
    saveJSON(HL_KEY, highlights);
  }

  function removeHighlightRange(paraIndex, start, end) {
    var key = hlKey(paraIndex);
    var ranges = highlights[key] || [];
    ranges = ranges.filter(function (r) { return !(r[0] === start && r[1] === end); });
    if (ranges.length) highlights[key] = ranges; else delete highlights[key];
    saveJSON(HL_KEY, highlights);
  }

  // Reconstruye el contenido de un <p> a partir del texto plano y sus
  // rangos resaltados, intercalando <mark> para las zonas resaltadas.
  function renderParaContent(pEl, text, paraIndex) {
    pEl.innerHTML = "";
    // En modo traducido no se aplican los rangos guardados: los offsets de
    // caracteres corresponden al texto original en español y no coinciden
    // con el texto traducido (el resaltado no se pierde, solo no se dibuja
    // mientras se ve la traducción).
    var ranges = translatedMode ? [] : (highlights[hlKey(paraIndex)] || []);
    var pos = 0;
    ranges.forEach(function (r) {
      var start = Math.max(0, Math.min(r[0], text.length));
      var end = Math.max(start, Math.min(r[1], text.length));
      if (start > pos) pEl.appendChild(document.createTextNode(text.slice(pos, start)));
      var mark = document.createElement("mark");
      mark.className = "reader-hl";
      mark.title = "Toca para quitar el resaltado";
      mark.textContent = text.slice(start, end);
      mark.addEventListener("click", function (e) {
        e.stopPropagation();
        removeHighlightRange(paraIndex, r[0], r[1]);
        renderParaContent(pEl, text, paraIndex);
      });
      pEl.appendChild(mark);
      pos = end;
    });
    if (pos < text.length) pEl.appendChild(document.createTextNode(text.slice(pos)));
  }

  // Calcula el offset (en caracteres, sobre el texto plano) de un punto
  // (node, offset) de un Range, relativo a un contenedor dado.
  function textOffsetInContainer(container, node, offset) {
    var total = 0;
    var found = -1;
    function walk(n) {
      if (found !== -1) return;
      if (n.nodeType === Node.TEXT_NODE) {
        if (n === node) {
          found = total + offset;
          return;
        }
        total += n.textContent.length;
      } else {
        for (var i = 0; i < n.childNodes.length; i++) {
          walk(n.childNodes[i]);
          if (found !== -1) return;
        }
      }
    }
    walk(container);
    return found;
  }

  function handleSelection(contentEl) {
    // El resaltado se guarda como rangos de caracteres sobre el texto en
    // español; en modo traducido esos offsets no significarían nada al
    // volver a español, así que se deshabilita mientras se ve la traducción.
    if (translatedMode) return;
    var sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
    var range = sel.getRangeAt(0);
    if (!contentEl.contains(range.commonAncestorContainer)) return;

    var startEl = range.startContainer.nodeType === 3 ? range.startContainer.parentElement : range.startContainer;
    var endEl = range.endContainer.nodeType === 3 ? range.endContainer.parentElement : range.endContainer;
    var startPara = startEl && startEl.closest(".reader-para");
    var endPara = endEl && endEl.closest(".reader-para");
    if (!startPara || !endPara || startPara !== endPara) {
      sel.removeAllRanges();
      return; // solo se admite resaltar dentro de un mismo párrafo
    }

    var paraIndex = parseInt(startPara.dataset.para, 10);
    var a = textOffsetInContainer(startPara, range.startContainer, range.startOffset);
    var b = textOffsetInContainer(startPara, range.endContainer, range.endOffset);
    sel.removeAllRanges();
    if (a < 0 || b < 0 || a === b) return;
    var start = Math.min(a, b), end = Math.max(a, b);

    addHighlightRange(paraIndex, start, end);
    renderParaContent(startPara, paraTexts[paraIndex], paraIndex);
  }

  function buildSkeleton() {
    root.innerHTML = "";

    var headTop = el("div", "reader-head-top");
    var badge = el("span", "reader-badge", "Librería · " + cfg.author);
    headTop.appendChild(badge);
    var bmBtn = el("button", "reader-bookmark-btn", "☆ Marcar este capítulo");
    bmBtn.type = "button";
    headTop.appendChild(bmBtn);
    var speechBtn = el("button", "reader-speech-btn", "▶");
    speechBtn.type = "button";
    speechBtn.title = "Reproducir";
    speechBtn.setAttribute("aria-label", "Reproducir");
    speechBtn.hidden = !audioSupported();
    headTop.appendChild(speechBtn);
    var speechError = el("span", "reader-speech-error");
    speechError.hidden = true;
    headTop.appendChild(speechError);
    root.appendChild(headTop);

    var manualNote = el("p", "reader-manual-note");
    manualNote.hidden = true;
    root.appendChild(manualNote);

    var title = el("h1", "reader-title", cfg.title);
    root.appendChild(title);

    if (cfg.licenseNotice) {
      var licenseNotice = el("p", "reader-license", cfg.licenseNotice);
      root.appendChild(licenseNotice);
    }

    var progress = el("div", "reader-progress");
    var progressBar = el("div", "reader-progress-bar");
    progress.appendChild(progressBar);
    root.appendChild(progress);

    var resume = el("div", "reader-resume-banner");
    resume.hidden = true;
    var resumeText = el("span");
    var resumeLink = el("a", null, "Continuar →");
    resumeLink.href = "#";
    var resumeDismiss = el("button", null, "Descartar");
    resumeDismiss.type = "button";
    resume.appendChild(resumeText);
    var resumeActions = el("span");
    resumeActions.appendChild(resumeLink);
    resumeActions.appendChild(document.createTextNode("  "));
    resumeActions.appendChild(resumeDismiss);
    resume.appendChild(resumeActions);
    root.appendChild(resume);

    var nav = el("div", "reader-chapternav");
    var prevBtn = document.createElement("button");
    prevBtn.type = "button";
    prevBtn.innerHTML = '←<span class="chapternav-label"> Anterior</span>';
    var select = document.createElement("select");
    select.className = "reader-chapter-select";
    var nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.innerHTML = '<span class="chapternav-label">Siguiente </span>→';
    nav.appendChild(prevBtn);
    nav.appendChild(select);
    nav.appendChild(nextBtn);
    root.appendChild(nav);

    var hint = el("p", "reader-hint", "Selecciona el texto que quieras resaltar (arrastra el dedo o el mouse). Toca un resaltado para quitarlo. Se guarda en este dispositivo.");
    root.appendChild(hint);

    var chapterTitle = el("h2", "reader-chapter-title");
    root.appendChild(chapterTitle);

    var content = el("div", "reader-content");
    content.addEventListener("mouseup", function () { handleSelection(content); });
    content.addEventListener("touchend", function () { handleSelection(content); });
    root.appendChild(content);

    var foot = el("div", "reader-foot");
    root.appendChild(foot);

    return {
      badge: badge, title: title, hint: hint, unitLabel: cfg.unitLabel,
      bmBtn: bmBtn, speechBtn: speechBtn, speechError: speechError, progressBar: progressBar, manualNote: manualNote,
      resume: resume, resumeText: resumeText, resumeLink: resumeLink, resumeDismiss: resumeDismiss,
      prevBtn: prevBtn, select: select, nextBtn: nextBtn,
      chapterTitle: chapterTitle, content: content, foot: foot
    };
  }

  // Reconstruye las opciones del selector de capítulos. Se llama al iniciar
  // y de nuevo cuando cambia el idioma, para que al menos la palabra de
  // unidad ("Capítulo" -> "Chapter") quede traducida; el resto del título
  // (descriptivo) se deja en español para no disparar decenas de llamadas
  // de traducción por cada cambio de idioma.
  function buildChapterOptions(ui) {
    var unitLabel = ui.unitLabel || cfg.unitLabel;
    ui.select.innerHTML = "";
    chapters.forEach(function (ch, i) {
      var opt = document.createElement("option");
      opt.value = String(i);
      var alreadyLabeled = /^(Libro|Cap[ií]tulo|Secci[oó]n|Fragmento|Visi[oó]n|Mandamiento|S[ií]mil|Salmo)/i.test(ch.title);
      var label = alreadyLabeled ? ch.title : (unitLabel + " " + (i + 1) + " — " + ch.title);
      opt.textContent = label.slice(0, 70);
      ui.select.appendChild(opt);
    });
    ui.select.value = String(current);
  }

  function render(ui) {
    var ch = chapters[current];
    var token = ++renderToken;
    var t = window.VerboI18n ? window.VerboI18n.t : function (k) { return k; };
    updateManualBanner(ui);

    ui.progressBar.style.width = Math.round(((current + 1) / chapters.length) * 100) + "%";
    ui.select.value = String(current);
    ui.prevBtn.disabled = current === 0;
    ui.nextBtn.disabled = current === chapters.length - 1;

    ui.content.innerHTML = '<p class="reader-hint">' + t("reader.loading") + '</p>';

    resolveChapterText(ch).then(function (resolved) {
      if (token !== renderToken) return; // el usuario ya navegó a otro capítulo/idioma
      translatedMode = resolved.translated;
      ui.chapterTitle.textContent = resolved.title;
      ui.content.innerHTML = "";
      paraTexts = splitIntoParagraphs(resolved.text);
      paraTexts.forEach(function (text, pi) {
        var p = el("p", "reader-para");
        p.dataset.para = String(pi);
        renderParaContent(p, text, pi);
        ui.content.appendChild(p);
      });
      if (speech.continueAfterRender) {
        speech.continueAfterRender = false;
        loadAndPlayChapterAudio(current, 0);
      }
    });

    ui.bmBtn.classList.toggle("is-active", !!(bookmark && bookmark.chapter === current));
    ui.bmBtn.textContent = (bookmark && bookmark.chapter === current) ? t("reader.marked") : t("reader.markChapter");

    var unitLabel = ui.unitLabel || cfg.unitLabel;
    ui.foot.textContent = t("reader.footOf", { unit: unitLabel, current: current + 1, total: chapters.length });

    window.location.hash = String(current + 1);
    window.scrollTo({ top: root.getBoundingClientRect().top + window.scrollY - 90, behavior: "smooth" });
  }

  function goTo(ui, index) {
    if (index < 0 || index >= chapters.length) return;
    current = index;
    render(ui);
  }

  function init(raw) {
    chapters = normalize(raw);
    if (!chapters.length) {
      root.innerHTML = '<p class="reader-hint">No se pudo cargar el contenido de este libro.</p>';
      return;
    }

    var ui = buildSkeleton();
    speech.ui = ui;
    buildChapterOptions(ui);

    var hashChapter = parseInt((window.location.hash || "").replace("#", ""), 10);
    if (hashChapter && hashChapter >= 1 && hashChapter <= chapters.length) {
      current = hashChapter - 1;
    } else if (bookmark && bookmark.chapter >= 0 && bookmark.chapter < chapters.length) {
      ui.resume.hidden = false;
      ui.resumeText.textContent = "Tienes un marcador en " + cfg.unitLabel.toLowerCase() + " " + (bookmark.chapter + 1) + ".";
      ui.resumeLink.addEventListener("click", function (e) {
        e.preventDefault();
        ui.resume.hidden = true;
        goTo(ui, bookmark.chapter);
      });
      ui.resumeDismiss.addEventListener("click", function () {
        ui.resume.hidden = true;
      });
    }

    ui.prevBtn.addEventListener("click", function () { stopSpeech(true); goTo(ui, current - 1); });
    ui.nextBtn.addEventListener("click", function () { stopSpeech(true); goTo(ui, current + 1); });
    ui.select.addEventListener("change", function () { stopSpeech(true); goTo(ui, parseInt(ui.select.value, 10)); });
    ui.speechBtn.addEventListener("click", toggleSpeech);
    ui.bmBtn.addEventListener("click", function () {
      if (bookmark && bookmark.chapter === current) {
        bookmark = null;
      } else {
        bookmark = { chapter: current, ts: Date.now() };
      }
      saveJSON(BM_KEY, bookmark);
      var t = window.VerboI18n ? window.VerboI18n.t : function (k) { return k; };
      ui.bmBtn.classList.toggle("is-active", !!bookmark);
      ui.bmBtn.textContent = bookmark ? t("reader.marked") : t("reader.markChapter");
    });

    document.addEventListener("verbo:uilang-changed", function () {
      stopSpeech(true);
      applyChrome(ui).then(function () { render(ui); });
    });
    window.addEventListener("pagehide", function () {
      if (speech.playing || speech.loading) saveAudioBookmark();
    });
    if (window.VerboI18n) {
      window.VerboI18n.ready().then(function () { applyChrome(ui).then(function () { render(ui); }); });
    } else {
      render(ui);
    }
  }

  root.innerHTML = '<p class="reader-hint">Cargando…</p>';
  var contentPromise = cfg.bibleManifestUrl
    ? loadBibleContent(cfg.bibleManifestUrl)
    : fetch(cfg.dataUrl).then(function (r) { return r.json(); });
  contentPromise
    .then(init)
    .catch(function () {
      root.innerHTML = '<p class="reader-hint">No se pudo cargar el contenido de este libro.</p>';
    });
})();

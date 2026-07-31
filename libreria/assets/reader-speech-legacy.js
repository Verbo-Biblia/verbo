/*
 * ARCHIVADO 2026-07-30 — no se carga en producción.
 *
 * Implementación de lectura en voz alta de Librería vía Web Speech API
 * (voz nativa del dispositivo del usuario), reemplazada por audiolibros
 * pregenerados con Google Cloud TTS (voces WaveNet), servidos bajo demanda
 * y cacheados permanentemente en R2 a través del Worker
 * `cloudflare/api-bible-worker` (endpoint /v1/tts/:libro/:capitulo).
 * Ver libreria/assets/reader.js para la implementación activa.
 *
 * Se conserva aquí como referencia y posible fallback futuro (por ejemplo,
 * si algún día se necesita una opción de lectura 100% offline/sin red que
 * no dependa del Worker ni de cuota de Google). Piper (motor de TTS local
 * anterior a Web Speech, retirado 2026-07) ya no dejó código en el repo —
 * solo queda la limpieza de su Service Worker/caché, conservada en
 * reader.js (cleanupLegacyPiper).
 *
 * Este archivo es texto de referencia, no código funcional: depende de
 * variables (cfg, chapters, current, bookmark, BM_KEY, saveJSON, loadJSON,
 * goTo) que existían en el ámbito del IIFE de reader.js en el momento en
 * que se archivó. No se puede incluir tal cual en una página sin volver a
 * cablear esas dependencias.
 */

// ---------- lectura nativa (Web Speech API) ----------

function speechSupported() {
  return "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

function speechLanguage() {
  if (translatedMode) return currentLang() === "en" ? "en-US" : "es-ES";
  if (cfg.language) return cfg.language;
  return strategy === "native" || /(?:-en$|^matthew-henry-)/.test(cfg.id) ? "en-US" : "es-ES";
}

function updateSpeechButton() {
  if (!speech.ui) return;
  speech.ui.speechBtn.textContent = speech.playing ? "❚❚" : "▶";
  speech.ui.speechBtn.title = speech.playing ? "Pausar" : "Reproducir";
  speech.ui.speechBtn.setAttribute("aria-label", speech.ui.speechBtn.title);
  speech.ui.speechBtn.classList.toggle("is-active", speech.playing);
}

function nextSpeechChunk(text, offset) {
  var start = Math.max(0, offset || 0);
  while (start < text.length && /\s/.test(text.charAt(start))) start++;
  if (start >= text.length) return null;
  var limit = Math.min(text.length, start + 650);
  var end = limit;
  if (limit < text.length) {
    var slice = text.slice(start, limit);
    var match;
    var boundary = /[.!?;:](?:["'”’»)]*)\s+/g;
    while ((match = boundary.exec(slice))) {
      if (match.index > 260) end = start + match.index + match[0].length;
    }
    if (end === limit) {
      var space = slice.lastIndexOf(" ");
      if (space > 260) end = start + space + 1;
    }
  }
  return { start: start, end: end, text: text.slice(start, end).trim() };
}

function saveSpeechBookmark() {
  updateEstimatedSpeechPosition();
  bookmark = {
    chapter: current,
    speechOffset: Math.max(0, speech.position || speech.chunkStart || 0),
    ts: Date.now()
  };
  saveJSON(BM_KEY, bookmark);
  if (speech.ui) {
    speech.ui.bmBtn.classList.add("is-active");
    speech.ui.bmBtn.textContent = window.VerboI18n ? window.VerboI18n.t("reader.marked") : "★ Marcado";
  }
}

function updateEstimatedSpeechPosition() {
  if (!speech.playing || !speech.positionUpdatedAt) return;
  var elapsedSeconds = Math.max(0, (performance.now() - speech.positionUpdatedAt) / 1000);
  // Respaldo para navegadores que no implementan SpeechSynthesis.onboundary.
  // La posición de eventos reales siempre reemplaza esta estimación.
  var estimated = speech.position + Math.floor(elapsedSeconds * 14);
  speech.position = Math.min(speech.chunkEnd, Math.max(speech.chunkStart, estimated));
  speech.positionUpdatedAt = performance.now();
}

function stopSpeech(savePosition) {
  if (!speechSupported()) return;
  if (savePosition && (speech.playing || speech.paused || speech.utterance)) {
    saveSpeechBookmark();
  }
  speech.generation++;
  window.speechSynthesis.cancel();
  speech.utterance = null;
  speech.playing = false;
  speech.paused = false;
  updateSpeechButton();
}

function speakFromOffset(offset) {
  if (!speech.playing || !speechSupported()) return;
  var chunk = nextSpeechChunk(speech.chapterText, offset);
  if (!chunk) {
    if (current < chapters.length - 1) {
      bookmark = { chapter: current + 1, speechOffset: 0, ts: Date.now() };
      saveJSON(BM_KEY, bookmark);
      speech.continueAfterRender = true;
      goTo(speech.ui, current + 1);
    } else {
      speech.position = speech.chapterText.length;
      saveSpeechBookmark();
      speech.playing = false;
      speech.paused = false;
      speech.utterance = null;
      updateSpeechButton();
    }
    return;
  }

  var generation = ++speech.generation;
  var utterance = new SpeechSynthesisUtterance(chunk.text);
  utterance.lang = speechLanguage();
  speech.utterance = utterance;
  speech.chunkStart = chunk.start;
  speech.chunkEnd = chunk.end;
  speech.position = chunk.start;
  speech.positionUpdatedAt = performance.now();
  utterance.onboundary = function (event) {
    if (generation !== speech.generation) return;
    if (typeof event.charIndex === "number") {
      speech.position = Math.min(chunk.end, chunk.start + event.charIndex);
      speech.positionUpdatedAt = performance.now();
    }
  };
  utterance.onend = function () {
    if (generation !== speech.generation || !speech.playing) return;
    speech.position = chunk.end;
    speech.positionUpdatedAt = 0;
    speech.utterance = null;
    speakFromOffset(chunk.end);
  };
  utterance.onerror = function (event) {
    if (generation !== speech.generation || event.error === "canceled" || event.error === "interrupted") return;
    speech.playing = false;
    speech.paused = false;
    speech.utterance = null;
    speech.positionUpdatedAt = 0;
    updateSpeechButton();
  };
  window.speechSynthesis.speak(utterance);
}

function toggleSpeech() {
  if (!speechSupported()) return;
  if (speech.playing) {
    saveSpeechBookmark();
    speech.generation++;
    window.speechSynthesis.cancel();
    speech.utterance = null;
    speech.playing = false;
    speech.paused = true;
    updateSpeechButton();
    return;
  }
  if (speech.paused) {
    speech.playing = true;
    speech.paused = false;
    updateSpeechButton();
    speakFromOffset(speech.position);
    return;
  }
  window.speechSynthesis.cancel();
  speech.playing = true;
  speech.paused = false;
  updateSpeechButton();
  var offset = bookmark && bookmark.chapter === current ? (bookmark.speechOffset || 0) : 0;
  speakFromOffset(offset);
}

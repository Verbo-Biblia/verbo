(function () {
  "use strict";

  // Botón "Escuchar" para Artículos y Reflexiones — mismo audiolibro
  // pregenerado (Google Cloud TTS + caché R2) que usa Librería, ver
  // libreria/assets/reader.js y cloudflare/api-bible-worker/worker.js
  // (/v1/tts/:libro/:capitulo). Cada idioma vive en su propia página
  // estática (redirección nativa, no traducción en vivo — ver
  // article-lang-redirect.js), así que el idioma de la voz se toma de
  // data-page-lang del propio <article>: metadata explícita, nunca
  // detección automática de texto.

  var article = document.querySelector("article[data-page-lang]");
  if (!article) return;
  if (typeof Audio === "undefined") return;

  var lang = article.dataset.pageLang === "en" ? "en" : "es";
  var slug = window.location.pathname.replace(/\/+$/, "").split("/").pop();
  if (!slug) return;

  var STRINGS = {
    es: { play: "▶ Escuchar", pause: "❚❚ Pausar", loading: "Generando audio…", error: "No se pudo cargar el audio. Intenta de nuevo." },
    en: { play: "▶ Listen", pause: "❚❚ Pause", loading: "Generating audio…", error: "Couldn't load the audio. Please try again." }
  };
  var t = STRINGS[lang];

  function extractText() {
    var parts = [];
    Array.prototype.forEach.call(article.children, function (node) {
      if (node.classList && (node.classList.contains("article-badge") || node.classList.contains("lesson-nav"))) return;
      if (!/^(H1|H2|H3|P|BLOCKQUOTE)$/.test(node.tagName)) return;
      var text = node.textContent.replace(/\s+/g, " ").trim();
      if (text) parts.push(text);
    });
    return parts.join("\n\n");
  }

  var text = extractText();
  if (!text) return;

  var btn = document.createElement("button");
  btn.type = "button";
  btn.className = "article-audio-btn";
  btn.textContent = t.play;

  var errorEl = document.createElement("span");
  errorEl.className = "article-audio-error";
  errorEl.hidden = true;

  var badge = article.querySelector(".article-badge");
  if (badge) {
    badge.insertAdjacentElement("afterend", errorEl);
    badge.insertAdjacentElement("afterend", btn);
  } else {
    article.insertBefore(errorEl, article.firstChild);
    article.insertBefore(btn, article.firstChild);
  }

  var audioEl = new Audio();
  var state = "idle"; // idle | loading | playing | paused
  var ttsBaseUrlPromise = null;

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

  function render() {
    btn.classList.toggle("is-loading", state === "loading");
    btn.classList.toggle("is-active", state === "playing");
    btn.textContent = state === "loading" ? t.loading : (state === "playing" ? t.pause : t.play);
  }

  function showError() {
    errorEl.textContent = t.error;
    errorEl.hidden = false;
    window.setTimeout(function () { errorEl.hidden = true; }, 4000);
  }

  function loadAndPlay() {
    state = "loading";
    render();
    resolveTtsBaseUrl().then(function (base) {
      if (!base) throw new Error("tts-no-base-url");
      var endpoint = base + "/v1/tts/articulos-" + lang + "/" + encodeURIComponent(slug);
      return fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text, lang: lang })
      });
    }).then(function (response) {
      if (!response.ok) throw new Error("tts-fetch-failed");
      return response.blob();
    }).then(function (blob) {
      audioEl.src = URL.createObjectURL(blob);
      state = "playing";
      render();
      audioEl.play().catch(function () {
        state = "paused";
        render();
      });
    }).catch(function () {
      state = "idle";
      render();
      showError();
    });
  }

  btn.addEventListener("click", function () {
    if (state === "loading") return;
    if (state === "playing") {
      audioEl.pause();
      state = "paused";
      render();
      return;
    }
    if (state === "paused" && audioEl.src) {
      audioEl.play().catch(function () {});
      state = "playing";
      render();
      return;
    }
    loadAndPlay();
  });

  audioEl.addEventListener("ended", function () {
    state = "idle";
    render();
  });
  audioEl.addEventListener("error", function () {
    if (state === "idle") return;
    state = "idle";
    render();
  });
})();

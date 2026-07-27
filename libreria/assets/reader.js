(function () {
  "use strict";

  var cfg = window.__LIBRERIA_BOOK__;
  if (!cfg) return;

  var root = document.getElementById("reader-root");
  if (!root) return;

  var HL_KEY = "verbo:libreria:" + cfg.id + ":hl";
  var BM_KEY = "verbo:libreria:" + cfg.id + ":bookmark";

  var chapters = [];
  var current = 0;
  var highlights = loadJSON(HL_KEY, {});
  var bookmark = loadJSON(BM_KEY, null);

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

  function normalize(raw) {
    var arr = raw[cfg.dataKey] || [];
    return arr.map(function (item, i) {
      return {
        n: item.n || i + 1,
        title: item[cfg.titleField] || (cfg.unitLabel + " " + (item.n || i + 1)),
        text: item[cfg.textField] || ""
      };
    });
  }

  function el(tag, className, text) {
    var e = document.createElement(tag);
    if (className) e.className = className;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function buildSkeleton() {
    root.innerHTML = "";

    var headTop = el("div", "reader-head-top");
    headTop.appendChild(el("span", "reader-badge", "Librería · " + cfg.author));
    var bmBtn = el("button", "reader-bookmark-btn", "☆ Marcar este capítulo");
    bmBtn.type = "button";
    headTop.appendChild(bmBtn);
    root.appendChild(headTop);

    root.appendChild(el("h1", "reader-title", cfg.title));

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
    var prevBtn = el("button", null, "← Anterior");
    prevBtn.type = "button";
    var select = document.createElement("select");
    select.className = "reader-chapter-select";
    var nextBtn = el("button", null, "Siguiente →");
    nextBtn.type = "button";
    nav.appendChild(prevBtn);
    nav.appendChild(select);
    nav.appendChild(nextBtn);
    root.appendChild(nav);

    root.appendChild(el("p", "reader-hint", "Toca un párrafo para resaltarlo. El resaltado y el marcador se guardan en este dispositivo."));

    var chapterTitle = el("h2", "reader-chapter-title");
    root.appendChild(chapterTitle);

    var content = el("div", "reader-content");
    root.appendChild(content);

    var foot = el("div", "reader-foot");
    root.appendChild(foot);

    return {
      bmBtn: bmBtn, progressBar: progressBar,
      resume: resume, resumeText: resumeText, resumeLink: resumeLink, resumeDismiss: resumeDismiss,
      prevBtn: prevBtn, select: select, nextBtn: nextBtn,
      chapterTitle: chapterTitle, content: content, foot: foot
    };
  }

  function render(ui) {
    var ch = chapters[current];
    ui.progressBar.style.width = Math.round(((current + 1) / chapters.length) * 100) + "%";
    ui.select.value = String(current);
    ui.prevBtn.disabled = current === 0;
    ui.nextBtn.disabled = current === chapters.length - 1;
    ui.chapterTitle.textContent = ch.title;

    ui.content.innerHTML = "";
    var paras = splitIntoParagraphs(ch.text);
    paras.forEach(function (text, pi) {
      var p = el("p", "reader-para", text);
      var key = current + ":" + pi;
      if (highlights[key]) p.classList.add("is-highlighted");
      p.addEventListener("click", function () {
        if (highlights[key]) {
          delete highlights[key];
          p.classList.remove("is-highlighted");
        } else {
          highlights[key] = true;
          p.classList.add("is-highlighted");
        }
        saveJSON(HL_KEY, highlights);
      });
      ui.content.appendChild(p);
    });

    ui.bmBtn.classList.toggle("is-active", !!(bookmark && bookmark.chapter === current));
    ui.bmBtn.textContent = (bookmark && bookmark.chapter === current) ? "★ Marcado" : "☆ Marcar este capítulo";

    ui.foot.textContent = cfg.unitLabel + " " + (current + 1) + " de " + chapters.length;

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

    chapters.forEach(function (ch, i) {
      var opt = document.createElement("option");
      opt.value = String(i);
      var alreadyLabeled = /^(Libro|Cap[ií]tulo|Secci[oó]n|Fragmento|Visi[oó]n|Mandamiento|S[ií]mil)/i.test(ch.title);
      var label = alreadyLabeled ? ch.title : (cfg.unitLabel + " " + (i + 1) + " — " + ch.title);
      opt.textContent = label.slice(0, 70);
      ui.select.appendChild(opt);
    });

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

    ui.prevBtn.addEventListener("click", function () { goTo(ui, current - 1); });
    ui.nextBtn.addEventListener("click", function () { goTo(ui, current + 1); });
    ui.select.addEventListener("change", function () { goTo(ui, parseInt(ui.select.value, 10)); });
    ui.bmBtn.addEventListener("click", function () {
      if (bookmark && bookmark.chapter === current) {
        bookmark = null;
      } else {
        bookmark = { chapter: current, ts: Date.now() };
      }
      saveJSON(BM_KEY, bookmark);
      ui.bmBtn.classList.toggle("is-active", !!bookmark);
      ui.bmBtn.textContent = bookmark ? "★ Marcado" : "☆ Marcar este capítulo";
    });

    render(ui);
  }

  root.innerHTML = '<p class="reader-hint">Cargando…</p>';
  fetch(cfg.dataUrl)
    .then(function (r) { return r.json(); })
    .then(init)
    .catch(function () {
      root.innerHTML = '<p class="reader-hint">No se pudo cargar el contenido de este libro.</p>';
    });
})();

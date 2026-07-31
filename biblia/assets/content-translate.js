/* Traducción ES->EN on-demand para piezas de contenido individuales de
   Recursos (artículos, reflexiones, lecciones de Escuela Dominical).
   Lee data-i18n-strategy en el <article> de la página:
     - "auto"   -> etiqueta párrafos/encabezados con data-i18n-live y deja
                   que site-translate.js (ya cargado por site-chrome.js)
                   los traduzca igual que Misión/Fundador.
     - "manual" -> nunca traduce el contenido; muestra un aviso discreto
                   cuando el idioma activo es distinto del español.
     - cualquier otro valor (ej. "nativo") -> no se toca.
   Debe cargarse ANTES de site-chrome.js para que el etiquetado ocurra
   antes de que este llame a VerboSiteTranslate.applyLiveTranslation(). */
(function () {
  'use strict';

  function tagAutoContent(article) {
    if (article.dataset.i18nTagged) return;
    var skipClasses = ['article-badge', 'lesson-badge', 'lesson-nav'];
    var i = 0;
    article.querySelectorAll('h1,h2,h3,p,li').forEach(function (el) {
      if (skipClasses.some(function (c) { return el.classList.contains(c); })) return;
      if (!el.textContent || !el.textContent.trim()) return;
      // Listas de enlaces (ej. índice de lecciones): tagear el <a>, no el
      // <li>, para no perder el elemento al reemplazar textContent.
      if (el.tagName === 'LI' && el.children.length === 1 && el.firstElementChild.tagName === 'A' &&
          el.firstElementChild.textContent.trim() === el.textContent.trim()) {
        el.firstElementChild.setAttribute('data-i18n-live', 'content:' + location.pathname + ':' + (i++));
        return;
      }
      el.setAttribute('data-i18n-live', 'content:' + location.pathname + ':' + (i++));
    });
    article.dataset.i18nTagged = '1';
  }

  function updateManualBanner(article) {
    var lang = window.VerboI18n ? window.VerboI18n.getUiLang() : 'es';
    var show = lang !== 'es';
    var note = article.querySelector('.i18n-manual-note');
    if (show) {
      if (!note) {
        note = document.createElement('p');
        note.className = 'i18n-manual-note';
        note.setAttribute('data-i18n', 'site.translationPending');
        var h1 = article.querySelector('h1');
        if (h1 && h1.parentNode) h1.parentNode.insertBefore(note, h1.nextSibling);
        else article.insertBefore(note, article.firstChild);
      }
      note.hidden = false;
      if (window.VerboI18n) window.VerboI18n.ready().then(function () { window.VerboI18n.applyStatic(note.parentNode); });
    } else if (note) {
      note.hidden = true;
    }
  }

  function apply() {
    var article = document.querySelector('main.static-page__main > article[data-i18n-strategy]');
    if (!article) return;
    var strategy = article.dataset.i18nStrategy;
    if (strategy === 'auto') {
      tagAutoContent(article);
    } else if (strategy === 'manual') {
      updateManualBanner(article);
    }
  }

  document.addEventListener('DOMContentLoaded', apply);
  document.addEventListener('verbo:uilang-changed', apply);
})();

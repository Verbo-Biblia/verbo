/* Artículos y Reflexiones: una sola página física sirve ambos idiomas.
   Cada fila trae data-titulo-es/en y data-ruta-es/en (impresos por
   tools/build_content_taxonomy.py). Al idioma activo (VerboI18n) se le
   reescribe título+href de cada fila; si falta la contraparte en inglés
   (data-ruta-en/data-titulo-en ausentes), la fila se queda en español sin
   error visible. */
(function () {
  "use strict";

  function applyLang() {
    if (!window.VerboI18n) return;
    var lang = VerboI18n.getUiLang();
    var rows = document.querySelectorAll("#articulos-list [data-item]");
    rows.forEach(function (row) {
      var useEn = lang === "en" && row.hasAttribute("data-ruta-en") && row.hasAttribute("data-titulo-en");
      var href = useEn ? row.getAttribute("data-ruta-en") : row.getAttribute("data-ruta-es");
      var titulo = useEn ? row.getAttribute("data-titulo-en") : row.getAttribute("data-titulo-es");
      var titleEl = row.querySelector(".r-article-row-title");
      if (href) row.setAttribute("href", href);
      if (titulo && titleEl) titleEl.textContent = titulo;
    });
  }

  applyLang();
  document.addEventListener("verbo:uilang-changed", applyLang);
})();

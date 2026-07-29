/* Artículos y Reflexiones ahora tienen versión nativa real en ambos idiomas
   (ya no traducción en vivo párrafo a párrafo). El <article> de cada página
   trae data-lang-pair apuntando a su contraparte y data-page-lang con el
   idioma real de ESE documento (no usar document.documentElement.lang: lo
   sobreescribe i18n.js para que siempre coincida con el idioma de interfaz
   elegido, lo que dejaría esta comparación siempre en verdadero). Si el
   idioma activo del sitio (VerboI18n, mismo switcher del header en todo el
   sitio) no coincide con data-page-lang, se navega directo a la
   contraparte -- al cargar la página y también si el usuario cambia el
   idioma desde el switcher estando ya adentro del artículo. Si la página no
   tiene data-lang-pair (contraparte todavía no traducida), no hace nada: se
   queda leyendo el español sin error visible. */
(function () {
  "use strict";

  function redirectIfNeeded() {
    if (!window.VerboI18n) return;
    var article = document.querySelector("main.static-page__main > article[data-lang-pair]");
    if (!article) return;
    var pageLang = article.getAttribute("data-page-lang") === "en" ? "en" : "es";
    if (VerboI18n.getUiLang() === pageLang) return;
    var pairUrl = article.getAttribute("data-lang-pair");
    if (pairUrl) location.replace(pairUrl);
  }

  redirectIfNeeded();
  document.addEventListener("verbo:uilang-changed", redirectIfNeeded);
})();

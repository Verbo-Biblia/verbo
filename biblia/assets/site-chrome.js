/* Wiring compartido del selector de idioma de interfaz (#uiLangSwitcher)
   para páginas fuera de /biblia/ (portal, misión, fundador, seminario,
   librería, recursos): activa VerboI18n + VerboSiteTranslate al cargar y
   cuando cambia el idioma. Cada página solo necesita incluir este script
   después de i18n.js (y site-translate.js si tiene contenido con
   data-i18n-live). */
(function(){
  'use strict';
  document.addEventListener('DOMContentLoaded', async () => {
    if(!window.VerboI18n) return;
    await VerboI18n.ready();
    const buttons = [...document.querySelectorAll('#uiLangSwitcher [data-lang]')];
    const markActive = () => {
      const current = VerboI18n.getUiLang();
      buttons.forEach(btn => btn.classList.toggle('is-active', btn.dataset.lang === current));
    };
    markActive();
    if(window.VerboSiteTranslate) await VerboSiteTranslate.applyLiveTranslation(document);
    buttons.forEach(btn => btn.addEventListener('click', () => VerboI18n.setUiLang(btn.dataset.lang)));
    document.addEventListener('verbo:uilang-changed', async () => {
      markActive();
      if(window.VerboSiteTranslate) await VerboSiteTranslate.applyLiveTranslation(document);
    });
  });
})();

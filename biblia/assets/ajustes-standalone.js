/* Versión standalone del panel de Ajustes (Tema, Sincronizar dispositivos,
   Exportar/Importar) para /ajustes/index.html — página propia fuera de la
   SPA de Biblia. Misma lógica que renderAjustes()/applyTheme() en
   biblia/assets/app.js, reescrita sin las dependencias del lector (catálogo
   de Biblias, panel lateral, etc.). Comparte los mismos scripts de datos
   (backup.js, sync.js) y por lo tanto el mismo IndexedDB/localStorage que
   /biblia/ — abrir esta página no crea una copia separada de los datos. */
(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', async () => {
    if (window.VerboI18n) await window.VerboI18n.ready();
    const t = (key, vars) => (window.VerboI18n ? window.VerboI18n.t(key, vars) : key);

    const panel = document.getElementById('ajustesPanel');
    if (!panel) return;

    const themes = [
      { id: 'paper', label: 'Papel cálido', sample: '#F1E3C8' },
      { id: 'cream', label: 'Crema dorada', sample: '#F5E7C8' },
      { id: 'sage', label: 'Verde oliva', sample: '#DDE8D1' },
      { id: 'mist', label: 'Azul noche suave', sample: '#DDEAF1' },
      { id: 'pearl', label: 'Gris perla', sample: '#ECE9E2' },
      { id: 'sand', label: 'Rosa arena', sample: '#F1DCD6' },
      { id: 'mint', label: 'Menta', sample: '#D8F3EA' },
      { id: 'rosewood', label: 'Palo rosa', sample: '#F2D7DF' }
    ];

    const escapeHTML = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[ch]));

    const toast = (message, duration = 1400) => {
      let el = document.querySelector('.verbo-toast');
      if (!el) { el = document.createElement('div'); el.className = 'verbo-toast'; document.body.appendChild(el); }
      el.textContent = message;
      el.classList.add('verbo-toast--show');
      clearTimeout(el._timer);
      el._timer = setTimeout(() => el.classList.remove('verbo-toast--show'), duration);
    };

    function applyTheme(themeId) {
      const safeTheme = themes.some(th => th.id === themeId) ? themeId : 'paper';
      document.body.dataset.theme = safeTheme;
      localStorage.setItem('verbo:theme', safeTheme);
    }
    applyTheme(localStorage.getItem('verbo:theme') || 'paper');

    await window.VerboBackup?.init?.();

    let syncPending = false;
    let syncBusy = false;

    if (window.VerboSync) {
      VerboSync.on('linked', () => { syncPending = false; renderAjustes(); });
      VerboSync.on('unlinked', () => { renderAjustes(); });
      VerboSync.on('link-error', () => { toast(t('toast.errorSync')); renderAjustes(); });
      VerboSync.init().catch(err => console.warn('[sync] init falló', err));
    }

    function renderSyncSection() {
      if (!window.VerboSync) {
        return `<div class="ajustes-section">
          <h3>${t('ajustes.syncTitle')}</h3>
          <p>${t('ajustes.syncDescripcion')}</p>
        </div>`;
      }
      if (VerboSync.isLinked()) {
        return `<div class="ajustes-section">
          <h3>${t('ajustes.syncTitle')}</h3>
          <p>${t('ajustes.syncLinkedMsg', { email: escapeHTML(VerboSync.getEmailMasked()) })}</p>
          <button class="ajustes-backup-btn" type="button" id="ajustesUnlinkBtn">${t('ajustes.syncUnlinkBtn')}</button>
        </div>`;
      }
      return `<div class="ajustes-section">
        <h3>${t('ajustes.syncTitle')}</h3>
        <p>${t('ajustes.syncDescripcion')}</p>
        <form class="ajustes-sync-form" id="ajustesSyncForm">
          <input class="ajustes-sync-form__input" type="email" id="ajustesSyncEmail" placeholder="${t('ajustes.syncPlaceholder')}" required ${syncBusy ? 'disabled' : ''}>
          <button class="ajustes-sync-form__btn" type="submit" ${syncBusy ? 'disabled' : ''}>${t('ajustes.syncBtn')}</button>
        </form>
        ${syncPending ? `<p class="ajustes-sync-pending">${t('ajustes.syncPendingMsg')}</p>` : ''}
      </div>`;
    }

    function renderAjustes() {
      const currentTheme = document.body.dataset.theme || 'paper';
      panel.innerHTML = `
        ${renderSyncSection()}
        <div class="ajustes-section">
          <h3>Tema</h3>
          <p>Elige un tono claro para descansar mejor la vista. Se guardará solo en este dispositivo.</p>
          <div class="theme-options">
            ${themes.map(th => `<button class="theme-option${th.id === currentTheme ? ' theme-option--active' : ''}" type="button" data-theme="${th.id}">
              <span class="theme-option__sample" style="background:${th.sample}"></span>
              <span class="theme-option__label">${escapeHTML(th.label)}</span>
            </button>`).join('')}
          </div>
        </div>
        <div class="ajustes-section">
          <h3>Exportar / Importar datos</h3>
          <p>Descarga un archivo con tus notas, resaltados y marcadores, o restáuralos en otro dispositivo.</p>
          <div class="ajustes-backup-actions">
            <button class="ajustes-backup-btn" type="button" id="ajustesExportBtn">Exportar mis datos</button>
            <button class="ajustes-backup-btn" type="button" id="ajustesImportBtn">Importar mis datos</button>
            <input type="file" id="ajustesImportInput" accept="application/json" hidden>
          </div>
        </div>`;

      panel.querySelectorAll('.theme-option').forEach(btn => btn.addEventListener('click', () => {
        applyTheme(btn.dataset.theme);
        renderAjustes();
      }));
      document.getElementById('ajustesExportBtn')?.addEventListener('click', () => {
        window.VerboBackup?.exportDownload();
        toast(t('toast.descargando'));
      });
      const importInput = document.getElementById('ajustesImportInput');
      document.getElementById('ajustesImportBtn')?.addEventListener('click', () => importInput?.click());
      importInput?.addEventListener('change', async () => {
        const file = importInput.files?.[0];
        if (!file) return;
        try { await window.VerboBackup.importFromFile(file); toast(t('toast.datosImportados')); setTimeout(() => location.reload(), 900); }
        catch (error) { console.error(error); toast(t('toast.noImportar')); }
        importInput.value = '';
      });
      document.getElementById('ajustesSyncForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('ajustesSyncEmail')?.value.trim();
        if (!email || syncBusy) return;
        syncBusy = true; renderAjustes();
        try { await VerboSync.requestLink(email); syncPending = true; }
        catch (error) { console.error(error); toast(t('toast.errorSync')); }
        syncBusy = false; renderAjustes();
      });
      document.getElementById('ajustesUnlinkBtn')?.addEventListener('click', async () => {
        await VerboSync.unlink();
        syncPending = false;
        renderAjustes();
      });
    }

    renderAjustes();
    document.addEventListener('verbo:uilang-changed', renderAjustes);
  });
})();

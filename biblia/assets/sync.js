/* Sincronización de verbo-datos entre dispositivos vía email + magic link.
   Sin cuentas ni contraseñas: el email solo agrupa dispositivos del mismo
   usuario en el Worker de Cloudflare (ver cloudflare/api-bible-worker).
   Última escritura gana, sin merge. Silenciosa tras el primer vínculo: no
   pide confirmación en cada sync, y falla en silencio si no hay conexión. */
const VerboSync = (() => {
  const DEVICE_KEY = 'verbo:syncDeviceId';
  const SESSION_KEY = 'verbo:syncSession';
  const EMAIL_MASKED_KEY = 'verbo:syncEmailMasked';
  const PULL_INTERVAL_MS = 5 * 60 * 1000;

  let baseUrlPromise = null;
  let pullTimer = null;
  let pushDebounce = null;
  let listeners = [];

  function on(event, cb) { listeners.push({ event, cb }); }
  function emit(event, payload) {
    listeners.filter(l => l.event === event).forEach(l => { try { l.cb(payload); } catch {} });
  }

  function deviceId() {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  }

  function getSession() { return localStorage.getItem(SESSION_KEY) || ''; }
  function getEmailMasked() { return localStorage.getItem(EMAIL_MASKED_KEY) || ''; }
  function isLinked() { return Boolean(getSession()); }

  function setLinked(sessionToken, emailMasked) {
    localStorage.setItem(SESSION_KEY, sessionToken);
    localStorage.setItem(EMAIL_MASKED_KEY, emailMasked || '');
  }
  function clearLinked() {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(EMAIL_MASKED_KEY);
  }

  async function baseUrl() {
    if (!baseUrlPromise) {
      baseUrlPromise = fetch('modules/registry.json').then(r => r.json())
        .then(registry => String(registry.apiBible?.proxyUrl || '').trim().replace(/\/+$/, ''));
    }
    return baseUrlPromise;
  }

  async function requestJSON(path, options = {}) {
    const base = await baseUrl();
    if (!base) throw new Error('sync-no-base-url');
    const response = await fetch(`${base}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `sync-http-${response.status}`);
    return body;
  }

  function currentLang() {
    return window.VerboI18n?.getUiLang?.() === 'en' ? 'en' : 'es';
  }

  async function requestLink(email) {
    await requestJSON('/v1/sync/link-request', {
      method: 'POST',
      body: JSON.stringify({ email, deviceId: deviceId(), lang: currentLang() })
    });
  }

  async function confirmLinkFromToken(token) {
    const result = await requestJSON('/v1/sync/link-confirm', {
      method: 'POST',
      body: JSON.stringify({ token })
    });
    setLinked(result.sessionToken, result.emailMasked);
    await reconcile({ forcePushIfNoRemote: true });
    emit('linked', { emailMasked: result.emailMasked });
  }

  async function unlink() {
    const token = getSession();
    clearLinked();
    stopBackgroundSync();
    if (token) {
      try { await requestJSON('/v1/sync/unlink', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }); }
      catch {}
    }
    emit('unlinked', {});
  }

  async function pull() {
    const token = getSession();
    if (!token) return null;
    return requestJSON('/v1/sync/data', { headers: { Authorization: `Bearer ${token}` } });
  }

  async function push() {
    const token = getSession();
    if (!token) return;
    const data = window.VerboBackup?.getData?.();
    if (!data) return;
    await requestJSON('/v1/sync/data', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ data, updatedAt: data.fecha_guardado || new Date().toISOString() })
    });
  }

  // Última escritura gana: compara updatedAt remoto contra fecha_guardado
  // local y aplica el que sea más nuevo. Si el servidor no tiene datos
  // todavía (primer vínculo), sube los locales para sembrar el blob.
  async function reconcile({ forcePushIfNoRemote = false } = {}) {
    if (!isLinked() || !navigator.onLine) return;
    try {
      const remote = await pull();
      const local = window.VerboBackup?.getData?.();
      if (!remote?.updatedAt) {
        if (forcePushIfNoRemote && local) await push();
        return;
      }
      const remoteTime = Date.parse(remote.updatedAt) || 0;
      const localTime = Date.parse(local?.fecha_guardado || '') || 0;
      if (remoteTime > localTime) {
        await window.VerboBackup.replaceData(remote.data);
        emit('data-updated', {});
      } else if (localTime > remoteTime) {
        await push();
      }
    } catch (error) { console.warn('[sync] reconcile falló (probablemente sin conexión)', error); }
  }

  function schedulePush() {
    if (!isLinked()) return;
    clearTimeout(pushDebounce);
    pushDebounce = setTimeout(() => { push().catch(err => console.warn('[sync] push falló', err)); }, 1500);
  }

  function startBackgroundSync() {
    if (!isLinked()) return;
    reconcile();
    clearInterval(pullTimer);
    pullTimer = setInterval(() => reconcile(), PULL_INTERVAL_MS);
    window.addEventListener('online', () => reconcile());
  }
  function stopBackgroundSync() {
    clearInterval(pullTimer);
    pullTimer = null;
  }

  async function consumeTokenFromUrl() {
    const url = new URL(location.href);
    const token = url.searchParams.get('syncToken');
    if (!token) return false;
    url.searchParams.delete('syncToken');
    history.replaceState(null, '', url.toString());
    try { await confirmLinkFromToken(token); }
    catch (error) { console.warn('[sync] no se pudo confirmar el vínculo', error); emit('link-error', error); }
    return true;
  }

  async function init() {
    window.VerboBackup?.onPersist?.(() => schedulePush());
    await consumeTokenFromUrl();
    if (isLinked()) startBackgroundSync();
  }

  return {
    init, on,
    isLinked, getEmailMasked,
    requestLink, unlink
  };
})();

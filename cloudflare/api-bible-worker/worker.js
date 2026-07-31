const API_ROOT = 'https://api.scripture.api.bible';
const ALLOWED_BIBLES = new Set([
  'e3f420b9665abaeb-01', // LBLA
  '826f63861180e056-01', // NTV
  'a761ca71e0b3ddcf-01'  // NASB 2020
]);

const LINK_TTL_SECONDS = 30 * 60; // 30 minutos, expiración del magic link
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 365; // 1 año, sesión de dispositivo vinculado

const SYNC_EMAIL = {
  es: {
    subject: 'Confirma tu correo para sincronizar Verbo',
    html: (confirmUrl) => `
      <p>Hola,</p>
      <p>Confirma este correo para mantener tus notas, marcadores y subrayados sincronizados entre tus dispositivos en Verbo.</p>
      <p><a href="${confirmUrl}">Vincular este dispositivo</a></p>
      <p>Este enlace expira en 30 minutos. Si no lo pediste tú, puedes ignorar este correo.</p>
    `
  },
  en: {
    subject: 'Confirm your email to sync Verbo',
    html: (confirmUrl) => `
      <p>Hello,</p>
      <p>Confirm this email to keep your notes, bookmarks, and highlights synced across your devices in Verbo.</p>
      <p><a href="${confirmUrl}">Link this device</a></p>
      <p>This link expires in 30 minutes. If you didn't request it, you can ignore this email.</p>
    `
  }
};

function corsHeaders(origin, env) {
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
  const accepted = allowed.includes(origin) ? origin : '';
  return {
    ...(accepted ? { 'Access-Control-Allow-Origin':accepted } : {}),
    'Access-Control-Allow-Methods':'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers':'Accept, Content-Type, Authorization',
    'Vary':'Origin',
    'X-Content-Type-Options':'nosniff'
  };
}

function jsonError(message, status, headers) {
  return new Response(JSON.stringify({ error:message }), {
    status,
    headers:{ ...headers, 'Content-Type':'application/json; charset=utf-8' }
  });
}

function jsonOk(payload, headers, status=200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers:{ ...headers, 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' }
  });
}

async function handleApiBible(request, url, env, headers) {
  if (request.method !== 'GET') return jsonError('Método no permitido', 405, headers);
  if (!env.API_BIBLE_KEY) return jsonError('API_BIBLE_KEY no está configurada', 500, headers);

  const chapter = url.pathname.match(/^\/v1\/bibles\/([^/]+)\/chapters\/([A-Z0-9]+\.\d+)$/);
  const search = url.pathname.match(/^\/v1\/bibles\/([^/]+)\/search$/);
  const match = chapter || search;
  if (!match || !ALLOWED_BIBLES.has(match[1])) return jsonError('Recurso no permitido', 404, headers);

  const upstream = new URL(`${API_ROOT}${url.pathname}`);
  if (chapter) {
    upstream.searchParams.set('content-type', 'html');
    upstream.searchParams.set('include-notes', 'false');
    upstream.searchParams.set('include-titles', 'false');
    upstream.searchParams.set('include-chapter-numbers', 'false');
    upstream.searchParams.set('include-verse-numbers', 'true');
    upstream.searchParams.set('include-verse-spans', 'true');
    upstream.searchParams.set('fums-version', '3');
  } else {
    const query = String(url.searchParams.get('query') || '').trim().slice(0, 120);
    if (query.length < 2) return jsonError('La búsqueda requiere al menos dos caracteres', 400, headers);
    upstream.searchParams.set('query', query);
    upstream.searchParams.set('limit', '100');
    upstream.searchParams.set('offset', '0');
    upstream.searchParams.set('sort', 'canonical');
    const range = url.searchParams.get('range');
    if (range === 'MAT-REV' || range === 'GEN-MAL') upstream.searchParams.set('range', range);
  }

  const response = await fetch(upstream, {
    headers:{ 'api-key':env.API_BIBLE_KEY, Accept:'application/json' }
  });
  const body = await response.text();
  return new Response(body, {
    status:response.status,
    headers:{ ...headers, 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' }
  });
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function maskEmail(email) {
  const [user, domain] = String(email).split('@');
  const maskedUser = user.length <= 2 ? user[0] + '*' : user[0] + '*'.repeat(user.length - 2) + user.slice(-1);
  const domainParts = domain.split('.');
  const maskedDomain = domainParts[0][0] + '*'.repeat(Math.max(domainParts[0].length - 1, 1));
  return `${maskedUser}@${maskedDomain}.${domainParts.slice(1).join('.')}`;
}

async function sha256Hex(value) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function bearerToken(request) {
  const auth = request.headers.get('Authorization') || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

async function readJson(request) {
  try { return await request.json(); } catch { return null; }
}

async function handleLinkRequest(request, env, headers) {
  const body = await readJson(request);
  const email = String(body?.email || '').trim().toLowerCase();
  const deviceId = String(body?.deviceId || '').trim();
  const lang = body?.lang === 'en' ? 'en' : 'es';
  if (!isValidEmail(email)) return jsonError('Correo inválido', 400, headers);
  if (!deviceId) return jsonError('Falta identificador de dispositivo', 400, headers);
  if (!env.SYNC_KV) return jsonError('Sincronización no está configurada', 500, headers);
  if (!env.RESEND_API_KEY) return jsonError('RESEND_API_KEY no está configurada', 500, headers);

  const token = crypto.randomUUID();
  await env.SYNC_KV.put(`link:${token}`, JSON.stringify({ email, deviceId }), { expirationTtl: LINK_TTL_SECONDS });

  const appUrl = String(env.APP_URL || 'https://verbobiblia.com/biblia/').replace(/\/+$/, '') + '/';
  const confirmUrl = `${appUrl}?syncToken=${encodeURIComponent(token)}`;
  const template = SYNC_EMAIL[lang];

  const resendResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: env.RESEND_FROM || 'Verbo <no-reply@verbobiblia.com>',
      to: [email],
      subject: template.subject,
      html: template.html(confirmUrl)
    })
  });
  if (!resendResponse.ok) {
    await env.SYNC_KV.delete(`link:${token}`);
    return jsonError('No se pudo enviar el correo', 502, headers);
  }
  return jsonOk({ ok:true }, headers);
}

async function handleLinkConfirm(request, env, headers) {
  const body = await readJson(request);
  const token = String(body?.token || '').trim();
  if (!token) return jsonError('Falta el token', 400, headers);
  if (!env.SYNC_KV) return jsonError('Sincronización no está configurada', 500, headers);

  const raw = await env.SYNC_KV.get(`link:${token}`);
  if (!raw) return jsonError('El enlace expiró o ya se usó', 400, headers);
  await env.SYNC_KV.delete(`link:${token}`);

  const { email } = JSON.parse(raw);
  const emailHash = await sha256Hex(email);
  const sessionToken = crypto.randomUUID();
  await env.SYNC_KV.put(`session:${sessionToken}`, JSON.stringify({ emailHash }), { expirationTtl: SESSION_TTL_SECONDS });

  return jsonOk({ sessionToken, emailMasked: maskEmail(email) }, headers);
}

async function requireSession(request, env, headers) {
  const token = bearerToken(request);
  if (!token) return { error: jsonError('Falta la sesión de sincronización', 401, headers) };
  const raw = await env.SYNC_KV.get(`session:${token}`);
  if (!raw) return { error: jsonError('Sesión inválida o expirada', 401, headers) };
  const { emailHash } = JSON.parse(raw);
  return { emailHash, sessionToken: token };
}

async function handleDataGet(request, env, headers) {
  if (!env.SYNC_KV) return jsonError('Sincronización no está configurada', 500, headers);
  const session = await requireSession(request, env, headers);
  if (session.error) return session.error;
  const raw = await env.SYNC_KV.get(`blob:${session.emailHash}`);
  if (!raw) return jsonOk({ data: null, updatedAt: null }, headers);
  const stored = JSON.parse(raw);
  return jsonOk({ data: stored.data, updatedAt: stored.updatedAt }, headers);
}

async function handleDataPut(request, env, headers) {
  if (!env.SYNC_KV) return jsonError('Sincronización no está configurada', 500, headers);
  const session = await requireSession(request, env, headers);
  if (session.error) return session.error;
  const body = await readJson(request);
  if (!body || typeof body.data !== 'object') return jsonError('Datos inválidos', 400, headers);
  const updatedAt = String(body.updatedAt || new Date().toISOString());
  await env.SYNC_KV.put(`blob:${session.emailHash}`, JSON.stringify({ data: body.data, updatedAt }));
  return jsonOk({ ok:true, updatedAt }, headers);
}

async function handleUnlink(request, env, headers) {
  if (!env.SYNC_KV) return jsonError('Sincronización no está configurada', 500, headers);
  const token = bearerToken(request);
  if (token) await env.SYNC_KV.delete(`session:${token}`);
  return jsonOk({ ok:true }, headers);
}

async function handleSync(request, url, env, headers) {
  if (url.pathname === '/v1/sync/link-request' && request.method === 'POST') return handleLinkRequest(request, env, headers);
  if (url.pathname === '/v1/sync/link-confirm' && request.method === 'POST') return handleLinkConfirm(request, env, headers);
  if (url.pathname === '/v1/sync/unlink' && request.method === 'POST') return handleUnlink(request, env, headers);
  if (url.pathname === '/v1/sync/data' && request.method === 'GET') return handleDataGet(request, env, headers);
  if (url.pathname === '/v1/sync/data' && request.method === 'PUT') return handleDataPut(request, env, headers);
  return jsonError('Recurso no permitido', 404, headers);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const headers = corsHeaders(origin, env);

    if (request.method === 'OPTIONS') return new Response(null, { status:204, headers });
    if (!headers['Access-Control-Allow-Origin']) return jsonError('Origen no autorizado', 403, headers);

    if (url.pathname.startsWith('/v1/sync/')) return handleSync(request, url, env, headers);
    return handleApiBible(request, url, env, headers);
  }
};

const API_ROOT = 'https://api.scripture.api.bible';
const ALLOWED_BIBLES = new Set([
  'e3f420b9665abaeb-01', // LBLA
  '826f63861180e056-01', // NTV
  'a761ca71e0b3ddcf-01'  // NASB 2020
]);

function corsHeaders(origin, env) {
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
  const accepted = allowed.includes(origin) ? origin : '';
  return {
    ...(accepted ? { 'Access-Control-Allow-Origin':accepted } : {}),
    'Access-Control-Allow-Methods':'GET, OPTIONS',
    'Access-Control-Allow-Headers':'Accept',
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const headers = corsHeaders(origin, env);

    if (request.method === 'OPTIONS') return new Response(null, { status:204, headers });
    if (request.method !== 'GET') return jsonError('Método no permitido', 405, headers);
    if (!headers['Access-Control-Allow-Origin']) return jsonError('Origen no autorizado', 403, headers);
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
};

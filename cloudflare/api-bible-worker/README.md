# Proxy API.Bible para Verbo

Este Worker mantiene `API_BIBLE_KEY` fuera del sitio estático. Solo permite leer
capítulos y buscar en LBLA, NTV y NASB 2020.

## Despliegue

1. Instala Wrangler e inicia sesión: `npx wrangler login`.
2. Ajusta `ALLOWED_ORIGINS` en `wrangler.toml` con el origen exacto de Verbo.
3. Desde esta carpeta ejecuta `npx wrangler secret put API_BIBLE_KEY` y pega la clave.
4. Ejecuta `npx wrangler deploy`.
5. Copia la URL `https://...workers.dev` resultante en
   `modules/registry.json`, propiedad `apiBible.proxyUrl`.

No guardes la clave en `wrangler.toml`, en archivos `.env` versionados ni en el
JavaScript del navegador. Para producción, configura también un límite de
solicitudes en Cloudflare para proteger la cuota de API.Bible.

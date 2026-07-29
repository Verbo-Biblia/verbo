# Proxy API.Bible + sincronización de dispositivos para Verbo

Este Worker cumple dos funciones:

1. Mantiene `API_BIBLE_KEY` fuera del sitio estático. Solo permite leer
   capítulos y buscar en LBLA, NTV y NASB 2020.
2. Sincroniza `verbo-datos` (notas, marcadores, subrayados) entre dispositivos
   vía email + magic link, sin cuentas ni contraseñas. Ver
   `biblia/assets/sync.js` para el cliente.

## Despliegue del proxy API.Bible (ya existente)

1. Instala Wrangler e inicia sesión: `npx wrangler login`.
2. Ajusta `ALLOWED_ORIGINS` en `wrangler.toml` con el origen exacto de Verbo.
3. Desde esta carpeta ejecuta `npx wrangler secret put API_BIBLE_KEY` y pega la clave.
4. Ejecuta `npx wrangler deploy`.
5. Copia la URL `https://...workers.dev` resultante en
   `modules/registry.json`, propiedad `apiBible.proxyUrl`.

No guardes la clave en `wrangler.toml`, en archivos `.env` versionados ni en el
JavaScript del navegador. Para producción, configura también un límite de
solicitudes en Cloudflare para proteger la cuota de API.Bible.

## Configuración adicional para sincronización (pasos manuales de Juan)

Estos pasos NO se pueden hacer desde Claude Code — requieren tu cuenta de
Cloudflare y de Resend.

1. **Crear el namespace de KV** (guarda los magic links, sesiones y el blob de
   datos por usuario):
   ```
   npx wrangler kv namespace create SYNC_KV
   ```
   Copia el `id` que devuelve y pégalo en `wrangler.toml`, reemplazando
   `REEMPLAZAR_CON_ID_REAL` en el bloque `[[kv_namespaces]]`.

2. **Cuenta de Resend** (envío del correo con el magic link):
   - Crea una cuenta en https://resend.com si no tienes una.
   - Verifica el dominio `verbobiblia.com` (o el que uses) en Resend — sin
     dominio verificado no puedes enviar desde `no-reply@verbobiblia.com`.
   - Genera una API key en el dashboard de Resend.
   - Desde esta carpeta: `npx wrangler secret put RESEND_API_KEY` y pega la key.

3. **Revisa `APP_URL` y `RESEND_FROM`** en `wrangler.toml` — deben apuntar al
   dominio real donde vive `/biblia/` y a un remitente del dominio verificado
   en Resend.

4. Vuelve a desplegar: `npx wrangler deploy`.

Notas de seguridad: los magic links expiran en 30 minutos y son de un solo
uso; el email del usuario se guarda solo temporalmente (30 min) para poder
enviar el correo, y luego solo se conserva un hash SHA-256 del email como
identificador — nunca el email en texto plano en el blob de datos. Es
sincronización ligera para notas de estudio bíblico, no autenticación
robusta: no usarla para datos sensibles.

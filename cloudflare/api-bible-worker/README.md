# Proxy API.Bible + sincronización de dispositivos + TTS de Librería para Verbo

Este Worker cumple tres funciones:

1. Mantiene `API_BIBLE_KEY` fuera del sitio estático. Solo permite leer
   capítulos y buscar en LBLA, NTV y NASB 2020.
2. Sincroniza `verbo-datos` (notas, marcadores, subrayados) entre dispositivos
   vía email + magic link, sin cuentas ni contraseñas. Ver
   `biblia/assets/sync.js` para el cliente.
3. Genera y cachea permanentemente en R2 el audio de los audiolibros de
   Librería (Google Cloud TTS, voces WaveNet), servido bajo demanda desde
   `/v1/tts/:libro/:capitulo`. Ver `libreria/assets/reader.js` para el cliente.

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

## Configuración de TTS de audiolibros (Librería) — pasos manuales de Juan

`GOOGLE_TTS_API_KEY` ya está subida como secret del Worker (`wrangler secret
put GOOGLE_TTS_API_KEY`) — no hace falta volver a crearla. Falta el bucket R2:

1. **Crear el bucket R2** (guarda los .mp3 generados permanentemente, uno por
   libro/capítulo):
   ```
   npx wrangler r2 bucket create verbo-tts-audio
   ```
   El binding ya está declarado en `wrangler.toml` (`TTS_AUDIO` →
   `verbo-tts-audio`) — no necesitas editar nada ahí salvo que cambies el
   nombre del bucket.

2. Vuelve a desplegar:
   ```
   npx wrangler deploy
   ```

3. **Probar en vivo** (importante antes de comitear el código del reproductor):
   ```
   curl -i -X POST https://verbo-api-bible.<tu-cuenta>.workers.dev/v1/tts/prueba/1 \
     -H "Origin: https://verbobiblia.com" \
     -H "Content-Type: application/json" \
     -d '{"text":"Esta es una prueba del sistema de audiolibros.","lang":"es"}'
   ```
   La primera vez debe tardar un par de segundos y responder con el header
   `X-Verbo-TTS-Cache: miss`. Repite exactamente la misma petición: debe
   responder casi instantáneo con `X-Verbo-TTS-Cache: hit`, sin volver a
   llamar a Google. Puedes borrar el objeto de prueba después con
   `npx wrangler r2 object delete verbo-tts-audio/prueba/1.mp3`.

4. **Monitorear consumo de caracteres** (cuota gratuita: 4,000,000/mes con
   voces WaveNet) con logs en vivo:
   ```
   npx wrangler tail
   ```
   Cada generación nueva imprime una línea `[tts] libro/capitulo chars=N
   chunks=N bytes=N`. Como el resultado se cachea permanentemente en R2, el
   consumo real es "una vez por capítulo que alguien pida", no por
   reproducción.

Notas: el endpoint no restringe qué `libro`/`capítulo` se puede pedir más
allá del formato de la ruta (letras/números/guiones) — cualquiera que conozca
la URL del Worker podría generar audio para texto arbitrario llamando al
endpoint directamente (fuera del navegador, sin CORS). Para launch de prueba
con familiares/pastores amigos el riesgo es bajo, pero antes de un lanzamiento
público conviene añadir un límite de solicitudes en Cloudflare (mismo
comentario que ya aplica al proxy de API.Bible arriba).

# Plan pendiente: índices livianos para comentarios (perf, fase 2)

Continuación de `perf: lazy-load Biblias + registry.json enriquecido` (commit `5e6e5f1`,
2026-07-25). Esa fase ya resolvió la mitad "fácil" del problema de carga (Biblias).
Esta fase resuelve la mitad pesada: los comentarios — el ejemplo real que motivó
todo esto fue Matthew Henry en inglés, 1.7MB por libro, descargado siempre aunque
el usuario esté leyendo otro comentario.

**Importante:** Juan va a traducir y agregar TODOS los comentarios (más de los 9
actuales). Sin este fix, cada comentario nuevo que se agregue hace la carga inicial
más pesada — el problema escala mal con el catálogo. Por eso conviene hacer este
fix ANTES de subir la tanda grande de comentarios nuevos, no después.

## Diagnóstico (ya confirmado leyendo el código, no es especulación)

`buildChapterData()` en `assets/module-loader.js` carga el contenido COMPLETO
(manifest + libro entero, con el HTML de cada nota) de los 9 comentarios
registrados, en cada cambio de capítulo — no solo el que está activo en el panel.

Esto no es un descuido: el badge "💬 8" que aparece bajo cada versículo (cuántos
comentarios DISTINTOS tienen nota ahí — ver `assets/app.js` línea ~321,
`v.commentaries.length`) necesita saber, para cada uno de los 9 comentarios, si
tiene una entrada que cubra ese versículo. Hoy la única forma de saberlo es
descargando el contenido completo de los 9 (no hay separación entre "existe una
nota aquí" y "el texto de la nota").

## La solución: mismo patrón que ya usa el diccionario Strong

`assets/module-loader.js` ya tiene `loadDictionaryIndex()` vs `loadDictionaryEntries()`:
un `manifest.indexFile` liviano (solo código + término) para poblar la lista
navegable, y el archivo completo solo se carga cuando el usuario abre una entrada
puntual. Hay que aplicar el mismo patrón a comentarios (y de paso a
`library`/`patristicByVerse`, que hoy tienen el mismo problema de doble carga,
aunque de menor peso).

### Paso 1 — generar el índice liviano (dato, no código)

Nuevo script `tools/build_commentary_index.py` (o extender
`tools/build_registry_catalog.py`): para cada comentario en `registry.json →
commentaries` (y `patristicByVerse`), leer sus archivos `books/*.json` existentes
y generar un archivo companion con SOLO `{id, reference: {chapterStart,
chapterEnd, verseStart, verseEnd}}` por entrada — sin `title`/`author`/`content`.

**Ojo con los formatos irregulares** (confirmado leyendo los manifests):
- Wesley tiene `"chapterSplit": true` — sus datos viven en `books/GEN/1.json`
  (un archivo por capítulo), no `books/GEN.json` como el resto. El script tiene
  que soportar ambos layouts.
- Verificar si K&D (`kd`, solo Antiguo Testamento) u otros tienen sus propias
  particularidades antes de asumir que todos son iguales.

Agregar `"indexFile"` (o `"chapterIndexFile"` si se sigue el patrón chapterSplit)
al `manifest.json` de cada comentario apuntando al archivo generado.

Después de generar los índices, volver a correr `tools/build_registry_catalog.py`
para que `registry.json → catalog` incluya los manifests actualizados (ya con el
campo `indexFile`).

### Paso 2 — `assets/module-loader.js`

Nueva función `loadCommentaryIndex(manifestPath, bookId, chapter)`, paralela a
`loadDictionaryIndex`: si el manifest declara `indexFile`, la usa (liviano); si
no, cae de vuelta a `loadCommentary` completo (compatibilidad con comentarios
que todavía no tengan el índice generado — no romper nada a mitad de migración).

En `buildChapterData({bookId, chapter, commentaryId, bibleId})`:
- Para TODOS los comentarios registrados: usar `loadCommentaryIndex` (liviano)
  para calcular `verse.commentaries`/`hasNote` (los badges).
- Para el comentario activo (`commentaryId`) SOLAMENTE: además, usar
  `loadCommentary` completo para poblar `notes[id].body` (el texto real).
- Aplicar el mismo criterio a `library`/`patristicByVerse` si el tiempo alcanza
  (mismo patrón, menor prioridad — son más livianos que los comentarios).

### Paso 3 — `assets/app.js`, puntos de riesgo ya identificados leyendo el código

1. **Selector de comentario dentro del panel** (línea ~699-706, listener de
   `#commentarySelect`): hoy asume que `commentCtx.data.notes` YA tiene el body
   de cualquier comentario que el usuario elija, porque hoy se cargan los 9
   completos de entrada. Con el índice liviano, `notes` solo tendrá el body del
   comentario que estaba activo al momento de `buildChapterData`. Hay que
   agregar ahí una carga bajo demanda (`loadCommentary` completo) para el
   comentario recién elegido, si `data.notes` no tiene ninguna entrada de ese
   `commentaryId` todavía — mismo patrón que `ensureVersionLoaded` ya aplicado
   a Biblias en la fase 1.
2. **Modo sermón** (`loadSermonBibleData`, `commentaryContext()`): actualmente
   NO pasa `commentaryId` a `buildChapterData` en absoluto (bug preexistente,
   inofensivo hoy porque el parámetro se ignora — pero con el fix deja de ser
   inofensivo). Hay que pasar `commentaryId: currentCommentary` ahí también,
   igual que ya se hace en el `loadPassage` de la Biblia principal.
3. **Preview de referencia cruzada** (`renderCrossrefCompare`, línama ~965):
   llama `buildChapterData({bookId:book,chapter})` completo solo para mostrar
   el TEXTO de un versículo en otra Biblia — no usa `notes`/`commentaries` para
   nada. Con el índice liviano esto ya es mucho más barato automáticamente
   (los 9 comentarios pasan a ser índices chicos, no contenido completo), así
   que no es obligatorio tocarlo, pero se puede optimizar más si se quiere
   (pasarle un modo "solo Biblia, sin comentarios" a `buildChapterData`).

### Pruebas obligatorias antes de dar por cerrado (mismas que ya pidió Juan)

- Cambiar de comentario a mitad de sesión (ej. Matthew Henry → JFB) — confirmar
  que carga bien y no rompe el panel ni el badge de conteo.
- Abrir Preparación de Sermón, cambiar el comentario sincronizado — confirmar
  que sigue funcionando (con el fix del punto 2 de arriba).
- Referencia cruzada de TSK hacia un módulo/comentario que todavía no se había
  abierto en esa sesión — confirmar que se resuelve bien.
- Confirmar que el badge "💬 N" sigue contando bien (comparar el número antes y
  después del cambio, capítulo por capítulo, en al menos 3-4 capítulos con
  comentarios variados) — es el número que más fácil se rompe silenciosamente
  si el índice liviano queda mal generado para algún comentario.
- Probar específicamente Wesley (`chapterSplit`) por su formato de archivo
  distinto.

### Estimado

Con las pruebas incluidas: **3-5 horas de reloj humano**, la mayoría en generar
los índices y probar los puntos de riesgo de arriba uno por uno, no en escribir
el código en sí.

## Estado actual (2026-07-25)

- ✅ Fase 1 (Biblias perezosas + registry.json enriquecido) — hecha, commiteada
  (`5e6e5f1`), sin push todavía (pendiente de que Juan revise el diff).
- ⬜ Fase 2 (este documento) — sin empezar. Retomar cuando Juan tenga tiempo,
  idealmente ANTES de subir la tanda grande de comentarios traducidos.

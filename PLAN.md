# Verbo — Plan de Trabajo y Recursos Disponibles

*Actualizado: 2026-06-28*

---

## Estrategia General (decisión tomada 2026-06-28)

En lugar de traducir manualmente los 50+ libros pendientes de Matthew Henry al español, la estrategia es:

1. **Subir MH en inglés** — módulo `matthew-henry-en` con los 66 libros extraídos del ZIP fuente, verse-level real del original histórico
2. **Traducción automática** — botón EN/ES en el panel de comentario. Default: español (traducción automática via API MyMemory con caché localStorage). Clic "EN" muestra el original inglés.
3. **Biblia bilingüe** — agregar ASV (American Standard Version) como segunda Biblia en inglés, para vista bilingüe RVA-1909 + ASV
4. **Nueva RV española** — versión propia basada en RV1909, trabajada individualmente con Juan. La rva-1909 original permanece como módulo separado.

---

## Inventario Completo de Recursos Disponibles

### BIBLIAS

| Módulo | Idioma | Estado | Fuente |
|--------|--------|--------|--------|
| rva-1909 | ES | ✅ En proyecto, 66 libros completos | SWORD SpaRV1909, dominio público |
| Nueva RV (edición Verbo) | ES | 🔜 Pendiente — base: rva-1909 | Edición propia, individual con Juan |
| American Standard Version (ASV) | EN | 📦 Listo para extraer | `Archivos Verbo.zip` → `american_standard_version.zip` (74 .htm) |

> Las biblias en español se tratan individualmente con Juan antes de publicar.

---

### COMENTARIOS — GRUPO A: Formato HTML/texto, extraíbles ya

| Recurso | Idioma | Cobertura | Formato | Fuente |
|---------|--------|-----------|---------|--------|
| **Matthew Henry Complete (MHC)** | EN | 66 libros | HTML `.HTM` | `matthew_henry.zip` en raíz del repo |
| DTN (Devotional Treasury Notes) | EN | NT | `.vss` texto plano | `Archivos Verbo.zip` → `DTN.zip` |
| TFG (Fourfold Gospel) | EN | Evangelios | `.vss` con marcas | `Archivos Verbo.zip` → `TFG.zip` |

---

### COMENTARIOS — GRUPO B: Formato SWORD binario (.bzs/.bzv/.bzz), requieren parser

Todos son **comentarios completos en inglés** de alta calidad histórica, dominio público o licencia abierta.

| Recurso | Cobertura | Valor pastoral | Tamaño ZIP |
|---------|-----------|----------------|-----------|
| **JFB** (Jamieson-Fausset-Brown) | 66 libros | ⭐⭐⭐ clásico evangélico | 5.7 MB |
| **Wesley's Explanatory Notes** | 66 libros | ⭐⭐ pietismo wesleyano | 1.9 MB |
| **Calvin Commentaries** | ~50 libros | ⭐⭐⭐ reforma reformada | 20.9 MB |
| **Keil & Delitzsch (KD)** | AT completo | ⭐⭐⭐ exégesis hebrea clásica | 11.2 MB |
| **Barnes' Notes** | 66 libros | ⭐⭐ | 5.8 MB |
| **TSK** (Treasury of Scripture Knowledge) | 66 libros | Referencias cruzadas | 2.6 MB |
| **Scofield Reference Notes** | 66 libros | ⭐⭐ | 0.5 MB |
| **King Comments** | 66 libros | ⭐⭐ | 9.0 MB |
| Abbott / Burkitt | NT | menor | < 1 MB |

> **Acción pendiente:** Escribir parser Python para formato SWORD zcom (.bzs + .bzv + .bzz = bzip2 en bloques). Desbloquea 9+ comentarios completos de golpe.

---

### HERRAMIENTAS DE REFERENCIA

| Recurso | Tipo | Formato | Estado |
|---------|------|---------|--------|
| Strong's Greek (XML) | Diccionario lexical griego | XML parseable | `strongs-dictionary-xml-master.zip` |
| Brown-Driver-Briggs (BDB) | Léxico hebreo | XML parseable | `HebrewLexicon-master.zip` |
| STEPBible-Data | Bíblias interlineales + léxicos | TSV/TXT | `STEPBible-Data-master.zip` |
| Strong's Hebrew | Diccionario lexical hebreo | SWORD `.dat/.idx` | `StrongsHebrew.zip` |
| Strong's Greek (compiled) | Diccionario lexical griego | SWORD `.zdt` | `StrongsGreek.zip` |
| Robinson / OSHM / Packard | Morfología griega | SWORD `.zdt` | varios ZIPs |
| Westminster Confession | Documento teológico | SWORD genbook | `Westminster.zip` |
| Baptist Confession 1689 | Documento teológico | SWORD genbook | `BaptistConfession1689.zip` |
| ISBE | Enciclopedia bíblica internacional | SWORD `.zdt` | `ISBE.zip` |
| Smith's Bible Dictionary | Diccionario bíblico | SWORD `.dat/.idx` | `Smith.zip` |

---

### PADRES APOSTÓLICOS (español, ya en proyecto)

| Documento | Estado |
|-----------|--------|
| Ireneo contra Herejías | ✅ Módulo JSON en proyecto (`ireneo-contra-herejias`) |
| Clemente, Didaché, Hermas, Bernabé, etc. | 📦 PDFs + DOCX en `PA.zip` → Padres Apostólicos/ |

---

## Fases de Trabajo

### FASE 1 — Matthew Henry en inglés completo ⬅ PRIORIDAD INMEDIATA

**Qué:** Extraer los 66 libros de `matthew_henry.zip` → módulo `matthew-henry-en`
**Por qué:** Verse-level real del original, sin traducción manual. Los 66 libros quedan disponibles de inmediato.
**Cómo:**
- Script Python: lee cada `MHC{num}{cap}.HTM`, extrae secciones por `<A NAME="SecN">`, limpia HTML
- Verse ranges: extraídos del texto del capítulo introductorio (patrones `ver. N-M`)
- Genera JSON con mismo esquema que `matthew-henry-es`
- Módulo ID: `matthew-henry-en`, language: `"en"`

**UI — Idioma automático (actualizado 2026-07-07, reemplaza el botón EN/ES original):**
- Ya no hay botón manual de idioma. El comentario y el diccionario Strong siguen el idioma de la Biblia activa: Biblia en inglés → contenido en inglés (sin traducir); Biblia en español → traducción automática al español.
- Traducción vía Google Translate (`translate.googleapis.com`), con caché en localStorage por entrada.
- Las notas personales del usuario nunca se traducen (son su propio texto).

**Entregable:** `modules/commentaries/matthew-henry-en/` completo + idioma automático en `assets/app.js` (función `contentLang()`)

---

### FASE 2 — ASV como Biblia en inglés

**Qué:** Parsear `american_standard_version.zip` (74 archivos .htm) → módulo `american-standard-version`
**Por qué:** Habilita vista bilingüe Biblia ES + EN en columnas
**Cómo:** Script Python lee los HTM del ASV, extrae versículos, genera JSON con mismo formato que rva-1909
**Entregable:** `modules/bibles/american-standard-version/` + selector en UI

---

### FASE 3 — Parser SWORD para comentarios del Grupo B

**Qué:** Escribir decoder Python para formato SWORD zcom4 (`.bzs` = índices, `.bzv` = datos bzip2)
**Por qué:** Desbloquea JFB, Wesley, Calvin, KD, Barnes, TSK, Scofield — 7 comentarios completos en un solo paso
**Cómo:** El formato SWORD zcom tiene bloques de 200 versículos. Cada bloque está comprimido con bzip2. El `.bzs` contiene los offsets. Con esto se puede leer cualquier versículo sin la librería SWORD.
**Entregable:** `tools/sword_reader.py` + módulos JSON para los 8+ comentarios

---

### FASE 4 — Herramientas de referencia (Strong's + BDB + STEPBible)

**Qué:** Convertir Strong's XML y BDB XML a módulos diccionario del sitio
**Por qué:** Completa la capa de herramientas de estudio (números Strong clickeables → definición)
**Cómo:** STEPBible-Data tiene Tagged Bibles (texto bíblico con números Strong en TSV); BDB y Strong XML son parseables directamente
**Entregable:** módulos diccionario actualizado + integración con lector bíblico

---

### FASE 5 — Nueva Biblia RV española (edición Verbo)

**Qué:** Versión propia del texto bíblico basada en RV1909, trabajada individualmente con Juan
**Reglas:**
- La rva-1909 original NO se borra — permanece como módulo separado
- La nueva edición Verbo tiene su propio module ID y nombre
- Se trabaja libro por libro con revisión de Juan antes de publicar
**Entregable:** `modules/bibles/rv-verbo/` (nombre a confirmar con Juan)

---

### FASE 6 — Cuentas de usuario y notas personales (pospuesta, especificación 2026-07-07)

**Qué:** Cada persona puede crear una cuenta (Supabase Auth) para guardar notas propias sobre un pasaje, privadas por defecto — no es un muro de pago, es persistencia personal.

**Diseño confirmado con Juan:**
- Cada nota queda ligada estrictamente a `bookId + chapter + verse` (mismo patrón que ya usan los comentarios fijos vía `reference.chapterStart/verseStart`), no a una Biblia/versión específica — así la nota aparece sin importar qué traducción esté leyendo el usuario en ese momento.
- Al tocar/hacer clic en un verso, aparecen ahí mismo las notas propias de ese verso.
- El usuario puede escribir referencias cruzadas dentro de su nota; la página ofrece autocompletado predictivo de referencias bíblicas mientras escribe (usa el índice de libros/capítulos/versículos ya presente en los manifests de cada Biblia — no depende de Supabase, es enteramente del lado del cliente).
- Cada referencia cruzada se convierte en un hipervínculo real que navega al pasaje referenciado usando el router interno ya existente.
- Las notas nunca se traducen automáticamente (a diferencia de comentarios/diccionario Strong) — son el texto propio del usuario.

**Arquitectura:** GitHub Pages sigue sirviendo el sitio estático sin cambios; Supabase (auth + Postgres) se consulta desde el navegador vía `fetch`, mismo patrón que ya se usa con API.Bible. No requiere backend propio ni migrar de hosting.

**Descartado explícitamente por Juan (mismo día):** comentarios de usuario públicos/compartidos por versículo (tipo foro). Motivo: rompe la garantía de neutralidad doctrinal y contenido revisado que hace confiable a Verbo hoy — un comentario público sin moderación previa puede contener error teológico visible para todos los lectores. Si se retoma más adelante, necesita su propia cola de moderación antes de publicarse, como fase separada de esta.

**Estado:** pospuesta — no bloquea el lanzamiento de prueba (ver CLAUDE.md, "Alcance del lanzamiento de prueba"). Se construye después de validar el contenido con los primeros testers.

---

### FASE 7 — TSK como referencias cruzadas inline (especificación 2026-07-07)

**Qué:** Dejar de mostrar TSK (Treasury of Scripture Knowledge) como un comentario más en el selector de comentarios. En su lugar, usar sus datos de referencias cruzadas directamente bajo cada versículo del texto bíblico principal.

**Diseño confirmado con Juan:**
- El texto bíblico principal se expande levemente en horizontal (solo en vista de escritorio/PC) para dejar espacio a las referencias.
- TSK sale de `modules/registry.json` → `commentaries` (o al menos deja de aparecer en el selector de comentarios); dejan de mostrarse como "comentario" de TSK.
- Debajo de cada versículo se listan sus referencias cruzadas (solo la lista de referencias, no el comentario largo).
- Click en una referencia cruzada → se abre/despliega el panel "Comparar versiones" (`renderCompare`, ya existente) mostrando ese pasaje referenciado; el usuario elige ahí en qué versión ver la referencia.
- Si el usuario hace click en otro versículo del texto principal (navegación normal), el panel de comparación vuelve a su comportamiento estándar — **solo** el click en una referencia cruzada dispara este modo especial de "comparar con referencia".

**Estado:** especificado, sin empezar. Pendiente: decidir mecánica exacta de layout (cuánto se expande el texto, dónde vive la lista de referencias en el DOM) antes de tocar `assets/app.js`/`assets/style.css`.

---

## Notas Técnicas

### Formato SWORD zcom (para referencia del parser)
```
archivo.bzs → tabla de offsets: (offset_en_bzv, tamaño_comprimido) por cada versículo
archivo.bzv → datos: bloques bzip2 concatenados
archivo.bzz → bloques de texto sin comprimir (alternativa)
```

### API de traducción en uso
- **Google Translate no oficial** (`https://translate.googleapis.com/translate_a/single`, gratuita, sin key): usada tanto para comentarios (Matthew Henry EN, JFB, K&D, etc.) como para el diccionario Strong. Reemplazó a MyMemory API.
- Textos largos se dividen en fragmentos de ~4500 caracteres (`splitTextIntoChunks`) y se traducen secuencialmente.
- Caché en localStorage, prefijo `verbo:t:` (comentarios) — ver `translationCacheKey()` en `assets/app.js`.
- **Idioma automático (reemplaza el botón manual EN/ES, ver FASE 3):** el idioma mostrado en comentario y diccionario sigue el idioma de la Biblia activa (`contentLang()`) — sin selector propio. Este cambio está escrito en `assets/app.js`/`assets/style.css` pero **sin comitear todavía** al cierre de la sesión del 2026-07-07 (ver CLAUDE.md/estado del repo antes de asumir que ya está en producción).

### Estructura de módulo comentario
```
modules/commentaries/{id}/
  manifest.json       → id, name, abbreviation, language, books[]
  books/{BOOK_ID}.json → { entries: [ {id, title, author, reference, content} ] }
```

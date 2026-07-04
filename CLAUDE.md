# Verbo — Contexto del proyecto

Este archivo da contexto permanente sobre el proyecto Verbo (verbobiblia.com) para cualquier sesión de Claude Code en este repositorio. Léelo completo antes de proponer o ejecutar cambios.

## Qué es Verbo

Plataforma de estudio bíblico en español (verbobiblia.com), creada por Juan (pastor, teólogo y músico, con canal cristiano de 17,000+ suscriptores). Es un sitio estático en GitHub Pages, sin backend propio todavía.

**Posicionamiento:** Verbo no compite con Logos siendo "más completo". Está afilado para UN perfil: el pastor que sirve activamente (predica, enseña niños/adolescentes, forma maestros) — no el académico investigador.

**Modelo de negocio:** SaaS de pago real, con planes Individual / Pastor / Iglesia, más una beca para pastores en países de bajos ingresos. La Biblia (texto) siempre es gratuita; se cobra por herramientas y funciones avanzadas, nunca por el texto bíblico en sí.

## Regla de neutralidad doctrinal (NO NEGOCIABLE)

Línea de coherencia fija: comprensión judeocristiana del Antiguo Testamento + fe cristiana de la iglesia de los dos primeros siglos (pre-siglo III).

Todo lo posterior a esa línea (bautismo, predestinación, dones, escatología, etc.) se presenta MOSTRANDO las distintas posturas (reformada, arminiana, católica, ortodoxa, Padres de la Iglesia) con sus argumentos, sin declarar un ganador.

Tono exigido en cualquier contenido generado: aclarar e ilustrar, nunca señalar, condenar ni imponer.

## Estado legal del contenido — CRÍTICO, leer antes de tocar Biblias/comentarios/diccionarios

- **Texto original hebreo/griego** — dominio público. Usar libremente.
- **SpaRV / SpaRV1909 (Reina-Valera 1909, sin y con números de Strong)** — dominio público, del repositorio SWORD (crosswire.org). Es la Biblia que estamos integrando como principal mientras se resuelve el permiso de RVG.
- **RVG (Reina Valera Gómez)** — licencia CC BY-NC-ND. El propio texto de copyright del Dr. Humberto Gómez Caballero permite distribución gratuita, pero PROHÍBE expresamente el uso con fines de lucro sin permiso explícito. Juan ya le envió un correo pidiendo permiso (humberto_gmz@yahoo.com) — está PENDIENTE de respuesta. NO usar RVG como base de un producto de pago hasta tener esa confirmación por escrito.
- **Módulos de MySword (Barclay, multilexico, matthew-henry-es, comentarios de la Biblia del diario vivir, LBLA, JFB, MacArthur, MacDonald, Scofield, RVR1960-notas, Peshitta-notas, strong-prueba, etc.)** — convertidos desde SQLite de MySword, varios con copyright de editoriales (ej. Casa Bautista de Publicaciones). Eran contenido DE PRUEBA, no para producción. Deben eliminarse del sitio (carpetas + entradas en `modules/registry.json`) antes de cualquier lanzamiento de pago. EXCEPCIÓN: `ireneo-contra-herejias` y `strong-verbo` parecen curados a mano / dominio público reconstruido por Juan — NO eliminar estos dos sin confirmar con Juan primero.
- Regla general: nunca asumir que algo "disponible para descarga gratuita" significa "libre para uso comercial". Cada módulo tiene su propia licencia — verificar antes de integrar cualquier contenido nuevo a un producto de pago.

## Arquitectura del producto (decisión ya tomada, no rediscutir desde cero — actualizado 2026-06-23)

**Se elimina toda generación de IA en tiempo real en producción.** El sitio es y seguirá siendo estático en su totalidad: GitHub Pages solo sirve contenido que ya existe como archivo en el repo. Si una combinación versículo+categoría no ha sido generada todavía, simplemente no está disponible — nunca se genera "al vuelo" para el usuario que la pide. No hay cache-on-first-use en producción.

Razón del cambio (reemplaza el plan anterior de IA respondiendo por clic): la generación de IA en el momento del clic produce variaciones de redacción entre una consulta y otra del mismo versículo/categoría. Esto genera desconfianza en el usuario (pastor/ministro), que percibe inconsistencia doctrinal donde solo hay variación de estilo — riesgo inaceptable para un producto que depende de la confianza del usuario en la fidelidad del contenido.

**Nuevo modelo: generación previa, revisada, fija.**
- Todo el contenido teológico (Biblia modernizada, comentarios, diccionario Strong) se genera **una sola vez, de antemano**, vía Claude Code desde la terminal de Juan contra este mismo repositorio — el mismo patrón que ya se usó para integrar RVA 1909.
- Cada pieza de contenido pasa por el **meta-prompt de "revisión teológica brutal" de Juan antes de comitearse al repo** (ver pendiente: este meta-prompt aún no existe como documento formal).
- Una vez comiteado, el contenido es fijo. No se regenera en producción bajo ninguna circunstancia automática; cualquier corrección futura es un cambio deliberado y versionado, hecho por Juan + Claude Code, igual que cualquier otro commit.
- Generación de IA (Claude/ChatGPT) se usa exclusivamente como **herramienta de trabajo offline** (traducción de fuentes reales, asistencia en modernización del texto bíblico, borradores de diccionario) — nunca como servicio en vivo de cara al usuario final.
- Orden de resolución de fuentes al generar contenido: (1) buscar primero en archivos reales de dominio público (Matthew Henry, diccionario Strong completo) que Juan tiene en PDFs/repos en su PC — nunca generar texto nuevo atribuido a un comentarista histórico real; (2) si se necesita otro idioma, traducir el fragmento real encontrado (no inventar); (3) generar contenido con IA solo cuando no hay fuente real disponible, siempre bajo la regla de neutralidad doctrinal.

El asistente de IA conversacional (chat libre, separado de los paneles fijos) sigue siendo una idea para el futuro, fuera del alcance de esta fase. Si se construye, respondería preguntas libremente en una ventana de chat, pero **nunca escribiría directamente en un panel fijo** del sitio (Comentario, Exégesis, etc.).

Módulos guiados (Preparar enseñanza, Niños, Adolescentes): la IA GUÍA con preguntas, nunca genera la prédica/lección terminada para usar tal cual. El pastor es el autor real del contenido final.

## Alcance del lanzamiento de prueba (familiares + pastores/ministros amigos)

Objetivo: validar el contenido, no el producto completo. Login/cuentas NO forman parte de esta fase. Acceso de solo lectura para todos.

**Componentes requeridos para considerar el sitio "listo para prueba":**
1. Biblia propia — modernización de RV1909 (framework 🟢/🟡/🔴 ya definido en sesiones previas).
2. La misma Biblia modernizada + números Strong enlazados.
3. Diccionario Strong en español — traducción/elaboración propia, no genérica.
4. Comentarios — mínimo 2: **Matthew Henry** (traducido del repo original en inglés que Juan ya tiene, dominio público; primero en la cola) + un segundo autor por definir (candidatos: Calvin, Wesley, Barnes, Keil & Delitzsch, Scofield, o Ireneo —ya integrado como módulo patrístico—).

**Orden de trabajo confirmado por Juan:** (1) traducción de Matthew Henry al español, (2) modernización bíblica de RV1909, (3) diccionario Strong en español, (4) continuar con el segundo comentario y el resto una vez resuelto qué autor usar.

**Eliminado/pospuesto explícitamente de esta fase:**
- Sección de Exégesis: eliminada de esta fase (pendiente decidir si se oculta del todo o queda visible como "próximamente" — preguntar a Juan antes de tocar la UI de este panel).
- Resto de paneles (Comparar, Mis notas, Tema, Biblioteca, Padres Apostólicos, Evangelio cronológico): no bloquean el lanzamiento, se llenan progresivamente.
- Login, notas de usuario, Stripe: pospuestos a una fase posterior.
- Asistente conversacional de IA: pospuesto indefinidamente, sin diseño aún.

## Infraestructura técnica decidida

- **Hosting:** GitHub Pages (estático) es suficiente para Biblia, Biblia+Strong, diccionario Strong y comentarios — todo JSON/archivos planos, mismo patrón que `modules/bibles/rva-1909/`. No se necesita backend para servir contenido mientras no haya IA en vivo en producción.
- **Supabase (auth + DB), login de usuario, "Mis notas", Stripe:** pospuestos — no bloquean el lanzamiento de prueba. Se implementan en una fase posterior, cuando el contenido ya esté validado por los primeros testers. (Decisión de usar Supabase para esa fase posterior sigue en pie, no rediscutir Railway/VPS salvo que Juan lo pida explícitamente.)
- **API de IA (uso offline, generación de contenido):** Claude Sonnet 4.6.
- El sitio HOY no tiene backend, ni base de datos, ni autenticación, ni APIs externas conectadas — es 100% estático. Confirmado por exploración del repositorio.

## Estrategia de comentarios (decisión 2026-06-28)

En lugar de traducir manualmente los 50+ libros pendientes de Matthew Henry, se adoptó la siguiente estrategia:
1. **Módulo `matthew-henry-en`** — 66 libros extraídos del ZIP fuente (`matthew_henry.zip`) en inglés, verse-level real. El módulo ES (`matthew-henry-es`) se retira del registry; sus entradas de GEN/EXO de calidad están en git si se necesitan luego.
2. **Botón EN/ES en el panel** — default español via traducción automática (MyMemory API + caché localStorage). Botón "EN" muestra el original.
3. **ASV** — American Standard Version (en inglés) como segunda Biblia para vista bilingüe.
4. **Nueva RV española (edición Verbo)** — versión propia basada en rva-1909, trabajada individualmente con Juan. La rva-1909 original no se borra.
5. **Parser SWORD** — para desbloquear JFB, Wesley, Calvin, KD, Barnes, TSK, Scofield.
Ver PLAN.md en la raíz del repo para inventario completo y fases detalladas.

## Catálogo de fuentes disponibles (Archivos Verbo.zip)

En la raíz del repo (sin comitear — es material de trabajo, no contenido final) está `Archivos Verbo.zip` (340 MB), con material en inglés ya descargado por Juan, organizado por Fuentes Oficiales de Recursos (CCEL, CrossWire/SWORD, Open Scriptures, STEPBible, GitHub — todo dominio público o licencia abierta, verificar caso por caso antes de usar comercialmente). Contiene, entre otros: comentarios completos de **Matthew Henry (MHC.zip), Barnes, JFB, Wesley, Keil & Delitzsch (KD.zip), Scofield, TSK, Pulpit/PA**; diccionario **Strong hebreo y griego completos** (StrongsHebrew.zip, StrongsGreek.zip, strongs-master, HebrewLexicon-master); además ASV en inglés y datos lingüísticos (STEPBible-Data-master, morphological-lexicon-master). También dos documentos de contexto (`Fuentes Oficiales de Recursos.docx`, `Verbo_Resumen_Ejecutivo.docx`) — el resumen ejecutivo es del 22 de junio, un día ANTES del cambio de arquitectura (IA en vivo → generación previa offline); su plan de backend/Supabase/IA-por-clic quedó superado por la decisión ya registrada arriba, pero sus secciones de modelo de negocio (planes $5/$10/$20, proyección de costos de API) y meta-prompt siguen vigentes.

## Pendientes abiertos (sin resolver aún, no bloquean empezar a trabajar)

- ¿Cuál es el segundo comentario? Candidatos con texto completo ya disponible en `Archivos Verbo.zip`: Barnes, JFB, Wesley, Keil & Delitzsch, Scofield, Pulpit Commentary, Matthew Poole, Cambridge Bible (más Ireneo, ya integrado como módulo patrístico). Falta decidir con Juan.
- ¿El panel de Exégesis se oculta del menú o queda visible como "próximamente"?
- El meta-prompt de "revisión teológica brutal" no existe como archivo formal todavía, pero sus criterios ya están documentados en `Verbo_Resumen_Ejecutivo.docx`: fidelidad bíblica, precisión exegética, equilibrio doctrinal, centralidad de Cristo, valor pastoral, riesgo de mala interpretación, calidad comunicativa; salida esperada: veredicto + frases a corregir + calificación 1-10. Ya validado con éxito en una prueba real (Romanos 8:28-30, resultado 8.5-10). Flujo previsto: Claude genera y se autorevisa con este meta-prompt en el mismo paso; el ChatGPT Plus de Juan (calibrado en su teología) se usa solo para auditoría puntual de muestra, sin conexión técnica entre ambos (copiar/pegar manual). Falta convertir esto en un archivo formal del repo (ej. `docs/meta-prompt-revision-teologica.md`) con el texto exacto del prompt.
- Respuesta del Dr. Humberto Gómez Caballero sobre licencia comercial de RVG (sigue sin respuesta). Si llega aprobación: recuperar del historial de git (`git show 055faf6:modules/bibles/rvg-2004/...` o ruta equivalente) antes de reintegrar a `registry.json` — no estaba aprobada para uso comercial, solo existía como contenido de prueba.

## Cómo trabajar con Juan

- Juan tiene comodidad técnica media: puede seguir instrucciones paso a paso, pero no domina frameworks ni terminología técnica a profundidad. Explica los comandos en términos simples antes o al pedir su aprobación.
- Juan revisa y aprueba cada paso — no asumas luz verde para cambios que toquen el repositorio real, `registry.json`, o cualquier `git commit`/`git push`. Los cambios que solo exploran, leen, o trabajan en archivos temporales (`/tmp/`) son de bajo riesgo y pueden proponerse con confianza.
- Antes de borrar o desactivar cualquier módulo de Biblia/comentario/diccionario, presenta el plan completo (qué se borra, qué se mantiene, por qué) y espera confirmación explícita de Juan.
- El control de calidad teológico de contenido generado usa un meta-prompt propio de Juan ("revisión teológica brutal") — si se genera contenido teológico NUEVO (con IA, sin fuente real), debe pasar por ese proceso. Preguntar a Juan por el meta-prompt si no está disponible en el repositorio.
- **Excepción confirmada por Juan (2026-06-23):** la traducción de Matthew Henry NO necesita pasar por la revisión teológica brutal — "en el caso de Matthew Henry, pasa directo". Razón: es traducción fiel de una obra histórica ya publicada y de dominio público, no contenido teológico generado de cero; el riesgo que la revisión brutal busca mitigar (una IA inventando o tergiversando doctrina) no aplica aquí. Esta excepción es específica a Matthew Henry — no asumir que se extiende a otros comentaristas sin confirmar con Juan.

## Estado actual del trabajo (actualizar conforme se avance)

- Explorado el repositorio completo: estructura, módulos de Biblias/comentarios/diccionarios, confirmado que es estático sin backend.
- Reina-Valera 1909 (RVA 1909, SpaRV1909 de crosswire.org, dominio público) integrada como Biblia en el sitio: 66 libros + manifest + entrada en `registry.json`. Solo texto plano, sin números Strong (esa capa tiene licencia "Permission to distribute granted to CrossWire", no claramente extensible a Verbo). Verificado en vivo (selector, carga de texto, navegación) — funciona correctamente. Publicado en GitHub.
- Módulos de MySword de prueba ELIMINADOS (2026-06-23, commit `09f01f4`): comentarios (matthew-henry-es, comentarios-de-la-biblia-del-diario-vivir, lbla, jfb, macarthur, macdonald, scofield, rvr1960-notas, peshitta-notas), biblioteca (nelson, arqueologico, geografia, usos-costumbres, barclay), diccionarios huérfanos no conectados al sitio (barclay, multilexico, strong-prueba, barclay-verbo), y la Biblia huérfana rv1960-strong (RV1960 con Strong, nunca conectada al sitio).
- Limpieza ampliada por instrucción explícita de Juan (2026-06-23, commit `1df794d`): se eliminaron TODAS las demás traducciones bíblicas con copyright editorial (RVG 2004, RVG 2004+Strong, NVI 1984, NTV, DHH, Biblia en Lenguaje Sencillo, Jünemann, LBLA, Biblia del Oso, Nácar-Colunga) y el diccionario strong-verbo. **El sitio hoy solo tiene una Biblia: RVA 1909 (dominio público), que es ahora la `defaultBible`.** Se mantuvieron únicamente como excepción: `ireneo-contra-herejias` (comentario + patrística, traducción propia de Juan, licencia CC BY-NC-ND no comercial) y `gospel/evangelio-uf` (Evangelio cronológico). `modules/dictionaries/` y `modules/library/` quedaron sin ningún módulo. Verificado en vivo tras cada borrado (selector, navegación, paneles) sin errores de consola. Ambos commits publicados en GitHub.
- Importante para cualquier sesión futura: si se vuelve a hablar de "las Biblias del sitio" o "la Biblia RVG", recordar que YA NO EXISTEN en el repo — solo queda RVA 1909. Antes de reintroducir cualquier traducción con copyright (RVG, NVI, NTV, DHH, LBLA, etc.) a producción, se necesita resolver la licencia correspondiente (ver caso RVG/Dr. Gómez abajo) — no asumir que estaban aprobadas porque existieron antes de esta limpieza.
- Correo enviado por Juan al Dr. Humberto Gómez Caballero solicitando permiso de uso comercial de RVG — esperando respuesta. (Nota: el módulo RVG ya no está en el repo; si llega el permiso, habría que reconstruirlo o recuperarlo del historial de git antes de reintegrarlo.)
- **Matthew Henry — Estado al 2026-06-28 (commit `83bb693`):** Los 66 libros del canon están traducidos al español en `modules/commentaries/matthew-henry-es/books/`. La fase siguiente es la **sincronización verso a verso** (como GEN/EXO), que divide cada capítulo en secciones de versos con `verseStart`/`verseEnd` precisos en lugar del marcador genérico `v=1-99`. Fuente: `matthew_henry.zip` (no comiteado, en raíz del repo). Traducción exenta de revisión teológica brutal (excepción ya documentada arriba).

  **Sincronización verso a verso COMPLETADA (formato como GEN):**
  - GEN: 290 entradas — modelo de referencia del formato correcto
  - EXO: 161 entradas
  - Epístolas paulinas: GAL (23), EPH (23), 1TH (24), 2TH (14), 1TI (24), 2CO (52)
  - Epístolas generales: JAS (19), 1PE (28), 2PE (18), JUD (6), 2JN (7), 3JN (6), PHM (4), TIT (12)
  - Profetas menores: JON (14), MIC (25), OBA (5), ZEC (49)

  **Una entrada por capítulo (v=1-99) — sin verse-sync aún:**
  - Evangelios y Hechos: MAT (29 entradas/28 caps), MRK (17/16), LUK (25/24), ACT (29/28)
  - JHN (22 entradas, caps 1-21 + intro)

  **Pocas entradas / agrupados por secciones — sin verse-sync:**
  - Pentateuco histórico: LEV (28), NUM (32), DEU (23), JOS (14), JDG (9), RUT (4)
  - Historia: 1SA (9), 2SA (8), 1KI (9), 2KI (7), 1CH (4), 2CH (4), EZR (3), NEH (4), EST (3)
  - Poéticos: JOB (8), PSA (19), PRO (4), ECC (3), SNG (1)
  - Profetas mayores: ISA (8), JER (4), LAM (1), EZK (4), DAN (3)
  - Profetas menores sin verse-sync: HOS (2), JOL (1), AMO (1), NAH (1), HAB (1), ZEP (1), HAG (1), MAL (1)
  - Epístolas NT sin verse-sync: 1CO (3), HEB (3), ROM (4), REV (4), 1JN (1)

  **⚠️ Estrategia cambiada (2026-06-28):** Se abandona la traducción manual del MH. Ver sección "Estrategia de comentarios" arriba. El módulo `matthew-henry-es` se retira del registry; se construye `matthew-henry-en` con los 66 libros del ZIP fuente + botón de traducción en el panel.

  **Fix app.js comiteados:** `83bb693` (panel sin selector redundante), `4fea476` (scroll con delay 320ms para animación del panel).

## Revisión de errores en RV-Verbo (iniciada 2026-07-01, en curso)

Juan reportó que la Biblia RV-Verbo (66 libros modernizados, commit `a86cee8`) tiene muchos errores. Se encontró que el script automático que modernizó "vosotros"→"ustedes" tiene varios bugs sistemáticos, no son errores aislados. Metodología: para cada categoría, se cruzó palabra por palabra contra el original `rva-1909` (mismo libro/capítulo/versículo) para confirmar el bug antes de corregir — evita falsos positivos sobre texto ya correctamente modernizado.

**Commits completados y pusheados a GitHub:**

1. `0a84a7c` — arcaísmos residuales: "é" conjunción antigua antes de i-/hi- (630 casos), "Á" preposición aislada (1 caso, LUK 17:1), 7 formas verbales "vosotros" sin convertir, "empero"→"pero" (402 casos), "aqueste/aquesta"→"este/esta" (53 casos).
2. `a7e2766` — **780 verbos futuros rotos**: el script convertía mal "-aréis/-eréis/-iréis" (futuro, forma vosotros) a "-aren/-eren/-iren" (inválido en español) en vez de "-arán/-erán/-irán". Ejemplo real, Génesis 3:3-4 (palabras de la serpiente): decía "no comeren... no moriren", ahora "no comerán... no morirán".
3. `a5215a1` — **87 verbos con diptongación rota**: verbos irregulares (pensar, morir, volver, entender, contar, etc.) perdieron el cambio de raíz e→ie/o→ue al convertir de "vosotros". Ejemplo: Génesis 3:3 decía "no muran" (inválido), ahora "no mueran".
4. `491fbe5` — **1068 imperativos "vosotros" sin convertir**: 87 palabras (cantad→canten, venid→vengan, oid→oigan, poned→pongan, volveos→vuélvanse, etc., incluyendo reflexivos con su cambio de acentuación). Se excluyó deliberadamente "libertad" (sustantivo "freedom", no verbo, en sus 28 apariciones — falso positivo detectado y evitado).
5. `fec2eed` (2026-07-02) — **311 imperativos "vosotros" + pronombre enclítico pegado**: 102 verbos únicos, 159 combinaciones verbo+pronombre (cantadle→cántenle, dadme→denme, oidme→óiganme, traedme→tráiganme, etc.). Requirió calcular bien la acentuación al pegar el pronombre: diptongos (traedme→tráiganme, NO traíganme — el acento va en la vocal fuerte del diptongo "ai"), la "u" muda de verbos -car/-gar antes de e (buscadme→búsquenme, no "búsqumenme"), y el caso irregular "estad"→estenle/estenme (sin tilde, porque el pronombre pegado desplaza la sílaba tónica a una posición que ya no la requiere — mismo patrón que "denme"). Verificado: 0 casos residuales del patrón, JSON válido en los 44 archivos.
6. `a60aeec` (2026-07-02) — **14 casos de "estén" (subjuntivo) sin tilde**: encontrado de rebote revisando el fix anterior. El script que convirtió "estéis"(vosotros)→"ustedes" dejó "esten" sin tilde en vez de "estén" (subjuntivo presente de "estar", irregular: la tilde cae en la propia terminación). Confirmado contra rva-1909, ej. Colosenses 4:12 "para que estéis firmes"→"para que estén firmes". No se tocaron los "estenle"/"estenme" del punto 5 (esos sí van sin tilde, correctamente).
7. `4158165` (2026-07-02) — **subjuntivo futuro tras "si" modernizado a indicativo presente**.
8. `dcdd58f` (2026-07-02) — **subjuntivo futuro tras "cuando" modernizado a subjuntivo presente**.

**Pendiente, encontrado pero NO corregido todavía:**

- Es probable que existan más categorías de bugs no descubiertas aún — cada categoría se encontró revisando manualmente ejemplos de la anterior, no por un barrido exhaustivo único (el punto 6 es un ejemplo: apareció mientras se revisaba el punto 5). Antes de dar la Biblia RV-Verbo por "lista", conviene un muestreo adicional (o revisión capítulo por capítulo) antes del lanzamiento de prueba.

Los ocho commits anteriores ya forman parte de `main` y de `origin/main`.

### Subjuntivo futuro arcaico — lotes "si" y "cuando" completados (2026-07-02)

**Decisión de Juan (2026-07-02):** SÍ modernizar el subjuntivo futuro arcaico ("si guardare", "cuando oraren"). Es coherente con el propósito de RV-Verbo — dejarlo tal cual sería inconsistente con el resto de la modernización ya hecha.

**Hallazgo clave que cambia el alcance:** la nota de la sesión anterior decía "461 casos". Un barrido más preciso encontró en realidad **2,204 apariciones reales, 470 formas verbales únicas** (461 era una subestimación). Además, **no es un fix mecánico de un solo paso** como los 6 commits anteriores: la conversión correcta depende de la conjunción que introduce la cláusula, verificado contra cómo RV1960 modernizó este mismo texto base (RV1909):
- **"si" + subjuntivo futuro → indicativo presente** (ej. "si confesáremos" → "si confesamos").
- **"cuando" + subjuntivo futuro → subjuntivo presente** (ej. "cuando viniere el Espíritu" → "cuando venga el Espíritu").
- **"el que"/"quien" + subjuntivo futuro → indicativo presente** en varios casos (ej. "el que hallare su vida" → "el que halla su vida"), pero no es 100% mecánico — a veces es criterio editorial verso por verso, no una regla gramatical única.

Por eso se decidió trabajar **por lotes según la conjunción**, empezando por "si" (el lote más grande y de regla más simple).

**Metodología empleada para el lote "si":**

1. Lista de falsos positivos ya identificada (palabras que terminan en "-are"/"-iere" por coincidencia de letras, NO son subjuntivo futuro): `quiere, quieren, hiere, pare, paren, declare, desampare, desamparen, thare (nombre propio, Taré), adquiere, adquieren, requiere, requieren, inquiere, inquieren, difiere, difieren, digiere, digieren, zahiere, zahieren, profiere, profieren, reparen, separe, separen, ampare, amparen, compare, comparen`. Regex base usado: `\b([a-záéíóúñ]+(?:are|iere)n?)\b` sobre `modules/bibles/rv-verbo/books/*.json`, excluyendo esa lista.
2. Detección de cláusula "si": para cada verbo candidato, se busca el límite de cláusula más cercano hacia atrás (`.`, `;`, `:`, `,`), y se revisa si ese fragmento empieza con "si" Y no contiene otra conjunción que dispute la cláusula (`cuando, quien, donde, aunque, mientras, porque, para que, el que, la que, los que, las que, como, según, do`).
3. Resultado: **203 pares "si + subjuntivo futuro"**, 113 formas verbales únicas (hubiere×10, hablare×6, pecare×6, hiciere×6, viniere×6, tuviere×5, volviere×5, tocare×5, quisiere×4, muriere×4, subiere×4, agradare×4, hallare×4, y ~100 formas más con 1-3 apariciones cada una).
4. El archivo con los 203 casos y su texto completo (`si_pairs.txt`) se generó en el scratchpad temporal de la sesión anterior — **ese archivo YA NO EXISTE** (es de `/tmp`, no sobrevive entre sesiones). Hay que regenerarlo con el script de arriba (regex + filtro de falsos positivos + detección de cláusula "si") al retomar.

Los diccionarios de conjugación se aplicaron y verificaron en los commits `4158165` ("si") y `dcdd58f` ("cuando"). Los contextos "el que"/"quien" y otros siguen requiriendo criterio editorial caso por caso.

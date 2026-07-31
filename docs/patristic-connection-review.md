# Revisión de tipo de conexión — citas patrísticas (Padres Apostólicos)

Fecha: 2026-07-31

## Qué es esto

El panel "Padres Apostólicos" enlaza citas de textos patrísticos (1 y 2 Clemente, Policarpo, Martirio de Ignacio, Didaché, Bernabé, Pastor de Hermas, Papías, Diogneto, Ireneo — Contra las Herejías) a versículos bíblicos específicos. La extracción original fue mecánica (regex sobre referencias bíblicas) y no distinguía si el texto patrístico **comenta directamente** ese pasaje o solo **lo cita como apoyo** de un argumento distinto.

Esta revisión clasifica las 367 citas ya indexadas con un campo nuevo `connection_type`:
- **`narrativa`** — el texto expone/parafrasea/interpreta el sentido propio del pasaje.
- **`referencial`** — el texto usa el pasaje como prueba de apoyo para un argumento distinto.

**No se borró ninguna cita.**

## Correcciones ejecutadas (2026-07-31, tras aprobación de Juan)

- `connectionType` fusionado en las 367 entradas reales de `biblia/modules/commentaries/{módulo}/books/*.json` (263 narrativa, 83 referencial, 21 `polemica-numerica`).
- **Categoría especial `polemica-numerica`** creada para las 21 citas de Ireneo que usan medidas/cantidades bíblicas (arca, candelabro, 70 discípulos, 5 vírgenes, etc.) para refutar aritméticamente la numerología gnóstica — no encajaban limpio en narrativa/referencial.
- **11 entradas marcadas `needsSourceReview: true`** con `reviewNote` (contenido verificado contra el texto real y confirmado que no corresponde al versículo anclado; no se adivinó la referencia correcta sin evidencia clara — ver detalle abajo). No se eliminó ninguna.
- **1 corrección de referencia verificada con alta confianza:** `bernabe-sec11a-jer-2-12` (antes `bernabe-sec11a-isa-16-1`) — el contenido ("fuente de agua viva... cisternas rotas") es Jeremías 2:12-13 textual, no Isaías 16. La entrada se **movió físicamente** de `bernabe/books/ISA.json` a `bernabe/books/JER.json` (el motor de sincronización carga por archivo/libro vía `manifest.books[].file`, no filtra por `reference.book` — cambiar solo el campo habría dejado la cita huérfana). Se renombró el `id` para reflejar el libro correcto.
- `MODULES.md` actualizado con el esquema de `connectionType`/`needsSourceReview` para referencia futura.
- Verificado tras la corrección: 367/367 entradas con JSON válido, mismo conteo por módulo que antes (nada se perdió), 124 archivos modificados.

### Detalle de las 11 entradas con `needsSourceReview`

Se verificó cada una contra el texto bíblico real (no solo el rationale del clasificador automático) antes de marcarla. En todos estos casos el contenido patrístico claramente NO corresponde al pasaje indicado, pero no había evidencia suficientemente clara para asignar con confianza la referencia correcta (a diferencia del caso de Bernabé/Jeremías arriba, que sí se corrigió):

| ID | Referencia actual | Problema detectado |
|---|---|---|
| `bernabe-sec18-2co-12-7` | 2 Co 12:7 | Contenido es la doctrina de los dos caminos (ángeles de luz/Satanás); no es cita de 2 Co 12:7. |
| `bernabe-sec2a-jer-7-22` | Jer 7:22 | Contenido idéntico a `bernabe-sec2b-zec-8-17` (Zacarías 8:17); posible anclaje duplicado. |
| `bernabe-sec12c-jhn-3-14` | Jn 3:14-18 | Contenido duplica `bernabe-sec12b-num-21-6` (serpiente de bronce); no es contenido propio de Juan 3. |
| `bernabe-sec19c-rom-8-29` | Rom 8:29-30 | Contenido ("llamó no según apariencia exterior") no es de Romanos 8:29-30 (predestinación). |
| `bernabe-sec16d-hag-2-10` | Hag 2:10 | Contenido usa "semana" (terminología de Daniel 9); duplica `bernabe-sec16c-dan-9-24`. |
| `clemente-1-sec2b-1pe-2-17` | 1 Pe 2:17 | Contenido sobre "la hermandad... elegidos" no coincide con "Honrad a todos..." de 1 Pe 2:17. |
| `clemente-2-sec12-1co-7-29` | 1 Co 7:29 | El dicho citado no está en 1 Corintios 7:29 canónico; posible cita extracanónica (tipo Evangelio de los Egipcios). |
| `clemente-2-sec16-1pe-4-4` | 1 Pe 4:4 | Contenido sobre limosna/ayuno no corresponde temáticamente a 1 Pedro 4:4. |
| `policarpo-filipenses-sec3b-gal-4-26` | Gá 4:26 | Contenido es mención genérica a "una carta que os escribió", no el contenido de Gá 4:26. |
| `policarpo-filipenses-sec12b-gal-1-1` | Gá 1:1 | Contenido es bendición final genérica, no el saludo apostólico de Gá 1:1. |
| `didache-sec2d-mat-5-34` | Mt 5:34 | Contenido idéntico a `didache-sec2c-exo-20-17` (Decálogo); no es la enseñanza de Mt 5:34. |
| `ireneo-doctrina-sec54-mat-5-45` | Mt 5:45 | El propio texto etiqueta "Mateo 5:45" pero el tema (persecución/prosperidad de impíos) no es el de Mt 5:45. |

**Siguiente paso real pendiente:** para corregir estas 11 referencias haría falta el texto fuente completo en inglés (Ante-Nicene Fathers) de cada obra para ubicar la cita real que el autor patrístico tenía en mente — no se intentó adivinar sin esa fuente.

## Estado de git

Todo lo anterior está comiteado y subido a `main` (ver commit). El deliverable original (`docs/patristic-connection-types.json`) es el snapshot previo a estas correcciones — el estado real y vigente vive en los archivos de `biblia/modules/commentaries/`.

## Conteo por módulo

| Módulo | Total | Narrativa | Referencial | Ambiguo |
|---|---:|---:|---:|---:|
| Ireneo — Contra las Herejías | 112 | 57 | 55 | 61 |
| Epístola de Bernabé | 69 | 59 | 10 | 25 |
| 1 Clemente | 50 | 33 | 17 | 1 |
| 2 Clemente | 22 | 18 | 4 | 2 |
| Didaché | 25 | 22 | 3 | 1 |
| Policarpo — Filipenses | 56 | 52 | 4 | 2 |
| Martirio de Policarpo | 7 | 3 | 4 | 0 |
| Pastor de Hermas | 9 | 6 | 3 | 2 |
| Epístola a Diogneto | 9 | 7 | 2 | 0 |
| Fragmentos de Papías | 5 | 4 | 1 | 0 |
| Martirio de Ignacio | 3 | 2 | 1 | 0 |
| **Total** | **367** | **263** | **104** | **94** |

**Nota sobre las proporciones:** varían mucho según el género literario de cada obra. Bernabé (85% narrativa) usa sobre todo tipología del AT donde el pasaje mismo es el tema. La Didaché (88% narrativa) parafrasea mandamientos casi al pie de la letra, en el mismo sentido del original. 1 Clemente tiene más proporción referencial (34%) porque su género retórico son catálogos de ejemplos morales (Abraham, los mártires, etc.) donde el foco real es la virtud abstracta, no el episodio bíblico en sí. Ireneo es el caso más parejo (51%/49%) por tratarse de una obra polémica antignóstica donde muchas citas son prueba doctrinal más que comentario directo — ver también la categoría especial de citas numéricas más abajo.

## Casos para tu revisión (94 de 367, el resto ya está clasificado con confianza)

Se marcaron como ambiguas cuando el fragmento es demasiado breve, cuando cumple ambos criterios a la vez, o cuando el propio anclaje verso-por-verso parece dudoso. Agrupadas por prioridad de revisión:


### Prioridad ALTA — posible error de anclaje (el contenido no corresponde al versículo citado) (14)

| Módulo | ID | Referencia | Motivo |
|---|---|---|---|
| Epístola de Bernabé | `bernabe-sec18-2co-12-7` | 2 Corintios 12:7 | El contenido no se relaciona temáticamente con 2 Corintios 12:7 (la espina en la carne de Pablo); probable error de indexación mecánica por coincidencia de la frase 'ángel de Satanás'. Verificar contra la fuente original. |
| Epístola de Bernabé | `bernabe-sec11a-isa-16-1` | Isaías 16:1-2 | El contenido corresponde temáticamente a Jeremías 2:13 (fuente de agua viva, cisternas rotas), no a Isaías 16:1-2. Probable error de referencia en la indexación mecánica original — verificar contra la fuente en inglés. |
| Epístola de Bernabé | `bernabe-sec2a-jer-7-22` | Jeremías 7:22 | El texto es prácticamente idéntico al de bernabe-sec2b, anclado a Zacarías 8:17 (que sí coincide con el contenido). Probable error de referencia o cita compuesta — verificar contra la fuente original. |
| Epístola de Bernabé | `bernabe-sec12c-jhn-3-14` | Juan 3:14-18 | Fuerte sospecha de error de referencia: el contenido es casi idéntico al de bernabe-sec12b (Números 21:6-9), que sí corresponde al relato. Verificar contra la fuente original en inglés — probablemente esta entrada debería estar anclada a Números, no a Juan. |
| Epístola de Bernabé | `bernabe-sec12b-num-21-6` | Números 21:6-9 | Ver nota en bernabe-sec12c (Juan 3:14-18) — mismo contenido aparece indexado también a un pasaje de Juan que probablemente no corresponde. |
| Epístola de Bernabé | `bernabe-sec19c-rom-8-29` | Romanos 8:29-30 | El texto no corresponde literalmente a la redacción de Romanos 8:29-30 (predestinación/llamado según propósito); relación temática indirecta ('llamado no según apariencia'). Verificar contra la fuente original — posible cita compuesta o de otro pasaje paulino. |
| Epístola de Bernabé | `bernabe-sec2b-zec-8-17` | Zacarías 8:17 | Ver nota en bernabe-sec2a (Jeremías 7:22) — mismo texto exacto aparece anclado también a un pasaje que no coincide con su contenido. |
| 1 Clemente | `clemente-1-sec2b-1pe-2-17` | 1 Pedro 2:17 | El contenido no corresponde literalmente a 1 Pedro 2:17 ('honrad a todos, amad la hermandad, temed a Dios, honrad al rey'); la conexión es temática indirecta. Verificar la referencia real contra la fuente original. |
| 2 Clemente | `clemente-2-sec12-1co-7-29` | 1 Corintios 7:29 | El dicho citado no aparece en 1 Corintios 7:29 canónico; podría tratarse de una cita de una fuente extracanónica (similar al Evangelio de los Egipcios) mal atribuida a esta referencia por el extractor automático. |
| 2 Clemente | `clemente-2-sec16-1pe-4-4` | 1 Pedro 4:4 | El contenido sobre limosna/ayuno no coincide temáticamente con 1 Pedro 4:4. Revisar si la referencia correcta debería apuntar a otro pasaje. |
| Ireneo — Contra las Herejías | `ireneo-doctrina-sec60-luk-11-40` | Lucas 11:40 | El contenido citado no corresponde claramente al sentido propio de Lucas 11:40; posible ancla imprecisa, conviene revisar contra el texto fuente completo. |
| Ireneo — Contra las Herejías | `ireneo-doctrina-sec54-mat-5-45` | Mateo 5:45 | Posible ancla imprecisa: el parrafo describe un tema distinto (prosperidad de los impios) al contenido literal de Mateo 5:45; conviene revisar contra el texto fuente completo. |
| Policarpo — Filipenses | `policarpo-filipenses-sec3b-gal-4-26` | Gálatas 4:26 | El contenido citado no coincide temáticamente con Gálatas 4:26; parece una referencia genérica a la carta a los Gálatas más que una cita de ese versículo puntual. Revisar si la referencia correcta es otra o si se trata de un comentario general sobre la epístola. |
| Policarpo — Filipenses | `policarpo-filipenses-sec12b-gal-1-1` | Gálatas 1:1 | El contenido no coincide con el saludo apostólico de Gálatas 1:1; parece una bendición final genérica, más cercana en tema a otros textos (p. ej. Hch 26:18). Revisar la referencia. |

### Mezcla real de ambos criterios en un mismo fragmento (1)

| Módulo | ID | Referencia | Motivo |
|---|---|---|---|
| Ireneo — Contra las Herejías | `ireneo-1cor-13-13` | 1 Corintios 13:13 | Mezcla exposicion del versiculo con un argumento monoteista antignostico anadido; revisar si el enfasis real es el pasaje o el argumento posterior. |

### Fragmento demasiado breve, o es solo un título/resumen de sección sin contenido propio (6)

| Módulo | ID | Referencia | Motivo |
|---|---|---|---|
| Epístola de Bernabé | `bernabe-sec12g-1ti-3-16` | 1 Timoteo 3:16 | Fragmento muy breve y terso, sin desarrollo explicativo alrededor; podría ser cita de apoyo doctrinal dentro del capítulo sobre la cruz en vez de exposición directa del versículo. |
| Ireneo — Contra las Herejías | `ireneo-doctrina-sec74-2co-4-5` | 2 Corintios 4:5 | Fragmento es un titulo/resumen de seccion, no contiene el argumento real; no se puede clasificar con confianza. |
| Ireneo — Contra las Herejías | `ireneo-doctrina-sec54-isa-5-12` | Isaías 5:12 | Fragmento muy breve, parte de la misma discusion que isa-61-2; confirmar que la referencia a Isaias 5:12 especificamente sea correcta. |
| Ireneo — Contra las Herejías | `ireneo-doctrina-sec64-mat-25-41` | Mateo 25:41 | Fragmento vacio/stub, y duplica la referencia de ireneo-doctrina-sec39-mat-25-41. |
| Ireneo — Contra las Herejías | `ireneo-doctrina-sec75-mat-6-24` | Mateo 6:24 | Fragmento es un titulo/resumen de seccion, no contiene el argumento real. |
| Ireneo — Contra las Herejías | `ireneo-doctrina-sec64-mrk-9-44` | Marcos 9:44 | Fragmento vacio/stub, identico a ireneo-doctrina-sec64-mat-25-41. |

### Categoría especial — citas numéricas de Ireneo contra la numerología gnóstica (no encajan limpio en narrativa/referencial) (23)

| Módulo | ID | Referencia | Motivo |
|---|---|---|---|
| Ireneo — Contra las Herejías | `ireneo-doctrina-sec60-1co-13-9` | 1 Corintios 13:9 | Fragmento vacio/stub: no hay contenido real mas alla de la referencia numerica. |
| Ireneo — Contra las Herejías | `ireneo-doctrina-sec56-exo-25-10` | Éxodo 25:10 | Ireneo cita el dato exacto del pasaje (medida, cantidad, edad) para refutar por incongruencia aritmetica la numerologia gnostica valentiniana (Ogdoad/Decad/etc.) - no expone el sentido teologico del pasaje ni lo usa como prueba de un argumento doctrinal en el sentido habitual; es una categoria intermedia ("refutacion polemica por numeros") que conviene que Juan revise. |
| Ireneo — Contra las Herejías | `ireneo-doctrina-sec56-exo-25-17` | Éxodo 25:17 | Ireneo cita el dato exacto del pasaje (medida, cantidad, edad) para refutar por incongruencia aritmetica la numerologia gnostica valentiniana (Ogdoad/Decad/etc.) - no expone el sentido teologico del pasaje ni lo usa como prueba de un argumento doctrinal en el sentido habitual; es una categoria intermedia ("refutacion polemica por numeros") que conviene que Juan revise. |
| Ireneo — Contra las Herejías | `ireneo-doctrina-sec56-exo-25-23` | Éxodo 25:23 | Ireneo cita el dato exacto del pasaje (medida, cantidad, edad) para refutar por incongruencia aritmetica la numerologia gnostica valentiniana (Ogdoad/Decad/etc.) - no expone el sentido teologico del pasaje ni lo usa como prueba de un argumento doctrinal en el sentido habitual; es una categoria intermedia ("refutacion polemica por numeros") que conviene que Juan revise. |
| Ireneo — Contra las Herejías | `ireneo-doctrina-sec56-exo-25-31` | Éxodo 25:31 | Ireneo cita el dato exacto del pasaje (medida, cantidad, edad) para refutar por incongruencia aritmetica la numerologia gnostica valentiniana (Ogdoad/Decad/etc.) - no expone el sentido teologico del pasaje ni lo usa como prueba de un argumento doctrinal en el sentido habitual; es una categoria intermedia ("refutacion polemica por numeros") que conviene que Juan revise. |
| Ireneo — Contra las Herejías | `ireneo-doctrina-sec56-exo-26-1` | Éxodo 26:1 | Ireneo cita el dato exacto del pasaje (medida, cantidad, edad) para refutar por incongruencia aritmetica la numerologia gnostica valentiniana (Ogdoad/Decad/etc.) - no expone el sentido teologico del pasaje ni lo usa como prueba de un argumento doctrinal en el sentido habitual; es una categoria intermedia ("refutacion polemica por numeros") que conviene que Juan revise. |
| Ireneo — Contra las Herejías | `ireneo-doctrina-sec56-exo-26-7` | Éxodo 26:7 | Ireneo cita el dato exacto del pasaje (medida, cantidad, edad) para refutar por incongruencia aritmetica la numerologia gnostica valentiniana (Ogdoad/Decad/etc.) - no expone el sentido teologico del pasaje ni lo usa como prueba de un argumento doctrinal en el sentido habitual; es una categoria intermedia ("refutacion polemica por numeros") que conviene que Juan revise. Ademas, parrafo identico a exo-26-1 y exo-26-2 (mismo texto, tres anclas distintas). |
| Ireneo — Contra las Herejías | `ireneo-doctrina-sec56-exo-26-2` | Éxodo 26:2 | Ireneo cita el dato exacto del pasaje (medida, cantidad, edad) para refutar por incongruencia aritmetica la numerologia gnostica valentiniana (Ogdoad/Decad/etc.) - no expone el sentido teologico del pasaje ni lo usa como prueba de un argumento doctrinal en el sentido habitual; es una categoria intermedia ("refutacion polemica por numeros") que conviene que Juan revise. Ademas, parrafo identico a exo-26-1 y exo-26-7 (mismo texto, tres anclas distintas). |
| Ireneo — Contra las Herejías | `ireneo-doctrina-sec56-exo-26-16` | Éxodo 26:16 | Ireneo cita el dato exacto del pasaje (medida, cantidad, edad) para refutar por incongruencia aritmetica la numerologia gnostica valentiniana (Ogdoad/Decad/etc.) - no expone el sentido teologico del pasaje ni lo usa como prueba de un argumento doctrinal en el sentido habitual; es una categoria intermedia ("refutacion polemica por numeros") que conviene que Juan revise. |
| Ireneo — Contra las Herejías | `ireneo-doctrina-sec56-exo-26-26` | Éxodo 26:26 | Ireneo cita el dato exacto del pasaje (medida, cantidad, edad) para refutar por incongruencia aritmetica la numerologia gnostica valentiniana (Ogdoad/Decad/etc.) - no expone el sentido teologico del pasaje ni lo usa como prueba de un argumento doctrinal en el sentido habitual; es una categoria intermedia ("refutacion polemica por numeros") que conviene que Juan revise. |
| Ireneo — Contra las Herejías | `ireneo-doctrina-sec56-exo-30-23` | Éxodo 30:23 | Ireneo cita el dato exacto del pasaje (medida, cantidad, edad) para refutar por incongruencia aritmetica la numerologia gnostica valentiniana (Ogdoad/Decad/etc.) - no expone el sentido teologico del pasaje ni lo usa como prueba de un argumento doctrinal en el sentido habitual; es una categoria intermedia ("refutacion polemica por numeros") que conviene que Juan revise. Ademas, parrafo identico a exo-26-26 (mismo texto, dos anclas distintas). |
| Ireneo — Contra las Herejías | `ireneo-doctrina-sec56-exo-30-34` | Éxodo 30:34 | Ireneo cita el dato exacto del pasaje (medida, cantidad, edad) para refutar por incongruencia aritmetica la numerologia gnostica valentiniana (Ogdoad/Decad/etc.) - no expone el sentido teologico del pasaje ni lo usa como prueba de un argumento doctrinal en el sentido habitual; es una categoria intermedia ("refutacion polemica por numeros") que conviene que Juan revise. |
| Ireneo — Contra las Herejías | `ireneo-doctrina-sec56-exo-28-1` | Éxodo 28:1 | Ireneo cita el dato exacto del pasaje (medida, cantidad, edad) para refutar por incongruencia aritmetica la numerologia gnostica valentiniana (Ogdoad/Decad/etc.) - no expone el sentido teologico del pasaje ni lo usa como prueba de un argumento doctrinal en el sentido habitual; es una categoria intermedia ("refutacion polemica por numeros") que conviene que Juan revise. |
| Ireneo — Contra las Herejías | `ireneo-doctrina-sec56-exo-28-5` | Éxodo 28:5 | Ireneo cita el dato exacto del pasaje (medida, cantidad, edad) para refutar por incongruencia aritmetica la numerologia gnostica valentiniana (Ogdoad/Decad/etc.) - no expone el sentido teologico del pasaje ni lo usa como prueba de un argumento doctrinal en el sentido habitual; es una categoria intermedia ("refutacion polemica por numeros") que conviene que Juan revise. |
| Ireneo — Contra las Herejías | `ireneo-doctrina-sec55-jhn-5-5` | Juan 5:5 | Ireneo cita el dato exacto del pasaje (medida, cantidad, edad) para refutar por incongruencia aritmetica la numerologia gnostica valentiniana (Ogdoad/Decad/etc.) - no expone el sentido teologico del pasaje ni lo usa como prueba de un argumento doctrinal en el sentido habitual; es una categoria intermedia ("refutacion polemica por numeros") que conviene que Juan revise. |
| Ireneo — Contra las Herejías | `ireneo-doctrina-sec56-jos-10-17` | Josué 10:17 | Ireneo cita el dato exacto del pasaje (medida, cantidad, edad) para refutar por incongruencia aritmetica la numerologia gnostica valentiniana (Ogdoad/Decad/etc.) - no expone el sentido teologico del pasaje ni lo usa como prueba de un argumento doctrinal en el sentido habitual; es una categoria intermedia ("refutacion polemica por numeros") que conviene que Juan revise. |
| Ireneo — Contra las Herejías | `ireneo-doctrina-sec53-luk-10-1` | Lucas 10:1 | Ireneo cita el dato exacto del pasaje (medida, cantidad, edad) para refutar por incongruencia aritmetica la numerologia gnostica valentiniana (Ogdoad/Decad/etc.) - no expone el sentido teologico del pasaje ni lo usa como prueba de un argumento doctrinal en el sentido habitual; es una categoria intermedia ("refutacion polemica por numeros") que conviene que Juan revise. |
| Ireneo — Contra las Herejías | `ireneo-doctrina-sec55-luk-13-16` | Lucas 13:16 | Ireneo cita el dato exacto del pasaje (medida, cantidad, edad) para refutar por incongruencia aritmetica la numerologia gnostica valentiniana (Ogdoad/Decad/etc.) - no expone el sentido teologico del pasaje ni lo usa como prueba de un argumento doctrinal en el sentido habitual; es una categoria intermedia ("refutacion polemica por numeros") que conviene que Juan revise. |
| Ireneo — Contra las Herejías | `ireneo-doctrina-sec56-luk-8-51` | Lucas 8:51 | Ireneo cita el dato exacto del pasaje (medida, cantidad, edad) para refutar por incongruencia aritmetica la numerologia gnostica valentiniana (Ogdoad/Decad/etc.) - no expone el sentido teologico del pasaje ni lo usa como prueba de un argumento doctrinal en el sentido habitual; es una categoria intermedia ("refutacion polemica por numeros") que conviene que Juan revise. Ademas, parrafo identico a luk-16-28 (mismo texto, dos anclas distintas). |
| Ireneo — Contra las Herejías | `ireneo-doctrina-sec56-luk-16-28` | Lucas 16:28 | Ireneo cita el dato exacto del pasaje (medida, cantidad, edad) para refutar por incongruencia aritmetica la numerologia gnostica valentiniana (Ogdoad/Decad/etc.) - no expone el sentido teologico del pasaje ni lo usa como prueba de un argumento doctrinal en el sentido habitual; es una categoria intermedia ("refutacion polemica por numeros") que conviene que Juan revise. Ademas, parrafo identico a luk-8-51 (mismo texto, dos anclas distintas). |
| Ireneo — Contra las Herejías | `ireneo-doctrina-sec1-mat-10-26` | Mateo 10:26 | Fragmento vacio/stub: solo cita y numero de seccion, sin contenido para clasificar con confianza. |
| Ireneo — Contra las Herejías | `ireneo-doctrina-sec56-mat-25-2` | Mateo 25:2 | Ireneo cita el dato exacto del pasaje (medida, cantidad, edad) para refutar por incongruencia aritmetica la numerologia gnostica valentiniana (Ogdoad/Decad/etc.) - no expone el sentido teologico del pasaje ni lo usa como prueba de un argumento doctrinal en el sentido habitual; es una categoria intermedia ("refutacion polemica por numeros") que conviene que Juan revise. |
| Ireneo — Contra las Herejías | `ireneo-doctrina-sec56-mat-17-1` | Mateo 17:1 | Ireneo cita el dato exacto del pasaje (medida, cantidad, edad) para refutar por incongruencia aritmetica la numerologia gnostica valentiniana (Ogdoad/Decad/etc.) - no expone el sentido teologico del pasaje ni lo usa como prueba de un argumento doctrinal en el sentido habitual; es una categoria intermedia ("refutacion polemica por numeros") que conviene que Juan revise. |

### Duplicados o citas paralelas legítimas (mismo texto anclado a más de un versículo) (40)

| Módulo | ID | Referencia | Motivo |
|---|---|---|---|
| Epístola de Bernabé | `bernabe-sec16c-dan-9-24` | Daniel 9:24-27 | Texto casi idéntico también aparece anclado a Hageo 2:10 (bernabe-sec16d); podría ser una sola cita bernabita de origen incierto indexada a dos libros distintos. Verificar contra la fuente en inglés (Ante-Nicene Fathers). |
| Epístola de Bernabé | `bernabe-sec4d-deu-9-12` | Deuteronomio 9:12 | Contenido casi idéntico al de bernabe-sec14d (mismo episodio, capítulo 14); ambos citan también las versiones paralelas de Éxodo 32:7. Posible mención repetida legítima en el propio texto de Bernabé o duplicado de indexación — revisar. |
| Epístola de Bernabé | `bernabe-sec14d-deu-9-12` | Deuteronomio 9:12 | Ver nota en bernabe-sec4d — posible repetición/duplicado del mismo episodio anclado a Deuteronomio 9:12 y Éxodo 32:7 en dos capítulos distintos. |
| Epístola de Bernabé | `bernabe-sec15b-deu-5-12` | Deuteronomio 5:12 | Texto idéntico también anclado a Éxodo 20:8 (bernabe-sec15a) — son los dos pasajes paralelos del mismo mandamiento en el Pentateuco, cita conjunta esperable, no necesariamente error. |
| Epístola de Bernabé | `bernabe-sec4a-exo-31-18` | Éxodo 31:18 | Texto casi idéntico a bernabe-sec4b, anclado a Éxodo 34:28 (otro relato de los 40 días). Posible mismo pasaje bernabita indexado a dos versículos distintos. |
| Epístola de Bernabé | `bernabe-sec4b-exo-34-28` | Éxodo 34:28 | Texto casi idéntico a bernabe-sec4a (Éxodo 31:18) — ver nota ahí. |
| Epístola de Bernabé | `bernabe-sec4c-exo-32-7` | Éxodo 32:7 | Contenido muy similar a bernabe-sec14c (mismo versículo, capítulo 14) y al cluster de Deuteronomio 9:12 — mismo episodio citado varias veces, revisar solapamiento. |
| Epístola de Bernabé | `bernabe-sec6e-exo-33-1` | Éxodo 33:1 | Contenido casi idéntico a bernabe-sec6i (Éxodo 33:3) y bernabe-sec6f (Levítico 20:24) — misma fórmula ('tierra que mana leche y miel') anclada a tres versículos distintos del mismo tema. |
| Epístola de Bernabé | `bernabe-sec6i-exo-33-3` | Éxodo 33:3 | Ver nota en bernabe-sec6e — mismo cluster de citas paralelas sobre 'tierra que mana leche y miel'. |
| Epístola de Bernabé | `bernabe-sec14c-exo-32-7` | Éxodo 32:7 | Ver nota en bernabe-sec4c — mismo episodio citado en ambos capítulos (4 y 14), revisar solapamiento. |
| Epístola de Bernabé | `bernabe-sec15a-exo-20-8` | Éxodo 20:8 | Texto idéntico a bernabe-sec15b (Deuteronomio 5:12) — cita conjunta de los dos pasajes paralelos del mandamiento, esperable. |
| Epístola de Bernabé | `bernabe-sec6j-ezk-11-19` | Ezequiel 11:19 | Ezequiel repite esta misma promesa en 36:26 (bernabe-sec6k) — cita conjunta de pasajes paralelos del mismo profeta, esperable. |
| Epístola de Bernabé | `bernabe-sec6k-ezk-36-26` | Ezequiel 36:26 | Ver nota en bernabe-sec6j — pasaje paralelo de Ezequiel. |
| Epístola de Bernabé | `bernabe-sec5b-gen-1-26` | Génesis 1:26 | Mismo versículo y argumento reaparecen en bernabe-sec6g (capítulo 6) — posible continuación del mismo argumento entre capítulos contiguos, no necesariamente error. |
| Epístola de Bernabé | `bernabe-sec16d-hag-2-10` | Hageo 2:10 | Texto idéntico también anclado a Daniel 9:24-27 (bernabe-sec16c) — ver nota ahí; recomendable verificar la fuente original para saber a cuál se refería realmente Bernabé. |
| Epístola de Bernabé | `bernabe-sec6f-lev-20-24` | Levítico 20:24 | Mismo cluster que bernabe-sec6e y bernabe-sec6i (fórmula 'tierra que mana leche y miel' anclada a tres versículos distintos). |
| Pastor de Hermas | `hermas-pastor-2co-3-14` | 2 Corintios 3:14 | El mismo fragmento de Hermas está anclado a cuatro referencias distintas (2 Co 3:14, Is 29:13, Jn 12:40, Mt 15:8). Is 29:13/Mt 15:8 parecen ser la fuente real ('labios' vs 'corazón'); 2 Co 3:14 y Jn 12:40 parecen coincidencias de la palabra 'endurecido' sin relación temática directa. Revisar si conviene descartar estas dos últimas. |
| Pastor de Hermas | `hermas-pastor-jhn-12-40` | Juan 12:40 | Mismo fragmento de Hermas anclado también a 2 Co 3:14, Is 29:13 y Mt 15:8 (ver hermas-pastor-2co-3-14). Is 29:13/Mt 15:8 son la fuente real; esta y la de 2 Co 3:14 parecen coincidencias de palabra clave. Revisar. |
| Ireneo — Contra las Herejías | `ireneo-doctrina-sec58-1co-8-1` | 1 Corintios 8:1 | Fragmento solapado/duplicado de ireneo-1cor-8-1 (mismo pasaje, mismo parrafo). |
| Ireneo — Contra las Herejías | `ireneo-doctrina-sec60-1co-13-13` | 1 Corintios 13:13 | Fragmento solapado/duplicado de ireneo-1cor-13-13. |
| Ireneo — Contra las Herejías | `ireneo-doctrina-sec60-1co-2-10` | 1 Corintios 2:10 | Fragmento solapado/duplicado de ireneo-1cor-2-10. |
| Ireneo — Contra las Herejías | `ireneo-doctrina-sec64-act-8-9` | Hechos 8:9 | Fragmento solapado/duplicado de ireneo-act-8-9. |
| Ireneo — Contra las Herejías | `ireneo-doctrina-sec34-gen-1-1` | Génesis 1:1 | Fragmento solapado/duplicado de ireneo-gen-1-1 (mismo parrafo, corte distinto). |
| Ireneo — Contra las Herejías | `ireneo-doctrina-sec62-heb-1-3` | Hebreos 1:3 | Fragmento solapado/duplicado de ireneo-heb-1-3. |
| Ireneo — Contra las Herejías | `ireneo-doctrina-sec45-isa-55-8` | Isaías 55:8 | Fragmento solapado/duplicado de ireneo-isa-55-8. |
| Ireneo — Contra las Herejías | `ireneo-doctrina-sec34-jhn-1-3` | Juan 1:3 | Fragmento muy breve, solapado/continuacion de ireneo-doctrina-sec23-jhn-1-3. |
| Ireneo — Contra las Herejías | `ireneo-doctrina-sec54-jhn-12-1` | Juan 12:1 | Fragmento identico/solapado con ireneo-doctrina-sec54-jhn-11-54 (mismo parrafo, dos anclas Jn 11:54 y Jn 12:1). |
| Ireneo — Contra las Herejías | `ireneo-doctrina-sec60-jhn-14-28` | Juan 14:28 | Fragmento solapado/duplicado de ireneo-jhn-14-28. |
| Ireneo — Contra las Herejías | `ireneo-doctrina-sec42-luk-18-27` | Lucas 18:27 | Fragmento solapado/duplicado de ireneo-luk-18-27. |
| Ireneo — Contra las Herejías | `ireneo-doctrina-sec1-mat-7-15` | Mateo 7:15 | Fragmento solapado/duplicado de ireneo-mat-7-15. |
| Ireneo — Contra las Herejías | `ireneo-doctrina-sec38-mat-11-27` | Mateo 11:27 | Fragmento solapado/duplicado de ireneo-mat-11-27. |
| Ireneo — Contra las Herejías | `ireneo-doctrina-sec52-mat-26-24` | Mateo 26:24 | Fragmento identico/solapado con ireneo-doctrina-sec52-jhn-17-12 y ireneo-doctrina-sec52-mrk-14-21 (mismo parrafo, tres anclas). |
| Ireneo — Contra las Herejías | `ireneo-doctrina-sec58-mat-10-30` | Mateo 10:30 | Fragmento solapado/duplicado de ireneo-mat-10-29-30. |
| Ireneo — Contra las Herejías | `ireneo-doctrina-sec58-mat-10-29` | Mateo 10:29 | Fragmento solapado/duplicado de ireneo-mat-10-29-30. |
| Ireneo — Contra las Herejías | `ireneo-doctrina-sec59-mat-25-5` | Mateo 25:5 | Fragmento solapado/duplicado de ireneo-mat-25-5. |
| Ireneo — Contra las Herejías | `ireneo-doctrina-sec59-mat-7-25` | Mateo 7:25 | Fragmento solapado/duplicado de ireneo-mat-7-25. |
| Ireneo — Contra las Herejías | `ireneo-doctrina-sec60-mat-10-24` | Mateo 10:24 | Fragmento solapado/duplicado de ireneo-mat-10-24. |
| Ireneo — Contra las Herejías | `ireneo-doctrina-sec64-mat-5-21` | Mateo 5:21 | Fragmento solapado/duplicado de ireneo-moral-sermon-monte. |
| Ireneo — Contra las Herejías | `ireneo-doctrina-sec52-mrk-14-21` | Marcos 14:21 | Fragmento identico/solapado con ireneo-doctrina-sec52-jhn-17-12 y ireneo-doctrina-sec52-mat-26-24. |
| Ireneo — Contra las Herejías | `ireneo-doctrina-sec54-rom-8-36` | Romanos 8:36 | Fragmento solapado/duplicado de ireneo-rom-8-36. |

### Otros casos límite (10)

| Módulo | ID | Referencia | Motivo |
|---|---|---|---|
| Epístola de Bernabé | `bernabe-sec6g-gen-1-26` | Génesis 1:26 | Ver nota en bernabe-sec5b. |
| Didaché | `didache-sec2d-mat-5-34` | Mateo 5:34 | El contenido coincide con Éxodo 20:16-17 (ya indexado aparte como didache-sec2c), no con la enseñanza más radical de Mt 5:34 sobre no jurar de ningún modo. Revisar si la referencia correcta debería ser otra. |
| Ireneo — Contra las Herejías | `ireneo-doctrina-sec54-col-1-18` | Colosenses 1:18 | Contenido identico a ireneo-doctrina-sec54-act-3-15; mismo parrafo anclado a dos referencias distintas. |
| Ireneo — Contra las Herejías | `ireneo-doctrina-sec41-isa-46-9` | Isaías 46:9 | El fragmento no deja clara la relacion con el contenido propio de Isaias 46:9; requiere ver el contexto mas amplio de la obra. |
| Ireneo — Contra las Herejías | `ireneo-mat-25-5` | Mateo 25:5 | El foco real es un argumento metahermeneutico sobre interpretacion de parabolas, usando la imagen de forma ilustrativa; podria tambien leerse como narrativa parcial. |
| Ireneo — Contra las Herejías | `ireneo-mat-7-25` | Mateo 7:25 | Mismo patron que ireneo-mat-25-5: imagen usada ilustrativamente para un argumento hermeneutico mas amplio. |
| Ireneo — Contra las Herejías | `ireneo-doctrina-sec46-mat-11-27` | Mateo 11:27 | Tematica y verso se solapan con ireneo-mat-11-27 / ireneo-doctrina-sec38-mat-11-27, aunque el argumento especifico es distinto (refutacion de otro subgrupo gnostico). |
| Ireneo — Contra las Herejías | `ireneo-doctrina-sec50-mat-7-7` | Mateo 7:7 | Solapa tematica con ireneo-doctrina-sec45-mat-7-7 y ireneo-doctrina-sec62-mat-7-7 (mismo verso, mismo hilo argumental repetido tres veces). |
| Ireneo — Contra las Herejías | `ireneo-doctrina-sec62-mat-7-7` | Mateo 7:7 | Solapa tematica con ireneo-doctrina-sec45-mat-7-7 y ireneo-doctrina-sec50-mat-7-7 (mismo verso, mismo hilo argumental repetido tres veces). |
| Ireneo — Contra las Herejías | `ireneo-doctrina-sec64-mat-13-43` | Mateo 13:43 | Parte del mismo argumento etico que ireneo-moral-sermon-monte / sec64-mat-5-21, con un ancla de verso distinta. |

## Próximo paso sugerido

1. Juan revisa sobre todo el bloque de prioridad ALTA (posibles errores de anclaje) — son los únicos que podrían requerir corregir o quitar un enlace verso-por-verso, no solo etiquetarlo.
2. Decidir si las citas numéricas de Ireneo (categoría especial) necesitan una tercera etiqueta propia (ej. `polemica-numerica`) en vez de forzarlas a narrativa/referencial.
3. Decidir en frontend cómo mostrar `connection_type` (filtro, color, icono) — fuera de alcance de esta revisión.
4. Una vez aprobado, fusionar `connection_type` dentro de los archivos reales de `biblia/modules/commentaries/*/books/*.json` y comitear.

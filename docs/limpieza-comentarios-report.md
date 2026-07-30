# Limpieza de comentarios ingleses para traducción en vivo

Fecha de inicio: 2026-07-30

## Alcance e invariantes

La limpieza se limita al texto de `content`. No se modifica `id` (identificador
fuente equivalente al `rawId` en estos módulos), `reference`, títulos, autores,
índices ni manifiestos. Antes y después de cada módulo se comparan:

- cantidad de archivos y entradas;
- secuencia completa de identificadores;
- representación JSON exacta de cada `reference`;
- campos ajenos a `content`.

Las referencias bíblicas con capítulos en números romanos se conservan. Los
romanos solo se convierten cuando aparecen inmediatamente después de un rótulo
narrativo explícito y con mayúscula (`Book`, `Chapter`, `Part`, `Section`,
`Volume` o `Vol.`), sin saltos de línea. Los casos dudosos no se tocan.

## Inventario de comentarios

Los comentarios ingleses activos son Matthew Henry, JFB, K&D, Scofield, Wesley,
Barnes, Clarke, Calvin y Cambridge. Cambridge ya incluye Romanos, Efesios,
Filipenses, Colosenses, 1–2 Tesalonicenses y Filemón. Por ampliación expresa del
alcance, esta ejecución cubre los nueve módulos. TSK queda fuera: no es cuerpo
de comentario traducible sino el sistema estructural de referencias cruzadas.

## Fase 1 — Matthew Henry

Base auditada: 66 archivos de contenido y 4.599 entradas.

### Hallazgos

| Tipo | Instancias aproximadas | Entradas afectadas |
|---|---:|---:|
| Secuencias de espacios/saltos de línea de maquetación OCR | 725.669 | 4.599 |
| Entidades `&nbsp;` usadas como separación visual | 26.995 | 3.536 |
| Dobles guiones usados como raya tipográfica | 7.787 | 2.522 |
| Párrafos HTML vacíos | 66 | 66 |
| Espacios OCR antes de puntuación | 10 | 9 |
| Numerales romanos narrativos inequívocos | 1 | 1 |
| Marca numerada posiblemente editorial | 1 | 1 |
| Controles, mojibake, caracteres privados, reemplazos o ligaduras Unicode | 0 | 0 |
| Candidatos a referencia bíblica en romanos | ≈29.500 | convertir a arábigos por decisión editorial |

### Ejemplos antes de limpiar

#### Espaciado y saltos OCR

1. `GEN intro`: `<BR>\n <p>Genesis</p>\n\n ...`
2. `GEN 1:0`: `<BR><b>G E N E S I S</b>\n <BR>\n <BR>CHAP. I.`
3. `GEN 1:1`: `God created the\n heaven and the earth.`
4. `GEN 1:3`: `Let there be\n light: and there was light.`
5. `GEN 1:14`: `let there be \n lights in the firmament`
6. `GEN 1:20`: `fowl <i>that may fly</i>\n above the earth`
7. `GEN 1:24`: `the earth \n bring forth the living creature`
8. `GEN 1:26`: `make man \n in our image`

#### Entidades de espacio

1. `1CH 1:0`: `F I R S T &nbsp; C H R O N I C L E S`
2. `1CH 1:1`: `Adam, Sheth, Enosh, &nbsp; 2 Kenan`
3. `GEN 1:1`: `earth. &nbsp; 2 And the earth`
4. `GEN 1:3`: `there was light. &nbsp; 4 And God`
5. `GEN 1:6`: `from the waters. &nbsp; 7 And God`
6. `GEN 1:9`: `it was so. &nbsp; 10 And God`
7. `GEN 1:14`: `and years: &nbsp; 15 And let`
8. `GEN 1:20`: `firmament of heaven. &nbsp; 21 And God`

#### Dobles guiones

1. `GEN intro`: `four thousand years--the truths then revealed`
2. `GEN 1:0`: `creation of the world--in answer`
3. `GEN 1:1`: `four things:--`
4. `GEN 1:3`: `dictum, factum--a word, and a world`
5. `1CH intro`: `words of days--journals or annals`
6. `1CH 1:5`: `vestigia nulla retrorsum--none can retrace`
7. `1CH 2:1`: `Jacob have I loved--not of works`
8. `1CH 7:6`: `Beriah--in trouble`

#### Párrafos vacíos

Los 66 libros contienen en su introducción la secuencia
`<p>EXPOSITION,</p><p></p><p>OF THE ...</p>`. Ejemplos: `GEN intro`,
`EXO intro`, `LEV intro`, `NUM intro`, `DEU intro`, `JOS intro`,
`JDG intro`, `RUT intro`, `1SA intro` y `2SA intro`.

#### Espacios antes de puntuación

1. `ACT 13:14`: `warnings ; what we are told`
2. `DAN 3:8`: `stand before envy ?`
3. `DEU 30:1`: `possess it is , though`
4. `DEU 33:2`: `mountains, but because , like`
5. `JOB 42:0`: `which, I confess , have`
6. `PSA 144:0`: `advancing him to the government ,`
7. `PSA 145:0`: `(ver . 3)`
8. `ISA 41:1`: `before the time" ;`
9. `GEN 1:20`: `Job xli. :1`

#### Numerales romanos

- Narrativo inequívoco: `The apocryphal Esdras (or Ezra), Book I.`
- Referencias detectadas: `Phil. iii. 1`, `Ezra vii. 6`,
  `2 Chron. v. 9`, `Gen. xxv.`, `Rom. iv. 11, 12`,
  `Luke iii. 34-38`, `Job xli. :1`.
- Enumeraciones y casos contextuales detectados:
  `I. The company...`, `II. The solemn fast...`, `CHAP. I.`.

La marca `(5)` de `mh-mic-5-1` puede ser una enumeración editorial legítima y
se conserva.

## Fase 2 — Reglas para Matthew Henry

1. Convertir `&nbsp;` y `&#160;` en espacios normales.
2. Eliminar párrafos que estén realmente vacíos.
3. Colapsar espacios, tabulaciones y saltos de línea consecutivos a un espacio,
   conservando todas las etiquetas HTML y sus atributos.
4. Retirar espacios situados antes de `, . ! ? ; :`.
5. Convertir `--` en raya tipográfica `—`, con un solo espacio a cada lado.
6. Convertir todos los numerales romanos reconocibles a arábigos, incluidas
   citas bíblicas, capítulos, libros, partes y enumeraciones. No convertir la
   letra inglesa `I` cuando funciona como pronombre ni palabras ordinarias
   compuestas por letras que también existen en el sistema romano.
7. No corregir ortografía, sintaxis, nombres, doctrina, citas ni palabras
   arcaicas.
8. Aplicar las transformaciones únicamente a `content` y abortar si cambia
   cualquier invariante estructural.

## Resultados por módulo

### Matthew Henry

- Archivos: 66.
- Entradas verificadas: 4.599.
- Entradas con limpieza: 4.599.
- Se eliminaron los saltos/espacios OCR, 26.995 espacios HTML, 66 párrafos
  vacíos y 7.783 dobles guiones íntegramente contenidos en nodos de texto.
- Se corrigieron 10 espacios antes de puntuación.
- En la primera pasada se convirtió `Book I` → `Book 1`; una segunda pasada
  modificó 4.512 entradas y cubrió también las referencias y enumeraciones
  romanas por decisión editorial.
- Permanecen cuatro secuencias `--` que cruzan etiquetas HTML; se conservaron
  para no alterar límites de marcado.
- Las referencias bíblicas romanas se convierten a números arábigos sin tocar
  los campos estructurales de enlace.
- Identificadores, referencias y campos ajenos a `content`: sin cambios.

### JFB

Auditoría previa: 66 archivos y 16.945 entradas. Se detectaron 35.786 dobles
guiones, 6.312 espacios antes de puntuación, 8 rótulos narrativos romanos y
6 candidatos de cita romana. No aparecieron controles, mojibake, caracteres de
reemplazo, ligaduras ni entidades de espacio. Ejemplos: `Part I`,
`Part II begins here`, `John II`, `word--as`, `grace ; and`.

Reglas: aplicar las reglas base de formato y conversión de romanos. No
reescribir el inglés ni modificar contenido doctrinal.

Resultado: 15.272 entradas limpiadas en 66 archivos; segunda comprobación con
cero cambios. Identificadores, referencias y demás campos: sin cambios.

### K&D

Auditoría previa: 39 archivos y 8.806 entradas. Se detectaron 3.629 bloques de
espaciado, 28.681 espacios antes de puntuación, 59.248 comillas tipográficas,
137 variantes de raya, una elipsis Unicode, 2 rótulos narrativos y al menos
36 citas/capítulos romanos. Un carácter privado OCR aparecía como
`H \uF895 sban`; por contexto inequívoco se normaliza a `Hesban`.

Ejemplos: `ch. xiii. 4`, `ch. ii. 3-7`, `Part II`, `Part I`, comillas `“...”`
y `Seetzen ; Burckhardt`. Reglas particulares: comillas a ASCII, variantes de
guion a formas estándar, elipsis a tres puntos y reparación puntual de
`Hesban`; sin correcciones de redacción.

Resultado: 7.972 entradas en la pasada principal y 12 ajustes convergentes en
la segunda; comprobación final con cero cambios. Estructura e identificadores:
sin cambios.

### Wesley

Auditoría previa: 1.156 archivos y 16.774 entradas. Se detectaron 116 bloques
de espaciado, 3.757 espacios antes de puntuación, 5 encabezados narrativos y
11 candidatos de cita romana; sin controles, mojibake, reemplazos, ligaduras
ni comillas tipográficas. Ejemplos: `Chapter XC`, `Chapter CXXXVII`,
`Matthew or Mark; and St. John`, `duty . Chapter`.

Reglas: formato base y conversión de romanos; sin reescribir el inglés.

Resultado: 2.806 entradas limpiadas en 791 archivos; comprobación final en
cero. Estructura e identificadores: sin cambios.

### Cambridge

Auditoría previa de lo actualmente publicado: 7 archivos y 108 entradas
(Romanos, Efesios, Filipenses, Colosenses, 1–2 Tesalonicenses y Filemón).
Se detectaron 5 dobles guiones, 16 comillas tipográficas, 2.226 rayas,
13 rótulos narrativos, 389 referencias `ch.` y al menos 611 referencias de
libro con numeración romana. Ejemplos: `Acts xix. 21`, `Romans i. 1-7`,
`ch. X. 3`, `Chapter XII`, `Session VI_ ch. ix.`.

No se detectaron controles, caracteres de reemplazo ni privados. Se conservan
griego, transliteraciones y signos filológicos legítimos aunque sean poco
comunes; corregirlos exigiría reconstrucción editorial, fuera de la limpieza
de formato. Reglas: formato base, comillas/guiones estándar y romanos a
arábigos, sin reescribir el contenido.

Resultado: las 108 entradas existentes se limpiaron en los 7 archivos;
comprobación final en cero. Estructura e identificadores: sin cambios.

## Verificación global de citas abreviadas

La búsqueda transversal posterior detectó romanos residuales en referencias
abreviadas que no repetían el nombre del libro, por ejemplo `Ps. cxxiv. 8`,
`John ix. 5`, `Ant. xvii. 10` y `(vi. 17)`. Se añadió una regla estricta:
convertir un token romano minúsculo únicamente cuando va seguido por
puntuación de cita y un número o rango. Así se evitan falsos positivos en
palabras latinas reales como `mi` y `dii`.

Entradas previstas para esta segunda pasada: Matthew Henry 2.150; JFB 11; K&D
916; Wesley 345; Scofield 18; Barnes 214; Clarke 449; Calvin 16; Cambridge 105.

### Calvin

Auditoría previa: 42 archivos y 10.888 entradas. Se detectaron 8.330 bloques
de espaciado, 22.017 espacios antes de puntuación, 46.158 comillas
tipográficas, 11.135 rayas y 6 dobles guiones; sin controles, mojibake,
reemplazos ni ligaduras. Hay referencias y rótulos romanos, por ejemplo
`Book II., chap. 13`. Reglas: normalizar comillas/guiones, espaciado y romanos,
sin modernizar vocabulario ni redacción.

Resultado: 9.308 entradas limpiadas en 42 archivos; comprobación final en
cero. Estructura e identificadores: sin cambios.

### Scofield

Auditoría previa: 66 archivos y 3.214 entradas. Se detectaron 176 dobles
guiones, 2.300 espacios antes de puntuación, 2 comillas tipográficas y un
rótulo romano (`Part III`); sin controles, mojibake, reemplazos ni ligaduras.
Reglas: formato base, comillas estándar y conversión de romanos; sin cambios
de redacción o doctrina.

Resultado: 2.303 entradas limpiadas en 66 archivos; comprobación final en
cero. Estructura e identificadores: sin cambios.

### Barnes

Auditoría previa: 27 archivos y 7.457 entradas. Es el segundo módulo con mayor
daño OCR: 11.680 dobles guiones, 52.856 espacios antes de puntuación, 98
controles (`0x14`/`0x15`) y 68 caracteres de reemplazo. También hay 19
referencias `ch./chap.` romanas y numerosos libros/capítulos romanos.

Ejemplos: `chap. iv. § 5`, `book vi.`, `30� 50' north`, `�342`,
`Kuin�el`, `occurrence o� frequent`, `�rom what he is`, `7� gallons`.
Reglas particulares: controles a raya o signo de sección según su función;
grados a `°`, libras a `£`, `7� gallons` a `7.5 gallons`, nombre OCR a
`Kuinoel` y letras evidentemente perdidas (`o�` → `of`, `�rom` → `from`).
No se reconstruyen palabras cuando el contexto no sea inequívoco.

Resultado: 6.604 entradas limpiadas en 27 archivos; quedaron cero controles y
cero caracteres de reemplazo. Comprobación final en cero; estructura e
identificadores sin cambios.

### Clarke

Auditoría previa: 66 archivos y 21.051 entradas. Se detectaron 1.132 espacios
antes de puntuación, 20 rótulos narrativos, 45 referencias `cap./ch.` y otros
candidatos romanos; sin controles, mojibake, reemplazos ni ligaduras.
Ejemplos: `Part I`, `cap. lxiv.`, `lib. ii., cap. ix.` y `chap. xii.`.
Reglas: formato base y conversión de romanos; sin cambios de redacción.

Resultado: 1.472 entradas limpiadas en 65 archivos; comprobación final en
cero. Estructura e identificadores: sin cambios.

# Licencias — Mapas bíblicos

## Fuente usada en el sitio: `churchmaps/`

**Creador original:** [churchmaps.info](https://churchmaps.info) — 4 mapas base (mundo antiguo/patriarcas,
éxodo y conquista de Canaán, Palestina en tiempos de Jesús, viajes de Pablo), disponibles en inglés, ruso
y ucraniano. Licencia declarada por el propio sitio: "All the maps are released entirely into public
domain and may be freely used, modified, or redistributed along with their source files."

**Distribuidor usado para las 14 imágenes cargadas al repo:**
[FreeBibleimages.org](https://www.freebibleimages.org/illustrations/church-maps/) — recortó los 4 mapas
de churchmaps.info en 14 escenas individuales con nombre propio (más una lámina de créditos, no cargada),
y las redistribuye bajo licencia **CC0 1.0 Universal (Public Domain Dedication)**, confirmada en su propia
página: "These maps were created by churchmaps.info and placed in the public domain. FreeBibleimages make
these maps available under a CC0 1.0 Universal (CC0 1.0) Public Domain Dedication license."

CC0 permite uso comercial, modificación y redistribución sin necesidad de atribución obligatoria — se
mantiene la mención a ambas fuentes en el panel "Fuentes y licencias" de Verbo como reconocimiento, no
como requisito legal.

**Idioma:** los rótulos de los mapas (nombres de lugares, títulos, leyendas) están únicamente en inglés.
No existe versión en español en ninguna de las dos fuentes. Decisión de Juan (2026-07-28): publicar así
por ahora; traducir el SVG fuente queda pendiente para una fase posterior si se decide abordarlo.

**Archivos cargados al repo** (`biblia/assets/maps/churchmaps/`):
- `full/01.jpg` … `full/14.jpg` — imagen completa de cada escena, 1024×768px, JPEG.
- `thumb/01.jpg` … `thumb/14.jpg` — miniatura de cada escena para la galería del panel.
- Descargados directamente de `media.freebibleimages.org/stories/FB_Church_Maps/`.

No se cargó la lámina 15 del set original (es una diapositiva de créditos/atribución, no un mapa).

## Fuente descartada: unfoldingWord / Door43 (`en_ubm`, "Unlocked Bible Maps")

Revisado el 2026-07-28: el repositorio `unfoldingWord/en_ubm` en git.door43.org declara licencia
**CC BY-SA 4.0** en su `manifest.yaml`, pero solo contiene `README.md`, `LICENSE.md` y `manifest.yaml` —
la carpeta `./content` que el manifest referencia como ubicación de los mapas **no existe** en el
repositorio. Es un proyecto abandonado en estado de esqueleto desde 2017 (último commit: "Added initial
manifest.yaml file"), sin un solo archivo de mapa real. No se usó como fuente por instrucción explícita:
"si solo hay prototipos o el proyecto está incompleto, ignorarlo por ahora".

## Alta resolución / fuente vectorial (no cargada al repo)

churchmaps.info también publica cada uno de sus 4 mapas base en PNG de máxima resolución (7000–10000px) y
en un `.zip` de "sources" que contiene el archivo **SVG editable** (confirmado inspeccionando
`Map_Paul_Journeys.zip`: incluye `Map_Paul_Journeys.svg` + un PNG de relieve enlazado). Combinados, los 4
PNG de máxima resolución y los 4 ZIP de fuentes pesan ~257MB — decisión de Juan (2026-07-28): no
comitearlos al repo para no inflar permanentemente su tamaño. Si en el futuro se necesita máxima
resolución (ej. para imprimir), pueden volver a descargarse directamente de churchmaps.info bajo demanda:

- `https://churchmaps.info/maps/Map_Ancient_World_Patriarchs/Map_Ancient_World_Patriarchs_150dpi_10000x7200_eng.png`
- `https://churchmaps.info/maps/Map_Exodus_and_Canaan_Conquest/Map_Exodus_and_Canaan_Conquest_eng.png`
- `https://churchmaps.info/maps/Map_Palestine_New_Testament/Map_Palestine_New_Testament_225dpi_7000x10000_eng.png`
- `https://churchmaps.info/maps/Map_Paul_Journeys/Map_Paul_Journeys_eng.png`
- Fuentes SVG: mismo directorio, archivo `<Nombre>.zip` ("Download sources" en el sitio).

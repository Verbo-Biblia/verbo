# Revisión editorial Strong

## Progreso

- Génesis 1: completado. Sus 396 asociaciones están en estado
  `editorial-reviewed` y no quedan grupos STEPBible pendientes sin una decisión.
- Génesis 2: completado. Sus 310 asociaciones están en estado
  `editorial-reviewed` y no quedan grupos STEPBible pendientes sin una decisión.

Cada CSV corresponde a un libro de RV2026+ y puede abrirse en Excel o LibreOffice.

## Columnas que completa el revisor

- `reviewer`: nombre o iniciales.
- `decision`: `approve`, `reject` o `correct`.
- `corrected_strong`: código correcto cuando la decisión sea `correct`.
- `notes`: explicación breve cuando sea útil.

`verified-open` identifica asociaciones reproducibles solo con RV2026 y STEPBible. `provisional-reference` identifica ubicaciones sugeridas por otra versión y confirmadas únicamente a nivel de código por versículo; estas requieren prioridad de revisión.

`cross-verified-open` identifica asociaciones confirmadas además por una relación
palabra–código inequívoca, observada repetidamente en datos `verified-open`. Se genera
con `tools/promote_strong_evidence.py`; no se presenta como revisión humana.

No se debe modificar `reference`, `verse_text`, `word`, `strong`, `morphology`, `step_gloss`, `status` ni `confidence`, porque permiten importar después las decisiones de forma reproducible.

`row_id`, `segment_index` y `code_index` identifican de forma inequívoca cada asociación. Tampoco deben editarse. El importador rechazará el CSV si el módulo cambió después de exportarlo.

## Validar o aplicar decisiones

Validar sin escribir archivos:

```bash
python3 tools/import_strong_review.py review/strong/GEN.csv
```

Generar una copia revisada del libro:

```bash
python3 tools/import_strong_review.py review/strong/GEN.csv --output /tmp/GEN.reviewed.json
```

El importador exige `reviewer` para toda decisión, acepta solamente `approve`, `reject` o `correct`, y verifica que cualquier `corrected_strong` exista en el diccionario instalado.

## Asociaciones faltantes

El flujo separado de adiciones compara el módulo contra STEPBible y exporta los grupos todavía no asociados:

```bash
python3 tools/export_strong_additions.py GEN
python3 tools/import_strong_additions.py review/strong/GEN-additions.csv
```

En esos CSV, `decision` acepta `add` o `skip`. `add` exige indicar el `target_segment_index` de la palabra española; `skip` documenta que el elemento hebreo o griego no tiene equivalente explícito en la traducción. Para generar una copia revisada se usa también `--output`.

Para encadenar decisiones sobre asociaciones existentes y adiciones sin modificar la línea base provisional:

```bash
python3 tools/import_strong_review.py review/strong/GEN.csv --output /tmp/GEN.reviewed.json
python3 tools/import_strong_additions.py review/strong/GEN-additions.csv --input /tmp/GEN.reviewed.json --output /tmp/GEN.complete.json
```

# Revisión editorial Strong

Cada CSV corresponde a un libro de RV2026+ y puede abrirse en Excel o LibreOffice.

## Columnas que completa el revisor

- `reviewer`: nombre o iniciales.
- `decision`: `approve`, `reject` o `correct`.
- `corrected_strong`: código correcto cuando la decisión sea `correct`.
- `notes`: explicación breve cuando sea útil.

`verified-open` identifica asociaciones reproducibles solo con RV2026 y STEPBible. `provisional-reference` identifica ubicaciones sugeridas por otra versión y confirmadas únicamente a nivel de código por versículo; estas requieren prioridad de revisión.

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

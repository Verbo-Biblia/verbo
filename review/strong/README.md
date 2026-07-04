# Revisión editorial Strong

Cada CSV corresponde a un libro de RV2026+ y puede abrirse en Excel o LibreOffice.

## Columnas que completa el revisor

- `reviewer`: nombre o iniciales.
- `decision`: `approve`, `reject` o `correct`.
- `corrected_strong`: código correcto cuando la decisión sea `correct`.
- `notes`: explicación breve cuando sea útil.

`verified-open` identifica asociaciones reproducibles solo con RV2026 y STEPBible. `provisional-reference` identifica ubicaciones sugeridas por otra versión y confirmadas únicamente a nivel de código por versículo; estas requieren prioridad de revisión.

No se debe modificar `reference`, `verse_text`, `word`, `strong`, `morphology`, `step_gloss`, `status` ni `confidence`, porque permiten importar después las decisiones de forma reproducible.

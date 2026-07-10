# Revision editorial de arcaismos

Flujo recomendado:

1. Exportar un lote revisable:

```bash
python3 tools/export_archaism_review.py --testament NT --profile nt --output review/archaisms/nt-lote-001.csv
python3 tools/export_archaism_review.py --testament OT --profile ot --output review/archaisms/ot-lote-001.csv
```

2. Revisar el CSV y completar solo estas columnas:

- `reviewer`
- `decision`
- `replacement`
- `notes`

Decisiones aceptadas:

- `approve`: usa `replacement` si existe; si no, usa `suggestion`.
- `replace`, `custom` o `correct`: exige `replacement`.
- `skip`, `keep` o `no`: conserva el texto.

3. Validar sin escribir:

```bash
python3 tools/import_archaism_review.py review/archaisms/nt-lote-001.csv --dry-run
```

4. Aplicar a una copia del modulo:

```bash
python3 tools/import_archaism_review.py review/archaisms/nt-lote-001.csv --output /tmp/rv-verbo-reviewed
```

No aplicar reemplazos globales sin CSV revisado. El `row_id` protege contra aplicar
decisiones a un texto que ya cambio.

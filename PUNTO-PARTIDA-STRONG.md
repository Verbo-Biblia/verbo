# Punto de partida — revisión Strong RV2026 (2026-07-05)

## Objetivo vigente

Completar de forma reproducible y rigurosa la revisión de códigos Strong para toda
la Biblia RV2026: asociaciones existentes, omisiones, validación y publicación
únicamente de datos suficientemente precisos.

Prioridad: precisión sobre cobertura. Una asociación dudosa debe quedar pendiente
o rechazarse; no debe publicarse como verificada.

## Estado del repositorio

- HEAD al cerrar: `5360870` (`content: revisar Strong de Génesis 1:4`).
- No se hizo commit durante la sesión del 5 de julio.
- El árbol de trabajo contiene cambios de esta revisión y otros archivos locales
  previos. No limpiar, restaurar ni borrar cambios en bloque.
- Módulo trabajado:
  `modules/bibles/rv-verbo-strong-provisional/`.
- Cobertura estructural del módulo: 66 libros y 31.084 versículos.

## Trabajo completado

- Se añadió el método de evidencia `cross-verified-open`.
- Se promovieron conservadoramente 8.254 asociaciones mediante evidencia cruzada.
- Se añadieron herramientas reproducibles:
  - `tools/audit_strong_bible.py`
  - `tools/promote_strong_evidence.py`
  - `tools/mark_strong_review.py`
  - `tools/mark_strong_additions.py`
- Se actualizaron los exportadores para conservar decisiones anteriores:
  - `tools/export_strong_review.py`
  - `tools/export_strong_additions.py`
- Se corrigió en el exportador de omisiones el orden del conteo de decisiones
  `skip`.
- Se actualizaron las instrucciones en:
  - `modules/bibles/rv-verbo-strong-provisional/README.md`
  - `review/strong/README.md`
- Génesis 1 está cerrado: 396 asociaciones revisadas editorialmente, cero
  provisionales y cero omisiones pendientes.
- Génesis 2 está cerrado: 310 asociaciones revisadas editorialmente, cero
  provisionales y cero omisiones pendientes.
- Génesis 3 está cerrado: asociaciones existentes y omisiones revisadas,
  reasignaciones aplicadas y cero errores de auditoría.
- Génesis 4 está cerrado: asociaciones existentes y omisiones revisadas,
  reasignaciones aplicadas y cero errores de auditoría.

Última auditoría completa aprobada, después de cerrar Génesis 4:

- 342.983 asociaciones totales.
- 1.345 `editorial-reviewed`.
- 274.096 provisionales.
- 59.294 `verified-open`.
- 8.248 `cross-verified-open`.
- Cero errores de auditoría.

## Punto exacto de pausa: Génesis 5:1

En Génesis 3:16-24 se revisaron 117 asociaciones existentes. Se rechazaron y
reasignaron cuatro enlaces desplazados: H859 a `vuelvas` (3:19), H1931 a `ella`
(3:20), H430 sin equivalente explícito en 3:23 y H2015 a `revolvía` (3:24).
También se resolvieron todas las omisiones detectadas en esos versículos.

`tools/mark_strong_review.py` admite ahora `--reject` para registrar rechazos por
`row_id` antes de aprobar el resto de un lote. El script compila y fue usado en
los dos últimos lotes.

Génesis 4:1-5 también quedó cerrado. H1931 se retiró del posesivo `sus` y se
reasignó a `también` en 4:4; H1060 se añadió a `primogénitos`; H413 se añadió a
la primera `a` de 4:5. Cuatro marcadores H853 se registraron como `skip`.

Génesis 4:6-10 quedó cerrado. H859 se retiró de `ti` y se reasignó a `tú` en
4:7. Se añadieron seis asociaciones explícitas y se descartaron H7257, H1980 y
la primera aparición de H7704 en 4:8 porque su cláusula no aparece en español.

Génesis 4:11-15 quedó cerrado. H859 se reasignó de `seas` a `tú` en 4:11. Se
añadieron ocho asociaciones explícitas, incluidos los pronombres de H853 con
sufijo en 4:14 y 4:15; tres H853 sin equivalente léxico se marcaron `skip`.

Génesis 4:16-20 quedó cerrado. Se aprobaron 54 asociaciones existentes y se
marcaron ocho omisiones como `skip`: siete marcadores H853 sin equivalente
léxico independiente y H1961 en 4:17 como auxiliar/aspecto incluido en
`edificó`.

Génesis 4:21-26 quedó cerrado. H1931 se retiró del posesivo `su` en 4:21 y se
reasignó a `cual` en la cláusula `el cual fue padre`. Se añadieron siete
asociaciones explícitas (`acicalador`, `obra`, dos componentes compuestos de
`Tubal-Caín`, `oigan`, `escuchen`, `llamarse`) y cinco omisiones se marcaron
como `skip`.

## Reanudación exacta

Revisar editorialmente Génesis 5:1 en adelante. Para regenerar los archivos de trabajo
sin perder decisiones anteriores:

```bash
python3 tools/export_strong_review.py GEN --output /tmp/GEN-review-next.csv \
  --preserve-decisions-from review/strong/GEN.csv
python3 tools/export_strong_additions.py GEN --output /tmp/GEN-additions-next.csv \
  --preserve-decisions-from review/strong/GEN-additions.csv
```

No hay un lote parcialmente aplicado. Génesis 1-4 están cerrados en el módulo y
en los CSV de revisión.

## Archivos con cambios propios de esta revisión

- Los 66 JSON de libros del módulo provisional y su `manifest.json`, por las
  promociones de evidencia.
- `modules/bibles/rv-verbo-strong-provisional/README.md`.
- `review/strong/GEN.csv`.
- `review/strong/GEN-additions.csv`.
- `review/strong/README.md`.
- Las seis herramientas de auditoría, promoción, marcado y exportación indicadas
  arriba.

No publicar todavía el módulo provisional como Biblia terminada: la mayor parte
de las asociaciones continúa pendiente de revisión editorial.

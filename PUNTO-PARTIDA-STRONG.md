# Punto de partida — Strong (2026-07-04)

## Completado y publicado

- Commit estable: `0ba090f` (`content: añadir KJV con códigos Strong`).
- Módulo: `modules/bibles/kjv-strong/`.
- Fuente: KJV 3.1 de CrossWire, ubicada en `Archivos Verbo/con strong/KJV/`.
- Licencia: GPL; CrossWire concede licencia pública general para usar el texto y etiquetado para cualquier propósito.
- Conversor reproducible: `tools/sword_ztext_to_verbo.py`.
- Validación: 66 libros, 31.102 versículos, todos con Strong, 367.052 asociaciones.
- 14.074 códigos únicos; ninguno falta en `modules/dictionaries/strong-verbo/`.
- KJV+ está registrada en `modules/registry.json` y publicada en la web.

## Decisiones vigentes

- RVG no se usa porque no hubo autorización escrita de Humberto Gómez.
- RV2026 deriva de RV1909 de dominio público y será la base de la futura versión española Strong.
- No copiar el etiquetado de SpaRV1909 a producción sin permiso de Rubén Gómez (`rubeng@infotelecom.es`): el módulo solo declara permiso de distribución para CrossWire.
- Los datos STEPBible son CC BY 4.0, pero el prototipo de alineación automática produjo asociaciones erróneas en el AT. No publicar aproximaciones.
- Prioridad: precisión sobre cobertura; una palabra dudosa debe quedar sin código.

## Trabajo descartado/no publicado

- El módulo generado `modules/bibles/rv-verbo-strong/` fue eliminado por precisión insuficiente.
- `tools/build_rv_verbo_strong.py` quedó local y sin comitear como borrador experimental. No ejecutarlo para producción sin rediseñar y validar el alineador.

## Siguiente paso

1. Verificar KJV+ en la web: selector, Génesis 1:1, Juan 3:16 y apertura del diccionario al pulsar códigos H/G.
2. Para RV2026+ elegir una fuente española alineada con permiso explícito, preferiblemente SpaRV1909 con autorización de Rubén Gómez.
3. Si se obtiene permiso, extraer SpaRV1909 conservando sus segmentos Strong y transferir únicamente coincidencias textuales seguras a RV2026.
4. Generar informe de cobertura y revisar muestras de todos los libros antes de registrar el módulo.

## Revisión adicional para la próxima sesión

- Auditar las definiciones españolas del diccionario Strong: Juan detecta traducciones extrañas o poco naturales.
- Comparar muestras hebreas y griegas contra la fuente inglesa antes de corregir el contenido.
- Añadir al panel del diccionario un selector ES/EN equivalente al de comentarios, conservando el texto inglés original como alternativa visible.

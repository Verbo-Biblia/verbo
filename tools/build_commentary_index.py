#!/usr/bin/env python3
"""Genera un índice liviano (id + reference, sin title/author/content) por
cada libro de los comentarios registrados en modules/registry.json, para que
buildChapterData() pueda calcular el badge "cuántos comentarios tienen nota
aquí" sin descargar el contenido completo (HTML) de los comentarios que no
están activos en el panel — mismo patrón que ya usa el diccionario Strong
(indexFile/entriesFile en assets/module-loader.js).

Se omiten los comentarios con "chapterSplit": true (ej. Wesley): ya están
divididos por capítulo, cada archivo es chico de por sí, no hace falta
indexarlos aparte.

Cada libro indexado gana un archivo companion "books/<ID>.index.json" y su
entrada en manifest.json → books[] gana el campo "indexFile" apuntando ahí.

Uso: python3 tools/build_commentary_index.py
Volver a correr este script cada vez que se agregue o traduzca un comentario
nuevo en modules/registry.json → commentaries, para que su índice quede
generado y declarado en el manifest.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "biblia" / "modules"
REGISTRY_PATH = ROOT / "registry.json"


def index_commentary(rel_path):
    manifest_path = ROOT / rel_path
    manifest_dir = manifest_path.parent
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("chapterSplit"):
        print(f"  omitido (chapterSplit): {manifest['id']}")
        return False
    changed = False
    total_before = 0
    total_after = 0
    for book in manifest.get("books", []):
        book_path = manifest_dir / book["file"]
        if not book_path.exists():
            continue
        book_data = json.loads(book_path.read_text(encoding="utf-8"))
        entries = book_data.get("entries", [])
        if not entries:
            continue
        stripped = [
            {"id": e.get("id"), "reference": e.get("reference")}
            for e in entries
            if e.get("id")
        ]
        index_file_name = book_path.stem + ".index.json"
        index_path = book_path.with_name(index_file_name)
        index_path.write_text(
            json.dumps({"entries": stripped}, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        book["indexFile"] = f"books/{index_file_name}"
        total_before += book_path.stat().st_size
        total_after += index_path.stat().st_size
        changed = True
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    kb_before, kb_after = total_before / 1024, total_after / 1024
    print(f"  {manifest['id']}: {kb_before:.0f}KB -> {kb_after:.0f}KB de índice (contenido completo sigue disponible en books/*.json)")
    return changed


def main():
    registry = json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
    print("Generando índices de comentarios...")
    any_changed = False
    for rel_path in registry.get("commentaries", []):
        if index_commentary(rel_path):
            any_changed = True
    if any_changed:
        print("\nListo. Correr también tools/build_registry_catalog.py para que registry.json->catalog quede con los manifests actualizados (indexFile).")


if __name__ == "__main__":
    main()

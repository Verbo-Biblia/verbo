#!/usr/bin/env python3
"""Audita la estructura de RV-Verbo y las referencias de comentarios activos."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CONTENT_ROOT = ROOT / "biblia" if (ROOT / "biblia" / "modules").is_dir() else ROOT
BIBLES = CONTENT_ROOT / "modules" / "bibles"
COMMENTARIES = CONTENT_ROOT / "modules" / "commentaries"
REGISTRY = CONTENT_ROOT / "modules" / "registry.json"

EXPECTED_GENERATED_ENTRIES = {
    "jfb": 16_945,
    "kd": 8_806,
    "scofield": 3_214,
    "wesley": 16_774,
    "tsk": 29_648,
}

FORBIDDEN_RV_VERBO = {
    "formas de vosotros": re.compile(r"\b(?:vosotros|vosotras|vuestro|vuestra|vuestros|vuestras|os)\b", re.I),
    "errores de conjugación conocidos": re.compile(
        r"\b(?:comencen|huieron|oieron|trajieron|pedieron|retenen|elegieron|"
        r"henchieron|resentieron|zaherieron|aparterán|encerran|calentan|sembran|"
        r"servieron|esperán|mirán|desamparán|prosperán)\b",
        re.I,
    ),
    "pronombre indirecto ante pronombre directo": re.compile(r"\bles\s+(?:lo|la|los|las)\b", re.I),
    "formas con mayúscula interna": re.compile(r"\b[A-Za-záéíóúñü]+[a-záéíóúñü]A[n-z]*\b"),
}

# Estos capítulos fueron corregidos deliberadamente de la numeración histórica
# de RV1909 a la versificación moderna que usa el lector.
MODERN_VERSE_CHAPTERS = {
    ("NUM", "12"),
    ("NUM", "29"),
    ("JOB", "35"),
    ("JOB", "38"),
    ("JOB", "40"),
}


def load_json(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"JSON inválido: {path.relative_to(ROOT)}: {exc}") from exc


def bible_chapters(module_id: str) -> dict[str, dict[str, dict[str, str]]]:
    result = {}
    for path in sorted((BIBLES / module_id / "books").glob("*.json")):
        result[path.stem] = load_json(path).get("chapters", {})
    return result


def audit_bible(errors: list[str]) -> None:
    source = bible_chapters("rva-1909")
    target = bible_chapters("rv-verbo")
    modern = bible_chapters("asv-1901")
    if set(source) != set(target):
        errors.append("RV-Verbo no contiene exactamente los mismos libros que RVA 1909")

    for book in sorted(set(source) & set(target)):
        source_chapters = source[book]
        target_chapters = target[book]
        if set(source_chapters) != set(target_chapters):
            errors.append(f"{book}: capítulos distintos de RVA 1909")
            continue
        for chapter, source_verses in source_chapters.items():
            target_verses = target_chapters[chapter]
            expected_verses = (
                modern.get(book, {}).get(chapter, {})
                if (book, chapter) in MODERN_VERSE_CHAPTERS
                else source_verses
            )
            if set(expected_verses) != set(target_verses):
                expected_name = "versificación moderna" if (book, chapter) in MODERN_VERSE_CHAPTERS else "RVA 1909"
                errors.append(f"{book} {chapter}: versículos distintos de {expected_name}")
                continue
            for verse, text in target_verses.items():
                ref = f"{book} {chapter}:{verse}"
                if not isinstance(text, str) or not text.strip():
                    errors.append(f"{ref}: texto vacío o no textual")
                    continue
                for label, pattern in FORBIDDEN_RV_VERBO.items():
                    match = pattern.search(text)
                    if match:
                        errors.append(f"{ref}: {label}: {match.group(0)!r}")


def build_verse_limits() -> dict[str, dict[int, int]]:
    limits = {}
    for book, chapters in bible_chapters("asv-1901").items():
        limits[book] = {
            int(chapter): max(map(int, verses))
            for chapter, verses in chapters.items()
        }
    # Los módulos bíblicos españoles usan NAM; los SWORD/KJV usan NAH.
    if "NAH" in limits:
        limits["NAM"] = limits["NAH"]
    return limits


def validate_reference(
    module_id: str,
    container_book: str,
    file_chapter: int | None,
    entry_id: str,
    reference: object,
    limits: dict[str, dict[int, int]],
    errors: list[str],
) -> None:
    where = f"{module_id}/{container_book}: {entry_id}"
    if not isinstance(reference, dict):
        errors.append(f"{where}: referencia ausente o inválida")
        return
    book = reference.get("book")
    if book != container_book:
        errors.append(f"{where}: referencia apunta a {book!r}")
        return
    try:
        cs = int(reference["chapterStart"])
        vs = int(reference["verseStart"])
        ce = int(reference.get("chapterEnd", cs))
        ve = int(reference.get("verseEnd", vs))
    except (KeyError, TypeError, ValueError):
        errors.append(f"{where}: coordenadas incompletas o no numéricas")
        return

    if cs == 0 and vs == 0 and ce == 0 and ve == 0:
        if file_chapter not in (None, 1):
            errors.append(f"{where}: introducción guardada en capítulo {file_chapter}")
        return
    if cs >= 1 and cs == ce and vs == 0 and ve == 0:
        if file_chapter is not None and cs != file_chapter:
            errors.append(f"{where}: está en archivo {file_chapter}, pero inicia en capítulo {cs}")
        if book not in limits or cs not in limits[book]:
            errors.append(f"{where}: libro o capítulo fuera de la versificación ASV/KJV")
        return
    if cs < 1 or ce < cs or vs < 1 or ve < 1:
        errors.append(f"{where}: intervalo inválido {cs}:{vs}-{ce}:{ve}")
        return
    if file_chapter is not None and cs != file_chapter:
        errors.append(f"{where}: está en archivo {file_chapter}, pero inicia en capítulo {cs}")
    if book not in limits or cs not in limits[book] or ce not in limits[book]:
        errors.append(f"{where}: libro o capítulo fuera de la versificación ASV/KJV")
        return
    if vs > limits[book][cs] or ve > limits[book][ce]:
        errors.append(f"{where}: versículo fuera de rango {cs}:{vs}-{ce}:{ve}")
    if cs == ce and ve < vs:
        errors.append(f"{where}: intervalo invertido {cs}:{vs}-{ce}:{ve}")


def audit_commentaries(errors: list[str]) -> None:
    registry = load_json(REGISTRY)
    active_paths = registry.get("commentaries", [])
    limits = build_verse_limits()
    seen_modules = set()

    for relative_manifest in active_paths:
        manifest_path = CONTENT_ROOT / "modules" / relative_manifest
        manifest = load_json(manifest_path)
        module_id = manifest.get("id")
        if not isinstance(module_id, str) or not module_id:
            errors.append(f"{relative_manifest}: id de módulo inválido")
            continue
        if module_id in seen_modules:
            errors.append(f"ID de comentario duplicado en registry: {module_id}")
        seen_modules.add(module_id)
        module_root = manifest_path.parent
        split = manifest.get("chapterSplit") is True
        manifest_books = manifest.get("books", [])
        expected_books = {
            item if isinstance(item, str) else item.get("id")
            for item in manifest_books
        }
        actual_books = set()
        seen_ids = set()
        entry_count = 0

        for path in sorted((module_root / "books").rglob("*.json")):
            if path.name.endswith(".index.json"):
                continue
            relative = path.relative_to(module_root / "books")
            container_book = relative.parts[0].removesuffix(".json")
            actual_books.add(container_book)
            file_chapter = int(path.stem) if split and path.stem.isdigit() else None
            payload = load_json(path)
            entries = payload.get("entries")
            if not isinstance(entries, list):
                errors.append(f"{module_id}/{relative}: falta lista entries")
                continue
            for entry in entries:
                entry_count += 1
                if not isinstance(entry, dict):
                    errors.append(f"{module_id}/{relative}: entrada no es objeto")
                    continue
                entry_id = entry.get("id")
                if not isinstance(entry_id, str) or not entry_id:
                    errors.append(f"{module_id}/{relative}: entrada sin id")
                    entry_id = "<sin-id>"
                elif entry_id in seen_ids:
                    errors.append(f"{module_id}: id duplicado {entry_id}")
                else:
                    seen_ids.add(entry_id)
                if not isinstance(entry.get("content"), str) or not entry["content"].strip():
                    errors.append(f"{module_id}/{relative}: {entry_id} sin contenido")
                validate_reference(
                    module_id,
                    container_book,
                    file_chapter,
                    entry_id,
                    entry.get("reference"),
                    limits,
                    errors,
                )

        if expected_books != actual_books:
            errors.append(
                f"{module_id}: libros del manifest no coinciden con books/ "
                f"(manifest={len(expected_books)}, archivos={len(actual_books)})"
            )
        expected_count = EXPECTED_GENERATED_ENTRIES.get(module_id)
        if expected_count is not None and entry_count != expected_count:
            errors.append(f"{module_id}: {entry_count} entradas; se esperaban {expected_count}")


def main() -> int:
    errors: list[str] = []
    try:
        audit_bible(errors)
        audit_commentaries(errors)
    except ValueError as exc:
        errors.append(str(exc))
    if errors:
        print(f"AUDITORÍA FALLIDA: {len(errors)} error(es)", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1
    print("AUDITORÍA OK: RV-Verbo y comentarios activos son estructuralmente coherentes.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

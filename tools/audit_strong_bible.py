#!/usr/bin/env python3
"""Audita integralmente un módulo bíblico con asociaciones Strong."""
from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MODULE = ROOT / "modules/bibles/rv-verbo-strong-provisional"
CODE = re.compile(r"^[GH][1-9]\d{0,4}$")
ALLOWED_STATUSES = {
    "verified-open", "cross-verified-open", "provisional-reference", "editorial-reviewed",
}


def load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def segment_codes(segment: dict) -> list[str]:
    return list(segment.get("strongs") or
                ([segment["strong"]] if segment.get("strong") else []))


def dictionary_codes() -> set[str]:
    base = ROOT / "modules/dictionaries/strong-verbo"
    manifest = load(base / "manifest.json")
    result: set[str] = set()
    for relative in manifest["entryFiles"].values():
        payload = load(base / relative)
        result.update((payload.get("entries") or payload).keys())
    return result


def audit(module: Path) -> tuple[dict, list[str]]:
    manifest = load(module / "manifest.json")
    valid_codes = dictionary_codes()
    totals = Counter()
    books: dict[str, dict] = {}
    errors: list[str] = []
    seen_books: set[str] = set()

    for book in manifest.get("books", []):
        book_id = book.get("id", "")
        if not book_id or book_id in seen_books:
            errors.append(f"ID de libro inválido o duplicado: {book_id!r}")
            continue
        seen_books.add(book_id)
        path = module / book["file"]
        if not path.is_file():
            errors.append(f"{book_id}: falta {book['file']}")
            continue
        payload = load(path)
        stats = Counter()
        if payload.get("book") != book_id:
            errors.append(f"{book_id}: el campo book no coincide")
        for chapter, verses in payload.get("chapters", {}).items():
            for verse, record in verses.items():
                reference = f"{book_id} {chapter}:{verse}"
                stats["verses"] += 1
                actual: set[str] = set()
                for index, segment in enumerate(record.get("segments", [])):
                    codes = segment_codes(segment)
                    if not codes:
                        continue
                    stats["taggedSegments"] += 1
                    meta = segment.get("strongMeta") or {}
                    status = meta.get("status", "missing")
                    stats[f"status:{status}"] += len(codes)
                    if status not in ALLOWED_STATUSES:
                        errors.append(f"{reference} segmento {index}: estado {status!r}")
                    for code in codes:
                        stats["associations"] += 1
                        actual.add(code)
                        if not CODE.fullmatch(code):
                            errors.append(f"{reference} segmento {index}: código inválido {code!r}")
                        elif code not in valid_codes:
                            errors.append(f"{reference} segmento {index}: {code} no existe en diccionario")
                expected = set(record.get("strongs", []))
                if expected != actual:
                    errors.append(f"{reference}: índice strongs no coincide con segmentos")
                if actual:
                    stats["taggedVerses"] += 1
        books[book_id] = dict(stats)
        totals.update(stats)

    if len(seen_books) != 66:
        errors.append(f"Se esperaban 66 libros; se encontraron {len(seen_books)}")
    report = {
        "module": manifest.get("id"),
        "books": len(seen_books),
        "totals": dict(totals),
        "valid": not errors,
        "errorCount": len(errors),
        "bookStats": books,
    }
    return report, errors


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--module", type=Path, default=DEFAULT_MODULE)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    report, errors = audit(args.module)
    if errors:
        report["errors"] = errors
    rendered = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered, encoding="utf-8")
    print(rendered, end="")
    if errors:
        raise SystemExit(1)


if __name__ == "__main__":
    main()

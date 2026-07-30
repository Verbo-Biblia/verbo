#!/usr/bin/env python3
"""Aplica decisiones aprobadas de revision de arcaismos a una Biblia Verbo."""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import shutil
from collections import Counter, defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MODULE = ROOT / "biblia/modules/bibles/rv-verbo"


def load_json(path: Path):
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def dump_json(path: Path, payload) -> None:
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")


def row_id(book_id: str, chapter: str, verse: str, term_id: str,
           occurrence_index: int, start: int, end: int, matched: str,
           verse_text: str) -> str:
    raw = "\x1f".join((
        book_id, chapter, verse, term_id, str(occurrence_index), str(start),
        str(end), matched, verse_text,
    ))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:20]


def verse_value(record) -> str:
    if isinstance(record, str):
        return record
    if isinstance(record, dict):
        return str(record.get("text", ""))
    return str(record or "")


def set_verse_value(chapters: dict, chapter: str, verse: str, value: str) -> None:
    record = chapters[chapter][verse]
    if isinstance(record, str):
        chapters[chapter][verse] = value
    elif isinstance(record, dict):
        record["text"] = value
    else:
        chapters[chapter][verse] = value


def read_decisions(csv_path: Path) -> list[dict]:
    with csv_path.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def replacement_for(row: dict) -> str | None:
    decision = row.get("decision", "").strip().lower()
    if not decision or decision in {"skip", "keep", "no"}:
        return None
    if decision == "approve":
        return row.get("replacement", "").strip() or row.get("suggestion", "")
    if decision in {"replace", "custom", "correct"}:
        replacement = row.get("replacement", "")
        if not replacement:
            raise SystemExit(f"Decision {decision} requiere replacement: {row.get('reference')} {row.get('term_id')}")
        return replacement
    raise SystemExit(f"Decision no reconocida '{decision}' en {row.get('reference')} {row.get('term_id')}")


def copy_module(source: Path, output: Path) -> Path:
    if output.exists():
        raise SystemExit(f"El destino ya existe: {output}")
    shutil.copytree(source, output)
    return output


def apply(csv_path: Path, module: Path, output: Path | None, in_place: bool,
          dry_run: bool) -> dict:
    target = module
    if output:
        target = copy_module(module, output)
    elif not in_place and not dry_run:
        raise SystemExit("Usa --output, --in-place o --dry-run.")

    manifest = load_json(target / "manifest.json")
    books = {book["id"]: book for book in manifest["books"]}
    changes = defaultdict(list)
    stats = Counter()
    for row in read_decisions(csv_path):
        replacement = replacement_for(row)
        if replacement is None:
            stats["skipped"] += 1
            continue
        book_id = row["book"]
        chapter = row["chapter"]
        verse = row["verse"]
        if book_id not in books:
            raise SystemExit(f"Libro no encontrado: {book_id}")
        expected_id = row_id(
            book_id, chapter, verse, row["term_id"], int(row["occurrence_index"]),
            int(row["start"]), int(row["end"]), row["matched"], row["verse_text"],
        )
        if expected_id != row["row_id"]:
            raise SystemExit(f"row_id no coincide en {row.get('reference')}: {row.get('row_id')}")
        changes[book_id].append((chapter, verse, int(row["start"]), int(row["end"]), row["matched"], replacement))
        stats["approved"] += 1

    for book_id, edits in changes.items():
        book = books[book_id]
        payload = load_json(target / book["file"])
        by_verse = defaultdict(list)
        for edit in edits:
            by_verse[(edit[0], edit[1])].append(edit)
        for (chapter, verse), verse_edits in by_verse.items():
            text = verse_value(payload["chapters"][chapter][verse])
            new_text = text
            for _, _, start, end, matched, replacement in sorted(verse_edits, key=lambda item: item[2], reverse=True):
                if text[start:end] != matched:
                    raise SystemExit(f"Texto cambiado en {book_id} {chapter}:{verse}: esperaba '{matched}'")
                new_text = new_text[:start] + replacement + new_text[end:]
            set_verse_value(payload["chapters"], chapter, verse, new_text)
            stats["versesChanged"] += 1
        if not dry_run:
            dump_json(target / book["file"], payload)
            stats["booksChanged"] += 1

    return {
        "target": str(target),
        "dryRun": dry_run,
        "stats": dict(stats),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("csv", type=Path)
    parser.add_argument("--module", type=Path, default=DEFAULT_MODULE)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--in-place", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    print(apply(args.csv, args.module, args.output, args.in_place, args.dry_run))


if __name__ == "__main__":
    main()

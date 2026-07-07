#!/usr/bin/env python3
"""Exporta la alineación Strong de un libro a CSV para revisión humana."""
from __future__ import annotations

import argparse
import csv
import hashlib
from collections import Counter, defaultdict, deque
from pathlib import Path

import build_rv_verbo_strong as builder


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MODULE = ROOT / "modules/bibles/rv-verbo-strong-provisional"


def row_id(book_id: str, chapter: str, verse: str, segment_index: int,
           code_index: int, verse_text: str, word: str, strong: str,
           morphology: str, step_gloss: str, status: str, confidence: str) -> str:
    """Identificador reproducible que impide aplicar una decisión a otra palabra."""
    raw = "\x1f".join((book_id, chapter, verse, str(segment_index),
                       str(code_index), verse_text, word, strong, morphology,
                       step_gloss, status, confidence))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:20]


def export_book(book_id: str, module: Path, output: Path) -> Counter:
    manifest = builder.load(module / "manifest.json")
    book = next((item for item in manifest["books"] if item["id"] == book_id), None)
    if not book:
        raise SystemExit(f"Libro no encontrado en el módulo: {book_id}")
    payload = builder.load(module / book["file"])
    step = builder.parse_step()
    stats = Counter()
    output.parent.mkdir(parents=True, exist_ok=True)
    fields = [
        "row_id", "reference", "segment_index", "code_index", "verse_text", "word",
        "strong", "morphology", "step_gloss", "status", "confidence", "reviewer",
        "decision", "corrected_strong", "notes",
    ]
    with output.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, lineterminator="\n")
        writer.writeheader()
        for chapter, verses in payload["chapters"].items():
            for verse, record in verses.items():
                groups = defaultdict(deque)
                for group in step.get((book_id, chapter, verse), []):
                    groups[group["code"]].append(group)
                for segment_index, segment in enumerate(record.get("segments", [])):
                    codes = segment.get("strongs") or ([segment["strong"]] if segment.get("strong") else [])
                    if not codes:
                        continue
                    meta = segment.get("strongMeta", {})
                    morphs = segment.get("morphs") or ([segment["morph"]] if segment.get("morph") else [])
                    for index, code in enumerate(codes):
                        group = groups[code].popleft() if groups[code] else {}
                        status = meta.get("status", "unclassified")
                        morphology = morphs[index] if index < len(morphs) else group.get("morph", "")
                        step_gloss = group.get("gloss", "")
                        confidence = str(meta.get("confidence", ""))
                        stats[status] += 1
                        writer.writerow({
                            "row_id": row_id(book_id, chapter, verse, segment_index,
                                             index, record["text"], segment.get("text", ""),
                                             code, morphology, step_gloss, status, confidence),
                            "reference": f"{book_id} {chapter}:{verse}",
                            "segment_index": segment_index,
                            "code_index": index,
                            "verse_text": record["text"],
                            "word": segment.get("text", ""),
                            "strong": code,
                            "morphology": morphology,
                            "step_gloss": step_gloss,
                            "status": status,
                            "confidence": confidence,
                            "reviewer": "",
                            "decision": "",
                            "corrected_strong": "",
                            "notes": "",
                        })
    return stats


def decision_key(row: dict) -> tuple[str, ...]:
    """Identidad estable aunque cambien estado/confianza por otra verificación."""
    return tuple(row.get(field, "") for field in (
        "reference", "segment_index", "code_index", "verse_text", "word",
        "strong", "morphology", "step_gloss",
    ))


def merge_decisions(current: Path, previous: Path) -> Counter:
    """Copia decisiones cuyo contenido y ubicación siguen siendo idénticos."""
    with previous.open(encoding="utf-8-sig", newline="") as handle:
        old_rows = list(csv.DictReader(handle))
    decisions = {
        decision_key(row): row for row in old_rows
        if row.get("decision", "").strip()
    }
    with current.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        fields = list(reader.fieldnames or [])
        rows = list(reader)
    stats = Counter()
    for row in rows:
        old = decisions.get(decision_key(row))
        if not old:
            continue
        for field in ("reviewer", "decision", "corrected_strong", "notes"):
            row[field] = old.get(field, "")
        stats["preserved"] += 1
    with current.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    stats["notPreserved"] = len(decisions) - stats["preserved"]
    return stats


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("book", help="ID del libro, por ejemplo GEN o JHN")
    parser.add_argument("--module", type=Path, default=DEFAULT_MODULE)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--preserve-decisions-from", type=Path)
    args = parser.parse_args()
    book_id = args.book.upper()
    output = args.output or ROOT / f"review/strong/{book_id}.csv"
    stats = export_book(book_id, args.module, output)
    result = {"output": str(output), "rows": sum(stats.values()), "statuses": dict(stats)}
    if args.preserve_decisions_from:
        if args.preserve_decisions_from.resolve() == output.resolve():
            parser.error("--preserve-decisions-from debe ser distinto de --output")
        result["merge"] = dict(merge_decisions(output, args.preserve_decisions_from))
    print(result)


if __name__ == "__main__":
    main()

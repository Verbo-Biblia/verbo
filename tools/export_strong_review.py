#!/usr/bin/env python3
"""Exporta la alineación Strong de un libro a CSV para revisión humana."""
from __future__ import annotations

import argparse
import csv
from collections import Counter, defaultdict, deque
from pathlib import Path

import build_rv_verbo_strong as builder


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MODULE = ROOT / "modules/bibles/rv-verbo-strong-provisional"


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
        "reference", "verse_text", "word", "strong", "morphology", "step_gloss",
        "status", "confidence", "reviewer", "decision", "corrected_strong", "notes",
    ]
    with output.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for chapter, verses in payload["chapters"].items():
            for verse, record in verses.items():
                groups = defaultdict(deque)
                for group in step.get((book_id, chapter, verse), []):
                    groups[group["code"]].append(group)
                for segment in record.get("segments", []):
                    codes = segment.get("strongs") or ([segment["strong"]] if segment.get("strong") else [])
                    if not codes:
                        continue
                    meta = segment.get("strongMeta", {})
                    morphs = segment.get("morphs") or ([segment["morph"]] if segment.get("morph") else [])
                    for index, code in enumerate(codes):
                        group = groups[code].popleft() if groups[code] else {}
                        status = meta.get("status", "unclassified")
                        stats[status] += 1
                        writer.writerow({
                            "reference": f"{book_id} {chapter}:{verse}",
                            "verse_text": record["text"],
                            "word": segment.get("text", ""),
                            "strong": code,
                            "morphology": morphs[index] if index < len(morphs) else group.get("morph", ""),
                            "step_gloss": group.get("gloss", ""),
                            "status": status,
                            "confidence": meta.get("confidence", ""),
                            "reviewer": "",
                            "decision": "",
                            "corrected_strong": "",
                            "notes": "",
                        })
    return stats


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("book", help="ID del libro, por ejemplo GEN o JHN")
    parser.add_argument("--module", type=Path, default=DEFAULT_MODULE)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    book_id = args.book.upper()
    output = args.output or ROOT / f"review/strong/{book_id}.csv"
    stats = export_book(book_id, args.module, output)
    print({"output": str(output), "rows": sum(stats.values()), "statuses": dict(stats)})


if __name__ == "__main__":
    main()

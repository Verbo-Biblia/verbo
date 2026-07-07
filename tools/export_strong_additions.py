#!/usr/bin/env python3
"""Exporta grupos STEPBible todavía no asociados a una palabra española."""
from __future__ import annotations

import argparse
import csv
import hashlib
from collections import Counter
from pathlib import Path

import build_rv_verbo_strong as builder
from export_strong_review import DEFAULT_MODULE


ROOT = Path(__file__).resolve().parents[1]


def addition_id(book_id: str, chapter: str, verse: str, step_index: int,
                verse_text: str, code: str, morph: str, gloss: str) -> str:
    raw = "\x1f".join((book_id, chapter, verse, str(step_index), verse_text,
                       code, morph, gloss))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:20]


def segment_codes(segment: dict) -> list[str]:
    return list(segment.get("strongs") or
                ([segment["strong"]] if segment.get("strong") else []))


def export_book(book_id: str, module: Path, output: Path) -> Counter:
    manifest = builder.load(module / "manifest.json")
    book = next((item for item in manifest["books"] if item["id"] == book_id), None)
    if not book:
        raise SystemExit(f"Libro no encontrado en el módulo: {book_id}")
    payload = builder.load(module / book["file"])
    step = builder.parse_step()
    stats = Counter()
    fields = [
        "row_id", "reference", "step_index", "verse_text", "strong", "morphology",
        "step_gloss", "reviewer", "decision", "target_segment_index", "notes",
    ]
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, lineterminator="\n")
        writer.writeheader()
        for chapter, verses in payload["chapters"].items():
            for verse, record in verses.items():
                assigned = Counter(code for segment in record.get("segments", [])
                                   for code in segment_codes(segment))
                reviewed_skips = {
                    (int(item["stepIndex"]), item.get("code", ""))
                    for item in record.get("strongReview", [])
                    if item.get("decision") == "skip" and str(item.get("stepIndex", "")).isdigit()
                }
                for step_index, group in enumerate(step.get((book_id, chapter, verse), [])):
                    code = group["code"]
                    if (step_index, code) in reviewed_skips:
                        stats["reviewedSkip"] += 1
                        continue
                    if assigned[code]:
                        assigned[code] -= 1
                        continue
                    stats["unassigned"] += 1
                    writer.writerow({
                        "row_id": addition_id(book_id, chapter, verse, step_index,
                                              record["text"], code,
                                              group.get("morph", ""), group.get("gloss", "")),
                        "reference": f"{book_id} {chapter}:{verse}",
                        "step_index": step_index,
                        "verse_text": record["text"],
                        "strong": code,
                        "morphology": group.get("morph", ""),
                        "step_gloss": group.get("gloss", ""),
                        "reviewer": "",
                        "decision": "",
                        "target_segment_index": "",
                        "notes": "",
                    })
    return stats


def merge_decisions(current: Path, previous: Path) -> Counter:
    with previous.open(encoding="utf-8-sig", newline="") as handle:
        old = {row["row_id"]: row for row in csv.DictReader(handle)
               if row.get("decision", "").strip()}
    with current.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        fields = list(reader.fieldnames or [])
        rows = list(reader)
    stats = Counter()
    for row in rows:
        prior = old.get(row["row_id"])
        if not prior:
            continue
        immutable = ("reference", "step_index", "verse_text", "strong",
                     "morphology", "step_gloss")
        if any(row[field] != prior[field] for field in immutable):
            stats["changed"] += 1
            continue
        for field in ("reviewer", "decision", "target_segment_index", "notes"):
            row[field] = prior.get(field, "")
        stats["preserved"] += 1
    with current.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    stats["alreadyAppliedOrRemoved"] = len(old) - stats["preserved"] - stats["changed"]
    return stats


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("book", help="ID del libro, por ejemplo GEN o JHN")
    parser.add_argument("--module", type=Path, default=DEFAULT_MODULE)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--preserve-decisions-from", type=Path)
    args = parser.parse_args()
    book_id = args.book.upper()
    output = args.output or ROOT / f"review/strong/{book_id}-additions.csv"
    stats = export_book(book_id, args.module, output)
    result = {"output": str(output), "rows": stats["unassigned"], "statuses": dict(stats)}
    if args.preserve_decisions_from:
        if args.preserve_decisions_from.resolve() == output.resolve():
            parser.error("--preserve-decisions-from debe ser distinto de --output")
        result["merge"] = dict(merge_decisions(output, args.preserve_decisions_from))
    print(result)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Valida y aplica decisiones sobre grupos Strong todavía no asociados."""
from __future__ import annotations

import argparse
import csv
import json
import re
from collections import Counter
from pathlib import Path

import build_rv_verbo_strong as builder
from export_strong_additions import addition_id, segment_codes
from export_strong_review import DEFAULT_MODULE
from import_strong_review import parse_reference


DECISIONS = {"add", "skip"}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("csv", type=Path)
    parser.add_argument("--module", type=Path, default=DEFAULT_MODULE)
    parser.add_argument("--input", type=Path,
                        help="Libro JSON ya revisado que se usará en lugar del libro del módulo")
    parser.add_argument("--output", type=Path,
                        help="Escribe el libro revisado aquí; sin esta opción solo valida")
    args = parser.parse_args()

    manifest = builder.load(args.module / "manifest.json")
    with args.csv.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        required = {"row_id", "reference", "step_index", "verse_text", "strong",
                    "morphology", "step_gloss", "reviewer", "decision",
                    "target_segment_index", "notes"}
        missing_columns = required - set(reader.fieldnames or [])
        if missing_columns:
            raise ValueError(f"Faltan columnas obligatorias: {', '.join(sorted(missing_columns))}")
        rows = list(reader)
    if not rows:
        raise SystemExit("El CSV está vacío")
    book_id, _, _ = parse_reference(rows[0]["reference"])
    book = next((item for item in manifest["books"] if item["id"] == book_id), None)
    if not book:
        raise SystemExit(f"Libro no encontrado en el módulo: {book_id}")
    payload = builder.load(args.input or (args.module / book["file"]))
    step = builder.parse_step()
    missing_ids: set[str] = set()
    for chapter, verses in payload["chapters"].items():
        for verse, record in verses.items():
            assigned = Counter(code for segment in record.get("segments", [])
                               for code in segment_codes(segment))
            for step_index, group in enumerate(step.get((book_id, chapter, verse), [])):
                if assigned[group["code"]]:
                    assigned[group["code"]] -= 1
                    continue
                missing_ids.add(addition_id(
                    book_id, chapter, verse, step_index, record["text"], group["code"],
                    group.get("morph", ""), group.get("gloss", ""),
                ))
    stats = Counter()
    seen: set[str] = set()
    changes: list[dict] = []

    for line, row in enumerate(rows, 2):
        decision = row["decision"].strip().lower()
        if not decision:
            stats["pending"] += 1
            continue
        if decision not in DECISIONS:
            raise ValueError(f"Línea {line}: decisión inválida {decision!r}")
        if not row["reviewer"].strip():
            raise ValueError(f"Línea {line}: una decisión requiere reviewer")
        current_book, chapter, verse = parse_reference(row["reference"])
        if current_book != book_id:
            raise ValueError(f"Línea {line}: libro inesperado {current_book}")
        record = payload["chapters"][chapter][verse]
        step_index = int(row["step_index"])
        try:
            group = step[(book_id, chapter, verse)][step_index]
        except (KeyError, IndexError) as error:
            raise ValueError(f"Línea {line}: grupo STEPBible inexistente") from error
        expected = addition_id(book_id, chapter, verse, step_index, record["text"],
                               group["code"], group.get("morph", ""), group.get("gloss", ""))
        if expected != row["row_id"] or row["verse_text"] != record["text"] \
                or row["strong"] != group["code"] \
                or row["morphology"] != group.get("morph", "") \
                or row["step_gloss"] != group.get("gloss", ""):
            raise ValueError(f"Línea {line}: la omisión cambió desde la exportación")
        if expected not in missing_ids:
            raise ValueError(f"Línea {line}: el grupo ya está asociado en el libro de entrada")
        if expected in seen:
            raise ValueError(f"Línea {line}: row_id duplicado")
        seen.add(expected)
        target = row["target_segment_index"].strip()
        if decision == "add":
            if not re.fullmatch(r"\d+", target):
                raise ValueError(f"Línea {line}: add requiere target_segment_index")
            target_index = int(target)
            if target_index >= len(record["segments"]):
                raise ValueError(f"Línea {line}: segmento destino inexistente")
        else:
            if target:
                raise ValueError(f"Línea {line}: skip no usa target_segment_index")
            target_index = None
        changes.append({
            "chapter": chapter, "verse": verse, "target": target_index,
            "code": group["code"], "morph": group.get("morph", ""),
            "decision": decision, "reviewer": row["reviewer"].strip(),
            "notes": row["notes"].strip(), "stepIndex": step_index,
        })
        stats[decision] += 1

    for item in changes:
        record = payload["chapters"][item["chapter"]][item["verse"]]
        audit = {key:item[key] for key in
                 ("code", "decision", "reviewer", "notes", "stepIndex")}
        if item["decision"] == "skip":
            record.setdefault("strongReview", []).append(audit)
            continue
        segment = record["segments"][item["target"]]
        codes = segment_codes(segment)
        morphs = list(segment.get("morphs") or
                      ([segment["morph"]] if segment.get("morph") else []))
        codes.append(item["code"])
        morphs.append(item["morph"])
        segment["strong"] = codes[0]
        if len(codes) > 1:
            segment["strongs"] = codes
        if morphs and morphs[0]:
            segment["morph"] = morphs[0]
        if len(morphs) > 1:
            segment["morphs"] = morphs
        segment["strongMeta"] = {
            "status": "editorial-reviewed", "method": "editorial-review", "confidence": 1.0,
        }
        segment.setdefault("strongReview", []).append(audit)
        record["strongs"] = sorted({code for part in record["segments"]
                                    for code in segment_codes(part)},
                                   key=lambda code: (code[0], int(code[1:])))

    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n",
                               encoding="utf-8")
    print(json.dumps({"book": book_id, "rows": sum(stats.values()),
                      "decisions": dict(stats), "output": str(args.output or "")},
                     ensure_ascii=False))


if __name__ == "__main__":
    main()

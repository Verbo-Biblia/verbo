#!/usr/bin/env python3
"""Valida y aplica decisiones editoriales de un CSV Strong a un libro JSON."""
from __future__ import annotations

import argparse
import csv
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

import build_rv_verbo_strong as builder
from export_strong_review import DEFAULT_MODULE, row_id


ROOT = Path(__file__).resolve().parents[1]
STRONG = re.compile(r"^[GH][1-9]\d{0,4}$")
DECISIONS = {"approve", "reject", "correct"}


def segment_codes(segment: dict) -> list[str]:
    return list(segment.get("strongs") or
                ([segment["strong"]] if segment.get("strong") else []))


def valid_dictionary_codes() -> set[str]:
    manifest = builder.load(ROOT / "modules/dictionaries/strong-verbo/manifest.json")
    base = ROOT / "modules/dictionaries/strong-verbo"
    codes: set[str] = set()
    for relative in manifest["entryFiles"].values():
        payload = builder.load(base / relative)
        codes.update((payload.get("entries") or payload).keys())
    return codes


def parse_reference(value: str) -> tuple[str, str, str]:
    match = re.fullmatch(r"([1-3A-Z]+) (\d+):(\d+)", value.strip())
    if not match:
        raise ValueError(f"Referencia inválida: {value!r}")
    return match.groups()


def load_decisions(csv_path: Path, payload: dict, book_id: str) -> tuple[dict, Counter]:
    valid_codes = valid_dictionary_codes()
    grouped: dict[tuple[str, str, int], dict[int, dict]] = defaultdict(dict)
    stats = Counter()
    seen_ids: set[str] = set()
    with csv_path.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        required = {"row_id", "reference", "segment_index", "code_index", "verse_text",
                    "word", "strong", "morphology", "step_gloss", "status", "confidence",
                    "reviewer", "decision", "corrected_strong", "notes"}
        missing = required - set(reader.fieldnames or [])
        if missing:
            raise ValueError(f"Faltan columnas obligatorias: {', '.join(sorted(missing))}")
        for line, row in enumerate(reader, 2):
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
                raise ValueError(f"Línea {line}: {current_book} no corresponde a {book_id}")
            segment_index = int(row["segment_index"])
            code_index = int(row["code_index"])
            try:
                record = payload["chapters"][chapter][verse]
                segment = record["segments"][segment_index]
                current_code = segment_codes(segment)[code_index]
            except (KeyError, IndexError) as error:
                raise ValueError(f"Línea {line}: ubicación inexistente") from error
            morphs = list(segment.get("morphs") or
                          ([segment["morph"]] if segment.get("morph") else []))
            current_morph = morphs[code_index] if code_index < len(morphs) else ""
            meta = segment.get("strongMeta", {})
            current_status = str(meta.get("status", "unclassified"))
            current_confidence = str(meta.get("confidence", ""))
            expected_id = row_id(
                book_id, chapter, verse, segment_index, code_index,
                row["verse_text"], segment.get("text", ""), current_code,
                row["morphology"], row["step_gloss"], row["status"], row["confidence"],
            )
            if row["row_id"] != expected_id or row["word"] != segment.get("text", "") \
                    or row["strong"] != current_code or row["verse_text"] != record["text"] \
                    or row["morphology"] != current_morph \
                    or row["status"] != current_status \
                    or row["confidence"] != current_confidence:
                raise ValueError(f"Línea {line}: la asociación cambió desde la exportación")
            if expected_id in seen_ids:
                raise ValueError(f"Línea {line}: row_id duplicado")
            seen_ids.add(expected_id)
            corrected = row["corrected_strong"].strip().upper()
            if decision == "correct":
                if not STRONG.fullmatch(corrected) or corrected not in valid_codes:
                    raise ValueError(f"Línea {line}: corrected_strong no existe: {corrected!r}")
            elif corrected:
                raise ValueError(f"Línea {line}: corrected_strong solo se usa con correct")
            key = (chapter, verse, segment_index)
            grouped[key][code_index] = {
                "decision": decision,
                "corrected": corrected,
                "original": current_code,
                "reviewer": row["reviewer"].strip(),
                "notes": row["notes"].strip(),
            }
            stats[decision] += 1
    return grouped, stats


def apply_decisions(payload: dict, grouped: dict) -> None:
    for (chapter, verse, segment_index), decisions in grouped.items():
        segment = payload["chapters"][chapter][verse]["segments"][segment_index]
        old_codes = segment_codes(segment)
        old_meta = dict(segment.get("strongMeta", {}))
        old_morphs = list(segment.get("morphs") or
                          ([segment["morph"]] if segment.get("morph") else []))
        new_codes: list[str] = []
        new_morphs: list[str] = []
        audit = list(segment.get("strongReview", []))
        for index, code in enumerate(old_codes):
            item = decisions.get(index)
            if not item:
                new_codes.append(code)
                new_morphs.append(old_morphs[index] if index < len(old_morphs) else "")
                continue
            audit.append(item)
            if item["decision"] == "reject":
                continue
            new_codes.append(item["corrected"] if item["decision"] == "correct" else code)
            new_morphs.append("" if item["decision"] == "correct"
                              else (old_morphs[index] if index < len(old_morphs) else ""))
        for field in ("strong", "strongs", "morph", "morphs"):
            segment.pop(field, None)
        if new_codes:
            segment["strong"] = new_codes[0]
            if len(new_codes) > 1:
                segment["strongs"] = new_codes
            if new_morphs and new_morphs[0]:
                segment["morph"] = new_morphs[0]
            if len(new_morphs) > 1:
                segment["morphs"] = new_morphs
            if len(decisions) == len(old_codes):
                segment["strongMeta"] = {
                    "status": "editorial-reviewed",
                    "method": "editorial-review",
                    "confidence": 1.0,
                }
            elif old_meta:
                segment["strongMeta"] = old_meta
        else:
            segment.pop("strongMeta", None)
        segment["strongReview"] = audit
        record = payload["chapters"][chapter][verse]
        record["strongs"] = sorted({code for part in record["segments"]
                                    for code in segment_codes(part)},
                                   key=lambda code: (code[0], int(code[1:])))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("csv", type=Path)
    parser.add_argument("--module", type=Path, default=DEFAULT_MODULE)
    parser.add_argument("--output", type=Path,
                        help="Escribe el libro revisado aquí; sin esta opción solo valida")
    args = parser.parse_args()

    manifest = builder.load(args.module / "manifest.json")
    with args.csv.open(encoding="utf-8-sig", newline="") as handle:
        first = next(csv.DictReader(handle), None)
    if not first:
        raise SystemExit("El CSV está vacío")
    book_id, _, _ = parse_reference(first["reference"])
    book = next((item for item in manifest["books"] if item["id"] == book_id), None)
    if not book:
        raise SystemExit(f"Libro no encontrado en el módulo: {book_id}")
    payload = builder.load(args.module / book["file"])
    grouped, stats = load_decisions(args.csv, payload, book_id)
    apply_decisions(payload, grouped)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n",
                               encoding="utf-8")
    print(json.dumps({"book": book_id, "rows": sum(stats.values()),
                      "decisions": dict(stats), "output": str(args.output or "")},
                     ensure_ascii=False))


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Registra decisiones examinadas en un CSV de omisiones Strong."""
from __future__ import annotations

import argparse
import csv
from collections import Counter
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("csv", type=Path)
    parser.add_argument("--add", default="",
                        help="Pares row_id:segment_index separados por coma")
    parser.add_argument("--skip", default="", help="row_id separados por coma")
    parser.add_argument("--reviewer", default="Codex-assisted")
    args = parser.parse_args()
    additions: dict[str, str] = {}
    for item in (part.strip() for part in args.add.split(",") if part.strip()):
        row_id, separator, target = item.partition(":")
        if not separator or not target.isdigit():
            parser.error(f"--add inválido: {item!r}")
        additions[row_id] = target
    skips = {part.strip() for part in args.skip.split(",") if part.strip()}
    overlap = additions.keys() & skips
    if overlap:
        parser.error(f"row_id presente en add y skip: {', '.join(sorted(overlap))}")
    requested = set(additions) | skips
    if not requested:
        parser.error("se requiere al menos una decisión")
    with args.csv.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        fields = list(reader.fieldnames or [])
        rows = list(reader)
    found = {row["row_id"] for row in rows if row["row_id"] in requested}
    missing = requested - found
    if missing:
        parser.error(f"row_id no encontrados: {', '.join(sorted(missing))}")
    stats = Counter()
    for row in rows:
        row_id = row["row_id"]
        if row_id not in requested:
            continue
        if row["decision"].strip():
            parser.error(f"{row_id} ya tiene decisión {row['decision']!r}")
        row["reviewer"] = args.reviewer
        if row_id in additions:
            row["decision"] = "add"
            row["target_segment_index"] = additions[row_id]
            row["notes"] = "Correspondencia explícita revisada con el texto hebreo/griego."
            stats["add"] += 1
        else:
            row["decision"] = "skip"
            row["notes"] = "Sin equivalente léxico independiente en la traducción española."
            stats["skip"] += 1
    with args.csv.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    print(dict(stats))


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Registra aprobaciones editoriales para referencias examinadas en un CSV."""
from __future__ import annotations

import argparse
import csv
from collections import Counter
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("csv", type=Path)
    parser.add_argument("--references", required=True,
                        help="Referencias separadas por coma, por ejemplo 'GEN 1:7,GEN 1:8'")
    parser.add_argument("--reject", default="",
                        help="row_id separados por coma; se rechazan antes de aprobar las referencias")
    parser.add_argument("--reviewer", default="Codex-assisted")
    parser.add_argument("--notes", default="Correspondencia entre el término español y el código Strong revisada.")
    args = parser.parse_args()
    references = {item.strip() for item in args.references.split(",") if item.strip()}
    rejects = {item.strip() for item in args.reject.split(",") if item.strip()}
    if not references:
        parser.error("--references no puede estar vacío")
    with args.csv.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        fields = list(reader.fieldnames or [])
        rows = list(reader)
    found = {row["reference"] for row in rows if row["reference"] in references}
    missing = references - found
    if missing:
        parser.error(f"referencias no encontradas: {', '.join(sorted(missing))}")
    found_rejects = {row["row_id"] for row in rows if row["row_id"] in rejects}
    missing_rejects = rejects - found_rejects
    if missing_rejects:
        parser.error(f"row_id no encontrados: {', '.join(sorted(missing_rejects))}")
    stats = Counter()
    for row in rows:
        if row["reference"] not in references:
            continue
        if row["decision"].strip():
            stats["alreadyDecided"] += 1
            continue
        row["reviewer"] = args.reviewer
        row["decision"] = "reject" if row["row_id"] in rejects else "approve"
        row["notes"] = ("Asociación descartada: el código no corresponde a este segmento español."
                        if row["row_id"] in rejects else args.notes)
        stats["rejected" if row["row_id"] in rejects else "approved"] += 1
    with args.csv.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    print(dict(stats))


if __name__ == "__main__":
    main()

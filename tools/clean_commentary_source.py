#!/usr/bin/env python3
"""Conservative formatting cleanup for English commentary source text."""

from __future__ import annotations

import argparse
import copy
import json
import re
from pathlib import Path
from typing import Any


EMPTY_PARAGRAPH_RE = re.compile(r"<p>\s*</p>", re.IGNORECASE)
NBSP_RE = re.compile(r"&(?:nbsp|#160);", re.IGNORECASE)
NARRATIVE_ROMAN_RE = re.compile(
    r"\b(Book|Chapter|Part|Section|Volume|Vol\.)[ \t]+([IVXLCDM]+)\b"
)
SPACE_BEFORE_PUNCTUATION_RE = re.compile(r"\s+([,.!?;:])")
WHITESPACE_RE = re.compile(r"\s+")
DOUBLE_HYPHEN_RE = re.compile(r"\s*--\s*")
HTML_TAG_RE = re.compile(r"(<[^>]+>)")


def roman_to_int(value: str) -> int:
    values = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100, "D": 500, "M": 1000}
    total = 0
    previous = 0
    for character in reversed(value):
        current = values[character]
        if current < previous:
            total -= current
        else:
            total += current
            previous = current
    return total


def clean_content(content: str) -> str:
    content = EMPTY_PARAGRAPH_RE.sub("", content)
    parts = HTML_TAG_RE.split(content)
    for index in range(0, len(parts), 2):
        text = NBSP_RE.sub(" ", parts[index])
        text = DOUBLE_HYPHEN_RE.sub(" — ", text)
        text = NARRATIVE_ROMAN_RE.sub(
            lambda match: f"{match.group(1)} {roman_to_int(match.group(2))}",
            text,
        )
        text = WHITESPACE_RE.sub(" ", text)
        text = SPACE_BEFORE_PUNCTUATION_RE.sub(r"\1", text)
        parts[index] = text
    return "".join(parts).strip()


def content_files(module_root: Path) -> list[Path]:
    return sorted(
        path
        for path in (module_root / "books").rglob("*.json")
        if not path.name.endswith(".index.json")
    )


def structural_snapshot(module_root: Path) -> list[dict[str, Any]]:
    snapshot: list[dict[str, Any]] = []
    for path in content_files(module_root):
        data = json.loads(path.read_text(encoding="utf-8"))
        entries = []
        for entry in data.get("entries", []):
            entries.append(
                {
                    "id": entry.get("id"),
                    "reference": copy.deepcopy(entry.get("reference")),
                    "other": {
                        key: copy.deepcopy(value)
                        for key, value in entry.items()
                        if key != "content"
                    },
                }
            )
        snapshot.append({"path": str(path.relative_to(module_root)), "entries": entries})
    return snapshot


def clean_module(module_root: Path, check: bool) -> tuple[int, int]:
    before = structural_snapshot(module_root)
    changed_entries = 0
    changed_files = 0

    for path in content_files(module_root):
        data = json.loads(path.read_text(encoding="utf-8"))
        file_changed = False
        for entry in data.get("entries", []):
            original = entry.get("content")
            if not isinstance(original, str):
                continue
            cleaned = clean_content(original)
            if cleaned != original:
                entry["content"] = cleaned
                changed_entries += 1
                file_changed = True
        if file_changed:
            changed_files += 1
            if not check:
                path.write_text(
                    json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n",
                    encoding="utf-8",
                )

    if not check:
        after = structural_snapshot(module_root)
        if before != after:
            raise RuntimeError("Structural invariant changed; refusing completed cleanup")

    return changed_files, changed_entries


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("module", help="Commentary module ID")
    parser.add_argument("--check", action="store_true", help="Report changes without writing")
    args = parser.parse_args()

    module_root = Path("biblia/modules/commentaries") / args.module
    if not (module_root / "manifest.json").is_file():
        raise SystemExit(f"Unknown commentary module: {args.module}")

    changed_files, changed_entries = clean_module(module_root, args.check)
    mode = "would change" if args.check else "changed"
    print(f"{args.module}: {mode} {changed_entries} entries in {changed_files} files")


if __name__ == "__main__":
    main()

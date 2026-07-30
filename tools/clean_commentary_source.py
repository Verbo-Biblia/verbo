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
ROMAN_CONTEXT_RE = re.compile(
    r"\b("
    r"Book|B\.|Chapter|Chap\.|Ch\.|Cap\.|Part|Section|Sec\.|Volume|Vol\.|"
    r"Lib\.|Epistle|Ep\.|Psalm|Ps\.|No\.|"
    r"Genesis|Gen\.|Exodus|Exod\.|Leviticus|Lev\.|Numbers|Num\.|"
    r"Deuteronomy|Deut\.|Joshua|Josh\.|Judges|Judg\.|Ruth|Samuel|Sam\.|"
    r"Kings|Chronicles|Chron\.|Ezra|Nehemiah|Neh\.|Esther|Esth\.|Job|"
    r"Psalms|Proverbs|Prov\.|Ecclesiastes|Eccl\.|Isaiah|Isa\.|Jeremiah|"
    r"Jer\.|Lamentations|Lam\.|Ezekiel|Ezek\.|Daniel|Dan\.|Hosea|Hos\.|"
    r"Joel|Amos|Obadiah|Obad\.|Jonah|Micah|Mic\.|Nahum|Nah\.|Habakkuk|"
    r"Hab\.|Zephaniah|Zeph\.|Haggai|Hag\.|Zechariah|Zech\.|Malachi|Mal\.|"
    r"Matthew|Matt\.|Mark|Luke|John|Acts|Romans|Rom\.|Corinthians|Cor\.|"
    r"Galatians|Gal\.|Ephesians|Eph\.|Philippians|Phil\.|Colossians|Col\.|"
    r"Thessalonians|Thess\.|Timothy|Tim\.|Titus|Philemon|Philem\.|"
    r"Hebrews|Heb\.|James|Peter|Jude|Revelation|Rev\."
    r")([ \t]+)([IVXLCDM]+)\b",
    re.IGNORECASE,
)
ROMAN_TOKEN_RE = re.compile(r"\b[IVXLCDM]{2,}\b")
ROMAN_CITATION_TOKEN_RE = re.compile(
    r"\b[ivxlcdm]+\b(?=\s*[.,:]\s*(?:\d|[-–]))"
)
ROMAN_SMALL_TOKEN_RE = re.compile(r"\b[ivxlcdm]{2,}\b", re.IGNORECASE)
SPACE_BEFORE_PUNCTUATION_RE = re.compile(r"\s+([,.!?;:])")
WHITESPACE_RE = re.compile(r"\s+")
DOUBLE_HYPHEN_RE = re.compile(r"\s*--\s*")
HTML_TAG_RE = re.compile(r"(<[^>]+>)")
HTML_ANCHOR_RE = re.compile(r"(<a\b[^>]*>)(.*?)(</a>)", re.IGNORECASE)
ROMAN_ANY_TOKEN_RE = re.compile(r"\b[ivxlcdm]+\b", re.IGNORECASE)
TYPOGRAPHIC_TRANSLATION = str.maketrans(
    {
        "‘": "'", "’": "'", "‚": "'", "‛": "'",
        "“": '"', "”": '"', "„": '"', "‟": '"',
        "‐": "-", "‑": "-", "‒": "–", "―": "—", "…": "...",
        "ﬀ": "ff", "ﬁ": "fi", "ﬂ": "fl", "ﬃ": "ffi", "ﬄ": "ffl",
        "ﬅ": "st", "ﬆ": "st",
    }
)


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


def is_canonical_roman(value: str) -> bool:
    number = roman_to_int(value.upper())
    remainder = number
    canonical = ""
    for amount, numeral in (
        (1000, "M"), (900, "CM"), (500, "D"), (400, "CD"),
        (100, "C"), (90, "XC"), (50, "L"), (40, "XL"),
        (10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I"),
    ):
        count, remainder = divmod(remainder, amount)
        canonical += numeral * count
    return canonical == value.upper()


def replace_roman_token(match: re.Match[str]) -> str:
    value = match.group(0)
    return str(roman_to_int(value.upper())) if is_canonical_roman(value) else value


def replace_small_roman_token(match: re.Match[str]) -> str:
    value = match.group(0)
    number = roman_to_int(value.upper())
    return str(number) if number <= 200 and is_canonical_roman(value) else value


def clean_anchor_romans(match: re.Match[str]) -> str:
    parts = HTML_TAG_RE.split(match.group(2))
    for index in range(0, len(parts), 2):
        parts[index] = ROMAN_ANY_TOKEN_RE.sub(replace_roman_token, parts[index])
    return f"{match.group(1)}{''.join(parts)}{match.group(3)}"


def clean_content(content: str) -> str:
    content = EMPTY_PARAGRAPH_RE.sub("", content)
    content = HTML_ANCHOR_RE.sub(clean_anchor_romans, content)
    parts = HTML_TAG_RE.split(content)
    for index in range(0, len(parts), 2):
        text = NBSP_RE.sub(" ", parts[index])
        text = text.translate(TYPOGRAPHIC_TRANSLATION)
        text = text.replace("H \uf895 sban", "Hesban")
        text = text.replace("\x14", " — ").replace("\x15", "§")
        text = re.sub(r"\blxx\b", "70", text, flags=re.IGNORECASE)
        text = text.replace("7� gallons", "7.5 gallons")
        text = re.sub(r"(?<=\d)�(?=[ '\\s])", "°", text)
        text = re.sub(r"�(?=\\s?\\d)", "£", text)
        text = re.sub(r"Kuin�(?:e|n)?l", "Kuinoel", text)
        text = text.replace(" o� ", " of ").replace(" a� ", " at ")
        text = text.replace("�rom", "from").replace("�he", "the")
        text = text.replace('"�e are', '"We are')
        text = text.replace("(�)", "(*)")
        text = re.sub(r"\s*�\s*", " — ", text)
        text = DOUBLE_HYPHEN_RE.sub(" — ", text)
        text = ROMAN_CONTEXT_RE.sub(
            lambda match: (
                f"{match.group(1)}{match.group(2)}"
                f"{roman_to_int(match.group(3).upper())}"
                if is_canonical_roman(match.group(3))
                else match.group(0)
            ),
            text,
        )
        text = ROMAN_TOKEN_RE.sub(replace_roman_token, text)
        text = ROMAN_CITATION_TOKEN_RE.sub(replace_roman_token, text)
        text = ROMAN_SMALL_TOKEN_RE.sub(replace_small_roman_token, text)
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

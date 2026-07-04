#!/usr/bin/env python3
"""Convierte una Biblia SWORD zText/OSIS a módulo bíblico Verbo v2.

Preserva etiquetas Strong y morfología contenidas en elementos OSIS ``w``.
Actualmente se usa para la KJV 3.1 de CrossWire (versificación KJV).
"""
from __future__ import annotations

import argparse
import html
import json
import re
import shutil
from html.parser import HTMLParser
from pathlib import Path

from sword_zcom_to_verbo import (
    OT_BOOKS, NT_BOOKS, OT_VERSE_MAP, NT_VERSE_MAP,
    read_bzs, read_bzv, decompress_block,
)


ROOT = Path(__file__).resolve().parents[1]
STRONG = re.compile(r"strong:([GH])0*(\d+)", re.I)
SPACE = re.compile(r"\s+")
BEFORE_PUNCT = re.compile(r"\s+([,.;:!?])")
AFTER_OPEN = re.compile(r"([“‘(\[])\s+")


def canonical_codes(value: str) -> list[str]:
    result = []
    for prefix, number in STRONG.findall(value or ""):
        code = f"{prefix.upper()}{int(number)}"
        if code not in result:
            result.append(code)
    return result


class VerseParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.pieces: list[dict] = []
        self.current: dict | None = None
        self.suppressed = 0

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "note":
            self.suppressed += 1
            return
        if self.suppressed:
            return
        if tag == "w":
            self.current = {
                "text": "",
                "strongs": canonical_codes(attrs.get("lemma", "")),
                "morphs": [x for x in attrs.get("morph", "").split() if x],
            }
        elif tag == "q" and attrs.get("marker"):
            self._append_text(attrs["marker"])

    def handle_startendtag(self, tag, attrs):
        attrs = dict(attrs)
        if not self.suppressed and tag == "q" and attrs.get("marker"):
            self._append_text(attrs["marker"])

    def handle_endtag(self, tag):
        if tag == "note" and self.suppressed:
            self.suppressed -= 1
            return
        if self.suppressed:
            return
        if tag == "w" and self.current is not None:
            self.current["text"] = SPACE.sub(" ", self.current["text"]).strip()
            if self.current["text"]:
                self.pieces.append(self.current)
            self.current = None

    def handle_data(self, data):
        if not self.suppressed:
            self._append_text(data)

    def _append_text(self, data):
        if not data:
            return
        if self.current is not None:
            self.current["text"] += data
        else:
            self.pieces.append({"text": data, "strongs": [], "morphs": []})


def parse_verse(raw: bytes) -> dict:
    parser = VerseParser()
    parser.feed(raw.decode("utf-8", errors="replace"))
    parser.close()
    segments: list[dict] = []
    for piece in parser.pieces:
        text = html.unescape(SPACE.sub(" ", piece["text"]))
        if not text.strip():
            continue
        codes = piece["strongs"]
        morphs = piece["morphs"]
        if codes:
            segment = {"text": text.strip()}
            if len(codes) == 1:
                segment["strong"] = codes[0]
            else:
                segment["strongs"] = codes
            if len(morphs) == 1:
                segment["morph"] = morphs[0]
            elif morphs:
                segment["morphs"] = morphs
            segments.append(segment)
            continue
        for token in text.split():
            if segments and re.fullmatch(r"[\],.;:!?)”’]+", token):
                segments[-1]["text"] += token
            else:
                segments.append({"text": token})

    text = " ".join(segment["text"] for segment in segments)
    text = AFTER_OPEN.sub(r"\1", BEFORE_PUNCT.sub(r"\1", text)).strip()
    codes = sorted({code for segment in segments for code in
                    ([segment["strong"]] if segment.get("strong") else segment.get("strongs", []))},
                   key=lambda value: (value[0], int(value[1:])))
    return {"text": text, "segments": segments, "strongs": codes}


def extract(module_dir: Path, out_id: str) -> dict:
    confs = list(module_dir.rglob("*.conf"))
    if len(confs) != 1:
        raise ValueError(f"Se esperaba un .conf en {module_dir}; encontrados: {len(confs)}")
    conf = confs[0].read_text(encoding="utf-8", errors="replace")
    data_match = re.search(r"^DataPath=(.+)$", conf, re.MULTILINE | re.IGNORECASE)
    if not data_match:
        raise ValueError("DataPath ausente")
    data_dir = module_dir / data_match.group(1).strip().lstrip("./").rstrip("/")
    out = ROOT / "modules/bibles" / out_id
    if out.exists():
        shutil.rmtree(out)
    (out / "books").mkdir(parents=True)

    all_books = []
    totals = {"books": 0, "verses": 0, "versesWithStrong": 0, "strongOccurrences": 0}
    for prefix, verse_map, books in (("ot", OT_VERSE_MAP, OT_BOOKS), ("nt", NT_VERSE_MAP, NT_BOOKS)):
        index_path = data_dir / f"{prefix}.bzv"
        blocks_path = data_dir / f"{prefix}.bzs"
        content_path = data_dir / f"{prefix}.bzz"
        index = read_bzv(index_path, len(verse_map))
        blocks = read_bzs(blocks_path)
        block_cache = {}
        book_payloads = {book_id: {"schemaVersion": 2, "book": book_id, "chapters": {}}
                         for book_id, _, _ in books}
        for position, (book_id, chapter, verse) in enumerate(verse_map):
            if book_id == "__" or chapter < 1 or verse < 1:
                continue
            block, start, size = index[position]
            if not size:
                continue
            if block not in block_cache:
                block_cache[block] = decompress_block(content_path, blocks, block)
            parsed = parse_verse(block_cache[block][start:start + size])
            chapters = book_payloads[book_id]["chapters"]
            chapters.setdefault(str(chapter), {})[str(verse)] = parsed
            totals["verses"] += 1
            if parsed["strongs"]:
                totals["versesWithStrong"] += 1
                totals["strongOccurrences"] += sum(
                    len(segment.get("strongs", [])) + (1 if segment.get("strong") else 0)
                    for segment in parsed["segments"]
                )
        for book_id, name, _ in books:
            payload = book_payloads[book_id]
            if not payload["chapters"]:
                continue
            dump_path = out / "books" / f"{book_id}.json"
            dump_path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
            all_books.append({"id": book_id, "name": name, "number": len(all_books) + 1,
                              "file": f"books/{book_id}.json"})
            totals["books"] += 1

    manifest = {
        "schemaVersion": 2,
        "id": out_id,
        "type": "bible",
        "name": "King James Version (1769) with Strong's Numbers",
        "abbreviation": "KJV+",
        "language": "en",
        "year": 1769,
        "description": "CrossWire KJV 3.1 with embedded Strong's numbers and morphology.",
        "license": "GPL; CrossWire grants a general public license to use this text for any purpose.",
        "source": "CrossWire Bible Society KJV 3.1",
        "hasStrongs": True,
        "books": all_books,
    }
    (out / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    (out / "conversion-report.json").write_text(json.dumps(totals, indent=2), encoding="utf-8")
    return totals


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("module_dir", type=Path)
    parser.add_argument("--out-id", default="kjv-strong")
    args = parser.parse_args()
    print(json.dumps(extract(args.module_dir, args.out_id), indent=2))


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Import the public-domain Cambridge Hebrews commentary from saved HTML pages.

Expected input files are ``cambridge-heb-1.html`` through
``cambridge-heb-13.html``, downloaded from:
https://biblehub.com/commentaries/cambridge/hebrews/
"""

from __future__ import annotations

import argparse
import html
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "biblia/modules/commentaries/cambridge/books/HEB.json"
AUTHOR = "Frederic W. Farrar (1831-1903)"


def clean_fragment(fragment: str) -> str:
    fragment = re.sub(r"<div class=\"verse\">.*?</div>", "", fragment, flags=re.S)
    fragment = re.sub(r"<A name=\"\d+\"></a>", "", fragment, flags=re.I)
    fragment = re.sub(
        r"<span class=\"p\">\s*<br\s*/?>\s*<br\s*/?>\s*</span>",
        "</p><p>",
        fragment,
        flags=re.I,
    )
    fragment = re.sub(r"<span class=\"bld\">(.*?)</span>", r"<strong>\1</strong>", fragment, flags=re.S)
    fragment = re.sub(r"<span class=\"ital\">(.*?)</span>", r"<em>\1</em>", fragment, flags=re.S)
    fragment = re.sub(r"<span class=\"greekheb\">(.*?)</span>", r"<span lang=\"grc\">\1</span>", fragment, flags=re.S)
    # BibleHub uses this as an unclosed wrapper around the chapter introduction.
    fragment = fragment.replace('<div class="chap">', "")
    fragment = re.sub(r"</?a\b[^>]*>", "", fragment, flags=re.I)
    fragment = re.sub(r"<span\b[^>]*>(.*?)</span>", r"\1", fragment, flags=re.S | re.I)
    fragment = re.sub(r"\s+", " ", fragment).strip()
    fragment = fragment.removeprefix("</p>").removesuffix("<p>").strip()
    return f"<p>{fragment}</p>" if fragment else ""


def parse_chapter(path: Path, chapter: int) -> list[dict]:
    page = path.read_text(encoding="utf-8")
    body_match = re.search(
        r'<div class="padleft"><div class="vheading">.*?</div>(.*?)<div id="botbox">',
        page,
        flags=re.S,
    )
    if not body_match:
        raise ValueError(f"Cambridge commentary body not found in {path}")
    body = body_match.group(1)
    markers = list(
        re.finditer(
            rf'<div class="versenum"><a href="/hebrews/{chapter}-(\d+)\.htm">'
            rf"Hebrews {chapter}:(\d+)</a></div>",
            body,
        )
    )
    if not markers:
        raise ValueError(f"No verse markers found in {path}")

    introduction = clean_fragment(body[: markers[0].start()])
    entries = []
    for index, marker in enumerate(markers):
        verse = int(marker.group(1))
        if verse != int(marker.group(2)):
            raise ValueError(f"Mismatched verse marker in {path}: {marker.group(0)}")
        end = markers[index + 1].start() if index + 1 < len(markers) else len(body)
        content = clean_fragment(body[marker.end() : end])
        if index == 0 and introduction:
            content = introduction + content
        # The printed commentary does not give every verse an independent note.
        if not content:
            continue
        entries.append(
            {
                "id": f"cambridge-heb-{chapter}-{verse}",
                "title": f"Hebrews {chapter}:{verse}",
                "author": AUTHOR,
                "reference": {
                    "book": "HEB",
                    "chapterStart": chapter,
                    "verseStart": verse,
                    "chapterEnd": chapter,
                    "verseEnd": verse,
                },
                "content": html.unescape(content),
            }
        )
    return entries


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source_dir", type=Path, help="Directory containing the 13 saved HTML pages")
    args = parser.parse_args()

    entries = []
    for chapter in range(1, 14):
        entries.extend(parse_chapter(args.source_dir / f"cambridge-heb-{chapter}.html", chapter))

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        json.dumps({"entries": entries}, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {len(entries)} entries to {OUTPUT}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Import the reviewed July 2026 English Chapel Library collection.

Sources must already exist in /tmp.  EPUB supplies the reading text; the
publisher's PDF supplies the complete reproduction-notice page, which is kept
verbatim because Chapel Library makes that a condition of redistribution.
"""
from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path

from import_library_batch import card_html, epub_sections, page_html, slugify

ROOT = Path(__file__).resolve().parent.parent
EPUBS = Path("/tmp/chapel-english-approved")
PDF_OLD = Path("/tmp/chapel-library-review")
PDF_NEW = Path("/tmp/chapel-library-review-more")
TODAY = "2026-07-31"
OBSOLETE_IDS = {"mans-willfree-yet-bound-en"}

BOOKS = [
    ("cove", "The Covenants of Works and of Grace", "Walter J. Chantry",
     ["chapel-library", "teologia", "pactos"]),
    ("sagw", "The Scriptures and Good Works", "Arthur W. Pink",
     ["chapel-library", "vida-cristiana", "santificacion"]),
    ("efcm", "Encouragement for Christian Mothers", "James Cameron",
     ["chapel-library", "familia", "vida-cristiana"]),
    ("sasi", "The Scriptures and Sin", "Arthur W. Pink",
     ["chapel-library", "vida-cristiana", "santificacion"]),
    ("clft", "Christ’s Love for the Sick", "Charles H. Spurgeon",
     ["chapel-library", "consuelo", "vida-cristiana"]),
    ("ycot", "The Young Cottager", "Legh Richmond",
     ["chapel-library", "narrativa", "vida-cristiana"]),
    ("sosa", "Sins of the Saints", "Arthur W. Pink",
     ["chapel-library", "santificacion", "teologia"]),
    ("aira", "Am I Really a Christian?", "Thomas Boston",
     ["chapel-library", "seguridad", "vida-cristiana"]),
    ("hmmf", "Humility: Micah’s Message for Today", "Charles H. Spurgeon",
     ["chapel-library", "humildad", "vida-cristiana"]),
    ("mwfy", "Man’s Will—Free Yet Bound", "Walter J. Chantry",
     ["chapel-library", "teologia", "gracia"]),
]


def pdf_path(code: str) -> Path:
    for root in (PDF_NEW, PDF_OLD):
        candidate = root / f"{code}.pdf"
        if candidate.exists() and candidate.stat().st_size:
            return candidate
    raise FileNotFoundError(f"Missing reviewed PDF for {code}")


def pdf_text(code: str) -> str:
    source = pdf_path(code)
    target = source.with_name(f"{source.stem}-plain.txt")
    subprocess.run(["pdftotext", str(source), str(target)], check=True)
    return target.read_text(encoding="utf-8", errors="replace")


def notice_page(code: str) -> str:
    pages = pdf_text(code).split("\f")
    for page in pages:
        if "Permission is expressly granted" in page:
            return clean_pdf_text(page)
    raise RuntimeError(f"The reproduction notice was not found in {code}")


def clean_pdf_text(raw: str) -> str:
    raw = raw.replace("\u00ad", "").replace("\uf0b7", "•")
    raw = re.sub(r"(?<=\w)-\n(?=[a-z])", "", raw)
    raw = re.sub(r"(?m)^\s*\d+\s*$", "", raw)
    raw = re.sub(r"[ \t]+\n", "\n", raw)
    raw = re.sub(r"\n{3,}", "\n\n", raw)
    return raw.strip()


def mwfy_sections() -> list[dict]:
    raw = pdf_text("mwfy")
    body = raw.split("MAN’S WILL\nFREE YET BOUND", 2)[-1]
    body = clean_pdf_text(body)
    headings = [
        "1. Man Has a Will and That Will Has a Certain Freedom.",
        "2. Man’s Will Is Not a Sovereign Faculty.",
        "3. Man’s Will Is in Bondage to Sin.",
        "4. Man’s Will Is Not His Hope.",
    ]
    positions = [(body.find(heading), heading) for heading in headings]
    if any(position < 0 for position, _ in positions):
        raise RuntimeError("Could not locate every Man’s Will section heading")
    sections = [{
        "n": 1,
        "title": "Publication and reproduction notice",
        "content": notice_page("mwfy"),
    }]
    intro = body[:positions[0][0]].strip()
    if intro:
        sections.append({"n": 2, "title": "Introduction", "content": intro})
    for index, (start, heading) in enumerate(positions):
        end = positions[index + 1][0] if index + 1 < len(positions) else len(body)
        content = body[start + len(heading):end].strip()
        sections.append({"n": len(sections) + 1, "title": heading, "content": content})
    return sections


def main() -> None:
    imported = []
    topics_by_slug = {}
    for code, title, author, topics in BOOKS:
        if code == "mwfy":
            sections = mwfy_sections()
            source_format = "pdf"
        else:
            source_path = EPUBS / f"{code}.epub"
            sections = epub_sections(source_path, title)
            sections.insert(0, {
                "n": 1,
                "title": "Publication and reproduction notice",
                "content": notice_page(code),
            })
            for number, section in enumerate(sections, 1):
                section["n"] = number
            source_format = "epub"
        if sum(len(section["content"]) for section in sections) < 2_000:
            raise RuntimeError(f"Incomplete extraction for {code}")

        slug = (
            "mans-will-free-yet-bound-en"
            if code == "mwfy"
            else slugify(f"{title}-en")
        )
        source = f"https://www.chapellibrary.org/api/books/download?code={code}&format={source_format}"
        license_text = (
            "Chapel Library expressly permits reproduction by any means when no "
            "charge beyond nominal duplication cost is made and the copyright "
            "notice and its complete page are included."
        )
        payload = {
            "metadata": {
                "title": title,
                "author": author,
                "language": "en",
                "source": source,
                "license": license_text,
            },
            "sections": sections,
        }
        data_dir = ROOT / "biblia/modules/chapel-library" / slug
        data_dir.mkdir(parents=True, exist_ok=True)
        (data_dir / "sections.json").write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        book = (slug, title, author, "en", source, license_text, len(sections))
        imported.append(book)
        topics_by_slug[slug] = topics
        page_dir = ROOT / "libreria" / slug
        page_dir.mkdir(parents=True, exist_ok=True)
        (page_dir / "index.html").write_text(
            page_html(book, f"../../biblia/modules/chapel-library/{slug}/sections.json"),
            encoding="utf-8",
        )

    catalog_path = ROOT / "libreria/data/libreria.json"
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    new_ids = {book[0] for book in imported}
    catalog = [
        item for item in catalog
        if item.get("id") not in new_ids | OBSOLETE_IDS
    ]
    for slug, title, author, lang, source, license_text, _ in imported:
        catalog.append({
            "id": slug,
            "titulo": title,
            "seccion": "libreria",
            "tipo": "libro",
            "idioma": lang,
            "temas": topics_by_slug[slug],
            "fecha_agregado": TODAY,
            "autor": author,
            "url": f"/libreria/{slug}/",
            "fuente": source,
            "licencia": license_text,
        })
    catalog_path.write_text(
        json.dumps(catalog, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    index_path = ROOT / "libreria/index.html"
    index = index_path.read_text(encoding="utf-8")
    for slug in new_ids | OBSOLETE_IDS:
        index = re.sub(
            rf'\n\s*<a class="r-book-row" href="{re.escape(slug)}/".*?</a>\n',
            "\n",
            index,
            flags=re.S,
        )
    marker = "\n    </div>\n  </main>"
    cards = []
    for book in imported:
        card = card_html(book).replace(
            'data-tema="chapel-library,vida-cristiana"',
            f'data-tema="{",".join(topics_by_slug[book[0]])}"',
        )
        cards.append(card)
    index = index.replace(marker, "".join(cards) + marker, 1)
    counts = {
        lang: sum(item.get("idioma") == lang for item in catalog)
        for lang in ("es", "en")
    }
    index = re.sub(
        r'<div class="r-section-label"><h2[^>]*>[^<]+</h2></div>',
        f'<div class="r-section-label"><h2 data-i18n-live>'
        f'{counts["es"]} en español · {counts["en"]} en inglés</h2></div>',
        index,
        count=1,
    )
    index_path.write_text(index, encoding="utf-8")

    report = {
        "date": TODAY,
        "published": len(imported),
        "books": [{"id": book[0], "sections": book[6]} for book in imported],
    }
    (ROOT / "docs/chapel-english-approved-2026-07-31.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Importa el lote aprobado de Librería desde fuentes ya descargadas en /tmp.

No descarga nada. Convierte EPUB/PDF/HTML a la estructura de lectura de Verbo,
crea la página de cada libro y actualiza el catálogo y la estantería.
"""
from __future__ import annotations

import html
import json
import re
import subprocess
import unicodedata
import zipfile
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCES = Path("/tmp/verbo-library-sources")
TODAY = "2026-07-30"


def slugify(value: str) -> str:
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


# Los diez folletos Pink del listado original no tienen hoy archivo digital:
# Chapel devuelve 200 con cuerpo vacío. Se omiten deliberadamente hasta contar
# con una fuente oficial completa.
BOOKS = [
    # Español — Chapel Library
    ("holis", "Santidad", "J. C. Ryle", "es"),
    ("dopas", "Los deberes de los padres", "J. C. Ryle", "es"),
    ("tfyms", "Pensamientos para hombres jóvenes", "J. C. Ryle", "es"),
    ("cials", "Cristo es el todo", "J. C. Ryle", "es"),
    ("sancs", "Santificación", "J. C. Ryle", "es"),
    ("aodes", "¿Vivo o muerto?", "J. C. Ryle", "es"),
    ("rlwis", "Acordaos de la mujer de Lot", "J. C. Ryle", "es"),
    ("aybas", "¿Es usted nacido de nuevo?", "J. C. Ryle", "es"),
    ("scats", "Catecismo de Spurgeon", "Charles H. Spurgeon", "es"),
    ("faits", "Fe", "Charles H. Spurgeon", "es"),
    ("iwogs", "La Palabra infalible de Dios", "Charles H. Spurgeon", "es"),
    ("ytirs", "Aún hay lugar", "Charles H. Spurgeon", "es"),
    ("babus", "El bautismo: una sepultura", "Charles H. Spurgeon", "es"),
    ("elecs", "La elección", "Charles H. Spurgeon", "es"),
    ("swins", "Ganar almas", "Charles H. Spurgeon", "es"),
    ("hinas", "La incapacidad humana", "Charles H. Spurgeon", "es"),
    ("bochs", "El nacimiento de Cristo", "Charles H. Spurgeon", "es"),
    ("omans", "Nuestro manifiesto", "Charles H. Spurgeon", "es"),
    ("pojas", "La oración de Jabes", "Charles H. Spurgeon", "es"),
    ("bregs", "La regeneración bautismal", "Charles H. Spurgeon", "es"),
    ("latls", "El Señor y el leproso", "Charles H. Spurgeon", "es"),
    ("ggfgs", "Un gran evangelio para grandes pecadores", "Charles H. Spurgeon", "es"),
    ("doc2s", "Una defensa del calvinismo", "Charles H. Spurgeon", "es"),
    ("tptps", "¡Verdadera oración, verdadero poder!", "Charles H. Spurgeon", "es"),
    ("hsias", "¿Cómo debo acercarme a Dios?", "Horatius Bonar", "es"),
    ("wtwos", "Palabras para el ganador de almas", "Horatius Bonar", "es"),
    ("wwhis", "¿Adónde? ¿Adónde?", "Horatius Bonar", "es"),
    ("baigs", "Belén y las buenas nuevas", "Horatius Bonar", "es"),
    ("hsigs", "¿Cómo iré a Dios?", "Horatius Bonar", "es"),
    ("cdfts", "Cristo murió por los impíos", "Horatius Bonar", "es"),
    ("wimhs", "¿Cuál es mi esperanza?", "Horatius Bonar", "es"),
    ("iomes", "En mi lugar", "Horatius Bonar", "es"),
    ("ltims", "La larga eternidad", "Horatius Bonar", "es"),
    ("wpaws", "El mundo se acaba", "Horatius Bonar", "es"),
    ("ppfes", "El progreso del peregrino para todos", "John Bunyan", "es"),
    ("fduts", "Deberes familiares", "John Bunyan", "es"),
    ("botws", "La esclavitud de la voluntad", "Martín Lutero", "es"),
    ("siths", "Pecadores en las manos de un Dios airado", "Jonathan Edwards", "es"),
    ("mogrs", "El método de la gracia", "George Whitefield", "es"),
    ("hlops", "La vida secreta de oración", "David MacIntyre", "es"),
    # Inglés — Chapel Library
    ("holi", "Holiness", "J. C. Ryle", "en"),
    ("ctpr", "A Call to Prayer", "J. C. Ryle", "en"),
    ("worl", "The World", "J. C. Ryle", "en"),
    ("ayba", "Are You Born Again?", "J. C. Ryle", "en"),
    ("nowm", "Night of Weeping; Morning of Joy", "Horatius Bonar", "en"),
    ("gwop", "God's Way of Peace", "Horatius Bonar", "en"),
    ("togr", "The Throne of Grace", "Horatius Bonar", "en"),
    ("asoc", "The Atoning Sacrifice of Christ", "Arthur W. Pink", "en"),
    ("botw", "The Bondage of the Will", "Martin Luther", "en"),
]

PATRISTIC = [
    ("first-clement", "First Epistle of Clement", "Clement of Rome", "Roberts–Donaldson"),
    ("second-clement", "Second Epistle of Clement", "Anónimo", "Roberts–Donaldson"),
    ("didache", "The Didache", "Anónimo", "Roberts–Donaldson"),
    ("epistle-barnabas", "Epistle of Barnabas", "Anónimo", "Roberts–Donaldson"),
    ("shepherd-hermas", "The Shepherd of Hermas", "Hermas", "Roberts–Donaldson"),
    ("epistle-diognetus", "Epistle to Diognetus", "Anónimo (Mathetes)", "Roberts–Donaldson"),
    ("polycarp-philippians", "Polycarp to the Philippians", "Polycarp of Smyrna", "J. B. Lightfoot"),
    ("martyrdom-polycarp", "Martyrdom of Polycarp", "Iglesia de Esmirna", "Roberts–Donaldson"),
    ("ignatius-romans", "Ignatius to the Romans", "Ignatius of Antioch", "Roberts–Donaldson"),
    ("fragments-papias", "Fragments of Papias", "Papias of Hierapolis", "J. B. Lightfoot"),
]


class Blocks(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.blocks: list[tuple[str, str]] = []
        self.tag = ""
        self.buf: list[str] = []
        self.skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in {"script", "style", "nav", "footer"}:
            self.skip += 1
        if not self.skip and tag in {"h1", "h2", "h3", "h4", "p", "li", "blockquote"}:
            self.flush()
            self.tag = tag

    def handle_endtag(self, tag):
        if tag in {"script", "style", "nav", "footer"} and self.skip:
            self.skip -= 1
        if not self.skip and tag == self.tag:
            self.flush()

    def handle_data(self, data):
        if not self.skip and self.tag:
            self.buf.append(data)

    def flush(self):
        text = re.sub(r"\s+", " ", "".join(self.buf)).strip()
        if text:
            self.blocks.append((self.tag, text))
        self.buf = []
        self.tag = ""


def html_blocks(raw: bytes | str) -> list[tuple[str, str]]:
    parser = Blocks()
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8", errors="replace")
    parser.feed(raw)
    parser.flush()
    return parser.blocks


def sections_from_blocks(blocks, fallback_title):
    sections = []
    title = fallback_title
    body: list[str] = []
    started = False
    for tag, text in blocks:
        if text.lower() in {"contents", "table of contents"}:
            continue
        is_heading = tag in {"h1", "h2", "h3"} or bool(
            re.match(r"^(chapter|chap\.?|capítulo|section|book|vision|commandment|similitude|fragment)\b", text, re.I)
        )
        if is_heading and started and body:
            content = "\n\n".join(body).strip()
            if len(content) >= 80:
                sections.append({"n": len(sections) + 1, "title": title, "content": content})
            body = []
            title = text
        elif is_heading and not started:
            title = text
            started = True
        else:
            started = True
            body.append(text)
    if body:
        content = "\n\n".join(body).strip()
        if len(content) >= 80:
            sections.append({"n": len(sections) + 1, "title": title, "content": content})
    return sections


def epub_sections(path: Path, title: str):
    with zipfile.ZipFile(path) as zf:
        names = [n for n in zf.namelist() if re.search(r"\.(xhtml|html|htm)$", n, re.I)]
        # Los EPUB de Chapel usan nombres secuenciales; content.opf/nav quedan
        # fuera por extensión o se descartan por falta de cuerpo sustancial.
        blocks = []
        for name in sorted(names):
            part = html_blocks(zf.read(name))
            text_len = sum(len(t) for _, t in part)
            if text_len >= 120:
                blocks.extend(part)
        return sections_from_blocks(blocks, title)


def pdf_sections(path: Path, title: str):
    out = path.with_suffix(".txt")
    subprocess.run(["pdftotext", "-layout", str(path), str(out)], check=True)
    pages = out.read_text(encoding="utf-8", errors="replace").split("\f")
    sections = []
    for page in pages:
        page = "\n".join(line.rstrip() for line in page.splitlines()).strip()
        if len(page) < 80:
            continue
        heading = next((x.strip() for x in page.splitlines() if x.strip()), title)
        sections.append({"n": len(sections) + 1, "title": heading[:160], "content": page})
    return sections


def source_for(code):
    epub = SOURCES / "chapel" / f"{code}.epub"
    pdf = SOURCES / "chapel" / f"{code}.pdf"
    if epub.exists() and epub.stat().st_size:
        return epub, "epub"
    if pdf.exists() and pdf.stat().st_size:
        return pdf, "pdf"
    raise FileNotFoundError(f"Sin fuente digital completa: {code}")


def page_html(book, data_url):
    slug, title, author, lang, source, license_text, count = book
    cfg = {
        "id": slug,
        "title": title,
        "author": author,
        "dataUrl": data_url,
        "dataKey": "sections",
        "textField": "content",
        "titleField": "title",
        "unitLabel": "Capítulo" if lang == "es" else "Section",
        # English sources are already native texts, not untranslated Spanish
        # originals; "native" prevents the reader's manual-translation banner.
        "estrategiaTraduccion": "auto" if lang == "es" else "native",
    }
    return f"""<!DOCTYPE html>
<html lang="{lang}">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{html.escape(title)} | Librería | Verbo</title>
<meta name="description" content="{html.escape(title)}, por {html.escape(author)}, en el lector de Verbo.">
<link rel="canonical" href="https://verbobiblia.com/libreria/{slug}/">
<link rel="manifest" href="../../biblia/manifest.webmanifest">
<link rel="icon" type="image/png" sizes="192x192" href="../../biblia/assets/icons/icon-192.png">
<meta name="theme-color" content="#7f2d35">
<link rel="stylesheet" href="../../biblia/assets/style.css?v=20260730-rail-center">
<link rel="stylesheet" href="../../recursos/assets/recursos.css?v=20260728-taxonomia">
<link rel="stylesheet" href="../assets/reader.css?v=6">
</head>
<body class="static-page recursos-page">
<header class="static-page__header"><a class="static-page__brand" href="../../">Verbo</a><a class="static-page__back" href="../">← Librería</a></header>
<main class="static-page__main"><div class="reader" id="reader-root"></div></main>
<script>window.__LIBRERIA_BOOK__ = {json.dumps(cfg, ensure_ascii=False, indent=2)};</script>
<script src="../../biblia/assets/i18n.js?v=20260729-shared-dict2"></script>
<script src="../../biblia/assets/site-translate.js?v=20260729-2"></script>
<script src="../../biblia/assets/site-chrome.js?v=20260729-1"></script>
<script src="../assets/reader.js?v=6"></script>
</body></html>
"""


def card_html(book):
    slug, title, author, lang, source, license_text, count = book
    topics = "patristica,siglo-1,siglo-2" if "earlychristianwritings" in source else "chapel-library,vida-cristiana"
    label = "secciones" if lang == "es" else "sections"
    return f"""
      <a class="r-book-row" href="{slug}/" data-item data-idioma="{lang}" data-tema="{topics}">
        <div class="book-cover">
          <span class="book-cover-lang">{lang.upper()}</span>
          <svg class="book-cover-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M4 5h6a2 2 0 0 1 2 2v13a3 3 0 0 0-3-3H4V5Zm16 0h-6a2 2 0 0 0-2 2v13a3 3 0 0 1 3-3h5V5Z"/></svg>
          <span class="book-cover-era">{'Chapel Library' if 'chapellibrary' in source else 'Apostolic Fathers'}</span>
          <span class="book-cover-title">{html.escape(title)}</span>
          <span class="book-cover-rule"></span><span class="book-cover-author">{html.escape(author)}</span>
        </div>
        <p class="r-book-title">{html.escape(title)}</p><p class="r-book-meta">{count} {label}</p>
      </a>
"""


def main():
    imported = []
    for code, title, author, lang in BOOKS:
        source_path, kind = source_for(code)
        sections = epub_sections(source_path, title) if kind == "epub" else pdf_sections(source_path, title)
        if not sections or sum(len(x["content"]) for x in sections) < 500:
            raise RuntimeError(f"Extracción incompleta: {code}")
        slug = slugify(f"{title}-{lang}")
        source = f"https://www.chapellibrary.org/api/books/download?code={code}&format={kind}"
        license_text = "Permiso de reproducción de Chapel Library; conservar atribución y avisos de la edición."
        if code == "botws":
            license_text = (
                "© 1984 Grace Publications Trust. Todos los derechos reservados. Usado con permiso. "
                "Se permite reproducir por cualquier medio sin cobrar más que el costo nominal y "
                "conservando el aviso y su texto íntegro."
            )
        payload = {
            "metadata": {"title": title, "author": author, "language": lang, "source": source, "license": license_text},
            "sections": sections,
        }
        data_dir = ROOT / "biblia/modules/chapel-library" / slug
        data_dir.mkdir(parents=True, exist_ok=True)
        (data_dir / "sections.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        page_dir = ROOT / "libreria" / slug
        page_dir.mkdir(parents=True, exist_ok=True)
        imported.append((slug, title, author, lang, source, license_text, len(sections)))
        (page_dir / "index.html").write_text(
            page_html(imported[-1], f"../../biblia/modules/chapel-library/{slug}/sections.json"), encoding="utf-8"
        )

    for source_name, title, author, translator in PATRISTIC:
        path = SOURCES / "patristic" / f"{source_name}.html"
        # La navegación lateral de Early Christian Writings es una lista
        # enorme de otros documentos. El cuerpo de estas diez ediciones no
        # usa <li>, por lo que excluirlos evita incorporar ese catálogo ajeno.
        blocks = [block for block in html_blocks(path.read_bytes()) if block[0] != "li"]
        sections = sections_from_blocks(blocks, title)
        if not sections or sum(len(x["content"]) for x in sections) < 500:
            raise RuntimeError(f"Extracción patrística incompleta: {source_name}")
        slug = f"{source_name}-en"
        source = {
            "first-clement": "1clement-roberts.html", "second-clement": "2clement-roberts.html",
            "didache": "didache-roberts.html", "epistle-barnabas": "barnabas-roberts.html",
            "shepherd-hermas": "shepherd.html", "epistle-diognetus": "diognetus-roberts.html",
            "polycarp-philippians": "polycarp-lightfoot.html",
            "martyrdom-polycarp": "martyrdompolycarp-roberts.html",
            "ignatius-romans": "ignatius-romans-roberts.html", "fragments-papias": "papias.html",
        }[source_name]
        source = f"https://www.earlychristianwritings.com/text/{source}"
        license_text = f"{translator} historical English translation; public domain."
        payload = {
            "metadata": {"title": title, "author": author, "language": "en", "translator": translator,
                         "source": source, "license": license_text},
            "sections": sections,
        }
        data_dir = ROOT / "biblia/modules/library" / slug
        data_dir.mkdir(parents=True, exist_ok=True)
        (data_dir / "sections.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        page_dir = ROOT / "libreria" / slug
        page_dir.mkdir(parents=True, exist_ok=True)
        imported.append((slug, title, author, "en", source, license_text, len(sections)))
        (page_dir / "index.html").write_text(
            page_html(imported[-1], f"../../biblia/modules/library/{slug}/sections.json"), encoding="utf-8"
        )

    catalog_path = ROOT / "libreria/data/libreria.json"
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    known = {x["id"] for x in catalog}
    for slug, title, author, lang, source, license_text, count in imported:
        if slug not in known:
            catalog.append({
                "id": slug, "titulo": title, "seccion": "libreria", "tipo": "libro", "idioma": lang,
                "temas": ["patristica"] if "earlychristianwritings" in source else ["chapel-library"],
                "fecha_agregado": TODAY, "autor": author, "url": f"/libreria/{slug}/",
                "fuente": source, "licencia": license_text,
            })
    catalog_path.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    index_path = ROOT / "libreria/index.html"
    index = index_path.read_text(encoding="utf-8")
    marker = "\n    </div>\n  </main>"
    cards = "".join(card_html(book) for book in imported)
    if imported[0][0] not in index:
        index = index.replace(marker, cards + marker, 1)
    index = re.sub(r'<div class="r-section-label"><h2[^>]*>\d+ libros</h2></div>',
                   f'<div class="r-section-label"><h2 data-i18n-live>{16 + len(imported)} libros</h2></div>', index)
    index_path.write_text(index, encoding="utf-8")

    report = {
        "requested": 69, "imported": len(imported), "chapel": len(BOOKS), "patristic": len(PATRISTIC),
        "omitted_empty_sources": ["sachs", "sagos", "salos", "sajos", "satws", "sasis", "saobs", "saprs", "sagws", "satps"],
        "books": [{"id": x[0], "sections": x[6]} for x in imported],
    }
    (ROOT / "docs/library-batch-2026-07-30.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

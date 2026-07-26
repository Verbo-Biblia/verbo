#!/usr/bin/env python3
"""Genera las páginas estáticas de Recursos > Escuela Dominical a partir de los
.md ya extraídos del export de WordPress (Archivos Verbo/centrobiblicouf-extraido/).

Fuente: contenido propio de Juan (blog "Centro Bíblico UF"), sin problema de licencia.
"""
import html
import json
import re
import unicodedata
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "Archivos Verbo" / "centrobiblicouf-extraido"
OUT = ROOT / "recursos" / "escuela-dominical"
IMG_DIR = OUT / "assets" / "img"

CSS_HREF_FROM_LESSON = "../../../../biblia/assets/style.css?v=20260726-escuela-dominical"
CSS_HREF_FROM_AGE_INDEX = "../../../biblia/assets/style.css?v=20260726-escuela-dominical"
CSS_HREF_FROM_ED_INDEX = "../../biblia/assets/style.css?v=20260726-escuela-dominical"
CSS_HREF_FROM_RECURSOS_INDEX = "../biblia/assets/style.css?v=20260726-escuela-dominical"

MANIFEST_FROM_LESSON = "../../../../biblia/manifest.webmanifest"
MANIFEST_FROM_AGE_INDEX = "../../../biblia/manifest.webmanifest"
MANIFEST_FROM_ED_INDEX = "../../biblia/manifest.webmanifest"
MANIFEST_FROM_RECURSOS_INDEX = "../biblia/manifest.webmanifest"

ICON_FROM_LESSON = "../../../../biblia/assets/icons/icon-192.png"
ICON_FROM_AGE_INDEX = "../../../biblia/assets/icons/icon-192.png"
ICON_FROM_ED_INDEX = "../../biblia/assets/icons/icon-192.png"
ICON_FROM_RECURSOS_INDEX = "../biblia/assets/icons/icon-192.png"


def slugify(text):
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    text = text.lower()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-")


HEADER_HASH_RE = re.compile(r"^#{1,2}\s+\*\*(.+?)\*\*\s*$")
HEADER_BOLD_RE = re.compile(r"^\*\*(.+?):\*\*\s*$")
TITLE_RE = re.compile(r"^#\s+(?:⭐\s*)?LECCIÓN\s+(\d+)\s*[–—-]\s*(.+?)\s*$", re.IGNORECASE)
IMG_RE = re.compile(r"!\[\]\((https?://[^\s)]+)\)")

PROPER_WORDS = {
    "dios", "jesús", "jesus", "cristo", "jesucristo", "mesías", "mesias",
    "él", "salvador", "señor", "espíritu", "espiritu", "santo",
    "adán", "adan", "eva", "noé", "noe", "abraham", "isaac", "jacob",
    "josé", "jose", "moisés", "moises", "samuel", "david", "goliat",
    "elías", "elias", "jonás", "jonas", "daniel", "pentecostés", "pentecostes",
    "pedro", "pablo", "nicodemo", "marta", "maría", "maria", "jairo",
    "zaqueo", "bartimeo", "getsemaní", "getsemani",
}


def spanish_title_case(title):
    segments = title.split(": ")
    rendered = []
    for segment in segments:
        words = segment.lower().split(" ")
        out = []
        for i, w in enumerate(words):
            core = w.strip("¿¡?!:,.")
            prefix = w[: len(w) - len(w.lstrip("¿¡"))]
            suffix = w[len(prefix) + len(core):]
            if i == 0 or core in PROPER_WORDS:
                core = core[:1].upper() + core[1:] if core else core
            out.append(prefix + core + suffix)
        rendered.append(" ".join(out))
    return ": ".join(rendered)


def parse_lesson(path):
    lines = path.read_text(encoding="utf-8").splitlines()
    title_match = None
    for line in lines:
        title_match = TITLE_RE.match(line.strip())
        if title_match:
            break
    if not title_match:
        return None

    number = int(title_match.group(1))
    title = spanish_title_case(title_match.group(2).strip())

    image_url = None
    for line in lines:
        m = IMG_RE.search(line)
        if m:
            image_url = m.group(1)

    sections = []  # list of (label, [content_lines])
    current_label = None
    current_lines = []
    started = False
    for line in lines:
        stripped = line.strip()
        if not started:
            if stripped == "---":
                started = True
            continue
        if stripped == "---":
            continue
        if stripped.startswith("- **"):
            continue
        if IMG_RE.search(stripped):
            continue
        header = HEADER_HASH_RE.match(stripped) or HEADER_BOLD_RE.match(stripped)
        if header:
            if current_label is not None:
                sections.append((current_label, current_lines))
            current_label = header.group(1).strip()
            # Corrige typo real encontrado en la fuente ("ersículo base").
            if current_label.lower() == "ersículo base":
                current_label = "Versículo base"
            current_lines = []
            continue
        current_lines.append(line)
    if current_label is not None:
        sections.append((current_label, current_lines))

    return {
        "number": number,
        "title": title,
        "image_url": image_url,
        "sections": sections,
    }


def md_inline_to_html(text):
    text = html.escape(text)
    text = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)", r"<em>\1</em>", text)
    return text


def render_section_body(lines):
    """Convierte las líneas de una sección (párrafos, listas *, listas 1.) a HTML."""
    # Limpia líneas vacías repetidas al inicio/fin.
    while lines and not lines[0].strip():
        lines.pop(0)
    while lines and not lines[-1].strip():
        lines.pop()

    html_parts = []
    para_buf = []
    list_buf = []
    list_type = None  # 'ul' | 'ol'

    def flush_para():
        if para_buf:
            text = " ".join(l.strip() for l in para_buf if l.strip())
            if text:
                html_parts.append(f"<p>{md_inline_to_html(text)}</p>")
            para_buf.clear()

    def flush_list():
        nonlocal list_type
        if list_buf:
            tag = list_type or "ul"
            items = "".join(f"<li>{md_inline_to_html(i)}</li>" for i in list_buf)
            html_parts.append(f"<{tag}>{items}</{tag}>")
            list_buf.clear()
            list_type = None

    for line in lines:
        stripped = line.strip()
        if not stripped:
            flush_para()
            continue
        bullet = re.match(r"^[*\-]\s+(.*)$", stripped)
        numbered = re.match(r"^\d+\.\s+(.*)$", stripped)
        if bullet:
            flush_para()
            list_type = "ul"
            list_buf.append(bullet.group(1))
        elif numbered:
            flush_para()
            list_type = "ol"
            list_buf.append(numbered.group(1))
        else:
            flush_list()
            para_buf.append(stripped)
    flush_para()
    flush_list()
    return "\n".join(html_parts)


def download_image(url, dest):
    if dest.exists():
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=20) as resp:
        dest.write_bytes(resp.read())


PAGE_TEMPLATE = """<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{page_title} | Verbo</title>
<meta name="description" content="{description}">
<link rel="canonical" href="{canonical}">
<link rel="manifest" href="{manifest}">
<link rel="icon" type="image/png" sizes="192x192" href="{icon}">
<link rel="apple-touch-icon" href="{icon}">
<meta name="theme-color" content="#7f2d35">
<link rel="stylesheet" href="{css}">
</head>
<body class="static-page">

  <header class="static-page__header">
    <a class="static-page__brand" href="{brand_href}">Verbo</a>
    <a class="static-page__back" href="{back_href}">← {back_label}</a>
  </header>

  <main class="static-page__main">
    <article>
{body}
    </article>
  </main>
</body>
</html>
"""


def write_page(dest, **kwargs):
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(PAGE_TEMPLATE.format(**kwargs), encoding="utf-8")


def build_lesson_page(lesson, age_slug, age_label, prev_link, next_link):
    slug = f"leccion-{lesson['number']:02d}-{slugify(lesson['title'])}"
    dest = OUT / age_slug / slug / "index.html"

    body_parts = [f'      <p class="lesson-badge">Escuela Dominical · {age_label} · Lección {lesson["number"]}</p>']
    body_parts.append(f"      <h1>{md_inline_to_html(lesson['title'])}</h1>")

    if lesson.get("image_local"):
        rel_img = f"../../assets/img/{age_slug}/{lesson['image_local']}"
        body_parts.append(f'      <img src="{rel_img}" alt="" loading="lazy">')

    for label, lines in lesson["sections"]:
        body_html = render_section_body(list(lines))
        if not body_html:
            continue
        label_norm = label.strip()
        if label_norm.lower() in ("oración", "oración final"):
            # Envuelve la oración como cita.
            inner = body_html.replace("<p>", "<blockquote><p>").replace("</p>", "</p></blockquote>")
            body_parts.append(f"      <h2>{md_inline_to_html(label_norm)}</h2>\n{inner}")
        elif label_norm.lower() == "versículo base":
            body_parts.append(f"      <h2>{md_inline_to_html(label_norm)}</h2>\n      <blockquote>{body_html}</blockquote>")
        else:
            body_parts.append(f"      <h2>{md_inline_to_html(label_norm)}</h2>\n{body_html}")

    nav_bits = []
    if prev_link:
        nav_bits.append(f'<a href="../{prev_link}/">← Lección anterior</a>')
    nav_bits.append(f'<a href="../">Índice {age_label}</a>')
    if next_link:
        nav_bits.append(f'<a href="../{next_link}/">Lección siguiente →</a>')
    body_parts.append('      <hr>')
    body_parts.append('      <p class="lesson-nav">' + " · ".join(nav_bits) + "</p>")

    write_page(
        dest,
        page_title=f"Lección {lesson['number']}: {lesson['title']} — Escuela Dominical {age_label}",
        description=f"Lección {lesson['number']} de Escuela Dominical para niños de {age_label}: {lesson['title']}. Historia bíblica, actividad, preguntas y oración, lista para usar.",
        canonical=f"https://verbobiblia.com/recursos/escuela-dominical/{age_slug}/{slug}/",
        manifest=MANIFEST_FROM_LESSON,
        icon=ICON_FROM_LESSON,
        css=CSS_HREF_FROM_LESSON,
        brand_href="../../../../",
        back_href="../",
        back_label=f"Índice {age_label}",
        body="\n".join(body_parts),
    )
    return slug


BLOCKS_4_7 = [
    ("Creación", 1, 8),
    ("Patriarcas", 9, 14),
    ("Moisés", 15, 20),
    ("David", 21, 25),
    ("Profetas", 26, 28),
    ("Navidad", 29, 32),
    ("Ministerio de Jesús", 33, 40),
    ("Muerte y resurrección", 41, 43),
    ("La Iglesia", 44, 47),
    ("Vida cristiana", 48, 52),
]


def lesson_link_html(lesson, slug, age_slug):
    return (
        f'<li><a href="{slug}/">Lección {lesson["number"]} — '
        f'{md_inline_to_html(lesson["title"])}</a></li>'
    )


def build_age_index(age_slug, age_label, lessons, slugs, blocks=None):
    dest = OUT / age_slug / "index.html"
    body_parts = [
        f'      <p class="lesson-badge">Escuela Dominical · {len(lessons)} lecciones</p>',
        f"      <h1>{age_label}</h1>",
    ]
    if blocks:
        by_number = {l["number"]: (l, s) for l, s in zip(lessons, slugs)}
        for block_title, start, end in blocks:
            body_parts.append(f"      <h2>{block_title}</h2>")
            items = []
            for n in range(start, end + 1):
                if n not in by_number:
                    continue
                lesson, slug = by_number[n]
                items.append(lesson_link_html(lesson, slug, age_slug))
            body_parts.append("      <ul>" + "".join(items) + "</ul>")
    else:
        items = [lesson_link_html(l, s, age_slug) for l, s in zip(lessons, slugs)]
        body_parts.append("      <ul>" + "".join(items) + "</ul>")

    body_parts.append('      <hr>')
    body_parts.append('      <p class="lesson-nav"><a href="../">← Escuela Dominical</a></p>')

    write_page(
        dest,
        page_title=f"Escuela Dominical — {age_label}",
        description=f"Escuela Dominical para niños de {age_label}: {len(lessons)} lecciones bíblicas completas, listas para usar (historia, actividad, preguntas y oración).",
        canonical=f"https://verbobiblia.com/recursos/escuela-dominical/{age_slug}/",
        manifest=MANIFEST_FROM_AGE_INDEX,
        icon=ICON_FROM_AGE_INDEX,
        css=CSS_HREF_FROM_AGE_INDEX,
        brand_href="../../../",
        back_href="../",
        back_label="Escuela Dominical",
        body="\n".join(body_parts),
    )


def build_ed_landing(summary):
    dest = OUT / "index.html"
    body_parts = [
        "      <h1>Escuela Dominical</h1>",
        "      <p>Lecciones bíblicas completas para niños, listas para usar en tu iglesia, tu hogar o tu ministerio: historia bíblica, aplicación, actividad, preguntas y oración en cada una.</p>",
    ]
    for age_slug, data in summary.items():
        n = len(data["lessons"])
        body_parts.append(f'      <h2><a href="{age_slug}/">{data["label"]}</a></h2>')
        body_parts.append(f"      <p>{n} lecciones.</p>")
    body_parts.append('      <hr>')
    body_parts.append('      <p class="lesson-nav"><a href="../">← Recursos</a></p>')

    write_page(
        dest,
        page_title="Escuela Dominical — Lecciones para niños",
        description="Lecciones bíblicas completas de Escuela Dominical para niños de 4 a 10 años, listas para usar: historia, actividad, preguntas y oración.",
        canonical="https://verbobiblia.com/recursos/escuela-dominical/",
        manifest=MANIFEST_FROM_ED_INDEX,
        icon=ICON_FROM_ED_INDEX,
        css=CSS_HREF_FROM_ED_INDEX,
        brand_href="../../",
        back_href="../",
        back_label="Recursos",
        body="\n".join(body_parts),
    )


def main():
    groups = [
        {
            "src": SRC / "escuela-dominical-4-7",
            "age_slug": "4-7-anos",
            "age_label": "4 a 7 años",
            "blocks": BLOCKS_4_7,
        },
        {
            "src": SRC / "escuela-dominical-8-10",
            "age_slug": "8-10-anos",
            "age_label": "8 a 10 años",
            "blocks": None,
        },
    ]

    summary = {}

    for g in groups:
        lessons = []
        for path in sorted(g["src"].glob("*.md")):
            lesson = parse_lesson(path)
            if lesson is None:
                continue
            lessons.append(lesson)
        lessons.sort(key=lambda l: l["number"])

        # Descarga imágenes.
        for lesson in lessons:
            if not lesson["image_url"]:
                continue
            ext = ".jpg"
            fname = f"{lesson['number']:02d}{ext}"
            dest_img = IMG_DIR / g["age_slug"] / fname
            try:
                download_image(lesson["image_url"], dest_img)
                lesson["image_local"] = fname
            except Exception as e:
                print(f"  ! no se pudo descargar imagen lección {lesson['number']} ({g['age_slug']}): {e}")
                lesson["image_local"] = None

        # Genera páginas de lección con navegación prev/next.
        slugs = []
        for lesson in lessons:
            slug = f"leccion-{lesson['number']:02d}-{slugify(lesson['title'])}"
            slugs.append(slug)
        for i, lesson in enumerate(lessons):
            prev_link = slugs[i - 1] if i > 0 else None
            next_link = slugs[i + 1] if i < len(lessons) - 1 else None
            build_lesson_page(lesson, g["age_slug"], g["age_label"], prev_link, next_link)

        build_age_index(g["age_slug"], g["age_label"], lessons, slugs, blocks=g["blocks"])

        summary[g["age_slug"]] = {"label": g["age_label"], "lessons": lessons, "slugs": slugs}
        print(f"{g['age_slug']}: {len(lessons)} lecciones generadas")

    build_ed_landing(summary)
    print("landing escuela-dominical/index.html generado")

    return summary


if __name__ == "__main__":
    main()

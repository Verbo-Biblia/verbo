#!/usr/bin/env python3
"""
Genera el índice de metadatos de Recursos y Librería (esquema id/titulo/
seccion/tipo/idioma/temas/fecha_agregado/autor) a partir del HTML existente
(no se duplica contenido, se lee de las páginas ya publicadas) más un par
de tablas de clasificación curadas a mano para los campos que no se pueden
derivar automáticamente (tipo editorial, temas finos).

Salidas:
  - recursos/data/recursos.json
  - libreria/data/libreria.json
  - clasificacion-pendiente-revision.md   (piezas con clasificación ambigua)
  - build/novedades.json                  (top-N combinado, para portada)
  - build/articulos_list.html             (bloque a pegar en articulos-y-reflexiones/index.html)
  - build/libreria_grid.html              (bloque a pegar en libreria/index.html)
  - build/novedades_section.html          (bloque a pegar en index.html raíz)
  - build/matthew_henry/                  (66 páginas lector + índice, listas para copiar a libreria/matthew-henry/)

Nada de esto se aplica automáticamente a los archivos "en vivo": este script
solo genera datos y fragmentos de HTML en build/ para revisión, salvo los
tres archivos JSON/MD de arriba, que sí son la fuente de datos final.
"""
import json
import re
import subprocess
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RECURSOS = ROOT / "recursos"
LIBRERIA = ROOT / "libreria"
BUILD = ROOT / "build"

MESES = {
    "ene": 1, "feb": 2, "mar": 3, "abr": 4, "may": 5, "jun": 6,
    "jul": 7, "ago": 8, "sep": 9, "oct": 10, "nov": 11, "dic": 12,
}


def slugify(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode("ascii")
    s = s.lower().strip()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


def git_add_date(path):
    """Fecha (YYYY-MM-DD) del commit más antiguo que agregó `path`."""
    try:
        out = subprocess.run(
            ["git", "log", "--diff-filter=A", "--format=%ad", "--date=short", "--", str(path)],
            cwd=ROOT, capture_output=True, text=True, check=True,
        ).stdout.strip().splitlines()
        return out[-1] if out else None
    except subprocess.CalledProcessError:
        return None


def parse_badge_date(text, fallback_git_date, approx_flags):
    """'27 jul 2026' -> fecha exacta. 'oct 2025' -> primer día del mes (aproximado)."""
    text = text.strip().lower()
    m = re.match(r"^(\d{1,2})\s+([a-zé]{3,4})\.?\s+(\d{4})$", text)
    if m:
        day, mon, year = m.groups()
        mon = mon[:3]
        if mon in MESES:
            return f"{year}-{MESES[mon]:02d}-{int(day):02d}"
    m = re.match(r"^([a-zé]{3,4})\.?\s+(\d{4})$", text)
    if m:
        mon, year = m.groups()
        mon = mon[:3]
        if mon in MESES:
            approx_flags.append(True)
            return f"{year}-{MESES[mon]:02d}-01"
    return fallback_git_date


# ============================================================
# 1. ARTÍCULOS Y REFLEXIONES
# ============================================================

# tipo explícito solo para las piezas que llevaban el rótulo interno
# "Reflexión" (las demás ya vienen clasificadas por su propio badge de tema
# -> Apologética/Teología/Historia de la Biblia/Vida cristiana, que mapea
# 1:1 a tipo="articulo" por su extensión y estructura argumentativa).
TIPO_OVERRIDE = {
    "2corintios-5": "devocional",
    "efesios-2": "devocional",
    "romanos-8": "devocional",
    "permanece-en-la-vid": "devocional",
    "hoy-si-oyes-su-voz": "devocional",
    "aun-no-es-el-fin": "devocional",
    "fe-y-voluntad": "reflexion",
    "desierto-eclesiastes-3": "reflexion",
    "cosas-mejores-vendran": "reflexion",
    "mirada-que-nos-alcanzo": "reflexion",
    "piedad-sin-condescendencia": "reflexion",
    "su-fidelidad-no-la-mia": "reflexion",
    "aceptados-por-cristo": "reflexion",
    # --- las tres siguientes eran ambiguas; confirmadas por Juan el 2026-07-28 ---
    "fe-que-no-negocia": "reflexion",
    "como-agradar-a-dios": "articulo",
    "dios-no-compite-con-el-ruido": "articulo",
}

# Piezas con clasificación genuinamente ambigua, pendientes de confirmar con
# Juan. Vacío desde 2026-07-28 (las 3 últimas se confirmaron ese día); se deja
# el mecanismo por si aparecen nuevas piezas ambiguas más adelante.
PENDIENTES = {}

# ============================================================
# Estrategia de traducción (2026-07-29) — español -> inglés on-demand.
# Regla de prioridad: nativo_disponible > auto_traducible > requiere
# traducción manual (arcaísmos/OCR que rompen el traductor automático).
# Por defecto todo el contenido moderno de Juan (Recursos) es
# auto_traducible; las excepciones curadas a mano van aquí, encontradas
# escaneando el texto fuente en busca de caracteres de Área de Uso Privado
# (U+E000-U+F8FF), residuo típico de ligaduras OCR mal decodificadas al
# convertir un PDF escaneado.
# ============================================================

ESTRATEGIA_DEFAULT = {"modo": "auto_traducible"}

ESTRATEGIA_OVERRIDE = {
    # Librería — patrística ES traducida por Juan desde DOCX (sin OCR),
    # pero basada en Ante-Nicene Fathers (ed. Roberts & Donaldson), que SÍ
    # tiene traducción inglesa nativa de dominio público en newadvent.org/
    # fathers. No la marcamos nativo_disponible porque ese texto inglés no
    # vive en este repo todavía — queda como auto_traducible con nota, para
    # que Juan decida si vale la pena sumarlo como fuente nativa después.
    "la-didache": {"modo": "auto_traducible", "nota": "Traducción de Ante-Nicene Fathers (dominio público); existe versión inglesa nativa en newadvent.org/fathers, no incluida aún en el repo."},
    "primera-clemente": {"modo": "auto_traducible", "nota": "Traducción de Ante-Nicene Fathers (dominio público); existe versión inglesa nativa en newadvent.org/fathers, no incluida aún en el repo."},
    "segunda-clemente": {"modo": "auto_traducible", "nota": "Traducción de Ante-Nicene Fathers (dominio público); existe versión inglesa nativa en newadvent.org/fathers, no incluida aún en el repo."},
    "el-pastor-de-hermas": {"modo": "auto_traducible", "nota": "Traducción de Ante-Nicene Fathers (dominio público); existe versión inglesa nativa en newadvent.org/fathers, no incluida aún en el repo."},
    "epistola-de-bernabe": {"modo": "auto_traducible", "nota": "Traducción de Ante-Nicene Fathers (dominio público); existe versión inglesa nativa en newadvent.org/fathers, no incluida aún en el repo."},
    "epistola-a-diogneto": {"modo": "auto_traducible", "nota": "Traducción de Ante-Nicene Fathers (dominio público); existe versión inglesa nativa en newadvent.org/fathers, no incluida aún en el repo."},
    "fragmentos-de-papias": {"modo": "auto_traducible", "nota": "Traducción de Ante-Nicene Fathers (dominio público); existe versión inglesa nativa en newadvent.org/fathers, no incluida aún en el repo."},
    "martirio-de-ignacio": {"modo": "auto_traducible", "nota": "Traducción de Ante-Nicene Fathers (dominio público); existe versión inglesa nativa en newadvent.org/fathers, no incluida aún en el repo."},
    "martirio-de-policarpo": {"modo": "auto_traducible", "nota": "Traducción de Ante-Nicene Fathers (dominio público); existe versión inglesa nativa en newadvent.org/fathers, no incluida aún en el repo."},
    "policarpo-a-los-filipenses": {"modo": "auto_traducible", "nota": "Traducción de Ante-Nicene Fathers (dominio público); existe versión inglesa nativa en newadvent.org/fathers, no incluida aún en el repo."},
    "contra-las-herejias": {"modo": "auto_traducible", "nota": "Traducción de Ante-Nicene Fathers (dominio público); existe versión inglesa nativa en newadvent.org/fathers, no incluida aún en el repo."},

    # Librería — Matthew Henry ya es el texto inglés nativo (dominio
    # público), reutilizado del módulo de comentario que ya usa el panel
    # de /biblia/. No hace falta traducir nada hacia inglés.
    "matthew-henry": {"modo": "nativo_disponible", "nativo_ref": "biblia/modules/commentaries/matthew-henry-en", "nota": "El lector de Librería ya sirve el texto inglés nativo; la traducción EN->ES para lectores hispanos usa el mecanismo existente del panel de Comentario, no está conectada todavía en el lector de Librería (gap detectado, fuera de alcance de esta tarea)."},

    # Librería — Chapel Library: dos de los tres folletos tienen residuos
    # de OCR (ligaduras mal decodificadas del PDF original) detectados por
    # escaneo de caracteres U+E000-U+F8FF en el texto fuente.
    "deberes-de-hijos-y-padres": {"modo": "requiere_traduccion_manual", "motivo": "Símbolo residual de OCR en el texto fuente (ligadura mal decodificada del PDF original, U+F065/U+F066 al final del texto) — riesgo de romper la traducción automática."},
    "el-tesoro-de-david-condensado": {"modo": "requiere_traduccion_manual", "motivo": "Símbolo residual de OCR en el texto fuente (ligadura mal decodificada del PDF original, U+F066 al final del texto) — riesgo de romper la traducción automática."},
    # "totalmente-por-gracia" no tiene residuos de OCR detectados -> auto_traducible por defecto.

    # Librería — Evangelio según Jesucristo es texto bíblico (armonía
    # cronológica de los cuatro Evangelios), no un ensayo de Juan. Mismo
    # criterio ya usado en el resto del sitio: el texto bíblico no se
    # traduce automáticamente (ver decisión i18n 2026-07-29).
    "evangelio-segun-jesucristo": {"modo": "requiere_traduccion_manual", "motivo": "Es texto bíblico (armonía cronológica de los Evangelios), no un ensayo — mismo criterio que excluye el texto bíblico de traducción automática en el resto del sitio. Traducir a mano o evaluar una armonía nativa en inglés si Juan lo decide."},
}


def estrategia_para(slug):
    return ESTRATEGIA_OVERRIDE.get(slug, ESTRATEGIA_DEFAULT)

TEMAS_OVERRIDE = {
    "2corintios-5": ["gracia", "identidad-en-cristo"],
    "efesios-2": ["gracia", "identidad-en-cristo"],
    "romanos-8": ["seguridad-en-cristo"],
    "permanece-en-la-vid": ["vida-en-cristo"],
    "hoy-si-oyes-su-voz": ["fe"],
    "aun-no-es-el-fin": ["escatologia"],
    "fe-y-voluntad": ["fe"],
    "desierto-eclesiastes-3": ["sufrimiento", "esperanza"],
    "cosas-mejores-vendran": ["esperanza"],
    "mirada-que-nos-alcanzo": ["gracia"],
    "piedad-sin-condescendencia": ["santidad"],
    "su-fidelidad-no-la-mia": ["gracia", "fidelidad-de-dios"],
    "aceptados-por-cristo": ["identidad-en-cristo", "gracia"],
    "fe-que-no-negocia": ["fe"],
    "como-agradar-a-dios": ["santidad"],
    "dios-no-compite-con-el-ruido": ["vida-cristiana"],
}

BADGE_RE = re.compile(r'<p class="article-badge">Art[ií]culos y Reflexiones · ([^·]+) · ([^<]+)</p>')
H1_RE = re.compile(r"<h1>(.+?)</h1>", re.S)


def build_articulos(approx_flags):
    items = []
    base = RECURSOS / "articulos-y-reflexiones"
    for d in sorted(base.iterdir()):
        if not d.is_dir():
            continue
        idx = d / "index.html"
        if not idx.exists():
            continue
        html = idx.read_text(encoding="utf-8")
        slug = d.name
        m = BADGE_RE.search(html)
        topic, datestr = (m.group(1).strip(), m.group(2).strip()) if m else ("", "")
        h1_m = H1_RE.search(html)
        titulo = re.sub(r"\s+", " ", h1_m.group(1)).strip() if h1_m else slug

        git_date = git_add_date(idx)
        fecha = parse_badge_date(datestr, git_date, approx_flags) if datestr else git_date

        tipo = TIPO_OVERRIDE.get(slug)
        if tipo is None:
            tipo = "articulo"  # Apologética / Teología / Historia de la Biblia / Vida cristiana
        temas = TEMAS_OVERRIDE.get(slug)
        if temas is None:
            temas = [slugify(topic)] if topic else []

        items.append({
            "id": slug,
            "titulo": titulo,
            "seccion": "recursos",
            "tipo": tipo,
            "idioma": "es",
            "temas": temas,
            "fecha_agregado": fecha,
            "url": f"/recursos/articulos-y-reflexiones/{slug}/",
            "estrategia_traduccion": estrategia_para(slug),
            **({"pendiente_revision": True, "nota_pendiente": PENDIENTES[slug]} if slug in PENDIENTES else {}),
        })
    return items


# ============================================================
# 2. ESCUELA DOMINICAL
# ============================================================

GROUPS_4_7 = {
    "Creación": range(1, 9), "Patriarcas": range(9, 15), "Moisés": range(15, 21),
    "David": range(21, 26), "Profetas": range(26, 29), "Navidad": range(29, 33),
    "Ministerio de Jesús": range(33, 41), "Muerte y resurrección": range(41, 44),
    "La Iglesia": range(44, 48), "Vida cristiana": range(48, 53),
}
LESSON_LINK_RE = re.compile(r'href="(leccion-[^/"]+)/">Lecci[oó]n \d+ (?:—|-) ([^<]+)</a>')


def build_escuela_dominical():
    items = []
    for grupo_edad, group_map in (("4-7", GROUPS_4_7), ("8-10", None)):
        d = RECURSOS / "escuela-dominical" / f"{grupo_edad}-anos"
        idx_html = (d / "index.html").read_text(encoding="utf-8")
        fecha = git_add_date(d)
        # slug -> número de lección, a partir del listado de la página índice
        slug_title = LESSON_LINK_RE.findall(idx_html)
        for slug, titulo in slug_title:
            num = int(re.search(r"leccion-(\d+)-", slug).group(1))
            if group_map:
                tema = next((g for g, rng in group_map.items() if num in rng), None)
                temas = ["escuela-dominical", slugify(tema)] if tema else ["escuela-dominical"]
            else:
                temas = ["escuela-dominical", "vida-de-jesus"]
            items.append({
                "id": slug,
                "titulo": titulo.strip(),
                "seccion": "recursos",
                "tipo": "leccion",
                "idioma": "es",
                "temas": temas,
                "fecha_agregado": fecha,
                "grupo_edad": grupo_edad,
                "url": f"/recursos/escuela-dominical/{grupo_edad}-anos/{slug}/",
                "estrategia_traduccion": estrategia_para(slug),
            })
    return items


# ============================================================
# 3. LIBRERÍA
# ============================================================

LIBRERIA_META = {
    "evangelio-segun-jesucristo": {"autor": "Versión Cronológica Fluida — Verbo", "temas": ["evangelios", "armonia-evangelica"]},
    "la-didache": {"autor": "Enseñanza de los Doce Apóstoles", "temas": ["patristica", "siglo-1"]},
    "primera-clemente": {"autor": "Clemente de Roma", "temas": ["patristica", "siglo-1"]},
    "segunda-clemente": {"autor": "Atribuida a Clemente de Roma", "temas": ["patristica", "siglo-2"]},
    "el-pastor-de-hermas": {"autor": "Hermas", "temas": ["patristica", "siglo-2"]},
    "epistola-de-bernabe": {"autor": "Atribuida a Bernabé", "temas": ["patristica", "siglo-1", "siglo-2"]},
    "epistola-a-diogneto": {"autor": "Autor anónimo (Mathietes)", "temas": ["patristica", "apologetica", "siglo-2"]},
    "fragmentos-de-papias": {"autor": "Papías de Hierápolis", "temas": ["patristica", "siglo-2"]},
    "martirio-de-ignacio": {"autor": "Ignacio de Antioquía", "temas": ["patristica", "siglo-2"]},
    "martirio-de-policarpo": {"autor": "Iglesia de Esmirna", "temas": ["patristica", "siglo-2"]},
    "policarpo-a-los-filipenses": {"autor": "Policarpo de Esmirna", "temas": ["patristica", "siglo-2"]},
    "contra-las-herejias": {"autor": "Ireneo de Lyon", "temas": ["patristica", "apologetica", "siglo-2"]},
    "deberes-de-hijos-y-padres": {"autor": "Richard Adams", "temas": ["vida-cristiana", "familia", "chapel-library", "siglo-17"]},
    "totalmente-por-gracia": {"autor": "Charles Spurgeon", "temas": ["gracia", "evangelismo", "chapel-library", "siglo-19"]},
    "el-tesoro-de-david-condensado": {"autor": "Charles Spurgeon", "temas": ["salmos", "devocional", "chapel-library", "siglo-19"]},
    "matthew-henry": {
        "autor": "Matthew Henry (1662–1714)",
        "temas": ["comentario-biblico", "teologia"],
        "idioma": "en",
        "fecha_agregado": "2026-07-28",
    },
}

BOOK_ROW_RE = re.compile(
    r'<a class="r-book-row" href="([^/"]+)/"[^>]*>'
    r'(?:(?!<a class="r-book-row").)*?'
    r'<span class="book-cover-title"[^>]*>([^<]+)</span>',
    re.S,
)


def build_libreria():
    items = []
    idx_html = (LIBRERIA / "index.html").read_text(encoding="utf-8")
    for slug, titulo in BOOK_ROW_RE.findall(idx_html):
        meta = LIBRERIA_META.get(slug, {})
        fecha = meta.get("fecha_agregado") or git_add_date(LIBRERIA / slug)
        items.append({
            "id": slug,
            "titulo": titulo.strip(),
            "seccion": "libreria",
            "tipo": "libro",
            "idioma": meta.get("idioma", "es"),
            "temas": meta.get("temas", []),
            "fecha_agregado": fecha,
            "autor": meta.get("autor"),
            "url": f"/libreria/{slug}/",
            "estrategia_traduccion": estrategia_para(slug),
        })
    return items


MESES_LARGO = {1: "ene", 2: "feb", 3: "mar", 4: "abr", 5: "may", 6: "jun",
               7: "jul", 8: "ago", 9: "sep", 10: "oct", 11: "nov", 12: "dic"}


def fmt_fecha_corta(iso):
    y, m, d = iso.split("-")
    return f"{int(d)} {MESES_LARGO[int(m)]} {y}"


LANG_FLAG = {"es": "🇪🇸 ES", "en": "🇺🇸 EN", "bilingue": "🌐 ES/EN"}
TIPO_LABEL = {"devocional": "Devocional", "articulo": "Artículo", "reflexion": "Reflexión"}
TEMA_LABEL = {
    "apologetica": "Apologética", "teologia": "Teología", "vida-cristiana": "Vida cristiana",
    "historia-de-la-biblia": "Historia de la Biblia", "gracia": "Gracia", "fe": "Fe",
    "esperanza": "Esperanza", "sufrimiento": "Sufrimiento", "identidad-en-cristo": "Identidad en Cristo",
    "santidad": "Santidad", "seguridad-en-cristo": "Seguridad en Cristo", "escatologia": "Escatología",
    "vida-en-cristo": "Vida en Cristo", "fidelidad-de-dios": "Fidelidad de Dios",
    "patristica": "Patrística", "chapel-library": "Chapel Library", "salmos": "Salmos",
    "devocional": "Devocional", "familia": "Familia", "evangelismo": "Evangelismo",
    "evangelios": "Evangelios", "armonia-evangelica": "Armonía evangélica",
    "comentario-biblico": "Comentario bíblico",
    "siglo-1": "Siglo I", "siglo-2": "Siglo II", "siglo-17": "Siglo XVII", "siglo-19": "Siglo XIX",
}


def tema_label(slug):
    return TEMA_LABEL.get(slug, slug.replace("-", " ").capitalize())


def esc(s):
    return (s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


# ---------- bloque: lista filtrable de Artículos y Reflexiones ----------

def render_articulos_block(items):
    items_sorted = sorted(items, key=lambda it: it["fecha_agregado"], reverse=True)
    temas = sorted({t for it in items_sorted for t in it["temas"]})
    out = []
    out.append('<!-- CONTENT-FILTERS:START -->')
    out.append('<div class="r-filterbar" data-filter-bar data-filter-target="#articulos-list">')
    out.append('  <div class="r-filter-group" data-filter-group="tipo">')
    out.append('    <span class="r-filter-group-label">Tipo</span>')
    out.append('    <button type="button" class="r-filter-pill is-active" data-value="todos">Todos</button>')
    for val, label in (("devocional", "Devocional"), ("articulo", "Artículo"), ("reflexion", "Reflexión")):
        out.append(f'    <button type="button" class="r-filter-pill" data-value="{val}">{label}</button>')
    out.append('  </div>')
    out.append('  <div class="r-filter-group" data-filter-group="idioma">')
    out.append('    <span class="r-filter-group-label">Idioma</span>')
    out.append('    <button type="button" class="r-filter-pill is-active" data-value="todos">Todos</button>')
    out.append('    <button type="button" class="r-filter-pill" data-value="es">🇪🇸 Español</button>')
    out.append('    <button type="button" class="r-filter-pill" data-value="en">🇺🇸 English</button>')
    out.append('  </div>')
    out.append('  <select class="r-filter-select" data-filter-group="tema" aria-label="Filtrar por tema">')
    out.append('    <option value="todos">Todos los temas</option>')
    for t in temas:
        out.append(f'    <option value="{t}">{tema_label(t)}</option>')
    out.append('  </select>')
    out.append('</div>')
    out.append('<div class="r-article-list" id="articulos-list">')
    for it in items_sorted:
        temas_attr = ",".join(it["temas"])
        out.append(
            f'  <a class="r-article-row" data-item data-tipo="{it["tipo"]}" '
            f'data-idioma="{it["idioma"]}" data-tema="{temas_attr}" href="{it["id"]}/">'
            f'<span class="r-article-row-main">'
            f'<span class="r-article-row-title">{esc(it["titulo"])}</span>'
            f'<span class="r-article-row-tags">'
            f'<span class="r-tag r-tag-tipo">{TIPO_LABEL[it["tipo"]]}</span>'
            f'<span class="r-tag r-tag-lang">{LANG_FLAG[it["idioma"]]}</span>'
            f'</span></span>'
            f'<span class="r-article-row-date">{fmt_fecha_corta(it["fecha_agregado"])}</span></a>'
        )
    out.append('</div>')
    out.append('<p class="r-filter-empty" hidden>No hay piezas que coincidan con estos filtros.</p>')
    out.append('<!-- CONTENT-FILTERS:END -->')
    return "\n".join(out)


# ---------- bloque: grid filtrable de Librería ----------

BOOK_COVER_RE = re.compile(
    r'(<a class="r-book-row" href="([^/"]+)/">\s*<div class="book-cover">)(.*?)(</div>\s*<p class="r-book-title">)',
    re.S,
)


def render_libreria_filterbar(items):
    temas = sorted({t for it in items for t in it["temas"]})
    out = []
    out.append('<!-- CONTENT-FILTERS:START -->')
    out.append('<div class="r-filterbar" data-filter-bar data-filter-target="#libreria-grid">')
    out.append('  <div class="r-filter-group" data-filter-group="idioma">')
    out.append('    <span class="r-filter-group-label">Idioma</span>')
    out.append('    <button type="button" class="r-filter-pill is-active" data-value="todos">Todos</button>')
    out.append('    <button type="button" class="r-filter-pill" data-value="es">🇪🇸 Español</button>')
    out.append('    <button type="button" class="r-filter-pill" data-value="en">🇺🇸 English</button>')
    out.append('  </div>')
    out.append('  <select class="r-filter-select" data-filter-group="tema" aria-label="Filtrar por tema">')
    out.append('    <option value="todos">Todos los temas</option>')
    for t in temas:
        out.append(f'    <option value="{t}">{tema_label(t)}</option>')
    out.append('  </select>')
    out.append('</div>')
    out.append('<p class="r-filter-empty" hidden>No hay libros que coincidan con estos filtros.</p>')
    out.append('<!-- CONTENT-FILTERS:END -->')
    return "\n".join(out)


# ---------- bloque: novedades combinadas (portada) ----------

SECCION_LABEL = {"recursos": "Recursos", "libreria": "Librería"}


def render_novedades_block(combined, n=6):
    out = ['<!-- NOVEDADES:START -->']
    out.append('<section class="novedades" id="novedades">')
    out.append('  <div class="sections-head">')
    out.append('    <h2>Novedades</h2>')
    out.append('    <span>lo último agregado</span>')
    out.append('  </div>')
    out.append('  <div class="novedades-grid">')
    for it in combined[:n]:
        seccion_path = "biblia" if it["seccion"] == "biblia" else it["seccion"]
        href = it["url"].lstrip("/")
        out.append(
            f'    <a class="novedad-card" href="{href}">'
            f'<span class="novedad-seccion">{SECCION_LABEL.get(it["seccion"], it["seccion"])}</span>'
            f'<span class="novedad-title">{esc(it["titulo"])}</span>'
            f'<span class="novedad-date">{fmt_fecha_corta(it["fecha_agregado"])}</span>'
            f'</a>'
        )
    out.append('  </div>')
    out.append('</section>')
    out.append('<!-- NOVEDADES:END -->')
    return "\n".join(out)


# ============================================================
# 4. MATTHEW HENRY — 66 páginas lector + 1 selector, dentro de Librería,
#    leyendo directamente el JSON que ya usa el panel de Comentario
#    (biblia/modules/commentaries/matthew-henry-en/books/*.json).
#    No se duplica contenido: mismo archivo, dos puntos de entrada.
# ============================================================

MH_MODULE = ROOT / "biblia" / "modules" / "commentaries" / "matthew-henry-en"
MH_OUT = LIBRERIA / "matthew-henry"

NAV_SVG = {
    "biblia": '<path d="M12 5C10 3.5 6.5 3 4 3.5v15c2.5-.5 6 0 8 1.5m0-15c2-1.5 5.5-2 8-1.5v15c-2.5-.5-6 0-8 1.5m0-15v15"/>',
    "seminario": '<path d="M3 8.5L12 4l9 4.5-9 4.5-9-4.5Z"/><path d="M7 10.8V16c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5v-5.2"/>',
    "libreria": '<path d="M4 4h3v16H4zM9 4h3v16H9zM14 5l3-.5 2 15.5-3 .5z"/>',
    "recursos": '<path d="M4 4h16v4H4zM4 10h16v10H4z"/><path d="M9 14h6"/>',
}


def nav_block(root_rel, current):
    items = [("biblia", "Biblia"), ("seminario", "Seminario"), ("libreria", "Librería"), ("recursos", "Recursos")]
    out = [f'  <nav class="quick-nav" aria-label="Otras áreas de Verbo">']
    for key, label in items:
        cur = ' class="is-current"' if key == current else ""
        out.append(f'    <a href="{root_rel}{key}/"{cur}>')
        out.append(f'      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4">{NAV_SVG[key]}</svg>')
        out.append(f'      {label}')
        out.append('    </a>')
    out.append('  </nav>')
    return "\n".join(out)


def page_shell(root_rel, title, description, back_href, back_label, body_html, extra_head="",
                body_class="static-page recursos-page recursos-index"):
    return f"""<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title}</title>
<meta name="description" content="{description}">
<link rel="canonical" href="https://verbobiblia.com/libreria/matthew-henry/">
<link rel="manifest" href="{root_rel}biblia/manifest.webmanifest">
<link rel="icon" type="image/png" sizes="192x192" href="{root_rel}biblia/assets/icons/icon-192.png">
<link rel="apple-touch-icon" href="{root_rel}biblia/assets/icons/icon-192.png">
<meta name="theme-color" content="#7f2d35">
<link rel="stylesheet" href="{root_rel}biblia/assets/style.css?v=20260727-ofrenda">
<link rel="stylesheet" href="{root_rel}recursos/assets/recursos.css?v=20260728-taxonomia">
{extra_head}</head>
<body class="{body_class}">

  <header class="static-page__header">
    <a class="static-page__brand" href="{root_rel}">Verbo</a> <a href="https://paypal.me/VerboBiblia" target="_blank" rel="noopener noreferrer" class="ofrenda-btn" aria-label="Apoyar a Verbo con una ofrenda"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 C2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg><span>Ofrenda</span></a>
    <a class="static-page__back" href="{back_href}">← {back_label}</a>
  </header>

{nav_block(root_rel, "libreria")}

{body_html}
</body>
</html>
"""


def generate_matthew_henry():
    manifest = json.loads((MH_MODULE / "manifest.json").read_text(encoding="utf-8"))
    books = manifest["books"]
    OT_COUNT = 39
    MH_OUT.mkdir(exist_ok=True)

    # ---- índice: selector de 66 libros, agrupado AT/NT ----
    def book_rows(subset):
        rows = []
        for b in subset:
            slug = slugify(b["name"])
            rows.append(f'      <a class="r-article-row" href="{slug}/"><span class="r-article-row-title">{esc(b["name"])}</span></a>')
        return "\n".join(rows)

    body = f'''  <main class="static-page__main recursos-index">
    <span class="r-eyebrow">Librería · Matthew Henry</span>
    <h1>Comentario Bíblico de Matthew Henry</h1>
    <p class="r-lede">Comentario completo, versículo a versículo, de toda la Biblia (1708–1714). Mismo texto que el panel de Comentario en la Biblia — aquí en modo lectura continua, libro por libro. En inglés, dominio público.</p>

    <div class="r-section-label"><h2>Antiguo Testamento</h2></div>
    <div class="r-article-list">
{book_rows(books[:OT_COUNT])}
    </div>

    <div class="r-section-label"><h2>Nuevo Testamento</h2></div>
    <div class="r-article-list">
{book_rows(books[OT_COUNT:])}
    </div>
  </main>'''

    html = page_shell(
        root_rel="../../",
        title="Comentario Bíblico de Matthew Henry | Librería | Verbo",
        description="Comentario completo de Matthew Henry sobre toda la Biblia, libro por libro, en modo lectura.",
        back_href="../",
        back_label="Librería",
        body_html=body,
    )
    (MH_OUT / "index.html").write_text(html, encoding="utf-8")

    # ---- 66 páginas lector ----
    for b in books:
        slug = slugify(b["name"])
        d = MH_OUT / slug
        d.mkdir(exist_ok=True)
        cfg = {
            "id": f"matthew-henry-{slug}",
            "title": f"Matthew Henry — {b['name']}",
            "author": "Matthew Henry (1662–1714)",
            "dataUrl": f"../../../biblia/modules/commentaries/matthew-henry-en/{b['file']}",
            "dataKey": "entries",
            "textField": "content",
            "titleField": "title",
            "unitLabel": "Entrada",
            "htmlSource": True,
        }
        body = f'''  <main class="static-page__main">
    <div class="reader" id="reader-root"></div>
  </main>

  <script>
    window.__LIBRERIA_BOOK__ = {json.dumps(cfg, ensure_ascii=False, indent=2)};
  </script>
  <script src="../../assets/reader.js?v=5"></script>'''
        html = page_shell(
            root_rel="../../../",
            title=f"Matthew Henry — {b['name']} | Librería | Verbo",
            description=f"Comentario de Matthew Henry sobre {b['name']}, versículo a versículo.",
            back_href="../",
            back_label="Matthew Henry",
            body_html=body,
            extra_head='<link rel="stylesheet" href="../../assets/reader.css?v=5">\n',
            body_class="static-page recursos-page",
        )
        (d / "index.html").write_text(html, encoding="utf-8")

    print(f"Matthew Henry: generadas {len(books)} páginas lector + 1 índice en {MH_OUT.relative_to(ROOT)}/")


# ============================================================
# main
# ============================================================

def main():
    approx_flags = []
    articulos = build_articulos(approx_flags)
    escuela = build_escuela_dominical()
    libreria = build_libreria()

    recursos_json = articulos + escuela
    ids = [it["id"] for it in recursos_json + libreria]
    dupes = {i for i in ids if ids.count(i) > 1}
    if dupes:
        raise SystemExit(f"IDs duplicados entre recursos/libreria: {dupes}")

    (RECURSOS / "data").mkdir(exist_ok=True)
    (LIBRERIA / "data").mkdir(exist_ok=True)
    (RECURSOS / "data" / "recursos.json").write_text(
        json.dumps(recursos_json, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    (LIBRERIA / "data" / "libreria.json").write_text(
        json.dumps(libreria, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    # pendientes: solo se escribe el archivo si hay algo pendiente de verdad
    # (si no, no se recrea clasificacion-pendiente-revision.md tras borrarlo).
    pendientes_path = ROOT / "clasificacion-pendiente-revision.md"
    if any(it.get("pendiente_revision") for it in articulos):
        lines = [
            "# Clasificación pendiente de revisión\n",
            "Piezas donde la línea entre Artículo/Reflexión no fue clara por definición",
            "estricta (ver CLAUDE.md / tarea de taxonomía). Se les asignó un `tipo` por",
            "defecto para que el filtro funcione, marcado con `pendiente_revision: true`",
            "en `recursos/data/recursos.json`. Confirmar o corregir con Juan.\n",
        ]
        for it in articulos:
            if it.get("pendiente_revision"):
                lines.append(f"## {it['titulo']} (`{it['id']}`)")
                lines.append(f"- Asignado por defecto: **{it['tipo']}**")
                lines.append(f"- Motivo de la duda: {it['nota_pendiente']}")
                lines.append(f"- Revisar en: {it['url']}\n")
        pendientes_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    elif pendientes_path.exists():
        pendientes_path.unlink()

    # novedades combinadas
    combined = sorted(recursos_json + libreria, key=lambda it: it["fecha_agregado"], reverse=True)
    BUILD.mkdir(exist_ok=True)
    (BUILD / "novedades.json").write_text(
        json.dumps(combined[:12], ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    (BUILD / "articulos_list.html").write_text(render_articulos_block(articulos) + "\n", encoding="utf-8")
    (BUILD / "libreria_filterbar.html").write_text(render_libreria_filterbar(libreria) + "\n", encoding="utf-8")
    (BUILD / "novedades_section.html").write_text(render_novedades_block(combined) + "\n", encoding="utf-8")

    generate_matthew_henry()

    print(f"Artículos y Reflexiones: {len(articulos)} ({sum(1 for i in articulos if i['tipo']=='devocional')} devocional, "
          f"{sum(1 for i in articulos if i['tipo']=='reflexion')} reflexión, "
          f"{sum(1 for i in articulos if i['tipo']=='articulo')} artículo, "
          f"{sum(1 for i in articulos if i.get('pendiente_revision'))} pendientes)")
    print(f"Escuela Dominical: {len(escuela)} lecciones")
    print(f"Librería: {len(libreria)} entradas")
    print(f"Fechas aproximadas (solo mes/año en el badge original): {len(approx_flags)}")
    print("Escrito: recursos/data/recursos.json, libreria/data/libreria.json, "
          "clasificacion-pendiente-revision.md, build/novedades.json")


if __name__ == "__main__":
    main()

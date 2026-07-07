#!/usr/bin/env python3
"""Extrae referencias cruzadas del comentario TSK (Treasury of Scripture Knowledge)
y las normaliza a un módulo ligero modules/crossrefs/tsk/ para uso en la UI
(chips clicables bajo cada versículo), sin depender del texto completo de TSK.
"""
import json
import re
import glob
import os
import html as html_mod
from collections import OrderedDict

SRC_GLOB = "modules/commentaries/tsk/books/*/*.json"
OUT_DIR = "modules/crossrefs/tsk"

# El bookId de origen en TSK no siempre coincide con nuestro canon (ver bookAbbr
# en assets/app.js): TSK usa "NAH" para Nahúm, nuestro sitio usa "NAM".
SOURCE_BOOK_FIX = {"NAH": "NAM"}

# Abreviatura TSK (según el texto fuente en inglés) -> nuestro bookId canónico
TSK_ABBR = {
    "Ge": "GEN", "Ex": "EXO", "Le": "LEV", "Nu": "NUM", "De": "DEU",
    "Jos": "JOS", "Jg": "JDG", "Ru": "RUT", "1Sa": "1SA", "2Sa": "2SA",
    "1Ki": "1KI", "2Ki": "2KI", "1Ch": "1CH", "2Ch": "2CH", "Ezr": "EZR",
    "Ne": "NEH", "Es": "EST", "Job": "JOB", "Ps": "PSA", "Pr": "PRO",
    "Ec": "ECC", "So": "SNG", "Isa": "ISA", "Jer": "JER", "La": "LAM",
    "Eze": "EZK", "Da": "DAN", "Ho": "HOS", "Joe": "JOL", "Am": "AMO",
    "Ob": "OBA", "Jon": "JON", "Mic": "MIC", "Na": "NAM", "Hab": "HAB",
    "Zep": "ZEP", "Hag": "HAG", "Zec": "ZEC", "Mal": "MAL", "Mt": "MAT",
    "Mr": "MRK", "Lu": "LUK", "Joh": "JHN", "Ac": "ACT", "Ro": "ROM",
    "1Co": "1CO", "2Co": "2CO", "Ga": "GAL", "Eph": "EPH", "Php": "PHP",
    "Col": "COL", "1Th": "1TH", "2Th": "2TH", "1Ti": "1TI", "2Ti": "2TI",
    "Tit": "TIT", "Phm": "PHM", "Heb": "HEB", "Jas": "JAS", "1Pe": "1PE",
    "2Pe": "2PE", "1Jo": "1JN", "2Jo": "2JN", "3Jo": "3JN", "Jude": "JUD",
    "Re": "REV",
}

# Abreviatura española (idéntica a bookAbbr en assets/app.js) para el label de UI
ES_ABBR = {
    "GEN": "Gn", "EXO": "Ex", "LEV": "Lv", "NUM": "Nm", "DEU": "Dt",
    "JOS": "Jos", "JDG": "Jue", "RUT": "Rt", "1SA": "1 S", "2SA": "2 S",
    "1KI": "1 R", "2KI": "2 R", "1CH": "1 Cr", "2CH": "2 Cr", "EZR": "Esd",
    "NEH": "Neh", "EST": "Est", "JOB": "Job", "PSA": "Sal", "PRO": "Pr",
    "ECC": "Ec", "SNG": "Cnt", "ISA": "Is", "JER": "Jer", "LAM": "Lm",
    "EZK": "Ez", "DAN": "Dn", "HOS": "Os", "JOL": "Jl", "AMO": "Am",
    "OBA": "Abd", "JON": "Jon", "MIC": "Mi", "NAM": "Nah", "HAB": "Hab",
    "ZEP": "Sof", "HAG": "Hag", "ZEC": "Zac", "MAL": "Mal", "MAT": "Mt",
    "MRK": "Mc", "LUK": "Lc", "JHN": "Jn", "ACT": "Hch", "ROM": "Ro",
    "1CO": "1 Cor", "2CO": "2 Cor", "GAL": "Gá", "EPH": "Ef", "PHP": "Fil",
    "COL": "Col", "1TH": "1 Tes", "2TH": "2 Tes", "1TI": "1 Ti", "2TI": "2 Ti",
    "TIT": "Tit", "PHM": "Flm", "HEB": "Heb", "JAS": "Stg", "1PE": "1 P",
    "2PE": "2 P", "1JN": "1 Jn", "2JN": "2 Jn", "3JN": "3 Jn", "JUD": "Jud",
    "REV": "Ap",
}

KEYWORD_BOUNDARY_RE = re.compile(r"[A-Za-z][A-Za-z']*\.\s+")
HAS_COLON_REF_RE = re.compile(r"\d{1,3}:\d{1,3}")
TOKEN_SPLIT_RE = re.compile(r"[A-Za-z0-9,\-:]+")
CHAP_VERSE_RE = re.compile(r"^(\d{1,3}):([\d,\-]+)$")
GLUED_BOOK_CHAP_VERSE_RE = re.compile(r"^([123]?[A-Za-z]{1,4})(\d{1,3}):([\d,\-]+)$")
BARE_VERSE_RE = re.compile(r"^(\d{1,3}(?:-\d{1,3})?)(?:,(\d{1,3}(?:-\d{1,3})?))*$")


def parse_verse_list(text):
    """'22-24' -> [(22,24)]; '6,9' -> [(6,6),(9,9)]; '104,30'-like combos handled per-piece."""
    out = []
    for piece in text.split(","):
        piece = piece.strip("-, ")
        if not piece:
            continue
        if "-" in piece:
            a, b = piece.split("-", 1)
            if not a or not b:
                continue
            out.append((int(a), int(b)))
        else:
            out.append((int(piece), int(piece)))
    return out


def make_label(book, chapter, vstart, vend):
    abbr = ES_ABBR.get(book, book)
    if vstart == vend:
        return f"{abbr} {chapter}:{vstart}"
    return f"{abbr} {chapter}:{vstart}-{vend}"


MAX_CHAPTER = 176
MAX_VERSE = 176
ALPHA_RUN_RE = re.compile(r"(?:[A-Za-z][A-Za-z']*\s+){2,}[A-Za-z][A-Za-z']*")


def has_prose_run(segment):
    """True si el segmento contiene 3+ palabras alfabéticas seguidas (prosa real,
    no lista de referencias) — p.ej. 'God creates heaven and earth'."""
    return bool(ALPHA_RUN_RE.search(segment))


def extract_refs_from_segment(segment, own_book, own_chapter):
    allow_bare = not has_prose_run(segment)
    words = TOKEN_SPLIT_RE.findall(segment)
    refs = []
    run_book = own_book
    run_chapter = own_chapter
    i = 0
    n = len(words)
    while i < n:
        w = words[i]
        if w in TSK_ABBR and i + 1 < n and CHAP_VERSE_RE.match(words[i + 1]):
            run_book = TSK_ABBR[w]
            m = CHAP_VERSE_RE.match(words[i + 1])
            chap = int(m.group(1))
            if chap <= MAX_CHAPTER:
                run_chapter = chap
                for vs, ve in parse_verse_list(m.group(2)):
                    if vs <= MAX_VERSE and ve <= MAX_VERSE:
                        refs.append((run_book, run_chapter, vs, ve))
            i += 2
            continue
        m = CHAP_VERSE_RE.match(w)
        if m:
            chap = int(m.group(1))
            if chap <= MAX_CHAPTER:
                run_chapter = chap
                for vs, ve in parse_verse_list(m.group(2)):
                    if vs <= MAX_VERSE and ve <= MAX_VERSE:
                        refs.append((run_book, run_chapter, vs, ve))
            i += 1
            continue
        gm = GLUED_BOOK_CHAP_VERSE_RE.match(w)
        if gm and gm.group(1) in TSK_ABBR:
            run_book = TSK_ABBR[gm.group(1)]
            chap = int(gm.group(2))
            if chap <= MAX_CHAPTER:
                run_chapter = chap
                for vs, ve in parse_verse_list(gm.group(3)):
                    if vs <= MAX_VERSE and ve <= MAX_VERSE:
                        refs.append((run_book, run_chapter, vs, ve))
            i += 1
            continue
        if allow_bare and BARE_VERSE_RE.match(w) and ":" not in w:
            for vs, ve in parse_verse_list(w):
                if vs <= MAX_VERSE and ve <= MAX_VERSE:
                    refs.append((run_book, run_chapter, vs, ve))
            i += 1
            continue
        # token desconocido (palabra normal del idioma, ej. "that") -> ignorar
        i += 1
    return refs


def extract_refs_from_content(content, own_book, own_chapter):
    all_refs = []
    for p_match in re.finditer(r"<p>(.*?)</p>", content, re.S):
        block = html_mod.unescape(p_match.group(1))
        block = re.sub(r"<[^>]+>", " ", block)
        segments = KEYWORD_BOUNDARY_RE.split(block)
        for seg in segments:
            if not seg.strip():
                continue
            all_refs.extend(extract_refs_from_segment(seg, own_book, own_chapter))
    return all_refs


def main():
    os.makedirs(os.path.join(OUT_DIR, "books"), exist_ok=True)
    files = sorted(glob.glob(SRC_GLOB))
    per_book = {}
    total_refs = 0
    total_entries = 0
    entries_without_refs = 0
    zero_ref_samples = []

    for path in files:
        with open(path, encoding="utf-8") as fh:
            doc = json.load(fh)
        for entry in doc.get("entries", []):
            ref = entry.get("reference", {})
            book = ref.get("book")
            book = SOURCE_BOOK_FIX.get(book, book)
            chapter = ref.get("chapterStart")
            verse = ref.get("verseStart")
            if not book or chapter is None or verse is None:
                continue
            total_entries += 1
            raw_refs = extract_refs_from_content(entry.get("content", ""), book, chapter)
            if not raw_refs:
                entries_without_refs += 1
                if len(zero_ref_samples) < 20:
                    zero_ref_samples.append((entry.get("id"), entry.get("content", "")[:300]))
                continue
            seen = OrderedDict()
            for b, c, vs, ve in raw_refs:
                key = (b, c, vs, ve)
                if key in seen:
                    continue
                seen[key] = {
                    "book": b, "chapter": c,
                    "verseStart": vs, "verseEnd": ve,
                    "label": make_label(b, c, vs, ve),
                }
            refs_list = list(seen.values())
            total_refs += len(refs_list)
            book_data = per_book.setdefault(book, {})
            chap_data = book_data.setdefault(str(chapter), {})
            existing = chap_data.setdefault(str(verse), [])
            existing_keys = {(r["book"], r["chapter"], r["verseStart"], r["verseEnd"]) for r in existing}
            for r in refs_list:
                k = (r["book"], r["chapter"], r["verseStart"], r["verseEnd"])
                if k not in existing_keys:
                    existing.append(r)
                    existing_keys.add(k)

    books_manifest = []
    for book, chapters in sorted(per_book.items()):
        out_path = os.path.join(OUT_DIR, "books", f"{book}.json")
        with open(out_path, "w", encoding="utf-8") as fh:
            json.dump(chapters, fh, ensure_ascii=False, separators=(",", ":"))
        books_manifest.append({"id": book, "file": f"books/{book}.json"})

    manifest = {
        "schemaVersion": 1,
        "id": "tsk-crossrefs",
        "type": "crossrefs",
        "name": "Referencias cruzadas (Treasury of Scripture Knowledge)",
        "source": "Treasury of Scripture Knowledge, R. A. Torrey (editor)",
        "license": "Public Domain",
        "stats": {
            "totalEntries": total_entries,
            "entriesWithoutRefs": entries_without_refs,
            "totalReferences": total_refs,
            "books": len(books_manifest),
        },
        "books": books_manifest,
    }
    with open(os.path.join(OUT_DIR, "manifest.json"), "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, ensure_ascii=False, indent=2)

    print(f"Libros generados: {len(books_manifest)}")
    print(f"Entradas totales: {total_entries}")
    print(f"Entradas sin referencias parseadas: {entries_without_refs}")
    print(f"Referencias totales: {total_refs}")
    print("Muestras sin referencias (primeras 20):")
    for eid, snippet in zero_ref_samples:
        print(f"  {eid}: {snippet!r}")


if __name__ == "__main__":
    main()

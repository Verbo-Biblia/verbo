#!/usr/bin/env python3
"""Build the Spanish NPNF2 continuators dataset from CCEL.

Scope is deliberately limited to the complete ecclesiastical histories of
Socrates Scholasticus, Sozomen and Theodoret of Cyrus. Acquisition, cleaning,
chapter selection, deduplication and translation remain reproducible.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import html
import json
import re
import time
import threading
import unicodedata
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import Path


WORKS = {
    "socrates": {
        "volume": "npnf202", "toc": "https://www.ccel.org/ccel/schaff/npnf202.toc.html",
        "xml": "https://ccel.org/ccel/schaff/npnf202.xml",
        "base": "https://ccel.org/ccel/schaff/npnf202/", "prefix": "npnf202.ii",
        "books": ["iv", "v", "vi", "vii", "viii", "ix", "x"],
        "ranges": [(305, 337), (337, 360), (360, 364), (364, 378), (379, 395), (395, 408), (408, 439)],
        "author": "Sócrates Escolástico", "work": "Historia Eclesiástica",
    },
    "sozomen": {
        "volume": "npnf202", "toc": "https://www.ccel.org/ccel/schaff/npnf202.toc.html",
        "xml": "https://ccel.org/ccel/schaff/npnf202.xml",
        "base": "https://ccel.org/ccel/schaff/npnf202/", "prefix": "npnf202.iii",
        "books": ["vi", "vii", "viii", "ix", "x", "xi", "xii", "xiii", "xiv"],
        "ranges": [(305, 323), (324, 337), (337, 361), (337, 361), (361, 363), (363, 375), (375, 395), (395, 408), (408, 425)],
        "author": "Sozomeno", "work": "Historia Eclesiástica",
    },
    "theodoret": {
        "volume": "npnf203", "toc": "https://www.ccel.org/ccel/schaff/npnf203.toc.html",
        "xml": "https://ccel.org/ccel/schaff/npnf203.xml",
        "base": "https://ccel.org/ccel/schaff/npnf203/", "prefix": "npnf203.iv.viii",
        "books": ["i", "ii", "iii", "iv", "v"],
        "ranges": [(320, 337), (337, 361), (361, 363), (363, 378), (378, 429)],
        "author": "Teodoreto de Ciro", "work": "Historia Eclesiástica",
    },
}

PEOPLE = {
    "Jesucristo": [r"\bJesus Christ\b", r"\bChrist\b"],
    "Constantino": [r"\bConstantine(?: the Great)?\b"],
    "Licinio": [r"\bLicinius\b"], "Constancio": [r"\bConstantius\b"],
    "Constante": [r"\bConstans\b"], "Juliano": [r"\bJulian(?:us)?\b"],
    "Joviano": [r"\bJovian(?:us)?\b"], "Valentiniano": [r"\bValentinian(?:us)?\b"],
    "Valente": [r"\bValens\b"], "Graciano": [r"\bGratian(?:us)?\b"],
    "Teodosio": [r"\bTheodosius(?: the Great| the Younger)?\b"], "Arcadio": [r"\bArcadius\b"],
    "Honorio": [r"\bHonorius\b"],
    "Arrio": [r"\bArius\b"], "Atanasio": [r"\bAthanasius\b"],
    "Alejandro de Alejandría": [r"\bAlexander,? Bishop of Alexandria\b"],
    "Eusebio de Nicomedia": [r"\bEusebius(?:,? Bishop)? of Nicomedia\b"],
    "Eusebio de Cesarea": [r"\bEusebius(?: Pamphilus| of Caesarea| of Cæsarea)\b"],
    "Antonio Abad": [r"\bAnthony(?: the Monk)?\b"], "Basilio de Cesarea": [r"\bBasil(?:ius)? of C(?:ae|æ)sarea\b"],
    "Gregorio Nacianceno": [r"\bGregory (?:of Nazianzus|Nazianzen)\b"],
    "Gregorio de Nisa": [r"\bGregory of Nyssa\b"], "Juan Crisóstomo": [r"\bJohn Chrysostom\b", r"\bChrysostom\b"],
    "Ambrosio de Milán": [r"\bAmbrose\b"], "Martín de Tours": [r"\bMartin of Tours\b"],
    "Cirilo de Jerusalén": [r"\bCyril of Jerusalem\b"], "Cirilo de Alejandría": [r"\bCyril of Alexandria\b"],
    "Nestorio": [r"\bNestorius\b"], "Teófilo de Alejandría": [r"\bTheophilus of Alexandria\b"],
    "Agustín de Hipona": [r"\bAugustine\b"], "Jerónimo": [r"\bJerome\b"],
    "Orígenes": [r"\bOrigen\b"], "Cipriano de Cartago": [r"\bCyprian\b"],
    "Pedro": [r"\b(?:Apostle Peter|Peter the Apostle)\b"],
    "Pablo": [r"\b(?:Apostle Paul|Paul the Apostle)\b"],
}
CACHE_LOCK = threading.Lock()


class TocParser(HTMLParser):
    def __init__(self): super().__init__(); self.links = []
    def handle_starttag(self, tag, attrs):
        data = dict(attrs)
        if tag == "a" and data.get("class") == "TOC":
            self.links.append((data.get("href", ""), data.get("title", "")))


class ContentParser(HTMLParser):
    def __init__(self):
        super().__init__(); self.in_content = False; self.depth = 0; self.skip = 0; self.para = None; self.paras = []
    def handle_starttag(self, tag, attrs):
        data = dict(attrs); classes = set(data.get("class", "").split())
        if tag == "div" and "book-content" in classes:
            self.in_content = True; self.depth = 1; return
        if not self.in_content: return
        if tag == "div": self.depth += 1
        if self.skip: self.skip += 1; return
        if classes & {"mnote", "pb", "footnotes", "Note", "NoteRef", "navigation"}:
            self.skip = 1; return
        if tag in {"p", "h1", "h2", "h3", "h4", "li", "blockquote"}: self.para = []
        if tag == "br" and self.para is not None: self.para.append("\n")
    def handle_endtag(self, tag):
        if not self.in_content: return
        if self.skip:
            self.skip -= 1; return
        if tag in {"p", "h1", "h2", "h3", "h4", "li", "blockquote"} and self.para is not None:
            text = clean_text("".join(self.para))
            if text: self.paras.append(text)
            self.para = None
        if tag == "div":
            self.depth -= 1
            if self.depth <= 0: self.in_content = False
    def handle_data(self, data):
        if self.in_content and not self.skip and self.para is not None: self.para.append(data)


def clean_text(text):
    text = html.unescape(unicodedata.normalize("NFC", text)).replace("\u00ad", "").replace("\xa0", " ")
    text = re.sub(r"[ \t\r\f\v]+", " ", text)
    text = re.sub(r" *\n *", "\n", text)
    return re.sub(r"\s+([,.;:!?])", r"\1", text).strip()


def fetch(url, path):
    if path.exists(): return path.read_text(encoding="utf-8", errors="replace")
    req = urllib.request.Request(url, headers={"User-Agent": "Verbo church-history indexer/1.0"})
    with urllib.request.urlopen(req, timeout=90) as response: data = response.read()
    path.parent.mkdir(parents=True, exist_ok=True); path.write_bytes(data)
    return data.decode("utf-8", errors="replace")


def roman_to_int(value):
    values = {"I":1,"V":5,"X":10,"L":50,"C":100,"D":500,"M":1000}; total = previous = 0
    for char in reversed(value.upper()):
        number = values[char]; total += -number if number < previous else number; previous = max(previous, number)
    return total


def selected_links(spec, toc_html):
    parser = TocParser(); parser.feed(toc_html); selected = []
    for href, title in parser.links:
        for book_index, book_roman in enumerate(spec["books"], 1):
            prefix = f'{spec["prefix"]}.{book_roman}.'
            if href.startswith(prefix) and re.fullmatch(r"[ivxlcdm]+", href.removeprefix(prefix).removesuffix(".html"), re.I):
                chapter_roman = href.removeprefix(prefix).removesuffix(".html")
                selected.append((book_index, roman_to_int(chapter_roman), href, clean_text(title)))
                break
    return selected


def text_without_notes(element):
    parts = [element.text or ""]
    for child in element:
        if child.tag != "note": parts.append(text_without_notes(child))
        parts.append(child.tail or "")
    return "".join(parts)


def xml_chapters(xml_text):
    root = ET.fromstring(xml_text); parents = {child: parent for parent in root.iter() for child in parent}
    chapters = {}
    for division in (element for element in root.iter() if element.tag.startswith("div")):
        chapter_id = division.get("id", "")
        if not chapter_id or not division.get("title"): continue
        paragraphs = []
        for paragraph in division.iter("p"):
            ancestor = parents.get(paragraph); inside_note = False
            while ancestor is not None and ancestor is not division:
                if ancestor.tag == "note": inside_note = True; break
                ancestor = parents.get(ancestor)
            if inside_note or paragraph.get("class") == "endnote": continue
            value = re.sub(r"\s+", " ", clean_text(text_without_notes(paragraph))).strip()
            if value: paragraphs.append(value)
        title = clean_text(division.get("title", ""))
        for index, paragraph in enumerate(paragraphs):
            if re.match(r"^(?:Chapter\s+[IVXLCDM]+|Prologue\b)", paragraph, re.I):
                paragraphs = paragraphs[index + 1:]; break
        chapters[chapter_id] = (title, paragraphs)
    return chapters


def protect_references(text):
    pattern = re.compile(r"\b(?:Gen|Exod|Lev|Num|Deut|Josh|Judg|Ruth|Sam|Kings|Chron|Ezra|Neh|Esth|Job|Ps|Prov|Eccl|Song|Isa|Jer|Ezek|Dan|Hos|Joel|Amos|Obad|Jonah|Mic|Nah|Hab|Zeph|Hag|Zech|Mal|Matt|Mark|Luke|John|Acts|Rom|Cor|Gal|Eph|Phil|Col|Thess|Tim|Tit|Philem|Heb|Jam|Pet|Jude|Rev)\.?\s+[ivxlcdm\d]+(?:[.:,]\s*[ivxlcdm\d]+(?:[-–][ivxlcdm\d]+)?)?", re.I)
    refs = []
    def replace(match): refs.append(match.group(0)); return f"__BIBREF_{len(refs)-1}__"
    return pattern.sub(replace, text), refs


def translate(text, cache):
    key = hashlib.sha256(text.encode()).hexdigest()
    with CACHE_LOCK:
        if key in cache: return cache[key]
    protected, refs = protect_references(text); chunks = []
    while len(protected) > 4200:
        cut = max(protected.rfind("\n", 0, 4200), protected.rfind(". ", 0, 4200) + 1)
        if cut < 1000: cut = 4200
        chunks.append(protected[:cut]); protected = protected[cut:].lstrip()
    chunks.append(protected); translated = []
    for chunk in chunks:
        query = urllib.parse.urlencode({"client":"gtx", "sl":"en", "tl":"es", "dt":"t", "q":chunk})
        req = urllib.request.Request("https://translate.googleapis.com/translate_a/single?" + query, headers={"User-Agent":"Mozilla/5.0"})
        for attempt in range(6):
            try:
                with urllib.request.urlopen(req, timeout=90) as response: payload = json.load(response)
                translated.append("".join(piece[0] for piece in payload[0] if piece[0])); break
            except Exception:
                if attempt == 5: raise
                time.sleep(2 ** attempt)
        time.sleep(.08)
    result = "".join(translated)
    for index, ref in enumerate(refs): result = result.replace(f"__BIBREF_{index}__", ref)
    result = clean_text(result)
    with CACHE_LOCK: cache[key] = result
    return result


def extract_people(source):
    return [name for name, patterns in PEOPLE.items() if any(re.search(pattern, source, re.I) for pattern in patterns)]


def explicit_years(source, fallback):
    years = [int(value) for value in re.findall(r"\b(?:A\.?D\.?\s*)?(3\d{2}|4[0-3]\d)\b", source, re.I)]
    years = [year for year in years if 305 <= year <= 439]
    if not years: return fallback
    return max(fallback[0], min(years)), min(fallback[1], max(years))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--cache", default="/tmp/npnf2-continuators-source")
    parser.add_argument("--xml-dir", help="Optional directory containing npnf202.xml and npnf203.xml")
    parser.add_argument("--workers", type=int, default=6)
    parser.add_argument("--output", default="biblia/modules/church-history/npnf2-continuadores")
    args = parser.parse_args(); cache_dir = Path(args.cache); output = Path(args.output)
    translation_path = cache_dir / "translations.json"
    translations = json.loads(translation_path.read_text()) if translation_path.exists() else {}
    raw_entries = []; seen = set(); toc_cache = {}; xml_cache = {}
    for slug, spec in WORKS.items():
        volume = spec["volume"]
        if volume not in toc_cache: toc_cache[volume] = fetch(spec["toc"], cache_dir / f"{volume}.toc.html")
        if volume not in xml_cache:
            local_xml = Path(args.xml_dir) / f"{volume}.xml" if args.xml_dir else cache_dir / f"{volume}.xml"
            xml_cache[volume] = xml_chapters(local_xml.read_text(encoding="utf-8", errors="replace") if local_xml.exists() else fetch(spec["xml"], local_xml))
        links = selected_links(spec, toc_cache[volume])
        print(f"{spec['author']}: {len(links)} capítulos", flush=True)
        for book, chapter, href, source_title in links:
            chapter_id = href.removeprefix(f"{volume}.").removesuffix(".html")
            xml_title, paragraphs = xml_cache[volume].get(chapter_id, ("", []))
            source_title = xml_title or source_title
            source = "\n\n".join(paragraphs).strip()
            if len(source) < 40: continue
            fingerprint = hashlib.sha256(clean_text(source).encode()).hexdigest()
            if fingerprint in seen: continue
            seen.add(fingerprint)
            year_start, year_end = explicit_years(source_title + "\n" + source[:3000], spec["ranges"][book - 1])
            entry_id = f"npnf2-{slug}-l{book}-c{chapter}"
            raw_entries.append({
                "id": entry_id, "sourceTitle": source_title, "source": source,
                "autor": spec["author"], "obra": spec["work"], "libro": book, "capitulo": chapter,
                "personas": extract_people(source_title + "\n" + source), "eventos": [],
                "periodo": f"{year_start}–{year_end}" if year_start != year_end else str(year_start),
                "epoca": "era_patristica", "anioInicio": year_start, "anioFin": year_end,
                "sourceUrl": spec["base"] + href, "sourceFingerprint": fingerprint,
            })
    def translate_entry(raw):
        title_es = translate(raw["sourceTitle"], translations); body_es = translate(raw["source"], translations)
        entry = {key:value for key,value in raw.items() if key != "source"}
        entry["title"] = f"{raw['autor']}, Libro {raw['libro']}, Capítulo {raw['capitulo']} — {title_es}"
        entry["excerpt"] = re.sub(r"\s+", " ", body_es)[:280].rstrip() + ("…" if len(body_es) > 280 else "")
        entry["content"] = "".join(f"<p>{html.escape(p)}</p>" for p in body_es.split("\n\n") if p.strip())
        return entry
    entries = []
    translation_path.parent.mkdir(parents=True, exist_ok=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, args.workers)) as executor:
        for index, entry in enumerate(executor.map(translate_entry, raw_entries), 1):
            entries.append(entry)
            if index % 10 == 0 or index == len(raw_entries):
                with CACHE_LOCK: translation_path.write_text(json.dumps(translations, ensure_ascii=False), encoding="utf-8")
            print(f"[{index:03d}/{len(raw_entries)}] {entry['autor']} {entry['libro']}.{entry['capitulo']}", flush=True)
    output.mkdir(parents=True, exist_ok=True)
    (output / "entries.json").write_text(json.dumps({"entries": entries}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    manifest = {
        "schemaVersion": 2, "id": "npnf2-continuadores", "type": "churchHistory",
        "name": "Sócrates, Sozomeno y Teodoreto — Historias Eclesiásticas (NPNF2-2/3)",
        "abbreviation": "NPNF2-2/3", "language": "es",
        "authors": ["Sócrates Escolástico", "Sozomeno", "Teodoreto de Ciro"],
        "editor": "Philip Schaff", "translator": "Traducción automática editorial de Verbo desde el texto inglés de NPNF2-2 y NPNF2-3",
        "year": 1890, "coverage": {"start": 305, "end": 439},
        "description": "Las Historias Eclesiásticas completas de Sócrates Escolástico, Sozomeno y Teodoreto de Ciro, segmentadas por libro y capítulo.",
        "license": "Dominio público. Traducción propia desde las ediciones inglesas NPNF2-2 y NPNF2-3.",
        "sourceUrls": ["https://ccel.org/ccel/schaff/npnf202.html", "https://ccel.org/ccel/schaff/npnf203.html"],
        "entriesFile": "entries.json", "totalEntries": len(entries),
    }
    (output / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Total: {len(entries)} entradas", flush=True)


if __name__ == "__main__": main()

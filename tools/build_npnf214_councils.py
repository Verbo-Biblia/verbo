#!/usr/bin/env python3
"""Build the Spanish, citable NPNF2-14 council dataset from CCEL.

The script deliberately keeps acquisition, cleaning, segmentation and translation
separate.  Generated entries retain the exact CCEL leaf URL used as their source.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import time
import unicodedata
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

BASE = "https://ccel.org/ccel/schaff/npnf214/"
TOC_URL = "https://www.ccel.org/ccel/schaff/npnf214.toc.html"
ROOTS = {"vii", "ix", "x", "xi", "xii", "xiii", "xvi"}
SPECIAL = {"npnf214.xvii.iii.html", "npnf214.xvii.iv.html"}
COUNCILS = {
    "vii": ("Nicea I", 325), "ix": ("Constantinopla I", 381),
    "x": ("Éfeso", 431), "xi": ("Calcedonia", 451),
    "xii": ("Constantinopla II", 553), "xiii": ("Constantinopla III", "680-681"),
    "xvi": ("Nicea II", 787),
}


class TocParser(HTMLParser):
    def __init__(self):
        super().__init__(); self.links = []
    def handle_starttag(self, tag, attrs):
        data = dict(attrs)
        if tag == "a" and data.get("class") == "TOC":
            self.links.append((data.get("href", ""), data.get("title", "")))


class ContentParser(HTMLParser):
    """Extract readable paragraphs while discarding CCEL chrome and duplicate notes."""
    def __init__(self):
        super().__init__(); self.in_content = False; self.skip = 0; self.para = None; self.paras = []
    def handle_starttag(self, tag, attrs):
        data = dict(attrs); classes = set(data.get("class", "").split())
        if tag == "div" and "book-content" in classes: self.in_content = True; return
        if not self.in_content: return
        if self.skip: self.skip += 1; return
        if classes & {"mnote", "pb", "footnotes", "Note", "NoteRef"}:
            self.skip = 1; return
        if tag in {"p", "h1", "h2", "h3", "h4", "li"}: self.para = []
        if tag == "br" and self.para is not None: self.para.append("\n")
    def handle_endtag(self, tag):
        if not self.in_content: return
        if self.skip:
            self.skip -= 1; return
        if tag in {"p", "h1", "h2", "h3", "h4", "li"} and self.para is not None:
            text = clean_english("".join(self.para))
            if text: self.paras.append(text)
            self.para = None
        if tag == "div" and self.in_content: pass
    def handle_data(self, data):
        if self.in_content and not self.skip and self.para is not None: self.para.append(data)


def clean_english(text):
    text = html.unescape(unicodedata.normalize("NFC", text))
    text = text.replace("\u00ad", "").replace("\xa0", " ")
    text = re.sub(r"[ \t\r\f\v]+", " ", text)
    text = re.sub(r" *\n *", "\n", text)
    text = re.sub(r"\s+([,.;:!?])", r"\1", text)
    return text.strip()


def fetch(url, path):
    if path.exists(): return path.read_text(encoding="utf-8", errors="replace")
    req = urllib.request.Request(url, headers={"User-Agent": "Verbo church-history indexer/1.0"})
    with urllib.request.urlopen(req, timeout=60) as res: data = res.read()
    path.parent.mkdir(parents=True, exist_ok=True); path.write_bytes(data)
    return data.decode("utf-8", errors="replace")


def selected_links(toc_html):
    parser = TocParser(); parser.feed(toc_html); output = []
    for href, title in parser.links:
        match = re.match(r"npnf214\.([^.]+)(?:\.|$)", href)
        root = match.group(1) if match else ""
        if root in ROOTS or href in SPECIAL or href.startswith("npnf214.xv.vi"):
            if title not in {"Title Page.", "Title Page"}: output.append((href, clean_english(title)))
    return output


def classify(title):
    low = title.lower()
    # Editorial commentary by Schaff must never be confused with conciliar text,
    # even when its subject mentions a canon, definition, decree or sentence.
    if low.startswith("excursus") or low.startswith("historical excursus"):
        return "excursus"
    if "creed" in low: return "credo"
    if re.match(r"canon [ivxlcdm]+", low) or "anathematism" in low or "anathema" in low: return "canon"
    if any(x in low for x in ("definition", "decree", "sentence", "condemnation", "capitula", "edict")): return "decreto_dogmatico"
    if any(x in low for x in ("letter", "epistle", "synodal")): return "carta_sinodal"
    return "excursus"


def metadata(href):
    root = href.split(".")[1]
    if href.startswith("npnf214.xvii"):
        return "Cánones Apostólicos", 300, "Cánones y documentos antiguos"
    if href.startswith("npnf214.xv.vi"):
        return "Cartago bajo Cipriano", 256, "Cánones y documentos antiguos"
    council, year = COUNCILS[root]
    era = "Concilios Tempranos (325-451)" if root in {"vii", "ix", "x", "xi"} else "Concilios Tardíos (553-787)"
    return council, year, era


def protect_references(text):
    # CCEL's printed references are intentionally left verbatim inside stable tokens.
    pat = re.compile(r"\b(?:Gen|Exod|Lev|Num|Deut|Josh|Judg|Ruth|Sam|Kings|Chron|Ezra|Neh|Esth|Job|Ps|Prov|Eccl|Song|Isa|Jer|Ezek|Dan|Hos|Joel|Amos|Obad|Jonah|Mic|Nah|Hab|Zeph|Hag|Zech|Mal|Matt|Mark|Luke|John|Acts|Rom|Cor|Gal|Eph|Phil|Col|Thess|Tim|Tit|Philem|Heb|Jam|Pet|Jude|Rev)\.?\s+[ivxlcdm\d]+(?:[.:,]\s*[ivxlcdm\d]+(?:[-–][ivxlcdm\d]+)?)?", re.I)
    refs = []
    def repl(m): refs.append(m.group(0)); return f"__BIBREF_{len(refs)-1}__"
    return pat.sub(repl, text), refs


def translate(text, cache):
    key = hashlib.sha256(text.encode()).hexdigest()
    if key in cache: return cache[key]
    protected, refs = protect_references(text)
    chunks = []
    while len(protected) > 4200:
        cut = max(protected.rfind("\n", 0, 4200), protected.rfind(". ", 0, 4200) + 1)
        if cut < 1000: cut = 4200
        chunks.append(protected[:cut]); protected = protected[cut:].lstrip()
    chunks.append(protected)
    translated = []
    for chunk in chunks:
        query = urllib.parse.urlencode({"client":"gtx","sl":"en","tl":"es","dt":"t","q":chunk})
        req = urllib.request.Request("https://translate.googleapis.com/translate_a/single?" + query,
                                     headers={"User-Agent":"Mozilla/5.0"})
        for attempt in range(5):
            try:
                with urllib.request.urlopen(req, timeout=90) as res: payload = json.load(res)
                translated.append("".join(piece[0] for piece in payload[0] if piece[0])); break
            except Exception:
                if attempt == 4: raise
                time.sleep(2 ** attempt)
        time.sleep(.08)
    result = "".join(translated)
    for i, ref in enumerate(refs): result = result.replace(f"__BIBREF_{i}__", ref)
    cache[key] = clean_english(result)
    return cache[key]


def roman_number(title):
    m = re.search(r"\b(?:Canon|Anathematism)\s+([IVXLCDM]+)", title, re.I)
    return ("Canon " + m.group(1).upper()) if m else None


def split_embedded_units(href, title, paras):
    """Split documents whose individual canons/anathemas are not exposed in CCEL's TOC."""
    if href == "npnf214.xvii.iv.html":
        heading = re.compile(r"^Canon\s+([IVXLCDM]+)\b", re.I)
        forced_type = "canon"
    elif href in {"npnf214.xii.vii.html", "npnf214.xii.ix.html", "npnf214.xii.x.html"}:
        heading = re.compile(r"^([IVXLCDM]+)\.$")
        forced_type = "decreto_dogmatico"
    else:
        return [(title, paras, None, None)]
    units = []; current_title = None; current = []; number = None
    for para in paras:
        match = heading.match(para)
        if match:
            if current_title and current: units.append((current_title, current, forced_type, number))
            number = ("Canon " + match.group(1).upper()) if forced_type == "canon" else match.group(1).upper()
            current_title = para if forced_type == "canon" else f"{title} — {match.group(1).upper()}"
            current = []
        elif current_title:
            current.append(para)
    if current_title and current: units.append((current_title, current, forced_type, number))
    if href == "npnf214.xvii.iv.html":
        expanded = []
        for item in units:
            unit_title, unit_paras, unit_type, unit_number = item
            if unit_title.lower().startswith("canon xii. and xiii") and len(unit_paras) >= 2:
                expanded.append(("Canon XII.", [unit_paras[0]], unit_type, "Canon XII"))
                expanded.append(("Canon XIII.", unit_paras[1:], unit_type, "Canon XIII"))
            else:
                expanded.append(item)
        units = expanded
    return units or [(title, paras, None, None)]


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--cache", default="/tmp/npnf214-source")
    ap.add_argument("--output", default="biblia/modules/church-history/npnf214-concilios-ecumenicos")
    args = ap.parse_args(); cache_dir = Path(args.cache); out = Path(args.output)
    toc = fetch(TOC_URL, cache_dir / "npnf214.toc.html")
    translation_file = cache_dir / "translations.json"
    translations = json.loads(translation_file.read_text()) if translation_file.exists() else {}
    entries = []; seen = set()
    for href, source_title in selected_links(toc):
        page = fetch(BASE + href, cache_dir / href)
        parser = ContentParser(); parser.feed(page)
        paras = [p for p in parser.paras if p not in {source_title, "Notes."}]
        for unit_title, unit_paras, forced_type, forced_number in split_embedded_units(href, source_title, paras):
            source = "\n\n".join(unit_paras).strip()
            if len(source) < 30: continue
            digest = hashlib.sha256(source.encode()).hexdigest()
            if digest in seen: continue
            seen.add(digest)
            council, year, era = metadata(href); kind = forced_type or classify(unit_title)
            title_es = translate(unit_title, translations)
            body_es = translate(source, translations)
            translation_file.write_text(json.dumps(translations, ensure_ascii=False), encoding="utf-8")
            slug = re.sub(r"[^a-z0-9]+", "-", unicodedata.normalize("NFKD", council).encode("ascii","ignore").decode().lower()).strip("-")
            entry = {
                "id": f"npnf214-{slug}-{len(entries)+1:03d}", "title": title_es,
                "personas": [], "eventos": [council], "periodo": f"{council} ({year})",
                "epoca": era, "anioInicio": int(str(year).split("-")[0]), "anioFin": int(str(year).split("-")[-1]),
                "concilio": council, "año": year, "tipo": kind, "numero": forced_number or roman_number(unit_title),
                "sourceTitle": unit_title, "sourceUrl": BASE + href,
                "excerpt": re.sub(r"\s+", " ", body_es)[:280].rstrip() + ("…" if len(body_es) > 280 else ""),
                "content": "".join(f"<p>{html.escape(p)}</p>" for p in body_es.split("\n\n") if p.strip()),
            }
            entries.append(entry); print(f"[{len(entries):03d}] {council}: {unit_title}", flush=True)
    out.mkdir(parents=True, exist_ok=True)
    (out / "entries.json").write_text(json.dumps({"entries":entries}, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
    manifest = {
        "schemaVersion": 2, "id": "npnf214-concilios-ecumenicos", "type": "churchHistory",
        "name": "Los siete concilios ecuménicos (NPNF2-14)", "abbreviation": "NPNF2-14",
        "language": "es", "author": "Philip Schaff (editor)",
        "translator": "Traducción automática editorial de Verbo desde el texto inglés de NPNF2-14",
        "year": 1899, "description": "Credos, cánones, decretos, cartas y excursus de los siete concilios ecuménicos; incluye los Cánones Apostólicos y Cartago bajo Cipriano.",
        "license": "Dominio público. Traducción propia desde la edición inglesa NPNF2-14.",
        "sourceUrl": "https://ccel.org/ccel/schaff/npnf214.html", "entriesFile": "entries.json",
        "totalEntries": len(entries)
    }
    (out / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")

if __name__ == "__main__": main()

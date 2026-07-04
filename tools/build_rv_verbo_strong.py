#!/usr/bin/env python3
"""Genera RV2026 + Strong usando exclusivamente STEPBible Data (CC BY 4.0).

La alineación es conservadora. En el NT usa las glosas españolas por palabra de
TAGNT; en toda la Biblia usa orden relativo y coincidencias léxicas. No copia
texto de otras traducciones bíblicas.
"""
from __future__ import annotations

import argparse
import json
import math
import re
import shutil
import sqlite3
import unicodedata
from collections import Counter, defaultdict
from difflib import SequenceMatcher
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
STEP = ROOT / "Archivos Verbo/STEPBible-Data-master/Translators Amalgamated OT+NT"
SOURCE = ROOT / "modules/bibles/rv-verbo"
WORD = re.compile(r"[^\s]+", re.UNICODE)
REF = re.compile(r"^((?:[1-3])?[A-Z][a-z]{1,2})\.(\d+)\.(\d+)#\d+=([^\t]+)\t")
CODE = re.compile(r"([GH])0*(\d+)", re.I)
STOPWORDS = {
    "a","al","ante","bajo","con","contra","de","del","desde","durante","e","el","ella","ellos","en","entre",
    "era","es","esta","este","fue","ha","hacia","hasta","la","las","le","les","lo","los","mas","mi","ni","no",
    "o","para","pero","por","porque","que","se","si","sin","sobre","su","sus","te","tu","un","una","y","ya",
}

BOOK_IDS = {
    "Gen":"GEN","Exo":"EXO","Lev":"LEV","Num":"NUM","Deu":"DEU","Jos":"JOS","Jdg":"JDG","Rut":"RUT",
    "1Sa":"1SA","2Sa":"2SA","1Ki":"1KI","2Ki":"2KI","1Ch":"1CH","2Ch":"2CH","Ezr":"EZR","Neh":"NEH",
    "Est":"EST","Job":"JOB","Psa":"PSA","Pro":"PRO","Ecc":"ECC","Sng":"SNG","Isa":"ISA","Jer":"JER",
    "Lam":"LAM","Ezk":"EZK","Dan":"DAN","Hos":"HOS","Jol":"JOL","Amo":"AMO","Oba":"OBA","Jon":"JON",
    "Mic":"MIC","Nam":"NAM","Hab":"HAB","Zep":"ZEP","Hag":"HAG","Zec":"ZEC","Mal":"MAL",
    "Mat":"MAT","Mrk":"MRK","Luk":"LUK","Jhn":"JHN","Act":"ACT","Rom":"ROM","1Co":"1CO","2Co":"2CO",
    "Gal":"GAL","Eph":"EPH","Php":"PHP","Col":"COL","1Th":"1TH","2Th":"2TH","1Ti":"1TI","2Ti":"2TI",
    "Tit":"TIT","Phm":"PHM","Heb":"HEB","Jas":"JAS","1Pe":"1PE","2Pe":"2PE","1Jn":"1JN","2Jn":"2JN",
    "3Jn":"3JN","Jud":"JUD","Rev":"REV",
}

BOOK_NUMBERS = {index + 1: book_id for index, book_id in enumerate(BOOK_IDS.values())}
REFERENCE_PATTERN = re.compile(r"(\S+?)((?:\{[GH]\d+\})+)", re.I)


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def dump(path: Path, value, pretty=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2 if pretty else None,
                               separators=None if pretty else (",", ":")), encoding="utf-8")


def norm(value: str) -> str:
    value = "".join(c for c in unicodedata.normalize("NFD", value.casefold())
                    if unicodedata.category(c) != "Mn")
    return "".join(c for c in value if c.isalnum())


def canonical(raw: str, testament: str) -> list[str]:
    result = []
    for prefix, number in CODE.findall(raw or ""):
        prefix = prefix.upper()
        number_i = int(number)
        if prefix != testament or number_i == 0:
            continue
        if prefix == "H" and number_i > 8674:  # afijos extendidos, fuera de Strong clásico
            continue
        if prefix == "G" and number_i > 5624:
            continue
        code = f"{prefix}{number_i}"
        if code not in result:
            result.append(code)
    return result


def parse_step() -> dict[tuple[str, str, str], list[dict]]:
    verses: dict[tuple[str, str, str], list[dict]] = defaultdict(list)
    for path in sorted(STEP.glob("TAHOT *.txt")) + sorted(STEP.glob("TAGNT *.txt")):
        nt = path.name.startswith("TAGNT")
        testament = "G" if nt else "H"
        for line in path.open(encoding="utf-8-sig", errors="replace"):
            match = REF.match(line)
            if not match:
                continue
            ref_book, chapter, verse, text_type = match.groups()
            book = BOOK_IDS.get(ref_book)
            if not book:
                continue
            fields = line.rstrip("\n\r").split("\t")
            if len(fields) < 6:
                continue
            # TAGNT incluye variantes: conservar la lectura común o presente en KJV/TR.
            if nt and "K" not in text_type.upper():
                continue
            raw_codes = fields[3] if nt else fields[4]
            codes = canonical(raw_codes.split("=", 1)[0], testament)
            if not codes:
                continue
            gloss = fields[8] if nt and len(fields) > 8 else fields[3]
            morph = fields[3].split("=", 1)[1] if nt and "=" in fields[3] else fields[5]
            for code in codes:
                verses[(book, str(int(chapter)), str(int(verse)))].append({
                    "code": code,
                    "gloss": gloss,
                    "morph": morph,
                })
    return verses


def gloss_words(gloss: str) -> list[str]:
    gloss = re.sub(r"[\[\]<>]", " ", gloss or "")
    return [norm(x) for x in re.split(r"[/\s]+", gloss) if norm(x)]


def train_associations(tagged: dict, manifest: dict) -> dict[str, dict[str, float]]:
    pair = Counter()
    code_frequency = Counter()
    word_frequency = Counter()
    verse_count = 0
    for book in manifest["books"]:
        payload = load(SOURCE / book["file"])
        for chapter, verses in payload["chapters"].items():
            for verse, raw in verses.items():
                groups = tagged.get((book["id"], chapter, verse), [])
                if not groups:
                    continue
                text = raw["text"] if isinstance(raw, dict) else raw
                words = {norm(x) for x in WORD.findall(text)} - STOPWORDS - {""}
                codes = {g["code"] for g in groups}
                verse_count += 1
                code_frequency.update(codes)
                word_frequency.update(words)
                pair.update((code, word) for code in codes for word in words)
    result: dict[str, dict[str, float]] = defaultdict(dict)
    for (code, word), count in pair.items():
        if count < 2:
            continue
        pmi = math.log((count * verse_count) / (code_frequency[code] * word_frequency[word]))
        reliability = math.log1p(count)
        result[code][word] = pmi + 0.35 * reliability
    return result


def lexical_score(token: str, gloss: str) -> float:
    words = gloss_words(gloss)
    if not token or not words:
        return 0.0
    best = 0.0
    for word in words:
        if token == word:
            score = 2.0 if word in STOPWORDS else 7.0
        elif token not in STOPWORDS and word not in STOPWORDS:
            ratio = SequenceMatcher(None, token, word, autojunk=False).ratio()
            score = 5.0 * ratio if ratio >= 0.72 else 0.0
        else:
            score = 0.0
        best = max(best, score)
    return best


def align(text: str, groups: list[dict], associations: dict[str, dict[str, float]]) -> tuple[list[dict], Counter]:
    segments = [{"text": token} for token in WORD.findall(text)]
    tokens = [norm(s["text"]) for s in segments]
    used: set[int] = set()
    stats = Counter(groups=len(groups))

    for group_i, group in enumerate(groups):
        expected = group_i * max(0, len(tokens) - 1) / max(1, len(groups) - 1)
        available = [i for i, token in enumerate(tokens) if i not in used and token]
        if not available:
            stats["unassigned"] += 1
            continue
        ranked = []
        for target in available:
            lexical = lexical_score(tokens[target], group["gloss"])
            learned = associations.get(group["code"], {}).get(tokens[target], 0.0)
            position = abs(target - expected) / max(1, len(tokens))
            ranked.append((lexical + learned - 1.8 * position, lexical, learned, target))
        score, lexical, learned, target = max(ranked)
        # El orden nunca basta por sí solo: exigir glosa o asociación corpus-wide.
        if lexical < 2.0 and learned < 2.2:
            stats["unassigned"] += 1
            continue
        method = "gloss" if lexical >= max(2.0, learned) else "learned"
        used.add(target)
        seg = segments[target]
        codes = seg.setdefault("strongs", [])
        if group["code"] not in codes:
            codes.append(group["code"])
        morphs = seg.setdefault("morphs", [])
        if group.get("morph") and group["morph"] not in morphs:
            morphs.append(group["morph"])
        stats[method] += 1

    for seg in segments:
        if len(seg.get("strongs", [])) == 1:
            seg["strong"] = seg.pop("strongs")[0]
        if len(seg.get("morphs", [])) == 1:
            seg["morph"] = seg.pop("morphs")[0]
    stats["assigned"] = stats["gloss"] + stats["learned"]
    return segments, stats


def align_strict_nt(text: str, groups: list[dict]) -> tuple[list[dict], Counter]:
    """Asocia glosas españolas completas cuando aparecen exactamente una vez."""
    segments = [{"text": token} for token in WORD.findall(text)]
    tokens = [norm(segment["text"]) for segment in segments]
    occupied: set[int] = set()
    stats = Counter(groups=len(groups))
    normalized_glosses = [tuple(gloss_words(group.get("gloss", ""))) for group in groups]
    gloss_counts = Counter(normalized_glosses)
    # Las frases más largas se resuelven primero para evitar que una palabra
    # aislada consuma parte de una coincidencia compuesta inequívoca.
    ordered = sorted(enumerate(groups), key=lambda item: len(normalized_glosses[item[0]]), reverse=True)
    for group_i, group in ordered:
        words = gloss_words(group.get("gloss", ""))
        phrase = tuple(words)
        if not phrase:
            stats["excludedEmptyGloss"] += 1
            continue
        if gloss_counts[phrase] != 1:
            stats["excludedRepeatedGloss"] += 1
            continue
        width = len(phrase)
        candidates = [i for i in range(len(tokens) - width + 1)
                      if tuple(tokens[i:i + width]) == phrase]
        if not candidates:
            stats["unassigned"] += 1
            continue
        if len(candidates) != 1:
            stats["excludedRepeated"] += 1
            continue
        start = candidates[0]
        positions = list(range(start, start + width))
        if any(position in occupied for position in positions):
            stats["excludedCollision"] += 1
            continue
        content_positions = [position for position in positions if tokens[position] not in STOPWORDS]
        target = content_positions[0] if content_positions else positions[-1]
        occupied.update(positions)
        segments[target]["strong"] = group["code"]
        if group.get("morph"):
            segments[target]["morph"] = group["morph"]
        stats["assigned"] += 1
        stats["assignedPhrase" if width > 1 else "assignedWord"] += 1
    return segments, stats


def train_strict_ot_lexicon(tagged: dict, manifest: dict) -> dict[str, str]:
    """Aprende solo equivalencias hebreo→español casi determinísticas."""
    pair = Counter()
    code_frequency = Counter()
    word_frequency = Counter()
    for book in manifest["books"][:39]:
        payload = load(SOURCE / book["file"])
        for chapter, verses in payload["chapters"].items():
            for verse, raw in verses.items():
                text = raw["text"] if isinstance(raw, dict) else raw
                words = {norm(x) for x in WORD.findall(text)} - STOPWORDS - {""}
                codes = {group["code"] for group in tagged.get((book["id"], chapter, verse), [])}
                code_frequency.update(codes)
                word_frequency.update(words)
                pair.update((code, word) for code in codes for word in words)
    candidates: dict[str, list[tuple[int, str]]] = defaultdict(list)
    for (code, word), count in pair.items():
        if count < 5:
            continue
        code_precision = count / code_frequency[code]
        word_precision = count / word_frequency[word]
        if code_precision >= 0.90 and word_precision >= 0.75:
            candidates[code].append((count, word))
    return {code: max(values)[1] for code, values in candidates.items()}


def align_strict_ot(text: str, groups: list[dict], lexicon: dict[str, str]) -> tuple[list[dict], Counter]:
    segments = [{"text": token} for token in WORD.findall(text)]
    tokens = [norm(segment["text"]) for segment in segments]
    code_counts = Counter(group["code"] for group in groups)
    token_counts = Counter(tokens)
    stats = Counter(groups=len(groups))
    for group in groups:
        word = lexicon.get(group["code"])
        if not word:
            stats["excludedNoLexicon"] += 1
            continue
        if code_counts[group["code"]] != 1 or token_counts[word] != 1:
            stats["excludedRepeated"] += 1
            continue
        target = tokens.index(word)
        if segments[target].get("strong"):
            stats["excludedCollision"] += 1
            continue
        segments[target]["strong"] = group["code"]
        if group.get("morph"):
            segments[target]["morph"] = group["morph"]
        stats["assigned"] += 1
    return segments, stats


def load_reference_sqlite(path: Path) -> dict[tuple[str, str, str], str]:
    connection = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    try:
        return {(BOOK_NUMBERS[int(book)], str(chapter), str(verse)): text
                for book, chapter, verse, text in connection.execute(
                    "SELECT book, chapter, verse, text FROM verses")
                if int(book) in BOOK_NUMBERS}
    finally:
        connection.close()


def lcs_mapping(source: list[str], target: list[str]) -> dict[int, int]:
    """Mapea una subsecuencia exacta, conservando el orden del versículo."""
    rows, columns = len(source), len(target)
    table = [[0] * (columns + 1) for _ in range(rows + 1)]
    for i in range(rows - 1, -1, -1):
        for j in range(columns - 1, -1, -1):
            table[i][j] = (1 + table[i + 1][j + 1] if source[i] == target[j]
                           else max(table[i + 1][j], table[i][j + 1]))
    result = {}
    i = j = 0
    while i < rows and j < columns:
        if source[i] == target[j]:
            result[i] = j
            i += 1
            j += 1
        elif table[i + 1][j] >= table[i][j + 1]:
            i += 1
        else:
            j += 1
    return result


def align_reference(text: str, groups: list[dict], reference: str,
                    independent: list[dict]) -> tuple[list[dict], Counter]:
    """Transfiere solo coincidencias exactas confirmadas además por STEPBible."""
    segments = [{"text": token} for token in WORD.findall(text)]
    tokens = [norm(segment["text"]) for segment in segments]
    entries = []
    for word, raw_codes in REFERENCE_PATTERN.findall(reference or ""):
        normalized = norm(word)
        codes = [f"{prefix.upper()}{int(number)}"
                 for prefix, number in CODE.findall(raw_codes)]
        if normalized and codes:
            entries.append((normalized, codes))
    mapping = lcs_mapping([entry[0] for entry in entries], tokens)
    allowed = Counter(group["code"] for group in groups)
    morphs = defaultdict(list)
    for group in groups:
        if group.get("morph"):
            morphs[group["code"]].append(group["morph"])
    used = Counter()
    stats = Counter(groups=len(groups), referenceEntries=len(entries))
    for entry_index, target in mapping.items():
        accepted = []
        for code in entries[entry_index][1]:
            if used[code] >= allowed[code]:
                stats["excludedNotStep"] += 1
                continue
            used[code] += 1
            accepted.append(code)
        if not accepted:
            continue
        segment = segments[target]
        segment["strong"] = accepted[0]
        if len(accepted) > 1:
            segment["strongs"] = accepted
        independent_codes = set(independent[target].get("strongs") or
                                ([independent[target]["strong"]] if independent[target].get("strong") else []))
        independently_verified = all(code in independent_codes for code in accepted)
        status = "verified-open" if independently_verified else "provisional-reference"
        segment["strongMeta"] = {
            "status": status,
            "method": ("step-open-alignment" if independently_verified
                       else "reference-position+step-verse"),
            "confidence": 1.0 if independently_verified else 0.85,
        }
        stats["verifiedOpen" if independently_verified else "provisionalReference"] += len(accepted)
        code_morphs = [morphs[code][used[code] - 1] for code in accepted
                       if len(morphs[code]) >= used[code]]
        if code_morphs:
            segment["morph"] = code_morphs[0]
            if len(code_morphs) > 1:
                segment["morphs"] = code_morphs
        stats["assigned"] += len(accepted)
        stats["referenceMatchedWords"] += 1
    stats["referenceUnmatchedEntries"] = len(entries) - len(mapping)
    return segments, stats


def build(out_id: str, selected_books: set[str], reference_sqlite: Path | None = None) -> dict:
    tagged = parse_step()
    manifest = load(SOURCE / "manifest.json")
    ot_lexicon = train_strict_ot_lexicon(tagged, manifest)
    reference = load_reference_sqlite(reference_sqlite) if reference_sqlite else {}
    out = ROOT / f"modules/bibles/{out_id}"
    if out.exists():
        shutil.rmtree(out)
    totals = Counter()
    books = {}
    review = []

    output_books = [book for book in manifest["books"] if book["id"] in selected_books]
    for book in output_books:
        payload = load(SOURCE / book["file"])
        result = {"schemaVersion": 2, "book": book["id"], "chapters": {}}
        book_stats = Counter()
        for chapter, verses in payload["chapters"].items():
            result["chapters"][chapter] = {}
            for verse, raw in verses.items():
                text = raw["text"] if isinstance(raw, dict) else raw
                groups = tagged.get((book["id"], chapter, verse), [])
                reference_text = reference.get((book["id"], chapter, verse))
                if reference_text is not None:
                    if book["number"] < 40:
                        independent, _ = align_strict_ot(text, groups, ot_lexicon)
                    else:
                        independent, _ = align_strict_nt(text, groups)
                    segments, stats = align_reference(text, groups, reference_text, independent)
                elif book["number"] < 40:
                    segments, stats = align_strict_ot(text, groups, ot_lexicon)
                else:
                    segments, stats = align_strict_nt(text, groups)
                result["chapters"][chapter][verse] = {
                    "text": text,
                    "segments": segments,
                    "strongs": sorted({c for s in segments
                                       for c in (s.get("strongs") or ([s["strong"]] if s.get("strong") else []))},
                                      key=lambda c: (c[0], int(c[1:]))),
                }
                stats["verses"] = 1
                if stats["assigned"]:
                    stats["versesTagged"] = 1
                if stats["unassigned"] and len(review) < 500:
                    review.append({"reference": f'{book["id"]}.{chapter}.{verse}', "text": text,
                                   "groups": stats["groups"], "assigned": stats["assigned"]})
                book_stats.update(stats)
        dump(out / book["file"], result)
        books[book["id"]] = dict(book_stats)
        totals.update(book_stats)

    output_manifest = dict(manifest)
    output_manifest.update({
        "id": out_id,
        "name": "Biblia Verbo RV2026 con Strong (beta)",
        "abbreviation": "RV2026+ β",
        "hasStrongs": True,
        "status": "beta",
        "strongSource": "STEPBible Data (CC BY 4.0)",
        "alignmentMethod": ("Referencia RV1909+ alineada por subsecuencia textual exacta y confirmada por STEPBible."
                            if reference else
                            "NT: glosas españolas exactas y únicas. AT: equivalencias corpus-wide con precisión condicional >=90/75 % y unicidad por versículo."),
        "license": "Edición Verbo sobre RV1909 de dominio público; datos Strong © STEP Bible, CC BY 4.0",
        "description": "RV2026 con una capa beta de códigos Strong derivada de STEPBible Data CC BY 4.0.",
    })
    output_manifest["books"] = output_books
    if reference:
        output_manifest.update({
            "name": "Biblia Verbo RV2026 con Strong (provisional)",
            "abbreviation": "RV2026+ P",
            "description": "RV2026 con capa Strong provisional, alineada por coincidencia textual exacta y verificada por versículo contra STEPBible.",
            "status": "provisional-noncommercial",
            "referenceSource": "Bible SuperSearch rv_1909_strongs.sqlite (uso no comercial)",
            "strongEditorAttribution": "Etiquetado RV1909 de referencia desarrollado por Rubén Gómez",
            "license": "Texto RV2026 sobre RV1909 de dominio público; referencia de etiquetado RV1909+ autorizada para redistribución no comercial por Bible SuperSearch; verificación STEPBible CC BY 4.0",
        })
    dump(out / "manifest.json", output_manifest, pretty=True)
    report = {"source": "STEPBible Data CC BY 4.0", "otLexiconSize": len(ot_lexicon),
              "totals": dict(totals), "books": books, "review": review}
    report["coveragePercent"] = round(100 * totals["assigned"] / totals["groups"], 2) if totals["groups"] else 0
    dump(out / "alignment-report.json", report, pretty=True)
    readme = [
        "# Biblia Verbo RV2026 con Strong (provisional)",
        "",
        "Texto: edición Verbo sobre RV1909 (dominio público). Datos de verificación: STEP Bible, CC BY 4.0.",
        "",
        "Generada con `tools/build_rv_verbo_strong.py`. Cada asociación provisional exige coincidencia textual exacta y presencia del mismo código en STEPBible para el versículo.",
    ]
    if reference:
        readme.extend([
            "",
            "Referencia provisional no comercial: Bible SuperSearch `rv_1909_strongs.sqlite`; etiquetado RV1909 desarrollado por Rubén Gómez.",
            "",
            "Estados de asociación: `verified-open` se reproduce solo con RV2026 y STEPBible; `provisional-reference` usa otra versión únicamente como sugerencia de ubicación y queda pendiente de revisión editorial.",
            "",
            "Este módulo debe reemplazar progresivamente esa referencia por revisión editorial propia antes de adoptar una licencia abierta definitiva.",
        ])
    (out / "README.md").write_text("\n".join(readme) + "\n", encoding="utf-8")
    return report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out-id", default="rv-verbo-strong-pilot")
    parser.add_argument("--books", default="ALL", help="IDs separados por coma, o ALL")
    parser.add_argument("--reference-sqlite", type=Path,
                        help="RV1909+ provisional; se abre en modo solo lectura")
    args = parser.parse_args()
    all_books = {item["id"] for item in load(SOURCE / "manifest.json")["books"]}
    books = all_books if args.books.strip().upper() == "ALL" else {
        book.strip().upper() for book in args.books.split(",") if book.strip()
    }
    if not books or any(book not in {item["id"] for item in load(SOURCE / "manifest.json")["books"]} for book in books):
        parser.error("--books contiene un ID desconocido")
    if args.reference_sqlite and not args.reference_sqlite.is_file():
        parser.error("--reference-sqlite no existe")
    report = build(args.out_id, books, args.reference_sqlite)
    print(json.dumps({"coveragePercent": report["coveragePercent"], **report["totals"]}, indent=2))


if __name__ == "__main__":
    main()

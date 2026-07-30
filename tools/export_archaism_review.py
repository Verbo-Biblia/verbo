#!/usr/bin/env python3
"""Exporta arcaísmos de una Biblia Verbo a CSV para revisión editorial."""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MODULE = ROOT / "biblia/modules/bibles/rv-verbo"


@dataclass(frozen=True)
class Term:
    term_id: str
    pattern: str
    suggestion: str
    risk: str
    note: str
    flags: int = re.IGNORECASE


COMMON_TERMS = [
    Term("empero", r"\bempero\b", "pero", "low", "Conjuncion arcaica; casi siempre equivale a 'pero'."),
    Term("dijole", r"\bd[íi]jole\b", "le dijo", "low", "Forma enclitica arcaica."),
    Term("dijoles", r"\bd[íi]joles\b", "les dijo", "low", "Forma enclitica arcaica."),
    Term("dijeronle", r"\bdij[ée]ronle\b", "le dijeron", "low", "Forma enclitica arcaica."),
    Term("dijeronles", r"\bdij[ée]ronles\b", "les dijeron", "low", "Forma enclitica arcaica."),
    Term("dicele", r"\bd[íi]cele\b", "le dice", "low", "Forma enclitica arcaica."),
    Term("diceles", r"\bd[íi]celes\b", "les dice", "low", "Forma enclitica arcaica."),
    Term("respondiole", r"\brespondi[óo]le\b", "le respondió", "low", "Forma enclitica arcaica."),
    Term("respondioles", r"\brespondi[óo]les\b", "les respondió", "low", "Forma enclitica arcaica."),
    Term("respondieronle", r"\brespondieronle\b", "le respondieron", "low", "Forma enclitica arcaica."),
    Term("respondieronles", r"\brespondieronles\b", "les respondieron", "low", "Forma enclitica arcaica."),
    Term("preguntaronle", r"\bpregunt[áa]ronle\b", "le preguntaron", "low", "Forma enclitica arcaica."),
    Term("preguntaronles", r"\bpregunt[áa]ronles\b", "les preguntaron", "low", "Forma enclitica arcaica."),
    Term("oyeronle", r"\boy[ée]ronle\b", "le oyeron", "low", "Forma enclitica arcaica."),
    Term("fuese", r"\bfu[ée]se\b", "se fue", "medium", "Puede requerir ajustar la frase completa."),
    Term("partiose", r"\bparti[óo]se\b", "se fue", "medium", "Puede significar partir/salir; revisar contexto."),
    Term("vio_acento", r"\bvi[óÓ]\b", "vio", "low", "Ortografia antigua con tilde."),
    Term("fue_acento", r"\bfu[éÉ]\b", "fue", "low", "Ortografia antigua con tilde."),
    Term("a_preposicion", r"\b[áà]\b", "a", "low", "Preposicion con ortografia antigua."),
    Term("e_conjuncion", r"\b[éÉ]\b(?=\s+[hií])", "e", "low", "Conjuncion antes de i/hi; solo normaliza tilde si aparece."),
]

NT_TERMS = COMMON_TERMS + [
    Term("mas", r"\bmas\b", "pero", "medium", "A veces equivale a 'pero'; a veces funciona mejor como 'sino'."),
    Term("he_aqui", r"\bhe aqu[íi]\b", "miren", "high", "Formula biblica; decidir si se conserva en citas solemnes."),
    Term("vosotros", r"\bvosotros\b", "ustedes", "medium", "Requiere concordancia verbal y posesivos cercanos."),
    Term("os", r"\bos\b", "los/les", "high", "Pronombre muy contextual; no aplicar globalmente sin revisar."),
    Term("habéis", r"\bhab[ée]is\b", "han", "medium", "Requiere revisar sujeto y concordancia."),
    Term("sois", r"\bsois\b", "son", "medium", "Requiere revisar sujeto y concordancia."),
    Term("bienaventurados", r"\bbienaventurados\b", "dichosos", "high", "Termino tradicional; revisar por pasaje."),
    Term("merced", r"\bmerced\b", "recompensa/favor", "high", "Puede significar recompensa, favor o misericordia segun contexto."),
    Term("alfoli", r"\balfol[íi]\b", "granero", "medium", "Termino agricola arcaico."),
    Term("segur", r"\bsegur\b", "hacha", "medium", "Termino arcaico para hacha."),
]

OT_TERMS = COMMON_TERMS + [
    Term("simiente", r"\bsimiente\b", "descendencia", "high", "Termino teologico; revisar promesas y genealogias."),
    Term("holocausto", r"\bholocausto(s)?\b", "holocausto", "high", "Termino tecnico sacrificial; puede conservarse."),
    Term("oblacion", r"\boblaci[óo]n(es)?\b", "ofrenda", "medium", "Termino sacrificial; revisar contexto ritual."),
    Term("presente", r"\bpresente(s)?\b", "ofrenda", "high", "Puede ser regalo, ofrenda o presencia."),
    Term("estatuto", r"\bestatuto(s)?\b", "estatuto", "medium", "Puede conservarse como termino legal."),
    Term("tabernaculo", r"\btabern[áa]culo\b", "tabernaculo", "medium", "Termino biblico tecnico; normalmente conservar."),
    Term("propiciatorio", r"\bpropiciatorio\b", "propiciatorio", "high", "Termino teologico tecnico; normalmente conservar."),
    Term("postrimeria", r"\bpostrimer[íi]a(s)?\b", "fin/final", "high", "Revisar contexto poetico/profetico."),
    Term("saeta", r"\bsaeta(s)?\b", "flecha", "medium", "Termino poetico; revisar estilo."),
    Term("lomos", r"\blomos\b", "cintura", "medium", "Puede ser literal o modismo."),
]

PROFILES = {
    "common": COMMON_TERMS,
    "nt": NT_TERMS,
    "ot": OT_TERMS,
}


def load_json(path: Path):
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def row_id(book_id: str, chapter: str, verse: str, term_id: str,
           occurrence_index: int, start: int, end: int, matched: str,
           verse_text: str) -> str:
    raw = "\x1f".join((
        book_id, chapter, verse, term_id, str(occurrence_index), str(start),
        str(end), matched, verse_text,
    ))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:20]


def compile_terms(profile: str, terms: list[str]) -> list[Term]:
    selected = list(PROFILES[profile])
    existing = {term.term_id for term in selected}
    for raw in terms:
      term_id = re.sub(r"[^a-z0-9]+", "_", raw.lower()).strip("_") or "custom"
      if term_id in existing:
          continue
      selected.append(Term(term_id, re.escape(raw), "", "custom", "Termino indicado manualmente."))
    return selected


def iter_books(manifest: dict, testament: str):
    for book in manifest["books"]:
        number = int(book.get("number", 0))
        is_nt = number >= 40
        if testament == "NT" and not is_nt:
            continue
        if testament == "OT" and is_nt:
            continue
        yield book


def verse_value(record) -> str:
    if isinstance(record, str):
        return record
    if isinstance(record, dict):
        return str(record.get("text", ""))
    return str(record or "")


def context(text: str, start: int, end: int, width: int = 70) -> tuple[str, str]:
    return text[max(0, start - width):start].strip(), text[end:end + width].strip()


def export(module: Path, testament: str, profile: str, terms: list[str],
           output: Path, limit_per_term: int | None) -> dict:
    manifest = load_json(module / "manifest.json")
    compiled = compile_terms(profile, terms)
    counts = {term.term_id: 0 for term in compiled}
    rows = []
    for book in iter_books(manifest, testament):
        payload = load_json(module / book["file"])
        for chapter, verses in payload.get("chapters", {}).items():
            for verse, record in verses.items():
                text = verse_value(record)
                for term in compiled:
                    if limit_per_term is not None and counts[term.term_id] >= limit_per_term:
                        continue
                    regex = re.compile(term.pattern, term.flags)
                    for match in regex.finditer(text):
                        if limit_per_term is not None and counts[term.term_id] >= limit_per_term:
                            break
                        occurrence_index = counts[term.term_id] + 1
                        before, after = context(text, match.start(), match.end())
                        rows.append({
                            "row_id": row_id(book["id"], chapter, verse, term.term_id,
                                             occurrence_index, match.start(), match.end(),
                                             match.group(0), text),
                            "testament": "NT" if int(book.get("number", 0)) >= 40 else "OT",
                            "book": book["id"],
                            "chapter": chapter,
                            "verse": verse,
                            "reference": f'{book["id"]} {chapter}:{verse}',
                            "term_id": term.term_id,
                            "occurrence_index": occurrence_index,
                            "start": match.start(),
                            "end": match.end(),
                            "matched": match.group(0),
                            "before": before,
                            "after": after,
                            "verse_text": text,
                            "suggestion": term.suggestion,
                            "risk": term.risk,
                            "term_note": term.note,
                            "reviewer": "",
                            "decision": "",
                            "replacement": "",
                            "notes": "",
                        })
                        counts[term.term_id] += 1
    output.parent.mkdir(parents=True, exist_ok=True)
    fields = [
        "row_id", "testament", "book", "chapter", "verse", "reference",
        "term_id", "occurrence_index", "start", "end", "matched", "before",
        "after", "verse_text", "suggestion", "risk", "term_note", "reviewer",
        "decision", "replacement", "notes",
    ]
    with output.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    return {
        "output": str(output),
        "rows": len(rows),
        "counts": {key: value for key, value in counts.items() if value},
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--module", type=Path, default=DEFAULT_MODULE)
    parser.add_argument("--testament", choices=["OT", "NT", "all"], default="NT")
    parser.add_argument("--profile", choices=sorted(PROFILES), default="nt")
    parser.add_argument("--term", action="append", default=[], help="Termino literal adicional.")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--limit-per-term", type=int, default=None)
    args = parser.parse_args()
    testament = args.testament
    if testament == "all":
        testament = "NT" if args.profile == "nt" else "OT" if args.profile == "ot" else "all"
    output = args.output or ROOT / f"review/archaisms/{testament.lower()}-{args.profile}-lote-001.csv"
    print(export(args.module, testament, args.profile, args.term, output, args.limit_per_term))


if __name__ == "__main__":
    main()

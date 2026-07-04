#!/usr/bin/env python3
"""
sword_zcom_to_verbo.py
Converts a SWORD zCom4 commentary module to Verbo JSON format.

Usage:
    python3 tools/sword_zcom_to_verbo.py <module_folder> <module_id> [--out <dir>]

Examples:
    python3 tools/sword_zcom_to_verbo.py "Archivos Verbo/JFB" jfb
    python3 tools/sword_zcom_to_verbo.py "Archivos Verbo/CalvinCommentaries" calvin
    python3 tools/sword_zcom_to_verbo.py "Archivos Verbo/Clarke" clarke

Runs all at once:
    for m in jfb clarke wesley calvin kd tsk scofield; do
        python3 tools/sword_zcom_to_verbo.py "Archivos Verbo/${m^}" $m
    done
"""

import struct, zlib, json, re, os, sys, argparse, shutil
from pathlib import Path

# ---------------------------------------------------------------------------
# KJV versification — (verbo_id, full_name)
#
# Los conteos de versiculos por capitulo NO se escriben a mano aqui: se
# derivan de modules/bibles/asv-1901/. Los modulos SWORD usados por Verbo
# declaran versificacion KJV, que coincide exactamente con ASV: 24.115 slots
# de indice para el AT y 8.246 para el NT, incluyendo cabeceras e intros.
# RVA 1909 no puede usarse como tabla del indice: tiene 16 versiculos menos
# en el AT y 2 menos en el NT, lo que desplaza contenido entre libros.
# ---------------------------------------------------------------------------
OT_BOOK_NAMES = [
    ("GEN","Genesis"), ("EXO","Exodus"), ("LEV","Leviticus"), ("NUM","Numbers"),
    ("DEU","Deuteronomy"), ("JOS","Joshua"), ("JDG","Judges"), ("RUT","Ruth"),
    ("1SA","1 Samuel"), ("2SA","2 Samuel"), ("1KI","1 Kings"), ("2KI","2 Kings"),
    ("1CH","1 Chronicles"), ("2CH","2 Chronicles"), ("EZR","Ezra"), ("NEH","Nehemiah"),
    ("EST","Esther"), ("JOB","Job"), ("PSA","Psalms"), ("PRO","Proverbs"),
    ("ECC","Ecclesiastes"), ("SNG","Song of Solomon"), ("ISA","Isaiah"), ("JER","Jeremiah"),
    ("LAM","Lamentations"), ("EZK","Ezekiel"), ("DAN","Daniel"), ("HOS","Hosea"),
    ("JOL","Joel"), ("AMO","Amos"), ("OBA","Obadiah"), ("JON","Jonah"),
    ("MIC","Micah"), ("NAH","Nahum"), ("HAB","Habakkuk"), ("ZEP","Zephaniah"),
    ("HAG","Haggai"), ("ZEC","Zechariah"), ("MAL","Malachi"),
]

NT_BOOK_NAMES = [
    ("MAT","Matthew"), ("MRK","Mark"), ("LUK","Luke"), ("JHN","John"),
    ("ACT","Acts"), ("ROM","Romans"), ("1CO","1 Corinthians"), ("2CO","2 Corinthians"),
    ("GAL","Galatians"), ("EPH","Ephesians"), ("PHP","Philippians"), ("COL","Colossians"),
    ("1TH","1 Thessalonians"), ("2TH","2 Thessalonians"), ("1TI","1 Timothy"), ("2TI","2 Timothy"),
    ("TIT","Titus"), ("PHM","Philemon"), ("HEB","Hebrews"), ("JAS","James"),
    ("1PE","1 Peter"), ("2PE","2 Peter"), ("1JN","1 John"), ("2JN","2 John"),
    ("3JN","3 John"), ("JUD","Jude"), ("REV","Revelation"),
]

ASV_BOOKS_DIR = Path(__file__).resolve().parent.parent / 'modules' / 'bibles' / 'asv-1901' / 'books'


def _load_chapter_counts(book_id):
    path = ASV_BOOKS_DIR / f'{book_id}.json'
    data = json.loads(path.read_text(encoding='utf-8'))
    chapters = data['chapters']
    n_chapters = len(chapters)
    return [len(chapters[str(ch)]) for ch in range(1, n_chapters + 1)]


def _with_counts(book_names):
    return [(book_id, name, _load_chapter_counts(book_id)) for (book_id, name) in book_names]


OT_BOOKS = _with_counts(OT_BOOK_NAMES)
NT_BOOKS = _with_counts(NT_BOOK_NAMES)

ALL_BOOKS = OT_BOOKS + NT_BOOKS


def build_verse_map(books):
    """Returns list of (book_id, chapter, verse) for every SWORD verse index.
    Prepends 2 dummy entries to account for the module header SWORD stores at indices 0-1."""
    mapping = [('__', 0, 0), ('__', 0, 0)]  # SWORD module header slots
    for (book_id, _, chapter_counts) in books:
        mapping.append((book_id, 0, 0))       # book intro
        for ch_idx, n_verses in enumerate(chapter_counts):
            ch = ch_idx + 1
            mapping.append((book_id, ch, 0))  # chapter intro
            for v in range(1, n_verses + 1):
                mapping.append((book_id, ch, v))
    return mapping


OT_VERSE_MAP = build_verse_map(OT_BOOKS)
NT_VERSE_MAP = build_verse_map(NT_BOOKS)


# ---------------------------------------------------------------------------
# Block reader — uses .bzs index directly (fast path)
# ---------------------------------------------------------------------------

def read_bzs(path):
    """Parse a .bzs block index file: returns list of (offset, comp_size, uncomp_size)."""
    data = path.read_bytes()
    return [struct.unpack_from('<III', data, i * 12) for i in range(len(data) // 12)]


def decompress_block(path, block_table, blk_idx):
    """Decompress a single block from a bzz/czz file using the .bzs index."""
    if blk_idx >= len(block_table):
        return b''
    offset, comp_size, _ = block_table[blk_idx]
    if comp_size == 0:
        return b''
    with open(path, 'rb') as f:
        f.seek(offset)
        raw = f.read(comp_size)
    return zlib.decompress(raw)


def read_bzv(path, expected_count):
    """Parse a bzv file: returns list of (block_idx, start, size) per verse."""
    data = path.read_bytes()
    # SWORD modules in this repository use both known zVerse layouts:
    # uint32/uint32/uint16 (10 bytes) and uint32/uint32/uint32 (12 bytes).
    # The KJV position count makes the layout unambiguous.
    layouts = [('<IIH', 10), ('<III', 12)]
    for fmt, record_size in layouts:
        if len(data) == expected_count * record_size:
            return [
                struct.unpack_from(fmt, data, i * record_size)
                for i in range(expected_count)
            ]
    raise ValueError(
        f'Invalid .bzv size: {path} ({len(data)} bytes; '
        f'expected {expected_count * 10} or {expected_count * 12})'
    )


# ---------------------------------------------------------------------------
# OSIS XML → HTML
# ---------------------------------------------------------------------------

_NOTE_RE    = re.compile(r'<note[^>]*>.*?</note>', re.DOTALL)
_MILESTONE  = re.compile(r'<milestone[^>]*/>', re.DOTALL)
_HI_BOLD    = re.compile(r'<hi\s+type="bold"[^>]*>(.+?)</hi>', re.DOTALL)
_HI_ITALIC  = re.compile(r'<hi\s+type="italic"[^>]*>(.+?)</hi>', re.DOTALL)
_TITLE_RE   = re.compile(r'<title[^>]*>(.+?)</title>', re.DOTALL)
_REF_RE     = re.compile(r'<reference[^>]*>(.+?)</reference>', re.DOTALL)
_ANY_TAG    = re.compile(r'<[^>]+>')
_MULTI_SP   = re.compile(r'  +')


def osis_to_html(raw_bytes):
    try:
        text = raw_bytes.decode('utf-8', errors='replace')
    except Exception:
        return ''

    text = _NOTE_RE.sub('', text)
    text = _MILESTONE.sub('\n', text)
    text = _HI_BOLD.sub(r'<b>\1</b>', text)
    text = _HI_ITALIC.sub(r'<i>\1</i>', text)

    def title_sub(m):
        inner = _ANY_TAG.sub('', m.group(1)).strip()
        return f'<h4>{inner}</h4>\n' if inner else ''
    text = _TITLE_RE.sub(title_sub, text)
    text = _REF_RE.sub(r'\1', text)
    text = _ANY_TAG.sub(' ', text)

    paragraphs, current = [], []
    for line in text.replace('\r', '\n').split('\n'):
        line = line.strip()
        if not line:
            if current:
                paragraphs.append(' '.join(current))
                current = []
        else:
            current.append(line)
    if current:
        paragraphs.append(' '.join(current))

    parts = []
    for p in paragraphs:
        p = _MULTI_SP.sub(' ', p).strip()
        if len(p) < 3:
            continue
        parts.append(p if p.startswith('<h4>') else f'<p>{p}</p>')
    return '\n'.join(parts)


# ---------------------------------------------------------------------------
# Main extraction
# ---------------------------------------------------------------------------

def extract_module(module_dir, module_id, author, full_name, abbreviation,
                   description, license_text, out_dir):
    module_dir = Path(module_dir)

    # Read .conf to find DataPath
    conf_files = list(module_dir.rglob('*.conf'))
    if not conf_files:
        sys.exit(f'ERROR: No .conf found in {module_dir}')
    conf_text = conf_files[0].read_text(encoding='utf-8', errors='replace')

    data_path = None
    for line in conf_text.splitlines():
        if line.lower().startswith('datapath='):
            data_path = line.split('=', 1)[1].strip().lstrip('./').rstrip('/')
            break
    if not data_path:
        sys.exit('ERROR: DataPath not found in .conf')
    print(f'  DataPath: {data_path}')

    out_path = Path(out_dir) / module_id
    books_path = out_path / 'books'
    if out_path.exists():
        shutil.rmtree(out_path)
    books_path.mkdir(parents=True, exist_ok=True)

    all_books_list = []
    total_entries = 0

    for prefix, verse_map, book_list in [('ot', OT_VERSE_MAP, OT_BOOKS),
                                          ('nt', NT_VERSE_MAP, NT_BOOKS)]:
        # Try .bzv/.bzz first (bzip2 modules), then .czv/.czz (ZIP/chapter-block modules)
        bzv_path = module_dir / data_path / f'{prefix}.bzv'
        bzz_path = module_dir / data_path / f'{prefix}.bzz'
        if not bzv_path.exists():
            bzv_path = module_dir / data_path / f'{prefix}.czv'
            bzz_path = module_dir / data_path / f'{prefix}.czz'

        if not bzv_path.exists():
            print(f'  Skipping {prefix} (no index file found)')
            continue

        # Determine .bzs path (same stem as .bzv but with s suffix)
        bzs_path = bzv_path.with_suffix('.bzs') if bzv_path.suffix == '.bzv' else bzv_path.with_suffix('.czs')
        if not bzs_path.exists():
            print(f'  Skipping {prefix} (no block index .bzs/.czs found)')
            continue

        print(f'  Loading {bzs_path.name} block index...')
        block_offsets = read_bzs(bzs_path)
        print(f'    {len(block_offsets)} blocks')

        bzv_entries = read_bzv(bzv_path, len(verse_map))
        print(f'    {len(bzv_entries)} verse index entries')

        # Group bzv entries by block — decompress each block only once
        block_verses = {}
        for idx, (blk, start, size) in enumerate(bzv_entries):
            if idx >= len(verse_map) or size == 0:
                continue
            block_verses.setdefault(blk, []).append((idx, start, size))

        # Decompress one block at a time, extract verse texts
        verse_texts = {}  # verse_idx → html
        for blk_idx in sorted(block_verses.keys()):
            try:
                block_data = decompress_block(bzz_path, block_offsets, blk_idx)
            except Exception:
                continue
            for (idx, start, size) in block_verses[blk_idx]:
                raw = block_data[start:start + size]
                if not raw:
                    continue
                html = osis_to_html(raw)
                if html and len(html.strip()) > 10:
                    verse_texts[idx] = html

        # Group by book
        book_data = {}  # book_id → {(ch, v): (html, blk, start, size)}
        for idx, html in verse_texts.items():
            book_id, ch, v = verse_map[idx]
            if book_id == '__':
                continue
            blk, start, size = bzv_entries[idx]
            book_data.setdefault(book_id, {})[(ch, v)] = (html, blk, start, size)

        # Build entries per book
        for book_id, name, _ in book_list:
            if book_id not in book_data:
                continue

            cv_data = book_data[book_id]
            sorted_cvs = sorted(cv_data.keys())
            entries = []
            used = set()

            for (ch, v) in sorted_cvs:
                if (ch, v) in used:
                    continue
                html, blk, start, size = cv_data[(ch, v)]

                # Find all positions sharing the same block content
                group = [(ch, v)]
                # Book/chapter introductions (verse 0) are structural labels,
                # never endpoints of a biblical verse range.
                if v != 0:
                    for (ch2, v2) in sorted_cvs:
                        if (ch2, v2) == (ch, v) or v2 == 0:
                            continue
                        b2, s2, z2 = cv_data[(ch2, v2)][1:]
                        if b2 == blk and s2 == start and z2 == size:
                            group.append((ch2, v2))

                group.sort()
                for pos in group:
                    used.add(pos)

                ch_s, v_s = group[0]
                ch_e, v_e = group[-1]

                if v_s == 0:
                    entry_id = f'{module_id}-{book_id.lower()}-{ch_s}-intro'
                    title = f'{name} — Introduction' if ch_s == 0 else f'{name} {ch_s} — Chapter Introduction'
                    ref = {'book': book_id, 'chapterStart': ch_s, 'verseStart': 0,
                           'chapterEnd': ch_e, 'verseEnd': 0}
                else:
                    entry_id = f'{module_id}-{book_id.lower()}-{ch_s}-{v_s}'
                    if ch_s == ch_e:
                        title = f'{name} {ch_s}:{v_s}' if v_s == v_e else f'{name} {ch_s}:{v_s}–{v_e}'
                    else:
                        title = f'{name} {ch_s}:{v_s}–{ch_e}:{v_e}'
                    ref = {'book': book_id, 'chapterStart': ch_s, 'verseStart': v_s,
                           'chapterEnd': ch_e, 'verseEnd': v_e}

                entries.append({'id': entry_id, 'title': title, 'author': author,
                                'reference': ref, 'content': html})

            if not entries:
                continue

            entries.sort(key=lambda e: (e['reference']['chapterStart'], e['reference']['verseStart']))
            (books_path / f'{book_id}.json').write_text(
                json.dumps({'entries': entries}, ensure_ascii=False, separators=(',', ':')),
                encoding='utf-8'
            )
            all_books_list.append({'id': book_id, 'name': name, 'file': f'books/{book_id}.json'})
            total_entries += len(entries)
            print(f'    {book_id}: {len(entries)} entries')

    manifest = {
        'schemaVersion': 2, 'id': module_id, 'type': 'commentary',
        'name': full_name, 'abbreviation': abbreviation, 'language': 'en',
        'author': author, 'description': description, 'license': license_text,
        'books': all_books_list,
    }
    (out_path / 'manifest.json').write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8'
    )
    print(f'\nDone: {total_entries} entries across {len(all_books_list)} books → {out_path}')


# ---------------------------------------------------------------------------
# Known modules
# ---------------------------------------------------------------------------

KNOWN_MODULES = {
    'barnes': {
        'folder': 'Barnes',
        'full_name': "Barnes' Notes on the New Testament",
        'abbreviation': 'Barnes',
        'author': 'Albert Barnes (1798–1870)',
        'description': 'Evangelical commentary on the New Testament. First published 1832–1851. Public domain.',
        'license': 'Public Domain',
    },
    'jfb': {
        'folder': 'JFB',
        'full_name': "Jamieson, Fausset, and Brown Commentary",
        'abbreviation': "Jamieson, Fausset, and Brown Commentary",
        'author': 'Robert Jamieson, A. R. Fausset, and David Brown',
        'description': 'Classic evangelical commentary covering all 66 books. First published 1871.',
        'license': 'Public Domain',
    },
    'clarke': {
        'folder': 'Clarke',
        'full_name': "Adam Clarke's Commentary on the Bible",
        'abbreviation': 'Clarke',
        'author': 'Adam Clarke (1760–1832)',
        'description': 'Exhaustive Methodist commentary on the entire Bible, first published 1810–1826.',
        'license': 'Public Domain',
    },
    'wesley': {
        'folder': 'Wesley',
        'full_name': "Wesley's Explanatory Notes",
        'abbreviation': 'Wesley',
        'author': 'John Wesley (1703–1791)',
        'description': 'Practical devotional notes on the entire Bible. First published 1754–1765.',
        'license': 'Public Domain',
    },
    'calvin': {
        'folder': 'CalvinCommentaries',
        'full_name': "Calvin's Commentaries",
        'abbreviation': 'Calvin',
        'author': 'John Calvin (1509–1564)',
        'description': 'Reformed commentaries on most of the Bible by John Calvin.',
        'license': 'Public Domain',
    },
    'kd': {
        'folder': 'KD',
        'full_name': "Keil & Delitzsch Commentary on the Old Testament",
        'abbreviation': "Keil & Delitzsch Commentary on the Old Testament",
        'author': 'C. F. Keil and F. Delitzsch',
        'description': 'Scholarly Hebrew exegesis of the entire Old Testament. First published 1861–1875.',
        'license': 'Public Domain',
    },
    'tsk': {
        'folder': 'TSK',
        'full_name': "Treasury of Scripture Knowledge",
        'abbreviation': "Treasury of Scripture Knowledge",
        'author': 'R. A. Torrey (editor)',
        'description': 'Comprehensive cross-reference tool covering every verse of the Bible.',
        'license': 'Public Domain',
    },
    'scofield': {
        'folder': 'Scofield',
        'full_name': "Scofield Reference Notes",
        'abbreviation': 'Scofield',
        'author': 'C. I. Scofield (1843–1921)',
        'description': "Dispensationalist reference notes on the entire Bible. First published 1909.",
        'license': 'Public Domain',
    },
}


def main():
    parser = argparse.ArgumentParser(
        description='Convert SWORD zCom4 module to Verbo JSON',
        epilog='Examples:\n'
               '  python3 tools/sword_zcom_to_verbo.py "Archivos Verbo/JFB" jfb\n'
               '  python3 tools/sword_zcom_to_verbo.py "Archivos Verbo/CalvinCommentaries" calvin\n',
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument('module_dir', help='Path to the extracted SWORD module folder')
    parser.add_argument('module_id', help='Module ID: ' + ', '.join(KNOWN_MODULES))
    parser.add_argument('--out', default='modules/commentaries',
                        help='Output directory (default: modules/commentaries)')
    args = parser.parse_args()

    key = args.module_id.lower()
    if key not in KNOWN_MODULES:
        sys.exit(f'Unknown module "{args.module_id}". Known: {", ".join(KNOWN_MODULES)}')

    m = KNOWN_MODULES[key]
    print(f'Reading {args.module_dir}...')
    extract_module(
        module_dir=args.module_dir,
        module_id=key,
        author=m['author'],
        full_name=m['full_name'],
        abbreviation=m['abbreviation'],
        description=m['description'],
        license_text=m['license'],
        out_dir=args.out,
    )


if __name__ == '__main__':
    main()

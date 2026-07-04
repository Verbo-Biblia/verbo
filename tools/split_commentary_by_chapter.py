#!/usr/bin/env python3
"""
split_commentary_by_chapter.py
Splits large commentary book JSON files into per-chapter files.

Input:  modules/commentaries/{id}/books/{BOOK}.json  (one file per book)
Output: modules/commentaries/{id}/books/{BOOK}/{N}.json  (one file per chapter)

The manifest gets chapterSplit: true added so the module loader knows
to fetch books/{BOOK}/{chapter}.json instead of books/{BOOK}.json.

Usage:
    python3 tools/split_commentary_by_chapter.py clarke
    python3 tools/split_commentary_by_chapter.py wesley
    python3 tools/split_commentary_by_chapter.py tsk
    python3 tools/split_commentary_by_chapter.py --root /tmp/output wesley tsk
"""

import argparse, json, shutil
from pathlib import Path

def split_module(module_id, root):
    base = root / module_id
    books_dir = base / 'books'
    manifest_path = base / 'manifest.json'

    if not manifest_path.exists():
        sys.exit(f'ERROR: {manifest_path} not found')

    with open(manifest_path, encoding='utf-8') as f:
        manifest = json.load(f)

    book_list = manifest.get('books', [])
    total_entries = 0
    total_files = 0

    for book_info in book_list:
        book_id = book_info['id']
        src_file = books_dir / f'{book_id}.json'

        if not src_file.exists():
            print(f'  SKIP {book_id}: {src_file} not found')
            continue

        with open(src_file, encoding='utf-8') as f:
            book_data = json.load(f)

        entries = book_data.get('entries', [])
        if not entries:
            print(f'  SKIP {book_id}: no entries')
            continue

        # Group by chapter — intro entries (chapterStart=0) go into chapter 1
        by_chapter = {}
        for entry in entries:
            ref = entry['reference']
            ch_start = ref.get('chapterStart', 1)
            if ch_start == 0:
                # Chapter/book intro: put in chapter 1
                by_chapter.setdefault(1, []).append(entry)
            else:
                # Store each entry once, under the chapter where its range starts.
                by_chapter.setdefault(ch_start, []).append(entry)

        # Write per-chapter files
        out_dir = books_dir / book_id
        if out_dir.exists():
            shutil.rmtree(out_dir)
        out_dir.mkdir(exist_ok=True)

        for ch, ch_entries in sorted(by_chapter.items()):
            out_file = out_dir / f'{ch}.json'
            out_file.write_text(
                json.dumps({'entries': ch_entries}, ensure_ascii=False, separators=(',', ':')),
                encoding='utf-8'
            )
            total_files += 1
            total_entries += len(ch_entries)

        print(f'  {book_id}: {len(entries)} entries → {len(by_chapter)} chapter files')

        # Remove original flat file
        src_file.unlink()

    # Update manifest
    manifest['chapterSplit'] = True
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8'
    )

    print(f'\nDone: {total_entries} entry-chapter pairs in {total_files} files')
    print(f'Manifest updated: chapterSplit = true')


if __name__ == '__main__':
    project_root = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('module_ids', nargs='+')
    parser.add_argument(
        '--root', type=Path,
        default=project_root / 'modules' / 'commentaries',
        help='Directory containing commentary modules',
    )
    args = parser.parse_args()

    for mid in args.module_ids:
        print(f'\n=== Splitting {mid} ===')
        split_module(mid, args.root)

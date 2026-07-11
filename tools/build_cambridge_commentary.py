#!/usr/bin/env python3
"""Build provisional Cambridge Bible commentary modules from OCR sources."""

from __future__ import annotations

import html
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "Archivos Verbo" / "cambridge-bible"
OUT_DIR = ROOT / "modules" / "commentaries" / "cambridge"


ROMANS_SECTIONS = [
    ("I", "Time, Place, and Occasion", 0, 0, 0, 0),
    ("II", "The Writer and His Readers", 1, 1, 1, 7),
    ("III", "Good Report of the Roman Church: Paul not Ashamed of the Gospel", 1, 8, 1, 17),
    ("IV", "Need for the Gospel: God's Anger and Man's Sin", 1, 18, 1, 23),
    ("V", "Man Given up to his own Way: the Heathen", 1, 24, 1, 32),
    ("VI", "Human Guilt Universal: He Approaches the Conscience of the Jew", 2, 1, 2, 17),
    ("VII", "Jewish Responsibility and Guilt", 2, 17, 2, 29),
    ("VIII", "Jewish Claims: No Hope in Human Merit", 3, 1, 3, 20),
    ("IX", "The One Way of Divine Acceptance", 3, 21, 3, 31),
    ("X", "Abraham and David", 4, 1, 4, 12),
    ("XI", "Abraham (2)", 4, 13, 4, 25),
    ("XII", "Peace, Love, and Joy for the Justified", 5, 1, 5, 11),
    ("XIII", "Christ and Adam", 5, 12, 5, 21),
    ("XIV", "Justification and Holiness", 6, 1, 6, 13),
    ("XV", "Justification and Holiness: Illustrations from Human Life", 6, 14, 7, 6),
    ("XVI", "The Function of the Law in the Spiritual Life", 7, 7, 7, 25),
    ("XVII", "The Justified: Their Life by the Holy Spirit", 8, 1, 8, 11),
    ("XVIII", "Holiness by the Spirit, and the Glories that Shall Follow", 8, 12, 8, 25),
    ("XIX", "The Spirit of Prayer in the Saints: Their Present and Eternal Welfare in the Love of God", 8, 26, 8, 39),
    ("XX", "The Sorrowful Problem: Jewish Unbelief; Divine Sovereignty", 9, 1, 9, 33),
    ("XXI", "Jewish Unbelief and Gentile Faith: Prophecy", 10, 1, 10, 21),
    ("XXII", "Israel However Not Forsaken", 11, 1, 11, 10),
    ("XXIII", "Israel's Fall Overruled, for the World's Blessing, and for Israel's Mercy", 11, 11, 11, 24),
    ("XXIV", "The Restoration of Israel Directly Foretold: All is of and for God", 11, 25, 11, 36),
    ("XXV", "Christian Conduct the Issue of Christian Truth", 12, 1, 12, 8),
    ("XXVI", "Christian Duty: Details of Personal Conduct", 12, 8, 12, 21),
    ("XXVII", "Christian Duty; in Civil Life and Otherwise: Love", 13, 1, 13, 10),
    ("XXVIII", "Christian Duty in the Light of the Lord's Return and in the Power of His Presence", 13, 11, 13, 14),
    ("XXIX", "Christian Duty: Mutual Tenderness and Tolerance: the Sacredness of Example", 14, 1, 14, 23),
    ("XXX", "The Same Subject: The Lord's Example: His Relation to Us All", 15, 1, 15, 13),
    ("XXXI", "Roman Christianity: St. Paul's Commission: His Intended Itinerary: He Asks for Prayer", 15, 14, 15, 33),
    ("XXXII", "A Commendation: Greetings: A Warning: A Doxology", 16, 1, 16, 27),
]

PHILIPPIANS_SECTIONS = [
    (r"Ch\. L\.? 1.*2\. Greeting", "Greeting", 1, 1, 1, 2),
    (r"8--U\. Thanksgiving and Prayer", "Thanksgiving and Prayer for the Philippian Saints", 1, 3, 1, 11),
    (r"12[\u2014-]20\. Acco", "Account of St Paul's Present Circumstances and Experience", 1, 12, 1, 20),
    (r"21[\u2014-]26\. The same subject", "The Alternative of Life or Death", 1, 21, 1, 26),
    (r"27\s*[\u2014-]\s*30\. Entreaties", "Entreaties to Cherish Consistency and Unity", 1, 27, 1, 30),
    (r"Ch\.il 1[\u2014-]4", "Appeal for Self-forgetful Unity", 2, 1, 2, 4),
    (r"6\s*[\u2014-]\s*11\. The appeal enforced", "The Example of Christ's Incarnation, Obedience, and Exaltation", 2, 5, 2, 11),
    (r"12\s*[\u2014-].*18\. Inferences", "The Call to a Reverent, Fruitful, Joyful Life", 2, 12, 2, 18),
    (r"19\s*[\u2014-]\s*30\. He pRorosEs", "Timotheus and Epaphroditus", 2, 19, 2, 30),
    (r"Ch\. III\. 1[\u2014-]3", "Joy in the Lord and Warning against False Confidence", 3, 1, 3, 3),
    (r"4[\u2014-]11\. His own experience", "Paul's Former Confidence and Present Gain in Christ", 3, 4, 3, 11),
    (r"12[\u2014-]16\. On the other hand", "Pressing toward the Goal", 3, 12, 3, 16),
    (r"17[\u2014-]21\. Application", "Warning and Heavenly Citizenship", 3, 17, 3, 21),
    (r"Ch, IV\. 1[\u2014-]7", "Steadfastness, Unity, Joy, and Peace", 4, 1, 4, 7),
    (r"8[\u2014-]9\. As A LAST", "A Last Spiritual Entreaty", 4, 8, 4, 9),
    (r"10[\u2014-]20\. He renders", "Thanks for the Philippians' Gift", 4, 10, 4, 20),
    (r"21[\u2014-]28\. Salutations", "Salutations and Farewell", 4, 21, 4, 23),
]


def compact_spaces(text: str) -> str:
    text = text.replace("\u00a0", " ")
    text = re.sub(r"[ \t]+", " ", text)
    return text.strip()


def is_noise(line: str) -> bool:
    clean = compact_spaces(line)
    if not clean:
        return False
    if re.fullmatch(r"[ivxlcdmIVXLCDM0-9]+", clean):
        return True
    if re.fullmatch(r"[0-9]+ THE EPISTLE TO THE ROMANS", clean):
        return True
    if re.fullmatch(r"THE EPISTLE TO THE ROMANS [0-9]+", clean):
        return True
    if re.fullmatch(r"[ivxlcdm0-9. ]+\] .*", clean, flags=re.IGNORECASE):
        return True
    return False


def lines_to_html(lines: list[str]) -> str:
    paragraphs: list[str] = []
    current: list[str] = []
    for raw in lines:
        line = compact_spaces(raw)
        if is_noise(line):
            continue
        if not line:
            if current:
                paragraphs.append(" ".join(current))
                current = []
            continue
        current.append(line)
    if current:
        paragraphs.append(" ".join(current))

    cleaned = []
    for paragraph in paragraphs:
        paragraph = re.sub(r"\s+([,.;:?!])", r"\1", paragraph)
        paragraph = re.sub(r"([A-Za-z])- ([A-Za-z])", r"\1\2", paragraph)
        cleaned.append(f"<p>{html.escape(paragraph)}</p>")
    return "".join(cleaned)


def roman_heading_positions(lines: list[str]) -> dict[str, int]:
    positions: dict[str, int] = {}
    for index, line in enumerate(lines):
        match = re.fullmatch(r"\s*CHAPTER\s+([IVXLCDM]+)\s*", line.strip())
        if match:
            positions[match.group(1)] = index
    return positions


def anchored_positions(
    lines: list[str], sections: list[tuple[str, str, int, int, int, int]], min_line: int
) -> list[int]:
    positions: list[int] = []
    cursor = min_line
    for pattern, *_ in sections:
        compiled = re.compile(pattern)
        for index in range(cursor, len(lines)):
            if compiled.search(lines[index]):
                positions.append(index)
                cursor = index + 1
                break
        else:
            raise RuntimeError(f"Missing section anchor: {pattern}")
    return positions


def build_book_from_anchors(
    source_name: str,
    book_id: str,
    book_name: str,
    author: str,
    sections: list[tuple[str, str, int, int, int, int]],
    min_line: int,
    end_pattern: str | None = None,
) -> None:
    source = SOURCE_DIR / source_name
    lines = source.read_text(encoding="utf-8", errors="replace").splitlines()
    positions = anchored_positions(lines, sections, min_line)

    entries = []
    for idx, ((_, title, cs, vs, ce, ve), start) in enumerate(zip(sections, positions)):
        if idx + 1 < len(positions):
            end = positions[idx + 1]
        elif end_pattern:
            compiled_end = re.compile(end_pattern)
            end = next(
                (index for index in range(start + 1, len(lines)) if compiled_end.search(lines[index])),
                len(lines),
            )
        else:
            end = len(lines)
        section_lines = lines[start:end]
        content = lines_to_html(section_lines)
        entries.append(
            {
                "id": f"cambridge-{book_id.lower()}-{cs}-{vs}-{ce}-{ve}",
                "title": f"{book_name} {cs}:{vs}-{ce}:{ve} - {title}",
                "author": author,
                "reference": {
                    "book": book_id,
                    "chapterStart": cs,
                    "verseStart": vs,
                    "chapterEnd": ce,
                    "verseEnd": ve,
                },
                "content": content,
            }
        )

    (OUT_DIR / "books").mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "books" / f"{book_id}.json").write_text(
        json.dumps({"entries": entries}, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )


def build_romans() -> None:
    source = SOURCE_DIR / "epistletoromans00moul_djvu.txt"
    lines = source.read_text(encoding="utf-8", errors="replace").splitlines()
    positions = roman_heading_positions(lines)
    missing = [roman for roman, *_ in ROMANS_SECTIONS if roman not in positions]
    if missing:
        raise RuntimeError(f"Missing Romans sections in OCR: {', '.join(missing)}")

    entries = []
    for idx, (roman, title, cs, vs, ce, ve) in enumerate(ROMANS_SECTIONS):
        start = positions[roman]
        next_roman = ROMANS_SECTIONS[idx + 1][0] if idx + 1 < len(ROMANS_SECTIONS) else None
        end = positions[next_roman] if next_roman else len(lines)
        section_lines = lines[start:end]
        content = lines_to_html(section_lines)
        entries.append(
            {
                "id": f"cambridge-rom-{cs}-{vs}-{ce}-{ve}",
                "title": f"Romans {cs}:{vs}-{ce}:{ve} - {title}" if cs else f"Romans - {title}",
                "author": "Handley C. G. Moule (1841-1920)",
                "reference": {
                    "book": "ROM",
                    "chapterStart": cs,
                    "verseStart": vs,
                    "chapterEnd": ce,
                    "verseEnd": ve,
                },
                "content": content,
            }
        )

    (OUT_DIR / "books").mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "books" / "ROM.json").write_text(
        json.dumps({"entries": entries}, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )


def build_manifest() -> None:
    manifest = {
        "schemaVersion": 2,
        "id": "cambridge",
        "type": "commentary",
        "name": "Cambridge Bible for Schools and Colleges",
        "abbreviation": "Cambridge",
        "language": "en",
        "author": "Various Cambridge scholars",
        "description": "Formal public-domain commentary series published by Cambridge University Press, 1878-1918. Provisional OCR-based integration; currently includes Romans.",
        "license": "Public Domain",
        "books": [
            {
                "id": "ROM",
                "name": "Romans",
                "file": "books/ROM.json",
            },
            {
                "id": "PHP",
                "name": "Philippians",
                "file": "books/PHP.json",
            }
        ],
    }
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def main() -> None:
    build_manifest()
    build_romans()
    build_book_from_anchors(
        "epistletophilip00moulgoog_djvu.txt",
        "PHP",
        "Philippians",
        "Handley C. G. Moule (1841-1920)",
        PHILIPPIANS_SECTIONS,
        min_line=1700,
        end_pattern=r"^(The Subscription\.|APPENDICES\.)",
    )


if __name__ == "__main__":
    main()

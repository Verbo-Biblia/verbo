import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env, pipeline } from '@xenova/transformers';

const MODEL = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
const BOOKS = [
  ['MAT', 'Mateo'],
  ['MRK', 'Marcos'],
  ['LUK', 'Lucas'],
  ['JHN', 'Juan'],
];
const PERICOPE_SIZE = 6;
const BATCH_SIZE = Number.parseInt(process.env.BATCH_SIZE || '16', 10);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const bibleDir = path.join(repoRoot, 'modules', 'bibles', 'rva-1909', 'books');
const outDir = path.join(__dirname, 'out');

env.cacheDir = path.join(__dirname, '.cache');

function normalizeWhitespace(text) {
  return text.replace(/\s+/g, ' ').trim();
}

async function loadGospelVerses() {
  const rows = [];
  for (const [book, bookName] of BOOKS) {
    const file = path.join(bibleDir, `${book}.json`);
    const data = JSON.parse(await readFile(file, 'utf8'));
    const chapters = Object.keys(data.chapters).map(Number).sort((a, b) => a - b);
    for (const chapter of chapters) {
      const verses = data.chapters[String(chapter)];
      const verseNumbers = Object.keys(verses).map(Number).sort((a, b) => a - b);
      for (const verse of verseNumbers) {
        rows.push({
          id: `${book}.${chapter}.${verse}`,
          book,
          bookName,
          chapterStart: chapter,
          verseStart: verse,
          chapterEnd: chapter,
          verseEnd: verse,
          label: `${bookName} ${chapter}:${verse}`,
          text: normalizeWhitespace(verses[String(verse)].text),
        });
      }
    }
  }
  return rows;
}

function buildPericopes(verses) {
  const byChapter = new Map();
  for (const verse of verses) {
    const key = `${verse.book}.${verse.chapterStart}`;
    if (!byChapter.has(key)) byChapter.set(key, []);
    byChapter.get(key).push(verse);
  }

  const chunks = [];
  for (const chapterVerses of byChapter.values()) {
    for (let index = 0; index < chapterVerses.length; index += PERICOPE_SIZE) {
      const group = chapterVerses.slice(index, index + PERICOPE_SIZE);
      const first = group[0];
      const last = group[group.length - 1];
      chunks.push({
        id: `${first.book}.${first.chapterStart}.${first.verseStart}-${last.verseEnd}`,
        book: first.book,
        bookName: first.bookName,
        chapterStart: first.chapterStart,
        verseStart: first.verseStart,
        chapterEnd: last.chapterEnd,
        verseEnd: last.verseEnd,
        label: `${first.bookName} ${first.chapterStart}:${first.verseStart}-${last.verseEnd}`,
        text: group.map((verse) => `${verse.verseStart}. ${verse.text}`).join(' '),
        verses: group.map((verse) => ({
          book: verse.book,
          chapter: verse.chapterStart,
          verse: verse.verseStart,
        })),
      });
    }
  }
  return chunks;
}

function tensorRows(tensor, rowCount) {
  const dims = tensor.dims;
  const width = dims[dims.length - 1];
  const data = tensor.data;
  const rows = [];
  for (let row = 0; row < rowCount; row += 1) {
    const start = row * width;
    rows.push(data.slice(start, start + width));
  }
  return rows;
}

async function embedRecords(records) {
  const extractor = await pipeline('feature-extraction', MODEL);
  const vectors = [];
  for (let index = 0; index < records.length; index += BATCH_SIZE) {
    const batch = records.slice(index, index + BATCH_SIZE);
    const output = await extractor(batch.map((record) => record.text), {
      pooling: 'mean',
      normalize: true,
    });
    vectors.push(...tensorRows(output, batch.length));
    console.log(`Embedded ${Math.min(index + batch.length, records.length)}/${records.length}`);
  }
  return vectors;
}

function quantizeUnitVector(vector) {
  const quantized = new Int8Array(vector.length);
  for (let index = 0; index < vector.length; index += 1) {
    const value = Math.max(-1, Math.min(1, vector[index]));
    quantized[index] = Math.round(value * 127);
  }
  return quantized;
}

async function writeIndex(name, records, vectors) {
  const dimensions = vectors[0].length;
  const vectorBytes = new Int8Array(records.length * dimensions);
  const metadata = {
    schemaVersion: 1,
    source: 'modules/bibles/rva-1909',
    books: BOOKS.map(([id, name]) => ({ id, name })),
    model: MODEL,
    dimensions,
    metric: 'cosine',
    quantization: {
      type: 'int8',
      scale: 127,
      note: 'Vectors are L2-normalized before scalar int8 quantization; approximate cosine is dot(query, int8/127).',
    },
    chunking: name === 'pericopes'
      ? { strategy: 'fixed_verse_windows_by_chapter', versesPerChunk: PERICOPE_SIZE, overlap: 0 }
      : { strategy: 'single_verse' },
    vectorFile: `${name}.i8.bin`,
    records: records.map((record, index) => ({
      id: record.id,
      book: record.book,
      bookName: record.bookName,
      chapterStart: record.chapterStart,
      verseStart: record.verseStart,
      chapterEnd: record.chapterEnd,
      verseEnd: record.verseEnd,
      label: record.label,
      text: record.text,
      offset: index * dimensions,
      length: dimensions,
      ...(record.verses ? { verses: record.verses } : {}),
    })),
  };

  vectors.forEach((vector, index) => {
    vectorBytes.set(quantizeUnitVector(vector), index * dimensions);
  });

  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, `${name}.i8.bin`), vectorBytes);
  await writeFile(path.join(outDir, `${name}.meta.json`), JSON.stringify(metadata, null, 2) + '\n');

  const binStat = await stat(path.join(outDir, `${name}.i8.bin`));
  const metaStat = await stat(path.join(outDir, `${name}.meta.json`));
  console.log(`${name}: ${records.length} records, ${dimensions} dims`);
  console.log(`${name}.i8.bin: ${binStat.size.toLocaleString()} bytes`);
  console.log(`${name}.meta.json: ${metaStat.size.toLocaleString()} bytes`);
}

async function main() {
  const verses = await loadGospelVerses();
  const pericopes = buildPericopes(verses);
  console.log(`Loaded ${verses.length} verses and ${pericopes.length} fixed pericope chunks`);

  console.log('Building verse index...');
  await writeIndex('verses', verses, await embedRecords(verses));

  console.log('Building pericope index...');
  await writeIndex('pericopes', pericopes, await embedRecords(pericopes));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

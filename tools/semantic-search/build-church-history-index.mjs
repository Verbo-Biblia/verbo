import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env, pipeline } from '@xenova/transformers';

const MODEL = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
const BATCH_SIZE = Number.parseInt(process.env.BATCH_SIZE || '16', 10);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const bibliaRoot = path.join(repoRoot, 'biblia');
const outDir = path.join(bibliaRoot, 'modules', 'semantic-search', 'church-history');

env.cacheDir = path.join(__dirname, '.cache');

function plainText(value) {
  return String(value || '').replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

async function loadRecords() {
  const registry = JSON.parse(await readFile(path.join(bibliaRoot, 'modules', 'registry.json'), 'utf8'));
  const records = [];
  for (const manifestRelative of registry.churchHistory || []) {
    const manifestPath = path.join(bibliaRoot, 'modules', manifestRelative);
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    const entriesPath = path.join(path.dirname(manifestPath), manifest.entriesFile);
    const entries = JSON.parse(await readFile(entriesPath, 'utf8')).entries || [];
    for (const entry of entries) {
      const source = entry.concilio || manifest.abbreviation || manifest.name;
      const excerpt = plainText(entry.excerpt || entry.content);
      records.push({
        id: entry.id,
        title: entry.title,
        text: plainText(`${entry.title}. ${entry.periodo || ''}. ${excerpt}`),
        source,
        sourceId: manifest.id,
        sourceLang: manifest.language,
        epoca: entry.epoca || null,
        anioInicio: entry.anioInicio ?? null,
        anioFin: entry.anioFin ?? null,
        tipo: entry.tipo || null,
        numero: entry.numero || null,
        concilio: entry.concilio || null,
      });
    }
  }
  return records;
}

function tensorRows(tensor, rowCount) {
  const width = tensor.dims.at(-1); const rows = [];
  for (let row = 0; row < rowCount; row += 1) rows.push(tensor.data.slice(row * width, (row + 1) * width));
  return rows;
}

async function embed(records) {
  const extractor = await pipeline('feature-extraction', MODEL); const vectors = [];
  for (let index = 0; index < records.length; index += BATCH_SIZE) {
    const batch = records.slice(index, index + BATCH_SIZE);
    const output = await extractor(batch.map(record => record.text), { pooling:'mean', normalize:true });
    vectors.push(...tensorRows(output, batch.length));
    console.log(`Embedded ${Math.min(index + batch.length, records.length)}/${records.length}`);
  }
  return vectors;
}

async function main() {
  const records = await loadRecords();
  const vectors = await embed(records); const dimensions = vectors[0].length;
  const bytes = new Int8Array(records.length * dimensions);
  vectors.forEach((vector, row) => vector.forEach((value, dim) => {
    bytes[row * dimensions + dim] = Math.round(Math.max(-1, Math.min(1, value)) * 127);
  }));
  const metadata = {
    schemaVersion: 1,
    source: 'modules/church-history',
    model: MODEL,
    dimensions,
    metric: 'cosine',
    quantization: { type:'int8', scale:127 },
    vectorFile: 'entries.i8.bin',
    records: records.map((record, index) => ({ ...record, offset:index * dimensions, length:dimensions })),
  };
  await mkdir(outDir, { recursive:true });
  await writeFile(path.join(outDir, 'entries.i8.bin'), bytes);
  await writeFile(path.join(outDir, 'entries.meta.json'), JSON.stringify(metadata, null, 2) + '\n');
  console.log(`church-history: ${records.length} records, ${dimensions} dims`);
  console.log(`entries.i8.bin: ${(await stat(path.join(outDir, 'entries.i8.bin'))).size.toLocaleString()} bytes`);
}

main().catch(error => { console.error(error); process.exit(1); });

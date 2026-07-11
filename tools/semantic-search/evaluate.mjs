import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env, pipeline } from '@xenova/transformers';

const MODEL = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
const TOP_K = 15;
const PRESET_QUESTIONS = [
  '¿Qué dijo Jesús sobre el divorcio?',
  '¿Cómo debo perdonar a quien me ofende muchas veces?',
  'El amor de Dios por los perdidos',
  '¿Qué enseñó Jesús sobre el dinero y las riquezas?',
  'Promesas de Jesús para los que están cansados',
  '¿Qué dijo Jesús sobre la oración a solas?',
  'El nuevo nacimiento',
  '¿Cómo trató Jesús a los pecadores y marginados?',
  'Advertencias sobre los falsos profetas',
  '¿Qué dijo Jesús en la cruz?',
];

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, 'out');
env.cacheDir = path.join(__dirname, '.cache');

function parseArgs(argv) {
  const args = { preset: false, question: null };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--preset') args.preset = true;
    else if (argv[index] === '--question' || argv[index] === '-q') {
      args.question = argv[index + 1];
      index += 1;
    }
  }
  return args;
}

async function loadIndex(name) {
  const metadata = JSON.parse(await readFile(path.join(outDir, `${name}.meta.json`), 'utf8'));
  const bytes = await readFile(path.join(outDir, metadata.vectorFile));
  return {
    name,
    metadata,
    vectors: new Int8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength),
  };
}

function tensorVector(tensor) {
  return tensor.data;
}

function searchIndex(index, queryVector) {
  const { dimensions, records } = index.metadata;
  const results = [];
  for (let recordIndex = 0; recordIndex < records.length; recordIndex += 1) {
    const offset = recordIndex * dimensions;
    let score = 0;
    for (let dim = 0; dim < dimensions; dim += 1) {
      score += queryVector[dim] * (index.vectors[offset + dim] / 127);
    }
    results.push({ score, record: records[recordIndex] });
  }
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, TOP_K);
}

function trim(text, max = 145) {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function printSideBySide(question, verseResults, pericopeResults) {
  console.log(`\n## ${question}\n`);
  console.log('| # | Versículo | score | Texto | Perícopa | score | Texto |');
  console.log('|---:|---|---:|---|---|---:|---|');
  for (let index = 0; index < TOP_K; index += 1) {
    const verse = verseResults[index];
    const pericope = pericopeResults[index];
    console.log([
      `| ${index + 1}`,
      verse.record.label,
      verse.score.toFixed(4),
      trim(verse.record.text).replaceAll('|', '\\|'),
      pericope.record.label,
      pericope.score.toFixed(4),
      trim(pericope.record.text).replaceAll('|', '\\|'),
      '|',
    ].join(' | '));
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const questions = args.preset ? PRESET_QUESTIONS : [args.question || process.argv.slice(2).join(' ').trim()];
  if (!questions[0]) {
    console.error('Usage: node evaluate.mjs --question "¿Qué dijo Jesús sobre el divorcio?"');
    console.error('   or: node evaluate.mjs --preset');
    process.exit(1);
  }

  const [verses, pericopes] = await Promise.all([loadIndex('verses'), loadIndex('pericopes')]);
  const extractor = await pipeline('feature-extraction', MODEL);

  for (const question of questions) {
    const output = await extractor(question, { pooling: 'mean', normalize: true });
    const queryVector = tensorVector(output);
    printSideBySide(question, searchIndex(verses, queryVector), searchIndex(pericopes, queryVector));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

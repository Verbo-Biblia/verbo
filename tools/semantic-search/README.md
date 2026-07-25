# Verbo semantic search

Offline generator for semantic search over the full Bible (66 books) in `modules/bibles/rva-1909`. Output is published to `modules/semantic-search/bible-rva-1909/` and consumed client-side by `assets/module-loader.js` (`searchSemanticBible`) — no backend, the embedding model runs locally in the browser.

This tool intentionally lives outside the published static site. It uses the same model intended for browser validation:

`Xenova/paraphrase-multilingual-MiniLM-L12-v2`

## Commands

```bash
npm install
npm run build:bible
npm run eval -- --question "¿Qué dijo Jesús sobre el divorcio?"
npm run eval:preset
```

## Indexes

`build-index.mjs` writes:

- `out/verses.i8.bin`
- `out/verses.meta.json`
- `out/pericopes.i8.bin`
- `out/pericopes.meta.json`

Copy these four files into `modules/semantic-search/bible-rva-1909/` to publish a rebuilt index.

The binary files are int8-quantized, L2-normalized vectors. Metadata contains references, labels, source text, offsets, and vector dimensions.

The RVA 1909 data has no section headings in its JSON files, so the pericope index uses fixed six-verse windows within each chapter, without overlap. This is a validation baseline, not a final pericope strategy.

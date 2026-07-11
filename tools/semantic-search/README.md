# Verbo semantic search prototype

Offline prototype for semantic search over the four Gospels in `modules/bibles/rva-1909`.

This tool intentionally lives outside the published static site. It uses the same model intended for browser validation:

`Xenova/paraphrase-multilingual-MiniLM-L12-v2`

## Commands

```bash
npm install
npm run build:gospels
npm run eval -- --question "¿Qué dijo Jesús sobre el divorcio?"
npm run eval:preset
```

## Indexes

`build-index.mjs` writes:

- `out/verses.i8.bin`
- `out/verses.meta.json`
- `out/pericopes.i8.bin`
- `out/pericopes.meta.json`

The binary files are int8-quantized, L2-normalized vectors. Metadata contains references, labels, source text, offsets, and vector dimensions.

The RVA 1909 data has no section headings in the Gospel JSON files, so the pericope prototype uses fixed six-verse windows within each chapter, without overlap. This is a validation baseline, not a final pericope strategy.

#!/usr/bin/env python3
"""Enriquece modules/registry.json con un campo "catalog" que embebe el
manifest.json completo de cada módulo registrado (bibles, commentaries,
dictionaries, exegesis, library, gospel, patristic, patristicByVerse,
crossrefs), en la misma forma {path, manifest} que ya arma getCatalog()
en assets/module-loader.js.

Esto le permite al front-end poblar los selectores de Biblia/comentario/
etc. con 1 sola petición (registry.json) en vez de una por cada
manifest.json (hoy ~30 peticiones solo para eso).

Uso: python3 tools/build_registry_catalog.py
Vuelve a correr este script cada vez que se agregue o quite un módulo de
registry.json, para que "catalog" quede sincronizado.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "biblia" / "modules"
REGISTRY_PATH = ROOT / "registry.json"
MODULE_KEYS = [
    "bibles", "commentaries", "dictionaries", "exegesis",
    "library", "gospel", "patristic", "patristicByVerse", "crossrefs",
]


def main():
    registry = json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
    catalog = {}
    for key in MODULE_KEYS:
        entries = []
        for rel_path in registry.get(key, []):
            manifest_path = ROOT / rel_path
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            # "path" lleva el prefijo "modules/" porque así lo espera el resto
            # del front-end (assets/module-loader.js prefija "modules/" en
            # tryLoadModule) — catalog.<tipo>[].path debe verse idéntico a lo
            # que devolvía el fetch-uno-por-uno que este catalog reemplaza.
            entries.append({"path": f"modules/{rel_path}", "manifest": manifest})
        catalog[key] = entries
    registry["catalog"] = catalog
    REGISTRY_PATH.write_text(
        json.dumps(registry, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    total = sum(len(v) for v in catalog.values())
    print(f"catalog generado: {total} módulos embebidos en {REGISTRY_PATH}")


if __name__ == "__main__":
    main()

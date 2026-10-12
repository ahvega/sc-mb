#!/usr/bin/env python3
"""Comprime imágenes de site/assets/ sin servicios externos (solo requiere Pillow).

Uso:
    pip install Pillow
    python tools/optimize_images.py                 # todo site/assets/
    python tools/optimize_images.py ruta/foto.jpg   # archivos o carpetas concretos

JPEG: calidad 82, progresivo. PNG: sin pérdida. Solo reemplaza el original si ahorra al menos 5 %; la
escritura es atómica (archivo temporal + reemplazo), así que es seguro repetirlo.
"""
import os
import sys
from pathlib import Path

try:
    from PIL import Image, ImageOps
except ImportError:
    sys.exit("Falta Pillow. Instálalo con:  pip install Pillow")

ROOT = Path(__file__).resolve().parent.parent
EXTS = {".jpg", ".jpeg", ".png"}


def collect(args):
    targets = [Path(a) for a in args] or [ROOT / "site" / "assets"]
    for t in targets:
        files = sorted(t.rglob("*")) if t.is_dir() else [t]
        for f in files:
            if f.suffix.lower() in EXTS:
                yield f


def optimize(path):
    before = path.stat().st_size
    tmp = path.with_name(path.name + ".tmp")
    with Image.open(path) as im:
        if path.suffix.lower() == ".png":
            im.save(tmp, format="PNG", optimize=True)
        else:
            ImageOps.exif_transpose(im).convert("RGB").save(tmp, format="JPEG", quality=82, optimize=True, progressive=True)
    after = tmp.stat().st_size
    if after < before * 0.95:  # ahorro mínimo del 5 %: evita recomprimir (y degradar) imágenes ya optimizadas
        os.replace(tmp, path)
        return before, after
    tmp.unlink()
    return before, before


def main():
    total_before = total_after = 0
    for f in collect(sys.argv[1:]):
        b, a = optimize(f)
        total_before += b
        total_after += a
        print(f"{f.name:32} {b // 1024:>6} KB -> {a // 1024:>6} KB")
    print(f"TOTAL {total_before // 1024} KB -> {total_after // 1024} KB")


if __name__ == "__main__":
    main()

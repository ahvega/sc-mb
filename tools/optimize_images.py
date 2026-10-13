#!/usr/bin/env python3
"""Convierte imágenes de site/assets/ a WebP sin servicios externos (solo requiere Pillow).

Uso:
    pip install Pillow
    python tools/optimize_images.py                 # todo site/assets/
    python tools/optimize_images.py ruta/foto.jpg   # archivos o carpetas concretos

JPG/JPEG -> WebP con pérdida (calidad 80). PNG -> WebP sin pérdida (conserva transparencia).
El original se borra tras escribir el .webp; después hay que apuntar index.html / styles.css al .webp.
Los .webp existentes no se tocan, así que es seguro repetirlo.
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


def convert(path):
    before = path.stat().st_size
    out = path.with_suffix(".webp")
    if out.exists():
        print(f"{path.name:32} OMITIDO: ya existe {out.name}")
        return before, before, None
    tmp = out.with_name(out.name + ".tmp")
    with Image.open(path) as im:
        if path.suffix.lower() == ".png":
            im.save(tmp, format="WEBP", lossless=True, quality=100, method=6)
        else:
            ImageOps.exif_transpose(im).convert("RGB").save(tmp, format="WEBP", quality=80, method=6)
    os.replace(tmp, out)  # escritura atómica
    path.unlink()
    return before, out.stat().st_size, out


def main():
    total_before = total_after = 0
    for f in collect(sys.argv[1:]):
        b, a, out = convert(f)
        if out is None:
            continue
        total_before += b
        total_after += a
        print(f"{f.name:32} {b // 1024:>6} KB -> {out.name} {a // 1024:>6} KB")
    print(f"TOTAL {total_before // 1024} KB -> {total_after // 1024} KB")


if __name__ == "__main__":
    main()

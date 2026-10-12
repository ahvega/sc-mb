---
name: optimize-image
description: "Optimize images using the ShortPixel API with lossy, glossy, or lossless compression. Use when the user says /optimize-image, asks to compress, optimize, or reduce the file size of images (PNG, JPG, JPEG, GIF, BMP, TIFF, WebP). Supports single files, multiple files, and glob patterns. Can also convert images to WebP or AVIF format."
allowed-tools: Bash, Read, Glob, Grep
---

# /optimize-image - Optimize Images with ShortPixel

Compress and optimize images using the ShortPixel API. Replaces originals with optimized versions.

## Usage

```
/optimize-image <path(s) or glob> [--mode lossy|glossy|lossless] [--convert webp|avif]
```

### Examples

```
/optimize-image hero.jpg
/optimize-image images/*.png --mode glossy
/optimize-image banner.jpg logo.png icon.gif
/optimize-image assets/**/*.jpg --convert webp
/optimize-image photos/ --mode lossless
```

## Workflow

### 1. Parse user input

Extract from the user's message:
- **File paths or glob patterns** (required)
- **Compression mode** (optional, default: `lossy`)
  - `lossy` - best size reduction, great for photos (default)
  - `glossy` - high quality, crisp appearance, professional-grade
  - `lossless` - pixel-perfect, no quality loss
- **Format conversion** (optional): `webp` or `avif`

If the user provides a directory path (e.g. `photos/`), treat it as `photos/**/*.{jpg,jpeg,png,gif,bmp,tiff,webp}`.

### 2. Resolve file paths

Use the Glob tool to expand any glob patterns into absolute file paths. Filter to supported image extensions: jpg, jpeg, png, gif, bmp, tiff, tif, webp.

If no valid image files are found, inform the user and stop.

### 3. Confirm with user

Before optimizing, show the user:
- Number of images to be processed
- Compression mode
- A warning that originals will be replaced

Ask for confirmation if more than 5 images are being processed.

### 4. Run the optimization script

The script needs a ShortPixel API key and **carries none**: pass `--key`, or export
`SHORTPIXEL_API_KEY` in the environment. Without one it exits `2` and optimizes nothing —
a key baked into the script would be copied into every repo and home this skill is vendored to.
Get one at <https://shortpixel.com/free-sign-up>.

```bash
python ".claude/skills/optimize-image/scripts/optimize.py" --mode <mode> [--convert <format>] <file1> <file2> ...
```

Pass all resolved absolute file paths as positional arguments. If the run exits `2` with a missing-key
error, tell the user to set `SHORTPIXEL_API_KEY` — **do not** invent or hardcode a key.

### 5. Present results

The script outputs a results table. Show it to the user. Highlight:
- Total savings (percentage and bytes)
- Any files that failed or were skipped
- If quota was exceeded, inform the user

## Notes

- The script handles batching (max 100 images per API call) automatically.
- Supported formats: JPG, JPEG, PNG, GIF, BMP, TIFF, WebP.
- The ShortPixel API has a monthly quota. If exceeded, the script will report it.
- When using `--convert`, the optimized file is saved with the new extension alongside the original. The original is NOT deleted when converting formats.

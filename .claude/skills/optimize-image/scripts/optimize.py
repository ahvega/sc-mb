#!/usr/bin/env python3
"""Optimize images using the ShortPixel API."""

import argparse
import json
import os
import sys
import time
from pathlib import Path

try:
    import requests
except ImportError:
    print("Error: 'requests' package is required. Install it with: pip install requests")
    sys.exit(1)

API_URL = "https://api.shortpixel.com/v2/post-reducer.php"
# La credencial NUNCA vive en el codigo: este archivo se vendoriza a varios repos y a tres
# directorios home, asi que una clave por defecto se multiplica por cada destino y entra al
# historial de git de todos ellos. Se toma de --key o de SHORTPIXEL_API_KEY, y si no hay, se para.
API_KEY_ENV = "SHORTPIXEL_API_KEY"
SUPPORTED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".tiff", ".tif", ".webp"}
MAX_BATCH_SIZE = 100
MAX_POLL_RETRIES = 10
POLL_WAIT_SECONDS = 20

MODE_MAP = {"lossy": 1, "glossy": 2, "lossless": 0}


def parse_args():
    parser = argparse.ArgumentParser(description="Optimize images with ShortPixel API")
    parser.add_argument("files", nargs="+", help="Image file paths to optimize")
    parser.add_argument(
        "--mode",
        choices=["lossy", "glossy", "lossless"],
        default="lossy",
        help="Compression mode (default: lossy)",
    )
    parser.add_argument(
        "--convert",
        choices=["webp", "avif"],
        default=None,
        help="Convert to WebP or AVIF format",
    )
    parser.add_argument(
        "--key",
        default=None,
        help=f"ShortPixel API key (por defecto, la variable de entorno {API_KEY_ENV})",
    )
    return parser.parse_args()


def resolve_api_key(args):
    """Clave desde --key o el entorno. Sin clave, para: no hay valor por defecto que usar."""
    key = args.key or os.environ.get(API_KEY_ENV)
    if not key:
        print(
            f"Error: falta la clave de ShortPixel. Pasa --key <clave> o exporta {API_KEY_ENV}.\n"
            "       Se obtiene en https://shortpixel.com/free-sign-up",
            file=sys.stderr,
        )
        sys.exit(2)
    return key


def format_size(size_bytes):
    """Format bytes into human-readable size."""
    if size_bytes < 1024:
        return f"{size_bytes} B"
    elif size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.1f} KB"
    else:
        return f"{size_bytes / (1024 * 1024):.2f} MB"


def get_status_code(item):
    """Extract status code as int from API response item."""
    status = item.get("Status", {})
    if isinstance(status, dict):
        code = status.get("Code")
    else:
        code = status
    try:
        return int(code)
    except (TypeError, ValueError):
        return None


def get_status_message(item):
    """Extract status message from API response item."""
    status = item.get("Status", {})
    if isinstance(status, dict):
        return status.get("Message", "Unknown error")
    return str(status)


def validate_files(file_paths):
    """Validate files exist and have supported extensions. Returns (valid, skipped)."""
    valid = []
    skipped = []
    for path_str in file_paths:
        path = Path(path_str)
        if not path.exists():
            skipped.append((path_str, "file not found"))
            continue
        if not path.is_file():
            skipped.append((path_str, "not a file"))
            continue
        if path.suffix.lower() not in SUPPORTED_EXTENSIONS:
            skipped.append((path_str, f"unsupported format '{path.suffix}'"))
            continue
        valid.append(path)
    return valid, skipped


def upload_and_optimize(batch, api_key, lossy_value, convert_to):
    """Upload a batch of files to ShortPixel and return optimized results."""
    file_paths_map = {}
    files_dict = {}
    for i, path in enumerate(batch, 1):
        field_name = f"file{i}"
        file_paths_map[field_name] = str(path)
        mime = guess_mime(path)
        files_dict[field_name] = (path.name, open(path, "rb"), mime)

    convert_value = ""
    if convert_to:
        convert_value = f"+{convert_to}"

    data = {
        "key": api_key,
        "lossy": str(lossy_value),
        "wait": str(POLL_WAIT_SECONDS),
        "convertto": convert_value,
        "refresh": "0",
        "file_paths": json.dumps(file_paths_map),
    }

    try:
        response = requests.post(API_URL, data=data, files=files_dict, timeout=60)
        result = response.json()
    except requests.exceptions.RequestException as e:
        for _, file_tuple in files_dict.items():
            file_tuple[1].close()
        raise RuntimeError(f"API request failed: {e}")
    finally:
        for _, file_tuple in files_dict.items():
            if not file_tuple[1].closed:
                file_tuple[1].close()

    # Normalize to list
    if isinstance(result, dict):
        result = [result]

    # Poll if still processing
    retries = 0
    while retries < MAX_POLL_RETRIES:
        all_done = all(get_status_code(item) not in (0, 1) for item in result)
        if all_done:
            break

        retries += 1
        print(f"  Processing... (attempt {retries}/{MAX_POLL_RETRIES})")
        time.sleep(5)

        # Re-send request to poll (reopen files)
        files_dict_retry = {}
        for i, path in enumerate(batch, 1):
            field_name = f"file{i}"
            mime = guess_mime(path)
            files_dict_retry[field_name] = (path.name, open(path, "rb"), mime)

        try:
            response = requests.post(API_URL, data=data, files=files_dict_retry, timeout=60)
            result = response.json()
            if isinstance(result, dict):
                result = [result]
        except requests.exceptions.RequestException:
            pass
        finally:
            for _, file_tuple in files_dict_retry.items():
                if not file_tuple[1].closed:
                    file_tuple[1].close()

    return result, file_paths_map


def guess_mime(path):
    """Guess MIME type from extension."""
    ext = path.suffix.lower()
    mime_map = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".gif": "image/gif",
        ".bmp": "image/bmp",
        ".tiff": "image/tiff",
        ".tif": "image/tiff",
        ".webp": "image/webp",
    }
    return mime_map.get(ext, "application/octet-stream")


def download_and_replace(item, file_paths_map, convert_to, lossy_value):
    """Download optimized image and replace original. Returns (path, orig_size, new_size) or None."""
    code = get_status_code(item)

    if code != 2:
        msg = get_status_message(item)
        original_name = item.get("OriginalURL", "unknown")
        return None, f"Failed ({msg}): {original_name}"

    # Determine download URL
    if convert_to == "webp":
        if lossy_value == 0:
            url = item.get("WebPLosslessURL", item.get("LosslessURL"))
        else:
            url = item.get("WebPLossyURL", item.get("LossyURL"))
    elif convert_to == "avif":
        if lossy_value == 0:
            url = item.get("AVIFLosslessURL", item.get("LosslessURL"))
        else:
            url = item.get("AVIFLossyURL", item.get("LossyURL"))
    else:
        if lossy_value == 0:
            url = item.get("LosslessURL")
        else:
            url = item.get("LossyURL")

    if not url or url == "NA":
        return None, f"No download URL in response for {item.get('OriginalURL', 'unknown')}"

    # Find original file path using the Key field (e.g. "file1", "file2")
    key_field = item.get("Key", "")
    original_path = file_paths_map.get(key_field)

    # Fallback: match by filename from OriginalURL
    if not original_path:
        orig_url = item.get("OriginalURL", "")
        orig_name = orig_url.split("/")[-1] if "/" in orig_url else orig_url
        for field_name, fpath in file_paths_map.items():
            if Path(fpath).name == orig_name:
                original_path = fpath
                break

    if not original_path:
        return None, f"Could not match response to original file: {item.get('OriginalURL', 'unknown')}"

    original_path = Path(original_path)
    orig_size = int(item.get("OriginalSize", original_path.stat().st_size))

    # Download optimized image
    try:
        dl_response = requests.get(url, timeout=120)
        dl_response.raise_for_status()
    except requests.exceptions.RequestException as e:
        return None, f"Download failed for {original_path.name}: {e}"

    optimized_data = dl_response.content
    new_size = len(optimized_data)

    # Determine save path
    if convert_to:
        save_path = original_path.with_suffix(f".{convert_to}")
    else:
        save_path = original_path

    # Write optimized file
    save_path.write_bytes(optimized_data)

    return (str(save_path), orig_size, new_size), None


def main():
    args = parse_args()
    api_key = resolve_api_key(args)

    # Validate files
    valid_files, skipped = validate_files(args.files)

    if skipped:
        print("\nSkipped files:")
        for path, reason in skipped:
            print(f"  - {path}: {reason}")

    if not valid_files:
        print("\nNo valid image files to optimize.")
        sys.exit(1)

    lossy_value = MODE_MAP[args.mode]
    convert_to = args.convert

    print(f"\nOptimizing {len(valid_files)} image(s) with {args.mode} compression...")
    if convert_to:
        print(f"Converting to {convert_to.upper()} format.")
    print()

    # Process in batches
    results = []
    errors = []
    total_batches = (len(valid_files) + MAX_BATCH_SIZE - 1) // MAX_BATCH_SIZE

    for batch_idx in range(total_batches):
        start = batch_idx * MAX_BATCH_SIZE
        end = min(start + MAX_BATCH_SIZE, len(valid_files))
        batch = valid_files[start:end]

        if total_batches > 1:
            print(f"Batch {batch_idx + 1}/{total_batches} ({len(batch)} images)...")

        try:
            api_results, file_paths_map = upload_and_optimize(
                batch, api_key, lossy_value, convert_to
            )
        except RuntimeError as e:
            errors.append(str(e))
            continue

        # Check for quota exceeded
        for item in api_results:
            if get_status_code(item) == -403:
                msg = get_status_message(item)
                print(f"\nERROR: {msg}")
                print("Your ShortPixel monthly quota has been exceeded.")
                sys.exit(2)

        # Download and replace
        for item in api_results:
            result, error = download_and_replace(item, file_paths_map, convert_to, lossy_value)
            if error:
                errors.append(error)
            elif result:
                results.append(result)

    # Print results table
    if results:
        print("\nImage Optimization Results")
        print("=" * 70)
        header = f"{'File':<35} {'Original':>10} {'Optimized':>10} {'Savings':>10}"
        print(header)
        print("-" * 70)

        total_orig = 0
        total_new = 0
        for path, orig_size, new_size in results:
            name = Path(path).name
            if len(name) > 34:
                name = name[:31] + "..."
            savings = ((orig_size - new_size) / orig_size * 100) if orig_size > 0 else 0
            total_orig += orig_size
            total_new += new_size
            print(f"{name:<35} {format_size(orig_size):>10} {format_size(new_size):>10} {savings:>9.1f}%")

        print("-" * 70)
        total_savings = ((total_orig - total_new) / total_orig * 100) if total_orig > 0 else 0
        print(f"{'Total':<35} {format_size(total_orig):>10} {format_size(total_new):>10} {total_savings:>9.1f}%")
        print(f"\nSaved {format_size(total_orig - total_new)} across {len(results)} image(s).")

    if errors:
        print(f"\n{len(errors)} error(s):")
        for err in errors:
            print(f"  - {err}")

    if not results and not errors:
        print("\nNo images were processed.")
        sys.exit(1)


if __name__ == "__main__":
    main()

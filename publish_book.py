#!/usr/bin/env python3
"""
Trees Pinyin Storybook Publisher (publish_book.py)
--------------------------------------------------
Usage:
    python3 publish_book.py nine-colored-deer
    python3 publish_book.py nine-colored-deer --source /path/to/public

What it does:
  1. Loads Cloudflare R2 credentials from project root `.env`.
  2. Finds source `images/` and `audio/` for `<book-id>`.
  3. Batch-converts 4K source images to WebP in memory (max width 2048px, quality 82%),
     leaving original local 4K files untouched.
  4. Uploads WebP images to `books/<book-id>/images/` and audio files to `books/<book-id>/audio/`
     in the configured Cloudflare R2 bucket via boto3.
  5. Updates `stories/catalog.json` (`mediaBaseUrl` -> `https://media.treespinyin.com/books/<book-id>/`
     and `coverUrl` -> `.webp`) and `stories/books/<book-id>/book.json` image paths to `.webp`.
"""

from __future__ import annotations

import argparse
import io
import json
import mimetypes
import os
import sys
from pathlib import Path

import boto3
from botocore.config import Config
from PIL import Image, ImageOps

REPO_ROOT = Path(__file__).resolve().parent
ENV_FILE = REPO_ROOT / ".env"
CATALOG_FILE = REPO_ROOT / "stories" / "catalog.json"

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"}
AUDIO_EXTS = {".mp3", ".wav", ".m4a", ".ogg", ".aac", ".webm"}
AUDIO_MIME_MAP = {
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".m4a": "audio/mp4",
    ".ogg": "audio/ogg",
    ".aac": "audio/aac",
    ".webm": "audio/webm",
}


def load_dotenv(env_path: Path) -> None:
    if not env_path.exists():
        return
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = val


def find_source_dir(book_id: str, explicit_source: str | None) -> Path:
    candidates = []
    if explicit_source:
        candidates.append(Path(explicit_source).expanduser().resolve())
    candidates.extend([
        REPO_ROOT / "stories" / "books" / book_id / "media",
        Path.home() / "Documents" / "trees-pinyin-promo" / book_id / "public",
        REPO_ROOT.parent / "trees-pinyin-promo" / book_id / "public",
    ])
    for cand in candidates:
        if cand.exists() and ((cand / "images").is_dir() or (cand / "audio").is_dir()):
            return cand
    searched = "\n  - ".join(str(c) for c in candidates)
    raise FileNotFoundError(
        f"Could not locate media folder (images/ or audio/) for '{book_id}'. Searched:\n  - {searched}"
    )


def convert_to_webp_bytes(src_path: Path, max_width: int, quality: int) -> tuple[bytes, tuple[int, int], tuple[int, int]]:
    with Image.open(src_path) as img:
        img = ImageOps.exif_transpose(img)
        orig_size = img.size
        if img.width > max_width:
            ratio = max_width / float(img.width)
            new_height = max(1, int(round(img.height * ratio)))
            img = img.resize((max_width, new_height), Image.Resampling.LANCZOS)

        if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
            img = img.convert("RGBA")
        elif img.mode != "RGB":
            img = img.convert("RGB")

        out = io.BytesIO()
        img.save(out, format="WEBP", quality=quality, method=6)
        return out.getvalue(), orig_size, img.size


def create_r2_client():
    endpoint = os.environ.get("R2_ENDPOINT_URL", "").strip()
    access_key = os.environ.get("R2_ACCESS_KEY_ID", "").strip()
    secret_key = os.environ.get("R2_SECRET_ACCESS_KEY", "").strip()
    bucket = os.environ.get("R2_BUCKET", "treespinyin-media").strip()
    public_base = os.environ.get("R2_PUBLIC_BASE_URL", "https://media.treespinyin.com").strip().rstrip("/")

    missing = [
        name for name, val in [
            ("R2_ENDPOINT_URL", endpoint),
            ("R2_ACCESS_KEY_ID", access_key),
            ("R2_SECRET_ACCESS_KEY", secret_key),
        ] if not val
    ]
    if missing:
        raise RuntimeError(f"Missing required environment variables in .env: {', '.join(missing)}")

    client = boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name="auto",
        config=Config(signature_version="s3v4"),
    )
    return client, bucket, public_base


def normalize_to_webp_path(rel_path: str, uploaded_stems: set[str]) -> str:
    if not rel_path:
        return rel_path
    p = Path(rel_path)
    if p.suffix.lower() in IMAGE_EXTS and p.stem in uploaded_stems:
        return str(p.with_suffix(".webp")).replace("\\", "/")
    return rel_path


def update_metadata_files(book_id: str, public_media_base: str, uploaded_image_stems: set[str]) -> None:
    # 1. Update stories/catalog.json
    if CATALOG_FILE.exists():
        catalog = json.loads(CATALOG_FILE.read_text(encoding="utf-8"))
        updated_catalog = False
        for book in catalog.get("books", []):
            if book.get("id") == book_id:
                book["mediaBaseUrl"] = public_media_base
                if book.get("coverUrl"):
                    book["coverUrl"] = normalize_to_webp_path(book["coverUrl"], uploaded_image_stems)
                updated_catalog = True
                break
        if updated_catalog:
            CATALOG_FILE.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            print(f"✅ Updated {CATALOG_FILE.relative_to(REPO_ROOT)} -> mediaBaseUrl = {public_media_base}")
        else:
            print(f"⚠️  Book id '{book_id}' not found in {CATALOG_FILE.relative_to(REPO_ROOT)}")

    # 2. Update stories/books/<book_id>/book.json image paths to .webp
    book_json_path = REPO_ROOT / "stories" / "books" / book_id / "book.json"
    if book_json_path.exists() and uploaded_image_stems:
        book_data = json.loads(book_json_path.read_text(encoding="utf-8"))
        changed_count = 0
        for page in book_data.get("pages", []):
            for key in ("image", "imagePath"):
                if page.get(key):
                    new_val = normalize_to_webp_path(page[key], uploaded_image_stems)
                    if new_val != page[key]:
                        page[key] = new_val
                        changed_count += 1
        if changed_count > 0:
            book_json_path.write_text(json.dumps(book_data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            print(f"✅ Updated {changed_count} image path(s) to .webp in {book_json_path.relative_to(REPO_ROOT)}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Convert storybook 4K images to WebP and upload assets to Cloudflare R2.")
    parser.add_argument("book_id", help="Storybook ID (e.g. nine-colored-deer)")
    parser.add_argument("--source", help="Path to source folder containing images/ and/or audio/")
    parser.add_argument("--max-width", type=int, default=2048, help="Max width in pixels for WebP images (default: 2048)")
    parser.add_argument("--quality", type=int, default=82, help="WebP quality 1-100 (default: 82)")
    parser.add_argument("--dry-run", action="store_true", help="Convert and report without uploading or editing JSON")
    args = parser.parse_args()

    load_dotenv(ENV_FILE)
    source_dir = find_source_dir(args.book_id, args.source)
    print(f"📂 Source media directory: {source_dir}")

    s3_client, bucket, public_base = create_r2_client()
    public_media_base = f"{public_base}/books/{args.book_id}/"

    # 1. Process and upload images -> books/<book_id>/images/*.webp
    images_dir = source_dir / "images"
    uploaded_image_stems: set[str] = set()
    image_urls: list[str] = []

    if images_dir.is_dir():
        img_files = sorted(
            p for p in images_dir.iterdir()
            if p.is_file() and p.suffix.lower() in IMAGE_EXTS and not p.name.startswith(".")
        )
        print(f"🖼️  Found {len(img_files)} image(s) in {images_dir}")
        for img_path in img_files:
            # Skip non-book favicon icons if present (e.g. icon.png) unless desired; still upload if needed?
            # Actually keep cover/page/scene images; skip site icon.png if it's just a duplicate app icon.
            if img_path.name.lower() == "icon.png":
                print(f"   ⏭️  Skipping duplicate app icon: {img_path.name}")
                continue
            webp_bytes, orig_dim, new_dim = convert_to_webp_bytes(img_path, args.max_width, args.quality)
            orig_kb = img_path.stat().st_size / 1024.0
            webp_kb = len(webp_bytes) / 1024.0
            r2_key = f"books/{args.book_id}/images/{img_path.stem}.webp"

            if not args.dry_run:
                s3_client.put_object(
                    Bucket=bucket,
                    Key=r2_key,
                    Body=webp_bytes,
                    ContentType="image/webp",
                    CacheControl="public, max-age=31536000, immutable",
                )
            uploaded_image_stems.add(img_path.stem)
            url = f"{public_base}/{r2_key}"
            image_urls.append(url)
            print(f"   ⬆️  {img_path.name} ({orig_dim[0]}x{orig_dim[1]}, {orig_kb:.1f}KB) -> {img_path.stem}.webp ({new_dim[0]}x{new_dim[1]}, {webp_kb:.1f}KB)")
    else:
        print(f"ℹ️  No images/ directory found under {source_dir}")

    # 2. Upload audio files -> books/<book_id>/audio/*
    audio_dir = source_dir / "audio"
    audio_urls: list[str] = []
    if audio_dir.is_dir():
        audio_files = sorted(
            p for p in audio_dir.rglob("*")
            if p.is_file() and p.suffix.lower() in AUDIO_EXTS and not p.name.startswith(".")
        )
        print(f"🔊 Found {len(audio_files)} audio file(s) in {audio_dir}")
        for audio_path in audio_files:
            rel_audio = audio_path.relative_to(audio_dir).as_posix()
            r2_key = f"books/{args.book_id}/audio/{rel_audio}"
            content_type = AUDIO_MIME_MAP.get(audio_path.suffix.lower()) or mimetypes.guess_type(audio_path.name)[0] or "application/octet-stream"
            if not args.dry_run:
                s3_client.put_object(
                    Bucket=bucket,
                    Key=r2_key,
                    Body=audio_path.read_bytes(),
                    ContentType=content_type,
                    CacheControl="public, max-age=31536000, immutable",
                )
            url = f"{public_base}/{r2_key}"
            audio_urls.append(url)
            print(f"   ⬆️  audio/{rel_audio} ({audio_path.stat().st_size / 1024.0:.1f}KB, {content_type})")
    else:
        print(f"ℹ️  No audio/ directory found under {source_dir}")

    # 3. Update catalog.json & book.json
    if not args.dry_run:
        update_metadata_files(args.book_id, public_media_base, uploaded_image_stems)

    print("\n🎉 Publish complete!")
    print(f"   Media Base URL: {public_media_base}")
    print(f"   Images uploaded: {len(image_urls)}")
    print(f"   Audio uploaded:  {len(audio_urls)}")
    if image_urls:
        print(f"   Sample image URL: {image_urls[0]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""Regenerate lib/scenario/godivaLogo.ts from the upstream brand mark.

The shipped example product "Godiva Sticks" carries the real Godiva
Chocolatier logo at the owner's explicit request. The asset is a third-party
trademark included for a local demo record only — it is not ours, and it is
not licensed for redistribution as part of a product.

Source: https://en.wikipedia.org/wiki/Godiva_Chocolatier (infobox logo,
uploaded to en.wikipedia as a non-free/fair-use file). en.wikipedia caps
non-free thumbnails at 250 px, which is why the source is that size; the app
renders product logos between 20 and 48 px, and lib/ui/logo.ts would downscale
anything larger to 256 px anyway.

The output mirrors what lib/ui/logo.ts produces for an uploaded file: a
contain-fitted 256x256 canvas with transparent padding, never upscaled,
encoded within the 64K-character data-URL budget that keeps the single
localStorage blob writable.

Usage: python3 scripts/make-godiva-logo.py
"""

import base64
import io
import os
import urllib.request

from PIL import Image

SOURCE_URL = (
    "https://upload.wikimedia.org/wikipedia/en/thumb/9/95/"
    "Godiva_Chocolatier_Logo.svg/250px-Godiva_Chocolatier_Logo.svg.png"
)
# Wikimedia blocks browser-spoofing user agents on hotlinks; identify honestly.
USER_AGENT = "AkifCPG-docs/1.0 (local demo asset fetch)"

TARGET_SIZE = 256          # lib/ui/logo.ts LOGO_TARGET_SIZE
MAX_DATA_URL_CHARS = 64 * 1024  # lib/ui/logo.ts MAX_LOGO_DATA_URL_CHARS

OUT_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "lib", "scenario", "godivaLogo.ts",
)


def fetch_source() -> Image.Image:
    request = urllib.request.Request(SOURCE_URL, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request) as response:
        if response.status != 200:
            raise SystemExit(f"source fetch failed: HTTP {response.status}")
        return Image.open(io.BytesIO(response.read())).convert("RGBA")


def contain_fit(image: Image.Image, size: int) -> Image.Image:
    """Centre the image on a transparent square canvas, never upscaling."""
    scale = min(size / image.width, size / image.height, 1.0)
    width, height = round(image.width * scale), round(image.height * scale)
    resized = image.resize((width, height), Image.LANCZOS) if scale < 1.0 else image
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.paste(resized, ((size - width) // 2, (size - height) // 2), resized)
    return canvas


def encode_within_budget(image: Image.Image) -> tuple[str, str, int]:
    """Walk a quality ladder like the runtime encoder; smallest fit wins."""
    candidates: list[tuple[str, str, bytes]] = []
    for quality in (90, 80, 65, 50):
        buffer = io.BytesIO()
        image.save(buffer, format="WEBP", quality=quality, method=6)
        candidates.append(("image/webp", f"webp q{quality}", buffer.getvalue()))
    png = io.BytesIO()
    image.save(png, format="PNG", optimize=True)
    candidates.append(("image/png", "png", png.getvalue()))

    for mime, label, payload in candidates:
        data_url = f"data:{mime};base64,{base64.b64encode(payload).decode('ascii')}"
        if len(data_url) <= MAX_DATA_URL_CHARS:
            return data_url, label, len(payload)
    raise SystemExit("no encoding fits the data-URL budget")


def main() -> None:
    source = fetch_source()
    fitted = contain_fit(source, TARGET_SIZE)
    data_url, label, raw_bytes = encode_within_budget(fitted)

    module = f'''/**
 * Godiva Chocolatier brand mark — the logo of the shipped "Godiva Sticks"
 * example product (see `lib/scenario/seeds.ts`).
 *
 * THIRD-PARTY TRADEMARK. Included at the owner's explicit request so the demo
 * record looks like a real SKU. It is not our asset and carries no licence for
 * redistribution; drop this file and the product falls back to the "GS"
 * monogram with no other change.
 *
 * Source: en.wikipedia.org/wiki/Godiva_Chocolatier (non-free infobox logo,
 * capped at 250 px upstream). Contain-fitted to {TARGET_SIZE}x{TARGET_SIZE} with transparent
 * padding, encoded {label} ({raw_bytes:,} bytes) — the same shape
 * `lib/ui/logo.ts` produces for an uploaded file, well inside its 64K-char
 * budget. Regenerate with: python3 scripts/make-godiva-logo.py
 */
export const GODIVA_LOGO_DATA_URL =
  "{data_url}";
'''
    with open(OUT_PATH, "w", encoding="utf-8") as handle:
        handle.write(module)
    print(f"{OUT_PATH}: {label}, {raw_bytes:,} bytes, data URL {len(data_url):,} chars")


if __name__ == "__main__":
    main()

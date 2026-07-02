#!/usr/bin/env python3
"""Remove a flat chroma-key background from a sprite sheet."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


def parse_rgb(value: str) -> tuple[int, int, int]:
    raw = value.strip().lower()
    if raw.startswith("#"):
        raw = raw[1:]
    if len(raw) == 6:
        return int(raw[0:2], 16), int(raw[2:4], 16), int(raw[4:6], 16)

    parts = [int(part.strip()) for part in raw.split(",") if part.strip()]
    if len(parts) != 3 or any(part < 0 or part > 255 for part in parts):
        raise argparse.ArgumentTypeError("expected #RRGGBB or R,G,B")
    return parts[0], parts[1], parts[2]


def remove_chroma_key(
    image: Image.Image,
    key: tuple[int, int, int],
    tolerance: int,
    feather: int,
) -> Image.Image:
    if tolerance < 0 or feather < 0:
        raise ValueError("tolerance and feather must be non-negative")

    rgba = image.convert("RGBA")
    pixels = rgba.load()
    key_r, key_g, key_b = key
    hard = tolerance
    soft = tolerance + feather

    for y in range(rgba.height):
        for x in range(rgba.width):
            r, g, b, a = pixels[x, y]
            distance = max(abs(r - key_r), abs(g - key_g), abs(b - key_b))
            if distance <= hard:
                pixels[x, y] = (r, g, b, 0)
            elif feather and distance <= soft:
                alpha_scale = (distance - hard) / feather
                pixels[x, y] = (r, g, b, round(a * alpha_scale))

    return rgba


def main() -> None:
    parser = argparse.ArgumentParser(description="Convert a flat chroma-key sprite sheet to RGBA transparency.")
    parser.add_argument("--input", required=True, type=Path, help="Source sprite sheet.")
    parser.add_argument("--output", required=True, type=Path, help="Transparent PNG/WebP output path.")
    parser.add_argument("--key", default="#00ff00", type=parse_rgb, help="Chroma-key color, default #00ff00.")
    parser.add_argument("--tolerance", default=28, type=int, help="Fully transparent max channel distance.")
    parser.add_argument("--feather", default=16, type=int, help="Soft edge distance beyond tolerance.")
    args = parser.parse_args()

    image = Image.open(args.input)
    output = remove_chroma_key(image, args.key, args.tolerance, args.feather)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    output.save(args.output)
    print(f"Wrote {args.output}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Assemble an aligned floating-window animation from a transparent sprite sheet."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


def parse_pair(value: str) -> tuple[int, int]:
    parts = value.lower().replace("x", ",").split(",")
    if len(parts) != 2:
        raise argparse.ArgumentTypeError("expected WIDTHxHEIGHT or WIDTH,HEIGHT")
    return int(parts[0]), int(parts[1])


def parse_int_list(value: str) -> list[int]:
    values = [int(part.strip()) for part in value.split(",") if part.strip()]
    if not values:
        raise argparse.ArgumentTypeError("at least one duration is required")
    if any(item < 0 for item in values):
        raise argparse.ArgumentTypeError("list items must be non-negative integers")
    return values


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("frame has no opaque pixels")
    return bbox


def split_sheet(sheet: Image.Image, cols: int, rows: int) -> list[Image.Image]:
    width, height = sheet.size
    cell_width = width // cols
    cell_height = height // rows
    frames: list[Image.Image] = []
    for row in range(rows):
        for col in range(cols):
            left = col * cell_width
            top = row * cell_height
            right = width if col == cols - 1 else left + cell_width
            bottom = height if row == rows - 1 else top + cell_height
            frames.append(sheet.crop((left, top, right, bottom)))
    return frames


def align_frames(
    frames: list[Image.Image],
    canvas_size: tuple[int, int],
    target_max: tuple[int, int],
    anchor: tuple[int, int],
) -> tuple[list[Image.Image], list[dict[str, object]]]:
    bboxes = [alpha_bbox(frame) for frame in frames]
    crops = [frame.crop(bbox) for frame, bbox in zip(frames, bboxes)]
    max_source_width = max(crop.width for crop in crops)
    max_source_height = max(crop.height for crop in crops)
    scale = min(target_max[0] / max_source_width, target_max[1] / max_source_height)
    if scale <= 0:
        raise ValueError("target size must be positive")

    aligned: list[Image.Image] = []
    placements: list[dict[str, object]] = []
    for index, crop in enumerate(crops):
        scaled_size = (
            max(1, round(crop.width * scale)),
            max(1, round(crop.height * scale)),
        )
        resized = crop.resize(scaled_size, Image.Resampling.LANCZOS)
        canvas = Image.new("RGBA", canvas_size, (0, 0, 0, 0))
        x = anchor[0] - scaled_size[0] // 2
        y = anchor[1] - scaled_size[1]
        canvas.alpha_composite(resized, (x, y))
        aligned.append(canvas)
        placements.append(
            {
                "frame": index,
                "source_bbox": bboxes[index],
                "source_size": crop.size,
                "scaled_size": scaled_size,
                "placement": (x, y),
                "aligned_bbox": alpha_bbox(canvas),
            }
        )
    return aligned, placements


def save_preview(frames: list[Image.Image], output: Path) -> None:
    width, height = frames[0].size
    preview = Image.new("RGBA", (width * len(frames), height), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        preview.alpha_composite(frame, (index * width, 0))
    preview.save(output)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Build an aligned animated WebP from a transparent multi-frame sprite sheet."
    )
    parser.add_argument("--input", required=True, type=Path, help="Transparent sprite sheet PNG/WebP.")
    parser.add_argument("--cols", required=True, type=int, help="Number of sheet columns.")
    parser.add_argument("--rows", default=1, type=int, help="Number of sheet rows.")
    parser.add_argument("--output", required=True, type=Path, help="Animated WebP output path.")
    parser.add_argument("--durations", required=True, type=parse_int_list, help="Comma-separated frame durations in ms.")
    parser.add_argument("--sequence", type=parse_int_list, help="Optional comma-separated source frame indexes, for example 0,1,0.")
    parser.add_argument("--canvas", default="256x256", type=parse_pair, help="Output canvas size.")
    parser.add_argument("--target-max", default="210x232", type=parse_pair, help="Maximum subject size after scaling.")
    parser.add_argument("--anchor", default="128,244", type=parse_pair, help="Shared bottom-center anchor x,y.")
    parser.add_argument("--loop", default=0, type=int, help="Animation loop count. 0 means forever.")
    parser.add_argument("--static-output", type=Path, help="Optional first-frame PNG output.")
    parser.add_argument("--fallback-output", type=Path, help="Optional resized 120x120 PNG fallback output.")
    parser.add_argument("--preview-output", type=Path, help="Optional side-by-side aligned frame preview.")
    args = parser.parse_args()

    if args.cols <= 0 or args.rows <= 0:
        raise ValueError("cols and rows must be positive")

    sheet = Image.open(args.input).convert("RGBA")
    raw_frames = split_sheet(sheet, args.cols, args.rows)
    if any(duration <= 0 for duration in args.durations):
        raise ValueError("durations must be positive milliseconds")

    aligned_sources, placements = align_frames(raw_frames, args.canvas, args.target_max, args.anchor)
    sequence = args.sequence if args.sequence is not None else list(range(len(aligned_sources)))
    if any(index >= len(aligned_sources) for index in sequence):
        raise ValueError("sequence index is outside the source frame range")
    if len(args.durations) != len(sequence):
        raise ValueError(f"duration count {len(args.durations)} does not match sequence length {len(sequence)}")
    aligned = [aligned_sources[index].copy() for index in sequence]

    args.output.parent.mkdir(parents=True, exist_ok=True)
    aligned[0].save(
        args.output,
        save_all=True,
        append_images=aligned[1:],
        duration=args.durations,
        loop=args.loop,
        format="WEBP",
        lossless=True,
        method=6,
        disposal=2,
    )

    if args.static_output:
        args.static_output.parent.mkdir(parents=True, exist_ok=True)
        aligned[0].save(args.static_output)
    if args.fallback_output:
        args.fallback_output.parent.mkdir(parents=True, exist_ok=True)
        aligned[0].resize((120, 120), Image.Resampling.LANCZOS).save(args.fallback_output)
    if args.preview_output:
        args.preview_output.parent.mkdir(parents=True, exist_ok=True)
        save_preview(aligned, args.preview_output)

    print(f"Wrote {args.output}")
    print(f"Durations: {args.durations}")
    for placement in placements:
        print(placement)


if __name__ == "__main__":
    main()



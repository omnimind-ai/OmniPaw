---
name: floating-window-animation
description: This skill should be used when creating or refining transparent animated mascot assets for the OmniPaw floating window, especially when turning an AI-generated multi-frame sprite sheet into an aligned idle, blink, drag, or task-state WebP/GIF with stable positioning and deliberate still intervals.
---

# Floating Window Animation

## Overview

Create small, transparent floating-window animations from a generated multi-frame sheet while preventing frame-to-frame position jitter. Use one generation pass to produce all expression or motion frames, then crop and recompose every frame onto a shared canvas with the same bottom-center anchor.

## When To Use

Use this skill for OmniPaw cat appearance packs and similar desktop floating mascots when the user asks for:

- A blinking idle animation, breathing idle animation, drag animation, or task-state animation.
- A WebP/GIF/AVIF made from a generated sprite sheet.
- Fixing jitter, flashing, inconsistent crop boxes, or uneven frame timing in a floating-window animation.
- Higher-resolution transparent mascot assets that still render inside the floating window with `object-fit: contain`.

## Workflow

1. Read `docs/cat-appearance-packs.md` when working inside the OmniPaw Electron repo. Preserve the manifest contract and resource limits from that document.
2. Generate one multi-frame sprite sheet rather than separate images. Ask the image generator for equal-sized cells, identical pose, identical scale, identical silhouette, and only the intended moving detail changed.
3. Use a flat chroma-key background such as `#00ff00` when the generator cannot output true transparency. Remove the chroma key before assembly so the script can use alpha boundaries.
4. Assemble the animation from the transparent sheet with `scripts/assemble_sprite_animation.py`.
5. Validate frame durations, alpha bounding boxes, transparent corners, file size, and a side-by-side preview before reporting completion.

## Sprite Sheet Prompt Pattern

Use a prompt shaped like:

```text
Create a clean multi-frame sprite sheet for a desktop floating-window mascot animation.
All cells must show the same full-body chibi character, same pose, same scale, same visual anchor point, same clothing, same hair, and same silhouette.
Only change: <eyes closed for blink / hair lifted / arm pose / task expression>.
Composition: <N> equal-sized cells in one row, full body centered in each cell, generous padding, no cropping.
Background: perfectly flat solid #00ff00 chroma-key background.
Constraints: no shadows, gradients, separator lines, labels, text, props, watermark, border, extra characters, or #00ff00 in the subject.
```

For blink idle, prefer three logical animation frames even when there are only two unique drawings:

1. Open eyes, still interval.
2. Closed eyes, short blink.
3. Open eyes, longer still interval.

Example timing: `2000,120,3000`.

## Assembly Rule

Never crop a sprite sheet with one shared union box unless each source frame is already perfectly overlaid. To prevent jitter:

1. Split the sheet into cells.
2. For each cell, take that frame's own alpha bounding box.
3. Compute one shared scale from the largest cropped frame.
4. Resize every cropped frame with that same scale.
5. Paste every resized frame onto the same transparent canvas using the same bottom-center anchor point.
6. Save the animation with explicit frame durations and no visual separator frames.

Use a larger working canvas than the final rendered window. `256x256` is a good default for a floating window that displays around `76x76`; keep a `120x120` fallback only when needed by existing docs or previews.

## Script Usage

Run the bundled script after chroma-key removal:

```bash
python .agents/skills/floating-window-animation/scripts/assemble_sprite_animation.py \
  --input tmp/imagegen/mascot-sheet-alpha.png \
  --cols 2 \
  --rows 1 \
  --output cat-appearances/my-pack/assets/idle.webp \
  --sequence 0,1,0 \
  --durations 2000,120,3000 \
  --canvas 256x256 \
  --target-max 210x232 \
  --anchor 128,244 \
  --static-output cat-appearances/my-pack/assets/idle-static-256.png \
  --fallback-output cat-appearances/my-pack/assets/idle.png \
  --preview-output tmp/imagegen/my-pack-idle-preview.png
```

Use `--sequence 0,1,0 --durations 2000,120,3000` for a natural blink from a two-cell open/closed source sheet. Use `--cols 2 --durations 2000,120` only when the user explicitly wants a short repeating blink.

## Validation

After assembly, inspect the output with Pillow:

```bash
python -c "from PIL import Image, ImageSequence; im=Image.open('cat-appearances/my-pack/assets/idle.webp'); frames=[f.copy().convert('RGBA') for f in ImageSequence.Iterator(im)]; print(im.size, len(frames), [f.getchannel('A').getbbox() for f in frames])"
```

Require:

- Expected frame count. Confirm requested durations from the script output, for example `Durations: [2000, 120, 3000]`. Some Pillow/WebP builds do not expose frame durations when reading the saved file.
- Identical or intentionally compatible alpha bounding boxes across frames.
- Transparent corners in every frame.
- No visible background fringe after chroma-key removal.
- Animated WebP below the appearance-pack file limit; keep common idle animations well under 1 MB when possible.

## Manifest Update

For a minimal OmniPaw appearance pack, point `assets.idle` at the animated WebP:

```json
{
  "version": 1,
  "id": "my-pack",
  "name": "My Pack",
  "description": "A transparent blinking floating-window appearance.",
  "assets": {
    "idle": "assets/idle.webp"
  }
}
```



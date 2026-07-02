---
name: floating-window-animation
description: This skill should be used when creating or refining transparent animated mascot assets for the OmniPaw floating window, especially when turning an AI-generated multi-frame sprite sheet into an aligned idle, blink, drag, or task-state WebP/GIF with stable positioning and deliberate still intervals.
---

# Floating Window Animation

## Overview

Create small, transparent floating-window animations from a generated multi-frame sheet while preventing frame-to-frame position jitter. Use one generation pass to produce all expression or motion frames, then crop and recompose every frame onto a shared canvas with the same bottom-center anchor. Keep source cells visually full so different animation states share the same apparent character size.

## When To Use

Use this skill for OmniPaw cat appearance packs and similar desktop floating mascots when the user asks for:

- A blinking idle animation, breathing idle animation, drag animation, or task-state animation.
- A WebP/GIF/AVIF made from a generated sprite sheet.
- Fixing jitter, flashing, inconsistent crop boxes, or uneven frame timing in a floating-window animation.
- Higher-resolution transparent mascot assets that still render inside the floating window with `object-fit: contain`.

## Workflow

1. Read `docs/cat-appearance-packs.md` when working inside the OmniPaw Electron repo. Preserve the manifest contract and resource limits from that document.
2. Generate one multi-frame sprite sheet rather than separate images. Ask the image generator for equal-sized cells, identical pose, identical scale, identical silhouette, and only the intended moving detail changed.
3. Prefer `256x256` source cells. Ask for the character to nearly fill each cell while leaving transparent/chroma-key safety padding, so separate animations keep a consistent visual size before final assembly.
4. Use a flat chroma-key background such as `#00ff00` when the generator cannot output true transparency. Remove the chroma key before assembly so the alignment script can use alpha boundaries.
5. Assemble the animation from the transparent sheet with `scripts/assemble_sprite_animation.py`.
6. Validate frame durations, alpha bounding boxes, transparent corners, file size, and a side-by-side preview before reporting completion.
7. Validate the WebP loop count. Idle, drag, and doing loops may use `loop=0` forever; one-shot transition animations must use `loop=1`.

## Sprite Sheet Prompt Pattern

Use a prompt shaped like:

```text
Create a clean multi-frame sprite sheet for a desktop floating-window mascot animation.
All cells must show the same full-body chibi character, same pose, same scale, same visual anchor point, same clothing, same hair, and same silhouette.
Only change: <eyes closed for blink / hair lifted / arm pose / task expression>.
Composition: <N> equal-sized 256x256 cells in one row, full body centered in each cell, character fills roughly 85-92% of cell height, consistent foot/bottom anchor, small safe padding, no cropping.
Background: perfectly flat solid #00ff00 chroma-key background.
Constraints: no shadows, gradients, separator lines, labels, text, props, watermark, border, extra characters, or #00ff00 in the subject.
```

If a 256px source cell is impractical, still keep every cell the same size and ask the subject to occupy the same percentage of each cell. Avoid tiny subjects floating in a large cell, because later upscaling makes separate animations disagree in apparent size.

## Chroma-Key Removal

Image generation is not a reliable matting step. Prefer true transparent output when available; otherwise ask for a perfectly flat `#00ff00` background and remove it locally before animation assembly.

Use the bundled chroma-key helper:

```bash
python .agents/skills/floating-window-animation/scripts/chroma_key_alpha.py \
  --input tmp/imagegen/mascot-sheet-green.png \
  --output tmp/imagegen/mascot-sheet-alpha.png \
  --key "#00ff00" \
  --tolerance 28 \
  --feather 16
```

Use lower tolerance if green is being removed from the subject. Use higher tolerance only when a flat green fringe remains around the character. Do not pass a green-background sheet directly into the assembly script, because the green background will be treated as opaque content and alignment will fail.

## Assembly Rule

Never crop a sprite sheet with one shared union box unless each source frame is already perfectly overlaid. To prevent jitter:

1. Split the sheet into cells.
2. For each cell, take that frame's own alpha bounding box.
3. Compute one shared scale from the largest cropped frame.
4. Resize every cropped frame with that same scale.
5. Paste every resized frame onto the same transparent canvas using the same bottom-center anchor point.
6. Save the animation with explicit frame durations and no visual separator frames.

Use a larger working canvas than the final rendered window. `256x256` is a good default for a floating window that displays inside a `116x116` window; keep a `120x120` fallback only when needed by existing docs or previews. For consistent pack-wide size, use the same `--canvas`, `--target-max`, and `--anchor` across idle, drag, and task-state animations.

## Loop Counts

Use the loop count deliberately:

- Use `--loop 0` only for animations that should keep looping while the state is active, such as `idle`, `drag`, and `doing`.
- Use `--loop 1` for one-shot transition animations controlled by manifest durations, such as `show`, `dragTransition`, `startDoing`, `endDoing`, and `finish`.
- Make the sum of frame durations match the related manifest duration, but do not rely on an infinite-loop WebP ending exactly when the JavaScript timer fires. If a transition WebP has `loop=0` and its frame duration total equals `durations.completedFinish` or another state timer, Chromium can visibly start the next loop before the state changes.

## Examples

### Blink Idle

For blink idle, prefer three logical animation frames even when there are only two unique drawings:

1. Open eyes, still interval.
2. Closed eyes, short blink.
3. Open eyes, longer still interval.

Run chroma-key removal first if the sheet is green-screened, then assemble:

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
  --loop 0 \
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
- Expected loop count. Inspect the WebP `ANIM` chunk or use a tool that reports loop count; transition animations should be `1`, while intended loops can be `0`.
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



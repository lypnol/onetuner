#!/usr/bin/env python3
"""Resize screenshots for App Store submission.

For each source image:
1. Masks the status bar and camera notch with the background color
2. Resizes to match each target width (preserving aspect ratio)
3. Crops or pads vertically to hit the exact target dimensions

Background color is sampled from the top-left pixel of each image.
"""

import os
import sys
from pathlib import Path
from PIL import Image, ImageDraw

TARGETS = [
    (1242, 2688),
    (1260, 2736),
    (1206, 2622),
    (1125, 2436),
    (1242, 2208),
    (750, 1334),
]

# Height in pixels of the status bar + notch area to mask (at source resolution)
STATUS_BAR_HEIGHT = 155

SCRIPT_DIR = Path(__file__).parent


def mask_status_bar(img: Image.Image, bg_color: tuple) -> Image.Image:
    """Paint over the status bar / Dynamic Island area with the background color."""
    masked = img.copy()
    draw = ImageDraw.Draw(masked)
    draw.rectangle([(0, 0), (img.width, STATUS_BAR_HEIGHT)], fill=bg_color)
    return masked


def resize_screenshot(src_path: Path):
    img = Image.open(src_path).convert("RGBA")
    bg_color = img.getpixel((0, 0))[:3]
    stem = src_path.stem

    # Mask status bar and notch
    img = mask_status_bar(img, bg_color)

    for tw, th in TARGETS:
        # Resize to target width, keep aspect ratio
        scale = tw / img.width
        new_h = round(img.height * scale)
        resized = img.resize((tw, new_h), Image.LANCZOS)

        # Create canvas at target size filled with background color
        canvas = Image.new("RGB", (tw, th), bg_color)

        if new_h > th:
            # Crop: center vertically
            top = (new_h - th) // 2
            cropped = resized.crop((0, top, tw, top + th))
            canvas.paste(cropped, (0, 0))
        else:
            # Pad: center vertically
            y_offset = (th - new_h) // 2
            canvas.paste(resized, (0, y_offset))

        out_dir = SCRIPT_DIR / f"{tw}x{th}"
        out_dir.mkdir(exist_ok=True)
        out_path = out_dir / f"{stem}.png"
        canvas.save(out_path, "PNG")
        print(f"  {tw}x{th} -> {out_path.name}")


def main():
    sources = sorted(SCRIPT_DIR.glob("*.PNG")) + sorted(SCRIPT_DIR.glob("*.png"))
    # Exclude outputs (in subdirectories) and this script
    sources = [s for s in sources if s.parent == SCRIPT_DIR]

    if not sources:
        print("No source images found in", SCRIPT_DIR)
        sys.exit(1)

    for src in sources:
        print(f"\n{src.name}:")
        resize_screenshot(src)

    print("\nDone!")


if __name__ == "__main__":
    main()

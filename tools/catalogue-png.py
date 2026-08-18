#!/usr/bin/env python3
"""Render catalogue .txt files (ANSI) to PNGs using Pillow.

Reads docs/catalogue/*.txt, parses SGR sequences for colour, and draws each
line into a monospace bitmap. Writes matching .png files beside the .txt.

Also produces a contact sheet — one tall PNG with every form's default tiled.

    python3 tools/catalogue-png.py
"""
import os
import re
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

CATALOGUE = Path(__file__).parent.parent / "docs" / "catalogue"

CELL_W = 10
CELL_H = 20
PAD = 12
BG = (24, 24, 24)
FG = (204, 204, 204)

# SGR 256-colour and 24-bit are complex; for the catalogue we parse the basics.
# Most catalogue files use the theme's SGR sequences. We parse:
#   \x1b[0m         reset
#   \x1b[38;5;Nm    256-colour foreground
#   \x1b[38;2;R;G;Bm  24-bit foreground
#   \x1b[39m        default foreground
#   \x1b[2m         dim
#   \x1b[22m        normal intensity
SGR = re.compile(r"\x1b\[([0-9;]*)m")

# 256-colour table (first 16 = ANSI, 16–231 = 6x6x6 cube, 232–255 = greyscale)
def colour256(n: int) -> tuple[int, int, int]:
    if n < 16:
        basic = [
            (0,0,0),(128,0,0),(0,128,0),(128,128,0),(0,0,128),(128,0,128),(0,128,128),(192,192,192),
            (128,128,128),(255,0,0),(0,255,0),(255,255,0),(0,0,255),(255,0,255),(0,255,255),(255,255,255),
        ]
        return basic[n]
    if n < 232:
        n -= 16
        r = (n // 36) * 51
        g = ((n % 36) // 6) * 51
        b = (n % 6) * 51
        return (r, g, b)
    g = 8 + (n - 232) * 10
    return (g, g, g)


def parse_ansi_line(text: str) -> list[tuple[str, tuple[int, int, int]]]:
    """Parse a line with ANSI escapes into (char, colour) pairs."""
    spans: list[tuple[str, tuple[int, int, int]]] = []
    colour = FG
    dim = False
    pos = 0
    for m in SGR.finditer(text):
        # Text before this escape
        chunk = text[pos:m.start()]
        for ch in chunk:
            c = colour
            if dim:
                c = (c[0] // 2, c[1] // 2, c[2] // 2)
            spans.append((ch, c))
        pos = m.end()

        params = m.group(1)
        parts = [int(p) if p else 0 for p in params.split(";")]
        i = 0
        while i < len(parts):
            p = parts[i]
            if p == 0:
                colour = FG
                dim = False
            elif p == 2:
                dim = True
            elif p == 22:
                dim = False
            elif p == 39:
                colour = FG
            elif p == 38:
                if i + 1 < len(parts) and parts[i + 1] == 5 and i + 2 < len(parts):
                    colour = colour256(parts[i + 2])
                    i += 2
                elif i + 1 < len(parts) and parts[i + 1] == 2 and i + 4 < len(parts):
                    colour = (parts[i + 2], parts[i + 3], parts[i + 4])
                    i += 4
            i += 1

    # Trailing text
    chunk = text[pos:]
    for ch in chunk:
        c = colour
        if dim:
            c = (c[0] // 2, c[1] // 2, c[2] // 2)
        spans.append((ch, c))
    return spans


def try_font() -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    """Find a monospace font."""
    candidates = [
        "/System/Library/Fonts/SFMono-Regular.otf",
        "/System/Library/Fonts/Menlo.ttc",
        "/System/Library/Fonts/Monaco.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf",
    ]
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, 18)
            except Exception:
                continue
    return ImageFont.load_default()


def render_txt_to_png(txt_path: Path, png_path: Path, font: ImageFont.FreeTypeFont | ImageFont.ImageFont) -> tuple[int, int]:
    """Render one .txt file to a PNG. Returns (width, height) in pixels."""
    with open(txt_path, "r", encoding="utf-8") as f:
        raw = f.read()

    lines = raw.rstrip("\n").split("\n")
    max_cols = max((len(re.sub(r"\x1b\[[0-9;]*m", "", line)) for line in lines), default=0)

    img_w = max_cols * CELL_W + PAD * 2
    img_h = len(lines) * CELL_H + PAD * 2

    img = Image.new("RGB", (img_w, img_h), BG)
    draw = ImageDraw.Draw(img)

    for row_idx, line in enumerate(lines):
        spans = parse_ansi_line(line)
        for col_idx, (ch, colour) in enumerate(spans):
            x = PAD + col_idx * CELL_W
            y = PAD + row_idx * CELL_H
            if ch.strip():
                draw.text((x, y), ch, fill=colour, font=font)

    img.save(png_path)
    return (img_w, img_h)


def main() -> None:
    if not CATALOGUE.exists():
        print(f"No catalogue at {CATALOGUE}", file=sys.stderr)
        sys.exit(1)

    font = try_font()

    txt_files = sorted(CATALOGUE.glob("*.txt"))
    if not txt_files:
        print("No .txt files in catalogue", file=sys.stderr)
        sys.exit(1)

    print(f"Rendering {len(txt_files)} PNGs...")
    contact_parts: list[tuple[str, Image.Image]] = []

    for txt in txt_files:
        png = txt.with_suffix(".png")
        render_txt_to_png(txt, png, font)

        # Collect defaults for the contact sheet
        name = txt.stem
        if "-default-" in name and name.endswith("-24bit"):
            contact_parts.append((name, Image.open(png)))

    # Contact sheet — one column, every default form stacked
    if contact_parts:
        max_w = max(img.width for _, img in contact_parts)
        total_h = sum(img.height for _, img in contact_parts)
        sheet = Image.new("RGB", (max_w, total_h), BG)
        y = 0
        for _, img in contact_parts:
            sheet.paste(img, (0, y))
            y += img.height
        sheet_path = CATALOGUE / "_contact-sheet.png"
        sheet.save(sheet_path)
        print(f"Contact sheet: {sheet_path} ({max_w}x{total_h})")

    print(f"Done: {len(txt_files)} PNGs written to {CATALOGUE}/")


if __name__ == "__main__":
    main()

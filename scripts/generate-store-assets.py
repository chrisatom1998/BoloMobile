"""Generate Bolo's checked-in app and store artwork from its in-app brand mark."""

from __future__ import annotations

import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
IMAGES = ROOT / "assets" / "images"
STORE = ROOT / "assets" / "store"

CREAM = "#F5F0E8"
PAPER = "#FFFDF8"
INK = "#172523"
MUTED = "#66706D"
BRAND = "#D8663C"
FOREST = "#1F7368"


def find_font(candidates: list[str]) -> Path:
    configured = os.environ.get("BOLO_DEVANAGARI_FONT")
    paths = ([configured] if configured else []) + candidates
    for candidate in paths:
        if candidate and Path(candidate).is_file():
            return Path(candidate)
    raise RuntimeError(
        "A Devanagari font is required to regenerate Bolo artwork. "
        "Set BOLO_DEVANAGARI_FONT to a font file such as Nirmala UI or Noto Sans Devanagari."
    )


DEVANAGARI_FONT = find_font(
    [
        r"C:\Windows\Fonts\Nirmala.ttc",
        "/System/Library/Fonts/Supplemental/Devanagari Sangam MN.ttc",
        "/usr/share/fonts/truetype/noto/NotoSansDevanagari-Bold.ttf",
    ]
)
LATIN_FONT = find_font(
    [
        r"C:\Windows\Fonts\segoeuib.ttf",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    ]
)
LATIN_REGULAR = find_font(
    [
        r"C:\Windows\Fonts\segoeui.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
)


def font(path: Path, size: int, index: int = 0) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(path), size, index=index)


def draw_centered_text(
    draw: ImageDraw.ImageDraw,
    box: tuple[int, int, int, int],
    value: str,
    typeface: ImageFont.FreeTypeFont,
    fill: str,
    y_adjust: int = 0,
) -> None:
    left, top, right, bottom = box
    bounds = draw.textbbox((0, 0), value, font=typeface)
    width = bounds[2] - bounds[0]
    height = bounds[3] - bounds[1]
    x = left + (right - left - width) / 2 - bounds[0]
    y = top + (bottom - top - height) / 2 - bounds[1] + y_adjust
    draw.text((x, y), value, font=typeface, fill=fill)


def brand_tile(size: int, margin: int, radius: int, glyph_size: int, transparent: bool) -> Image.Image:
    mode = "RGBA" if transparent else "RGB"
    background = (0, 0, 0, 0) if transparent else CREAM
    image = Image.new(mode, (size, size), background)
    draw = ImageDraw.Draw(image)
    tile = (margin, margin, size - margin, size - margin)
    draw.rounded_rectangle(tile, radius=radius, fill=BRAND)
    draw_centered_text(draw, tile, "ब", font(DEVANAGARI_FONT, glyph_size), PAPER, y_adjust=-size // 50)
    return image


def save_scaled(source: Image.Image, path: Path, size: tuple[int, int], mode: str | None = None) -> None:
    output = source.resize(size, Image.Resampling.LANCZOS)
    if mode:
        output = output.convert(mode)
    path.parent.mkdir(parents=True, exist_ok=True)
    output.save(path, format="PNG", optimize=True)


def generate_icons() -> None:
    master = brand_tile(2048, 312, 360, 860, transparent=False)
    save_scaled(master, IMAGES / "icon.png", (1024, 1024), "RGB")
    save_scaled(master, STORE / "app-store-icon.png", (1024, 1024), "RGB")
    save_scaled(master.convert("RGBA"), STORE / "play-store-icon.png", (512, 512), "RGBA")
    save_scaled(master.convert("RGBA"), IMAGES / "favicon.png", (64, 64), "RGBA")

    adaptive = brand_tile(2048, 440, 320, 690, transparent=True)
    save_scaled(adaptive, IMAGES / "android-icon-foreground.png", (1024, 1024), "RGBA")

    monochrome = Image.new("RGBA", (2048, 2048), (0, 0, 0, 0))
    monochrome_draw = ImageDraw.Draw(monochrome)
    draw_centered_text(
        monochrome_draw,
        (0, 0, 2048, 2048),
        "ब",
        font(DEVANAGARI_FONT, 920),
        "#FFFFFF",
        y_adjust=-38,
    )
    save_scaled(monochrome, IMAGES / "android-icon-monochrome.png", (1024, 1024), "RGBA")

    splash = brand_tile(2048, 480, 300, 660, transparent=True)
    save_scaled(splash, IMAGES / "splash-icon.png", (1024, 1024), "RGBA")


def generate_feature_graphic() -> None:
    image = Image.new("RGB", (2048, 1000), CREAM)
    draw = ImageDraw.Draw(image)
    draw.ellipse((1470, -420, 2350, 460), fill="#F0DED1")
    draw.ellipse((-390, 620, 380, 1390), fill="#DDECE8")

    tile = (150, 170, 810, 830)
    draw.rounded_rectangle(tile, radius=180, fill=BRAND)
    draw_centered_text(draw, tile, "ब", font(DEVANAGARI_FONT, 410), PAPER, y_adjust=-20)

    draw.text((920, 240), "Bolo", font=font(LATIN_FONT, 156), fill=INK)
    draw.text((925, 445), "Hindi for real moments", font=font(LATIN_REGULAR, 65), fill=INK)
    draw.rounded_rectangle((920, 600, 1360, 704), radius=52, fill=FOREST)
    draw_centered_text(draw, (920, 600, 1360, 704), "21 practice scenes", font(LATIN_FONT, 34), PAPER)
    draw.text((925, 760), "Speak. Listen. Keep going.", font=font(LATIN_REGULAR, 36), fill=MUTED)
    save_scaled(image, STORE / "play-store-feature.png", (1024, 500), "RGB")


if __name__ == "__main__":
    generate_icons()
    generate_feature_graphic()
    print(f"Generated Bolo artwork in {IMAGES} and {STORE}")

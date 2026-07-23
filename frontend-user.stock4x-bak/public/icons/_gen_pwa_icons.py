"""Generate the PWA icon set (192 + 512 + maskable 512) from the actual
Stock4X brand logo (`frontend-user/public/logo1.png`).

    py frontend-user/public/icons/_gen_pwa_icons.py

The source logo is 1000x230 — a wide format with the chart-arrow brand
mark on the LEFT and the "STOCK4X / TRADE. INVEST. GROW." wordmark on
the right. PWA icons need a square aspect ratio, so we crop the
leftmost square region (the brand mark) and use it as the icon. This
mirrors the iconOnly cropping the BrandLogo React component does in
the app shell (object-position: left center inside a square frame).
"""
import os
from PIL import Image

OUT_DIR = os.path.dirname(os.path.abspath(__file__))
SOURCE_LOGO = os.path.normpath(os.path.join(OUT_DIR, "..", "logo1.png"))

# Background tile colour for the maskable / standard icons. The brand
# mark itself uses a transparent background in logo1.png — without an
# opaque tile behind it, Android's adaptive-icon system would show
# whatever launcher wallpaper is behind, and the install-prompt would
# render the logo on its own dark grey card. White matches the landing
# page surface and lets the multi-colour chart-arrow read cleanly.
TILE_BG = (255, 255, 255, 255)


def crop_brand_mark(logo: Image.Image) -> Image.Image:
    """Return a square crop containing just the brand mark.

    logo1.png is 1000x230. The chart-arrow icon occupies roughly the
    leftmost 230px (one logo-height worth). We crop a slightly wider
    250px window so a touch of padding sits on the right of the mark,
    then square the canvas to the original logo height (230) by
    paddings the crop into a 250x250 square centred vertically.
    """
    w, h = logo.size  # 1000, 230
    crop_w = min(int(h * 1.1), w)  # ~253 → still narrower than the wordmark start
    crop = logo.crop((0, 0, crop_w, h))
    # Promote the crop to a square canvas of side = max(crop_w, h).
    side = max(crop_w, h)
    sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    sq.alpha_composite(crop, (0, (side - h) // 2))
    return sq


def make_tile(size: int, brand: Image.Image, scale: float = 0.74) -> Image.Image:
    """Standard PWA app-icon tile — rounded white square with the brand
    mark centred at `scale` of the tile width."""
    tile = Image.new("RGBA", (size, size), TILE_BG)
    target = int(size * scale)
    mark = brand.resize((target, target), Image.LANCZOS)
    pos = ((size - target) // 2, (size - target) // 2)
    tile.alpha_composite(mark, pos)
    return tile


def make_maskable(size: int, brand: Image.Image) -> Image.Image:
    """Android maskable icon — full-bleed white background so the OS can
    crop into a circle/squircle without revealing transparent corners.
    Safe zone for the brand mark is the inner ~60%."""
    tile = Image.new("RGBA", (size, size), TILE_BG)
    safe = int(size * 0.58)
    mark = brand.resize((safe, safe), Image.LANCZOS)
    pos = ((size - safe) // 2, (size - safe) // 2)
    tile.alpha_composite(mark, pos)
    return tile


def main() -> None:
    if not os.path.isfile(SOURCE_LOGO):
        raise SystemExit(f"source logo missing: {SOURCE_LOGO}")

    logo = Image.open(SOURCE_LOGO).convert("RGBA")
    brand = crop_brand_mark(logo)

    for s in (192, 512):
        img = make_tile(s, brand)
        path = os.path.join(OUT_DIR, f"icon-{s}.png")
        img.save(path, "PNG")
        print(f"wrote {path} ({s}x{s})")

    mask = make_maskable(512, brand)
    mp = os.path.join(OUT_DIR, "icon-maskable-512.png")
    mask.save(mp, "PNG")
    print(f"wrote {mp} (512x512 maskable)")


if __name__ == "__main__":
    main()

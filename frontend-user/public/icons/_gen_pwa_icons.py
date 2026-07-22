"""Generate the PWA icon set (192 + 512 + maskable 512) from the
Hindenburg India brand mark — a capital "H" filled with the Indian
tricolour (saffron / white / green) and the 24-spoke Ashoka Chakra
(navy) on the crossbar.

    py frontend-user/public/icons/_gen_pwa_icons.py

Keeps the install-prompt tile, splash and Android home-screen icon in
sync with /public/icon.svg and the in-app <HindenburgMark /> glyph.
"""
import math
import os

from PIL import Image, ImageDraw

OUT_DIR = os.path.dirname(os.path.abspath(__file__))

# ── Brand palette ────────────────────────────────────────────────────
SAFFRON = (255, 153, 51)
WHITE = (255, 255, 255)
GREEN = (19, 136, 8)
NAVY = (0, 0, 128)
DARK = (10, 10, 10)

# ── H geometry in a 512×512 design box ───────────────────────────────
BAR_W, LEFT_X, RIGHT_X = 68, 132, 312
TOP_Y, BOT_Y = 96, 416
H_H = BOT_Y - TOP_Y
CROSS_TOP, CROSS_H, CROSS_X = 214, 84, 132
CROSS_W = (RIGHT_X + BAR_W) - LEFT_X
CX, CY, CHAKRA_R = 256, 256, 40
B1 = TOP_Y + H_H / 3
B2 = TOP_Y + 2 * H_H / 3


def draw_h_mark(canvas, box):
    bx, by, bw, bh = box
    S = int(round(bw))
    tile = Image.new("RGBA", (S, S), (0, 0, 0, 0))

    mask = Image.new("L", (S, S), 0)
    md = ImageDraw.Draw(mask)

    def rr(x, y, w, h, rad=0):
        x0, y0 = x / 512 * S, y / 512 * S
        x1, y1 = (x + w) / 512 * S, (y + h) / 512 * S
        if rad:
            md.rounded_rectangle([x0, y0, x1, y1], radius=rad / 512 * S, fill=255)
        else:
            md.rectangle([x0, y0, x1, y1], fill=255)

    rr(LEFT_X, TOP_Y, BAR_W, H_H, 6)
    rr(RIGHT_X, TOP_Y, BAR_W, H_H, 6)
    rr(CROSS_X, CROSS_TOP, CROSS_W, CROSS_H)

    bands = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    bd = ImageDraw.Draw(bands)
    for y0, y1, color in ((TOP_Y, B1, SAFFRON), (B1, B2, WHITE), (B2, BOT_Y, GREEN)):
        bd.rectangle([0, y0 / 512 * S, S, y1 / 512 * S], fill=color + (255,))
    tile.paste(bands, (0, 0), mask)

    ss = 4
    ch = Image.new("RGBA", (S * ss, S * ss), (0, 0, 0, 0))
    cd = ImageDraw.Draw(ch)
    ccx, ccy = CX / 512 * S * ss, CY / 512 * S * ss
    r = CHAKRA_R / 512 * S * ss
    cd.ellipse([ccx - r, ccy - r, ccx + r, ccy + r], fill=WHITE + (255,),
               outline=NAVY + (255,), width=max(1, int(5 / 512 * S * ss)))
    spoke_w = max(1, int(2.2 / 512 * S * ss))
    inner = r - 3 / 512 * S * ss
    for k in range(24):
        a = math.radians(k * 15)
        cd.line([ccx, ccy, ccx + inner * math.cos(a), ccy + inner * math.sin(a)],
                fill=NAVY + (255,), width=spoke_w)
    hub = 5.5 / 512 * S * ss
    cd.ellipse([ccx - hub, ccy - hub, ccx + hub, ccy + hub], fill=NAVY + (255,))
    tile.alpha_composite(ch.resize((S, S), Image.LANCZOS))

    canvas.alpha_composite(tile, (int(round(bx)), int(round(by))))


def rounded_mask(size, radius_pct):
    m = Image.new("L", (size, size), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size - 1, size - 1],
                                        radius=int(size * radius_pct), fill=255)
    return m


def make_tile(size, rounded=True, mark_scale=0.72):
    bg = Image.new("RGBA", (size, size), DARK + (255,))
    if rounded:
        bg.putalpha(rounded_mask(size, 0.22))
    box = size * mark_scale
    off = (size - box) / 2
    draw_h_mark(bg, (off, off, box, box))
    return bg


def main():
    for s in (192, 512):
        p = os.path.join(OUT_DIR, f"icon-{s}.png")
        make_tile(s, rounded=True).save(p, "PNG")
        print(f"wrote {p} ({s}x{s})")
    p = os.path.join(OUT_DIR, "icon-maskable-512.png")
    make_tile(512, rounded=False, mark_scale=0.60).save(p, "PNG")
    print(f"wrote {p} (512x512 maskable)")


if __name__ == "__main__":
    main()

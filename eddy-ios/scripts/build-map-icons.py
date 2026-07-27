#!/usr/bin/env python3
"""Generate the map's SDF pin icons.

Run from anywhere:  python3 eddy-ios/scripts/build-map-icons.py

WHY THESE ARE GENERATED AND NOT DRAWN BY HAND: they are two-tone-free
silhouettes whose whole job is to be RECOLOURED at runtime — a gauge wears its
condition, an access point wears its layer colour — so the shape and the colour
cannot live in the same file. A hand-exported PNG would also have to be
re-exported at every size we ever want.

WHY SDF: Mapbox recolours an icon only when the image is registered with
`sdf: true`, and only an actual signed distance field survives that cleanly.
Registering a plain alpha mask as SDF works but renders soft and slightly wrong
at the edges, because Mapbox reads alpha as DISTANCE, not as coverage — a mask
tells it "0 or 1" where it expects "how far, and which side". So the alpha
channel below is a real SDF: 0.5 exactly on the outline, rising inward, falling
outward, over a fixed spread. RGB is flat white and is never seen; iconColor
replaces it.

The distance transform is 8SSEDT (Danielsson's two-pass sweep), which is exact
enough at this size and needs no numpy — this repo's Python has Pillow and
nothing else.
"""

import math
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parents[1] / "assets/map"

# Supersample factor for the mask before the distance transform. The shapes have
# curved edges and a 1x mask would quantise the SDF into visible steps.
SS = 4

# How far, in FINAL pixels, the field ramps either side of the outline. Mapbox's
# own sprites use 8; less than that and a thick icon-halo runs out of gradient to
# stand on, which is what draws the white ring around every pin.
SPREAD = 8.0


def sdf_alpha(mask: Image.Image, size: tuple[int, int]) -> Image.Image:
    """Signed distance field, encoded 0-255 with the outline at 128."""
    inside = mask.resize(size, Image.LANCZOS).point(lambda v: 255 if v >= 128 else 0)
    w, h = size
    px = inside.load()

    INF = float(w * h)

    def transform(is_target) -> list[float]:
        """Squared distance from every cell to the nearest cell where is_target."""
        # Danielsson: carry the VECTOR to the nearest target, not the scalar, so
        # a diagonal propagation stays exact instead of accumulating chamfer
        # error. Two sweeps, forward then backward.
        dx = [0.0] * (w * h)
        dy = [0.0] * (w * h)
        dist = [0.0 if is_target(px[x, y]) else INF for y in range(h) for x in range(w)]

        def compare(x, y, ox, oy):
            nx, ny = x + ox, y + oy
            if nx < 0 or ny < 0 or nx >= w or ny >= h:
                return
            i, j = y * w + x, ny * w + nx
            cdx, cdy = dx[j] - ox, dy[j] - oy
            d = cdx * cdx + cdy * cdy
            if d < dist[i]:
                dist[i], dx[i], dy[i] = d, cdx, cdy

        for y in range(h):
            for x in range(w):
                compare(x, y, -1, 0)
                compare(x, y, 0, -1)
                compare(x, y, -1, -1)
                compare(x, y, 1, -1)
            for x in range(w - 1, -1, -1):
                compare(x, y, 1, 0)
        for y in range(h - 1, -1, -1):
            for x in range(w - 1, -1, -1):
                compare(x, y, 1, 0)
                compare(x, y, 0, 1)
                compare(x, y, 1, 1)
                compare(x, y, -1, 1)
            for x in range(w):
                compare(x, y, -1, 0)
        return dist

    out_d = transform(lambda v: v > 0)   # distance from outside to the shape
    in_d = transform(lambda v: v == 0)   # distance from inside to the background

    field = Image.new("L", size)
    field.putdata([
        max(0, min(255, round(128 + (math.sqrt(in_d[i]) - math.sqrt(out_d[i])) / SPREAD * 127)))
        for i in range(w * h)
    ])
    return field


# Apex-to-bulb-centre distance, in bulb radii. 1.9 gives a silhouette about
# 1:1.43 — the proportion both a water drop and a map marker actually have.
# Much less and the point is a nub on a circle; much more and it reads as a
# spike.
ELONGATION = 1.9


def teardrop(width: int, point_up: bool) -> tuple[Image.Image, tuple[int, int]]:
    """A bulb with a tangent point: a droplet up, a map pin down.

    The HEIGHT is derived, not given: the bulb fills the width, and the point
    then needs whatever room ELONGATION asks for. Passing both would let the two
    contradict each other and silently flatten the shape into a circle.
    """
    pad = 2
    r = (width - 2 * pad) / 2
    d = ELONGATION * r
    height = round(pad + d + r + pad)
    size = (width, height)

    w, h = width * SS, height * SS
    mask = Image.new("L", (w, h), 0)
    draw = ImageDraw.Draw(mask)

    cx = w / 2
    rs, ds, pads = r * SS, d * SS, pad * SS
    # The bulb sits at the blunt end, the apex `d` away at the other.
    cy = h - pads - rs if point_up else pads + rs
    apex_y = pads if point_up else h - pads

    draw.ellipse((cx - rs, cy - rs, cx + rs, cy + rs), fill=255)

    # Tangent lines from the apex to the bulb, so the point MEETS the curve
    # instead of being a triangle laid over it — that join is the whole
    # difference between a teardrop and a circle wearing a hat.
    length = math.sqrt(ds * ds - rs * rs)
    alpha = math.asin(rs / ds)
    # Bearing from apex to centre. Screen y grows downward, so a point-up icon
    # (apex above the bulb) looks DOWN at +pi/2. Getting this backwards aims the
    # polygon off-canvas and leaves a bare circle behind.
    base = math.pi / 2 if point_up else -math.pi / 2
    pts = [(cx, apex_y)]
    for sign in (1, -1):
        theta = base + sign * alpha
        pts.append((cx + math.cos(theta) * length, apex_y + math.sin(theta) * length))
    draw.polygon(pts, fill=255)

    return mask, size


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)

    # Widths are @3x: `scale: 3` at registration makes a 66px image draw 22pt.
    shapes = {
        # Gauges. Round-bottomed drop, point up — the shape everyone reads as
        # water, and the one the condition colour has to fill.
        "gauge-drop": teardrop(66, point_up=True),
        # Access points. The same silhouette inverted, which is the universal
        # map-marker shape; anchored at its point so it indicates a spot rather
        # than covering one.
        "poi-pin": teardrop(66, point_up=False),
    }

    for name, (mask, size) in shapes.items():
        alpha = sdf_alpha(mask, size)
        icon = Image.merge("RGBA", (
            Image.new("L", size, 255),
            Image.new("L", size, 255),
            Image.new("L", size, 255),
            alpha,
        ))
        target = OUT / f"{name}.png"
        icon.save(target, optimize=True)
        print(f"{name + '.png':16} {size[0]}x{size[1]}  {target.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Generate the map's lightweight icon atlas.

Run from anywhere:  python3 eddy-ios/scripts/build-map-icons.py

The atlas has two kinds of asset: compact SDF route marks Mapbox recolours at
runtime, and full-colour Eddy utility illustrations for the place layers. The
utility illustrations are normalized here to the same 66px canvas rather than
being resized independently in six call sites.

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
EDDY = Path(__file__).resolve().parents[1] / "assets/eddy"

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


def square_mask(size: int = 66) -> tuple[Image.Image, ImageDraw.ImageDraw]:
    """A supersampled square canvas and its drawing context."""
    mask = Image.new("L", (size * SS, size * SS), 0)
    return mask, ImageDraw.Draw(mask)


def hazard_triangle(size: int = 66) -> tuple[Image.Image, tuple[int, int]]:
    """A broad warning triangle that remains distinct at 18–22pt."""
    mask, draw = square_mask(size)
    s = SS
    draw.polygon([(33 * s, 4 * s), (62 * s, 58 * s), (4 * s, 58 * s)], fill=255)
    # The two cut-outs make this read as warning, not merely direction.
    draw.rounded_rectangle((30 * s, 21 * s, 36 * s, 41 * s), radius=2 * s, fill=0)
    draw.ellipse((30 * s, 47 * s, 36 * s, 53 * s), fill=0)
    return mask, (size, size)


def tent(size: int = 66) -> tuple[Image.Image, tuple[int, int]]:
    """A chunky tent with a negative-space doorway."""
    mask, draw = square_mask(size)
    s = SS
    draw.polygon([(33 * s, 7 * s), (62 * s, 57 * s), (4 * s, 57 * s)], fill=255)
    draw.polygon([(33 * s, 27 * s), (45 * s, 57 * s), (24 * s, 57 * s)], fill=0)
    draw.rectangle((31 * s, 7 * s, 35 * s, 57 * s), fill=255)
    return mask, (size, size)


def canoe(size: int = 66) -> tuple[Image.Image, tuple[int, int]]:
    """A compact open canoe with two seats."""
    mask, draw = square_mask(size)
    s = SS
    draw.polygon([(3 * s, 18 * s), (63 * s, 18 * s), (55 * s, 50 * s), (11 * s, 50 * s)], fill=255)
    # Open interior. The small bridges left across it are the seats and keep the
    # silhouette from reading as a generic crescent.
    draw.polygon([(13 * s, 26 * s), (53 * s, 26 * s), (49 * s, 34 * s), (17 * s, 34 * s)], fill=0)
    draw.rectangle((22 * s, 24 * s, 27 * s, 37 * s), fill=255)
    draw.rectangle((39 * s, 24 * s, 44 * s, 37 * s), fill=255)
    return mask, (size, size)


def dam(size: int = 66) -> tuple[Image.Image, tuple[int, int]]:
    """A dam face with three unmistakable spillway slots."""
    mask, draw = square_mask(size)
    s = SS
    draw.polygon([(7 * s, 15 * s), (59 * s, 15 * s), (54 * s, 55 * s), (12 * s, 55 * s)], fill=255)
    draw.rectangle((4 * s, 10 * s, 62 * s, 19 * s), fill=255)
    for left in (17, 30, 43):
        draw.rounded_rectangle((left * s, 25 * s, (left + 6) * s, 50 * s), radius=3 * s, fill=0)
    return mask, (size, size)


def route_start(size: int = 54) -> tuple[Image.Image, tuple[int, int]]:
    """A right-facing start/play marker for the float put-in."""
    mask, draw = square_mask(size)
    s = SS
    draw.polygon([(10 * s, 6 * s), (48 * s, 27 * s), (10 * s, 48 * s)], fill=255)
    return mask, (size, size)


def route_finish(size: int = 54) -> tuple[Image.Image, tuple[int, int]]:
    """A stop marker for the float take-out."""
    mask, draw = square_mask(size)
    s = SS
    draw.rounded_rectangle((7 * s, 7 * s, 47 * s, 47 * s), radius=7 * s, fill=255)
    return mask, (size, size)


def themed_icon(source_name: str, size: int = 66) -> Image.Image:
    """Fit one transparent Eddy utility mark into a map-sized square."""
    source = EDDY / f"{source_name}.png"
    if not source.exists():
        raise SystemExit(f"missing Eddy symbol: {source}")

    opened = Image.open(source).convert("RGBA")
    box = opened.getchannel("A").getbbox()
    if box is None:
        raise SystemExit(f"empty Eddy symbol: {source}")

    art = opened.crop(box)
    available = size - 4
    scale = available / max(art.size)
    art = art.resize(
        (max(1, round(art.width * scale)), max(1, round(art.height * scale))),
        Image.LANCZOS,
    )
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.alpha_composite(art, ((size - art.width) // 2, (size - art.height) // 2))
    return canvas


# THERE IS NO LOCK ICON HERE ANY MORE, and it is not an omission.
#
# `private-lock-pin` and `private-lock-center` were white padlocks stamped over
# the recoloured pin so privacy was visible before selection. They were removed
# because they answered the wrong question: a private access point is the same
# kind of place as a public one, and a second glyph on some pins read as a
# second category. Permission is a caveat about a place, not a class of place.
#
# It is still said, in words and in behaviour — the callout's "permission may be
# required" line, the Private chip on the detail screen, the dimmed overview
# circle, and the confirmation raised before one is used as a plan endpoint.
# Do not reintroduce a glyph for it.


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
        # Legacy SDF category marks are retained for backwards-compatible builds
        # and snapshots. Current place layers use the full-colour Eddy marks
        # generated below; route endpoints still use SDF at runtime.
        "hazard-warning": hazard_triangle(),
        "campground-tent": tent(),
        "outfitter-canoe": canoe(),
        "dam-spillway": dam(),
        # Float endpoints communicate direction by shape as well as colour.
        "route-start": route_start(),
        "route-finish": route_finish(),
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
        print(f"{name + '.png':20} {size[0]}x{size[1]}  {target.stat().st_size // 1024} KB")

    # Full-colour map variants of Eddy's utility catalog. These are registered
    # once and reused by every feature, so a map with hundreds of points does
    # not decode hundreds of images. A data-coloured badge remains underneath
    # each one in RiverMap: the art says WHAT it is, the badge says condition or
    # severity.
    themed = {
        "eddy-gauge": "eddy-other-usgs-gauge",
        "eddy-access": "eddy-poi",
        "eddy-hazard": "eddy-hazard",
        "eddy-campground": "eddy-campground",
        # The boat-ramp tier's mark. Full-colour like its siblings — the map's
        # place layers are `sdf: false` and only the route endpoints are SDF, so
        # a mark generated the other way would draw as a flat silhouette.
        "eddy-boat-ramp": "eddy-boat-ramp",
        "eddy-outfitter": "eddy-outfitter",
        "eddy-dam": "eddy-dam",
    }
    for name, source_name in themed.items():
        icon = themed_icon(source_name)
        target = OUT / f"{name}.png"
        icon.save(target, optimize=True)
        print(f"{name + '.png':20} {icon.width}x{icon.height}  {target.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()

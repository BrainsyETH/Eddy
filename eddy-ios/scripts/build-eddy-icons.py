#!/usr/bin/env python3
"""Derive the bundled Eddy symbol icons from the concept art.

Run from anywhere:  python3 eddy-ios/scripts/build-eddy-icons.py

Sibling of build-icons.py, and a script for the same reason: the sources in
design/eddy-emoji are the shared concept set, they will be revised, and a
hand-exported PNG is exactly the asset that silently drifts from its origin.
That folder's own README says so — "source concepts rather than final iOS
asset-catalog exports. Final asset sizes and transparency can be derived after
the preferred icons are selected." This is that derivation.

Two things have to happen to make one of those files bundleable:

  1. THE BACKGROUND HAS TO GO. The concepts are 1254x1254 RGB with an off-white
     card baked in and no alpha at all. Shipped as-is, every one of them paints
     a pale square into a dark-mode card.

     It is removed by flood-filling inward from the four corners rather than by
     keying the colour globally, because #FAFAFA is IN the palette — it is the
     art direction's own highlight colour. A global key would punch holes
     through the middle of the mark; only background that touches an edge is
     background.

  2. THEY HAVE TO GET SMALL. 1254px of sticker for a 16pt render is ~900 KB
     each of bundle for something drawn a hundred times smaller. 300px is the
     same ceiling the otter set uses (see Otter.tsx) — enough for @3x — and it
     is what took that set from 4.58 MB to 193 KB.
"""

from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "design/eddy-emoji"
OUT = ROOT / "eddy-ios/assets/eddy"
WEB_OUT = ROOT / "missouri-float-planner/public/icons"

# Only what the app actually renders. Adding a file here is a deliberate act:
# every entry is bundle weight on every install — which is why this list is not
# simply the contents of design/eddy-emoji.
#
# Split by how each one is DRAWN, not by what it depicts, because the two halves
# are rendered by different components and at different sizes. See EddySymbol.tsx
# (inline, ~18pt) and EddyScene.tsx (hero, ~110pt).
SYMBOLS = (
    "eddy-weather",
    "eddy-ai-assistant",
    "eddy-water-droplet",
    "eddy-poi",
    "eddy-other-usgs-gauge",
    "eddy-hazard",
    "eddy-campground",
    "eddy-outfitter",
)

# Four, not the ten the catalog offers, because a scene needs a hero-sized slot
# to live in and the app has six of them. The rest of the catalog's scenes are
# rendered by the website, which has surfaces the app does not (a chat panel, a
# photo submission form) — see WEB_ICONS.
#
# The app's other large-mascot slots are dead ends — a failed load, an
# unsupported region, a forced upgrade — and those keep the canonical `flag`
# caution otter. See UpgradeGate.tsx, which says why.
SCENES = (
    "eddy-checking-gauge",
    "eddy-route-planning",
    "eddy-heart",
    "eddy-wave",
)

ICONS = SYMBOLS + SCENES

# What the website renders. Next serves public/ per request rather than shipping
# it to every device, so this list is not under the bundle-weight rule above —
# it is just "what something imports", and it differs from the iOS list in both
# directions: the web has a chat panel and a submission form the app does not,
# and the app has empty states the web has no equivalent for.
WEB_ICONS = (
    "eddy-weather",
    "eddy-ai-assistant",
    "eddy-water-droplet",
    "eddy-poi",
    "eddy-campfire-chill",
    "eddy-wave",
    "eddy-thumbs-up",
)

# Longest edge of the exported PNG. Matches assets/otter.
SIZE = 300

# How far a pixel may sit from the corner it is being compared against and still
# count as background. The card is nearly flat (250,249,250 to 252,251,251 across
# the four corners) so this only has to absorb JPEG-ish noise; large enough to
# eat a shadow gradient would start eating the mark's own light fills.
FLOOD_THRESHOLD = 24

# Sentinel written by the flood fill, then mapped to alpha 0. Nothing in the
# palette is near it, so a surviving pixel of this colour means the fill leaked.
SENTINEL = (255, 0, 255)


def cut_background(src: Image.Image) -> Image.Image:
    """RGBA copy with the edge-connected off-white card removed."""
    flat = src.convert("RGB")
    right, bottom = flat.width - 1, flat.height - 1

    for corner in ((0, 0), (right, 0), (0, bottom), (right, bottom)):
        if flat.getpixel(corner) == SENTINEL:
            continue  # already reached by an earlier corner's fill
        ImageDraw.floodfill(flat, corner, SENTINEL, thresh=FLOOD_THRESHOLD)

    # Alpha 0 where the fill reached, opaque everywhere else — a channel at a
    # time, so this stays a whole-image operation rather than a per-pixel loop.
    # A pixel is background iff all three channels match the sentinel exactly.
    hits = None
    for channel, value in zip(flat.split(), SENTINEL):
        match = channel.point(lambda v, want=value: 255 if v == want else 0)
        hits = match if hits is None else ImageChops.multiply(hits, match)

    # Built from the filled COPY but applied to the original, so the returned
    # image keeps its real colours — the fill was only ever a mask.
    out = src.convert("RGBA")
    out.putalpha(ImageChops.invert(hits))
    return out


def derive(name: str) -> Image.Image:
    """The exported form of one concept: background gone, cropped, downscaled."""
    source = SRC / f"{name}.png"
    if not source.exists():
        raise SystemExit(f"missing source: {source}")

    art = cut_background(Image.open(source))

    box = art.getchannel("A").getbbox()
    if box is None:
        raise SystemExit(f"{name}: flood fill removed everything — check FLOOD_THRESHOLD")
    art = art.crop(box)

    # Scale the LONGEST edge, so a non-square mark keeps its proportions and
    # both icons end up optically the same weight beside each other.
    scale = SIZE / max(art.size)
    art = art.resize(
        (max(1, round(art.width * scale)), max(1, round(art.height * scale))),
        Image.LANCZOS,
    )

    # Palette, like assets/otter — and for these sources it is the difference
    # between 1.4 MB of bundle and 250 KB. The concepts are flat colour with a
    # film grain baked over them, and it is the grain, not the art, that costs:
    # one 300px sticker holds ~15,000 distinct colours where the drawing uses a
    # dozen. Quantising throws away the noise and keeps the drawing.
    #
    # FASTOCTREE specifically, because it is the one Pillow quantiser that
    # carries alpha into the palette. The default would flatten these to a hard
    # 1-bit edge, which on a 110pt mascot is a visible staircase.
    return art.quantize(colors=255, method=Image.FASTOCTREE)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    WEB_OUT.mkdir(parents=True, exist_ok=True)

    # Derived once and written to both apps, rather than each app deriving its
    # own: the same concept must be the same pixels in the app and the browser,
    # and two pipelines is how a mark ends up cropped differently on each.
    for name in sorted(set(ICONS) | set(WEB_ICONS)):
        art = derive(name)

        targets = []
        if name in ICONS:
            targets.append(OUT / f"{name}.png")
        if name in WEB_ICONS:
            targets.append(WEB_OUT / f"{name}.png")

        for target in targets:
            art.save(target, optimize=True)

        where = "+".join("ios" if t.parent == OUT else "web" for t in targets)
        size = targets[0].stat().st_size // 1024
        print(f"{name + '.png':28} {art.size[0]}x{art.size[1]:<5} {size:>4} KB  {where}")

    bundled = sum((OUT / f"{n}.png").stat().st_size for n in ICONS)
    print(f"\nbundled into the app: {len(ICONS)} files, {bundled // 1024} KB")


if __name__ == "__main__":
    main()

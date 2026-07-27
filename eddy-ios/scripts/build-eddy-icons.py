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

# Only what the app actually renders. Adding a file here is a deliberate act:
# every entry is bundle weight on every install.
ICONS = ("eddy-weather", "eddy-ai-assistant")

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


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)

    for name in ICONS:
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

        target = OUT / f"{name}.png"
        art.save(target, optimize=True)
        print(f"{name + '.png':24} {art.size[0]}x{art.size[1]}  {target.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()

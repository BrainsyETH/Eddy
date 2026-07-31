#!/usr/bin/env python3
"""Generate the iOS icon and splash assets from the Eddy favicon artwork.

Run from anywhere:  python3 eddy-ios/scripts/build-icons.py

WHY THIS IS A SCRIPT AND NOT JUST CHECKED-IN PNGS: the source artwork lives in
remotion/public/eddy at video resolution and is the same mark the website and
the social pipeline use. When it changes, the icon has to change with it, and a
hand-exported icon is exactly the kind of asset that silently drifts. Everything
below is derived — nothing is hand-placed.

Three iOS-specific rules are encoded here:

  1. The App Store icon MUST NOT have an alpha channel. Apple rejects the
     binary at upload, not at review, so this is a build blocker rather than a
     style note. `icon.png` is flattened onto an opaque background; the splash
     and tinted assets keep their alpha because those are composited by the OS.

  2. The mark is scaled from its ALPHA BOUNDING BOX, not the source canvas. The
     source is 1024x1024 with the otter occupying 769x606 of it, so scaling the
     canvas would leave the icon looking small and off-centre inside the
     rounded-rect mask.

  3. The tinted variant (iOS 18) is a luminance map, and the otter's artwork is
     mostly dark outline on mid-tone fill. Mapping luminance straight through
     renders it as a dark smudge, so the ramp below lifts and expands it.
"""

from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageOps

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "missouri-float-planner/remotion/public/eddy/eddy-favicon.png"
OUT = ROOT / "eddy-ios/assets"
POLISHED_LIGHT = OUT / "icon-polished-light.png"

SIZE = 1024

# Light appearance is white, matching the website's favicon treatment, so the
# mark reads the same in the App Store listing as it does in a browser tab.
LIGHT_BG = "#FFFFFF"

# Dark appearance is Deep River Teal, the DESIGN.md primary. Not black: the
# otter's outline is near-black itself and would dissolve into it.
DARK_BG = "#0A1F26"

# How much of the icon's width the mark spans. 0.84 keeps ~8% clear on each side,
# which survives the superellipse corner mask without the mark looking inset.
ICON_FILL = 0.84


def artwork() -> Image.Image:
    """The mark, cropped to its own edges."""
    src = Image.open(SRC).convert("RGBA")
    return src.crop(src.getchannel("A").getbbox())


def centred(art: Image.Image, fill: float, background: str | None) -> Image.Image:
    """Scale `art` to `fill` of the canvas width and centre it."""
    width = int(SIZE * fill)
    height = round(art.height * width / art.width)
    scaled = art.resize((width, height), Image.LANCZOS)

    canvas = Image.new("RGBA", (SIZE, SIZE), background or (0, 0, 0, 0))
    canvas.alpha_composite(scaled, ((SIZE - width) // 2, (SIZE - height) // 2))

    # RGB drops the alpha channel entirely, which is the point for `icon.png`.
    return canvas.convert("RGB") if background else canvas


def tinted(art: Image.Image) -> Image.Image:
    """Greyscale mark for iOS 18's tinted home screen."""
    grey = ImageOps.grayscale(art.convert("RGB"))

    # The mark is heavy black linework over mid-tone fills, so its natural
    # luminance range sits low and the tint has almost nothing to work with.
    # Autocontrast expands the range; the floor keeps the outline from becoming
    # pure black, where the system tint cannot show through at all.
    grey = ImageOps.autocontrast(grey, cutoff=1)
    grey = grey.point(lambda v: 40 + v * (255 - 40) // 255)

    out = Image.merge("RGBA", (grey, grey, grey, art.getchannel("A")))
    return centred(out, ICON_FILL, None)


def polished_splash() -> Image.Image:
    """Remove only the edge-connected white card from the polished icon."""
    source = Image.open(POLISHED_LIGHT).convert("RGB")
    filled = source.copy()
    sentinel = (255, 0, 255)
    edge = filled.width - 1
    for corner in ((0, 0), (edge, 0), (0, edge), (edge, edge)):
        if filled.getpixel(corner) != sentinel:
            ImageDraw.floodfill(filled, corner, sentinel, thresh=12)

    hits = None
    for channel, value in zip(filled.split(), sentinel):
        match = channel.point(lambda pixel, wanted=value: 255 if pixel == wanted else 0)
        hits = match if hits is None else ImageChops.multiply(hits, match)

    result = source.convert("RGBA")
    result.putalpha(ImageChops.invert(hits))
    # The splash renders at 220pt; keeping a million-colour 1024px gradient is
    # a megabyte of bundle for detail the screen cannot display. FASTOCTREE
    # preserves the alpha channel while reducing the asset to a compact palette.
    return result.quantize(colors=255, method=Image.FASTOCTREE)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    art = artwork()

    # App icon — opaque, no alpha channel. See rule 1 above. This is also the
    # asset App Store Connect uses for the listing, so it is the white one.
    centred(art, ICON_FILL, LIGHT_BG).save(OUT / "icon.png")

    # iOS 18 dark variant.
    centred(art, ICON_FILL, DARK_BG).save(OUT / "icon-dark.png")

    # iOS 18 tinted variant — alpha retained, the system supplies the backdrop.
    tinted(art).save(OUT / "icon-tinted.png")

    # Splash. Alpha retained so the plugin's backgroundColor shows through and
    # one asset serves both light and dark.
    centred(art, 1.0, None).save(OUT / "splash-icon.png")

    # The App Store icon is the newer polished rendering, but it is opaque by
    # requirement. Cut only its edge-connected white card so one polished RGBA
    # asset can sit on both splash backgrounds without a white square.
    polished_splash().save(OUT / "splash-icon-polished.png", optimize=True)

    for name in ("icon", "icon-dark", "icon-tinted", "splash-icon", "splash-icon-polished"):
        im = Image.open(OUT / f"{name}.png")
        print(f"{name + '.png':20} {im.size[0]}x{im.size[1]}  {im.mode}")


if __name__ == "__main__":
    main()

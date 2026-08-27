#!/usr/bin/env python3
"""Build the Eddy print flyer: generate its QR code, then render PDF + PNG.

The flyer source of truth is `eddy-flyer.html` — edit that by hand. This script
only does the two things that cannot be hand-authored: encoding the QR and
driving a headless browser to produce print output.

    python3 marketing/flyer/build.py            # QR + PDF + PNG
    python3 marketing/flyer/build.py --qr-only  # just regenerate the QR

The QR is generated at error-correction level H (30% recovery) on purpose: a
flyer stapled to a kiosk at a boat ramp gets rained on, sun-faded and thumbed,
and H is the level that still scans through that damage.

Requires a Chromium binary plus:
    pip install segno            # QR encoding — required
    pip install pypdfium2 pillow # PNG preview — optional, skipped if absent
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent

# What the QR encodes: Eddy River Guide on the App Store.
#
# 6794933267 is Eddy's numeric Apple app ID — the same one pinned by the
# offer-code assertion in missouri-float-planner/src/lib/purchase-copy.test.ts.
# It is NOT the bundle identifier (eddy.guide.app); a wrong id here sends a
# printed flyer to somebody else's app, and print cannot be corrected later.
#
# `ct` is Apple's App Analytics campaign token, the App Store's equivalent of
# the utm_campaign the embed widgets set (see src/lib/embed/branding.ts), so
# installs driven by this flyer are separable from organic ones.
QR_TARGET = "https://apps.apple.com/app/id6794933267?ct=ozarks-flyer"

# Near-black from the brand neutral ramp (--color-neutral-900), not #000: the
# whole flyer outlines in this ink and a true black QR reads as a foreign object.
QR_DARK = "#2D2A24"

QR_SVG = HERE / "assets" / "eddy-guide-qr.svg"
FLYER_HTML = HERE / "eddy-flyer.html"
FLYER_PDF = HERE / "eddy-flyer.pdf"
FLYER_PNG = HERE / "eddy-flyer.png"

CHROMIUM_CANDIDATES = (
    "/opt/pw-browsers/chromium/chrome-linux/chrome",
    "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    "chromium",
    "chromium-browser",
    "google-chrome",
)


def find_chromium() -> str:
    for candidate in CHROMIUM_CANDIDATES:
        if candidate.startswith("/"):
            if Path(candidate).exists():
                return candidate
        else:
            found = shutil.which(candidate)
            if found:
                return found
    sys.exit(
        "No Chromium binary found. Set one of: " + ", ".join(CHROMIUM_CANDIDATES)
    )


def build_qr() -> None:
    try:
        import segno
    except ModuleNotFoundError:
        sys.exit("segno is not installed. Run: pip install segno")

    qr = segno.make(QR_TARGET, error="h")
    QR_SVG.parent.mkdir(parents=True, exist_ok=True)
    # border=4 bakes the full quiet zone the QR spec mandates into the SVG
    # itself, so the flyer's white tile only has to supply design margin. Split
    # the two and the padding becomes load-bearing: shrink it for looks and the
    # symbol quietly stops scanning.
    qr.save(
        str(QR_SVG),
        kind="svg",
        scale=10,
        border=4,
        dark=QR_DARK,
        light="#FFFFFF",
        svgclass=None,
        lineclass=None,
    )
    print(f"QR  → {QR_SVG.relative_to(HERE.parent.parent)}  ({qr.designator}, {QR_TARGET})")


def render(chromium: str) -> None:
    url = FLYER_HTML.as_uri()
    common = [
        chromium,
        "--headless",
        "--disable-gpu",
        "--no-sandbox",
        "--hide-scrollbars",
        # file:// → file:// subresource loads (fonts, otter art in ../app-store)
        # are blocked by default in headless Chrome.
        "--allow-file-access-from-files",
        "--force-color-profile=srgb",
        "--font-render-hinting=none",
    ]

    subprocess.run(
        [*common, f"--print-to-pdf={FLYER_PDF}", "--no-pdf-header-footer", url],
        check=True,
        capture_output=True,
    )
    print(f"PDF → {FLYER_PDF.relative_to(HERE.parent.parent)}")


def preview(dpi: int = 150) -> None:
    """Rasterize the PDF we just wrote, rather than taking a second browser shot.

    Chromium's --screenshot pass resolves the page box differently from its
    --print-to-pdf pass, so a browser-rendered preview can crop content the PDF
    places correctly — which is exactly the sort of disagreement a preview is
    supposed to rule out. Rasterizing the PDF makes the preview a view OF the
    print artifact, so it cannot drift from it.
    """
    try:
        import pypdfium2 as pdfium
    except ModuleNotFoundError:
        print("PNG · skipped (pip install pypdfium2 to get a preview)")
        return

    pdf = pdfium.PdfDocument(str(FLYER_PDF))
    if len(pdf) != 1:
        sys.exit(f"{FLYER_PDF.name} is {len(pdf)} pages — the flyer must fit on one.")
    pdf[0].render(scale=dpi / 72).to_pil().save(FLYER_PNG)
    print(f"PNG → {FLYER_PNG.relative_to(HERE.parent.parent)}  ({dpi}dpi of the PDF)")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--qr-only", action="store_true", help="regenerate the QR and stop")
    args = parser.parse_args()

    build_qr()
    if args.qr_only:
        return
    render(find_chromium())
    preview()


if __name__ == "__main__":
    main()

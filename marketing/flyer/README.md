# Eddy print flyer

A one-page US Letter flyer for counters and kiosks — outfitters, campground
offices, gear shops, boat-ramp bulletin boards. It leads with the question a
floater already walked in with ("is the river floatable today?") and answers it
with a QR straight to the iOS app.

| File | What it is |
| --- | --- |
| `eddy-flyer.html` | **The source. Hand-edit this.** Self-contained layout; pulls fonts and otter art from `../app-store/assets/`. |
| `eddy-flyer.pdf` | The print artifact — 1 page, 612×792pt, exactly 8.5×11in. Send this to a printer. |
| `eddy-flyer.png` | 150dpi preview, rasterized from the PDF (not a second browser pass), so it cannot disagree with what prints. |
| `assets/eddy-guide-qr.svg` | Generated. Do not hand-edit — `build.py` owns it. |
| `assets/download-on-app-store.svg` | Apple's badge, copied unaltered from `missouri-float-planner/public/app-store/`. |
| `assets/eddy-boat-ramp.png` | Access icon, copied from `eddy-ios/assets/eddy/`. |

## Building

```sh
pip install segno pypdfium2 pillow      # segno required; the other two are for the preview
python3 marketing/flyer/build.py        # QR + PDF + PNG
python3 marketing/flyer/build.py --qr-only
```

`build.py` only does what cannot be hand-authored — encoding the QR and driving
headless Chromium. It never rewrites the HTML.

## The QR code

It points at **Eddy River Guide on the App Store**:

```
https://apps.apple.com/app/id6794933267?ct=ozarks-flyer
```

- `6794933267` is Eddy's numeric Apple app ID — the same one pinned by the
  offer-code assertion in `missouri-float-planner/src/lib/purchase-copy.test.ts`.
  It is **not** the bundle identifier (`eddy.guide.app`). A wrong id here sends a
  printed flyer to someone else's app, and print cannot be corrected later.
- `ct` is Apple's App Analytics campaign token — the App Store's counterpart to
  the `utm_campaign` the embed widgets set (`src/lib/embed/branding.ts`), so
  installs driven by this flyer are separable from organic ones.
- Error correction is level **H** (30% recovery). A flyer on a kiosk gets rained
  on and sun-faded; H still scans through that.
- Encoded as **version 6** (41 modules), printing at ~1.37in — about **0.85mm
  per module**, well over the ~0.4mm a phone camera needs. Rule of thumb: a
  symbol scans from roughly 10× its own width, so this one is comfortable at
  arm's length and not meant to be read across a room. If you enlarge the flyer
  to poster size, the QR scales with it and gets better, not worse.

**After changing the URL or the QR's printed size, re-verify it decodes.** The
readable "search Eddy River Guide" line beside it is the human fallback and has
to keep naming the same destination the code resolves to:

```sh
python3 - <<'PY'
import cv2, numpy as np, pypdfium2 as pdfium
EXPECTED = "https://apps.apple.com/app/id6794933267?ct=ozarks-flyer"
pdf = pdfium.PdfDocument("marketing/flyer/eddy-flyer.pdf")
det = cv2.QRCodeDetector()
for dpi in (150, 300, 600):                       # real print resolutions
    img = np.array(pdf[0].render(scale=dpi/72).to_pil().convert("RGB"))
    data, _, _ = det.detectAndDecode(cv2.cvtColor(img, cv2.COLOR_RGB2GRAY))
    print(dpi, "PASS" if data == EXPECTED else f"FAIL {data!r}")
PY
```

A scattering of intermediate DPIs (96, 120, 516, 588 at the time of writing)
fail this check while every standard print resolution passes. That is the
detector resampling a vector symbol onto an unlucky pixel grid, not a defect in
the artwork — which is why the check above tests 150/300/600 rather than a sweep.

## Brand sources

Nothing here invents a value. Change it upstream, then re-transcribe:

| What | Source of truth |
| --- | --- |
| Color ramps | `missouri-float-planner/src/app/globals.css` (`:root`) |
| Condition scale colors + labels | `missouri-float-planner/shared/condition-system.ts` (`CONDITION_SYSTEM`, `CONDITION_ORDER`) |
| Fonts (Fredoka / Geist / Geist Mono) | `marketing/app-store/assets/`, shared with `share-card.svg` |
| Otter art | `marketing/app-store/assets/`, `eddy-ios/assets/eddy/` |
| Layout grammar | `marketing/app-store/share-card.svg` — near-black outlines, hard offset shadows, no blur |

The condition strip is the load-bearing one: `condition-system.ts` is the single
source for every condition color Eddy prints or draws, and the flyer's CSS
custom properties are a transcription of its `solid` values. Never pick a
condition color by eye.

## Printing notes

- **Home / office printer:** print at 100% ("actual size"), not "fit to page" —
  fitting shrinks the QR. The cream bleed outside the black frame absorbs the
  ~0.25in unprintable margin, so only bleed gets trimmed, never the frame.
- **Print shop:** the PDF has no crop marks or bleed marks. It is sized to trim,
  so ask for borderless on 8.5×11, or hand them the HTML for a bled version.
- **Black and white:** the condition strip is the one thing that does not
  survive grayscale — the six ratings are distinguished by hue, and Low/Good and
  High/Flood collapse into each other. Print this one in color.

## Facts on the flyer, and where they came from

Everything claimed here is checkable, and a printed claim cannot be walked back:

- **"24 Ozarks float rivers"** — matches `marketing/app-store/LISTING.md` and the
  river count referenced across `missouri-float-planner/src/app/api/`. The
  about page derives its count at runtime, so this can only go stale by
  undercounting as rivers are added.
- **"Free on the App Store"** — the app is free to download; the App Store
  listing confirms price 0.0.
- **"Conditions, float plans, hazards and access maps … free"** — the promise
  `premium-copy.test.ts` enforces in-app and `LISTING.md` repeats on the store
  page. A subscription buys Eddy's written daily report, which this flyer does
  not advertise. Do not add a claim here that those tests do not already back.
- **The safety line** is the same disclaimer as the App Store description. Keep
  it; it is not decoration.

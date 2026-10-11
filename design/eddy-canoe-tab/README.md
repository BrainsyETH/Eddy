# Floats tab artwork

`source.png` is the approved Eddy-in-a-canoe silhouette, with sunglasses and a
bold smile. It was extracted from the approved October 11, 2026 concept using
image generation. The black shape is opaque; facial details, including the
smile, are transparent cutouts. It is an icon template, not a screenshot.

Regenerate the bundled PNGs after installing the web dependencies:

```sh
node eddy-ios/scripts/build-tab-icons.cjs
```

The exports are 32 × 24 points at 1x, 2x and 3x. iOS uses `renderingMode="template"`
so UIKit owns the selected/unselected tint and accessibility appearance.
The non-iOS tab uses the same asset with the tab's supplied `tintColor`.
Do not flatten the cutouts onto a background: that hides the smile when the
theme changes. Neither the master nor this directory is imported by the app.

Before distribution, check the actual native tab on a small iPhone in light and
dark mode, selected and unselected, plus Increase Contrast and Reduce
Transparency. Inspect the smile, tint, and alignment with adjacent icons.

`preview.png` renders the bundled mask at tab size and enlarged in both themes.
Its inactive samples use fallback palette colors; UIKit chooses the actual
inactive tint on iOS. This is an asset preview, not device verification.

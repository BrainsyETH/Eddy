# Floats tab artwork

`source.png` is the Eddy-in-a-canoe silhouette, with sunglasses and a bold
smile. It was adapted from the approved October 11, 2026 concept using image
generation. Following device feedback, the canoe is more compact and Eddy's
head is larger: the original wide illustration looked short next to the other
tab symbols. The black shape is opaque; facial details, including the smile,
are transparent cutouts. It is an icon template, not a screenshot.

Regenerate the bundled PNGs after installing the web dependencies:

```sh
node eddy-ios/scripts/build-tab-icons.cjs
```

The exports are 28 × 28 points at 1x, 2x and 3x, with the artwork contained
proportionally inside a 26 × 26 point box. The exporter rejects overly wide or
tall source compositions, so another wide illustration cannot silently become
a short tab thumbnail. iOS uses `renderingMode="template"`
so UIKit owns the selected/unselected tint and accessibility appearance.
The non-iOS tab uses the same asset with the tab's supplied `tintColor`.
Do not flatten the cutouts onto a background: that hides the smile when the
theme changes. Neither the master nor this directory is imported by the app.

Before distribution, check the actual native tab on a small iPhone in light and
dark mode, selected and unselected, plus Increase Contrast and Reduce
Transparency. Inspect the smile, tint, and alignment with adjacent icons.

`preview.png` compares the previous and corrected bundled masks at tab size
and enlarged in both themes. This is an asset preview, not device verification.

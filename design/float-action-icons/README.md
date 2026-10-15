# Floats action icons

Approved transparent artwork for the Floats hub:

| Source | Action |
| --- | --- |
| `start-float-source.png` | Start a Float — Eddy with a paddle and ripples |
| `build-route-source.png` | Build a Route — Eddy holding a folded route map |
| `find-route-source.png` | Find a Route — plain magnifying glass |

These are the selected original illustrations, not theme-specific backgrounds.
The build script exports their alpha masks into 40-point square canvases at
1x/2x/3x. Artwork is cropped to its visible bounds and contained without stretching.
Eddy fits inside 38 points; the magnifier uses 32 points for visual balance.

Regenerate from the repository root after installing web dependencies:

```sh
node eddy-ios/scripts/build-float-action-icons.cjs
```

`FloatActionIcon` applies the current semantic foreground color, so the same
artwork supports light, dark, and increased contrast without duplicated shapes:
white `onAccent` for the Start button (and Build when Float Mode is disabled),
and `interactive` for Build/Find cards. Transparent cutouts keep Eddy's glasses,
smile, and map legible on each background. Icons are decorative; the surrounding
buttons supply the accessible text. Resume Float keeps its navigation arrow.

`preview.png` compares actual-size and enlarged exports against the current
light/dark and increased-contrast palettes, including Build's filled fallback.
It is an asset appearance reference, not a simulator screenshot. Solid icon
foregrounds clear 5:1 contrast against their surfaces in all shown states.

Appearance checks: inspect the hub in light/dark and increased contrast, with
Float Mode on/off and with an active float. Confirm face/map details, an open
magnifier lens, no stretching/clipping, and large-text label wrapping.

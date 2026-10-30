# Eddy emoji concepts

This folder contains square PNG concept art for Eddy reaction and experience icons.
The images use the existing Eddy mascot artwork as a character reference and are
usually isolated on an off-white background for review. Approved transparent
masters, including Today, retain their alpha channel for app integration.

## Reaction icons

- `eddy-wave.png`
- `eddy-thumbs-up.png`
- `eddy-heart.png`
- `eddy-laugh.png`
- `eddy-thinking.png`
- `eddy-celebrate.png`

Prompts for the planned float recap moods (big water, rain, chilly, scrape,
speed run) are recorded in [float-mood-otters.md](float-mood-otters.md); their
masters are not generated yet. See `docs/float-history-card-plan.md`, phase 4.

## River-experience icons

- `eddy-checking-gauge.png`
- `eddy-paddle-ready.png`
- `eddy-route-planning.png`
- `eddy-safety-first.png`
- `eddy-campfire-chill.png`
- `eddy-high-water-alert.png`
- `eddy-ai-assistant.png`
- `eddy-weather.png`
- `eddy-today.png`
- `eddy-water-droplet.png`
- `eddy-release.png`
- `eddy-water-temperature.png`
- `eddy-inflow.png`
- `eddy-fishery.png`
- `eddy-poi.png`
- `eddy-boat-ramp.png`
- `eddy-other-usgs-gauge.png`
- `eddy-hazard.png`
- `eddy-campground.png`
- `eddy-outfitter.png`
- `eddy-lodging.png`
- `eddy-river.png`
- `eddy-alert-watch.png`
- `eddy-offline-map.png`

## Generated utility icons

Bridge, gravel-bar, dam and Float tools marks are reproducible geometry in
`eddy-ios/scripts/build-eddy-icons.py`. Float tools is a coral wrench crossed
over an Eddy paddle; a toolbox was tried first and read as a briefcase at
button size. The script applies the same utility-symbol
palette, thick outline, transparency, crop, and 300px export template as the
concept-derived icons and writes them directly to `eddy-ios/assets/eddy/`.
Generic Access intentionally reuses `eddy-poi.png`: it is the broad fallback
place category, not a visually distinct facility.

## Dam reading icons

`eddy-release.png` and `eddy-water-temperature.png` are transparent masters
generated with the built-in image-generation tool, using the existing water
droplet, weather, and dam artwork as style references. Release shows water
flowing from a coral spillway; water temperature shows a coral thermometer in
blue waves. They are mascot-free symbols, not Lucide glyphs.

`python3 eddy-ios/scripts/build-eddy-icons.py` preserves their alpha and creates
300px web exports under `missouri-float-planner/public/icons/`. Their `EddyIcon`
roles are `release` and `waterTemperature`, rendered at 32px on dam cards. They
also ship through `EddySymbol` on the iOS dam readings card. Both lake and
below-dam level readings reuse the existing gauge symbol. `eddy-inflow.png`
(an arrow entering water) and `eddy-fishery.png` (a fish) are generated
transparent masters with the same palette, exported for the iOS readings card.

Generation prompts are recorded in [dam-metric-icons.md](dam-metric-icons.md).

## Today — Morning current

`eddy-today.png` is the approved **option A** from the Today tab exploration:
three rounded sun rays, a coral half-sun, and two blue river bands with deep
teal outlines. It was adapted from the approved concept using image generation.
It is the shared full-color brand master, with real transparency between all
six parts. Keep those gaps open; they carry the shape in the monochrome tab.

Regenerate from the repository root:

```sh
python3 eddy-ios/scripts/build-eddy-icons.py
node eddy-ios/scripts/build-tab-icons.cjs
```

The first command needs Pillow and creates matching 300px color exports in
`eddy-ios/assets/eddy/` and `missouri-float-planner/public/icons/`, registered
as `today` in `EddySymbol` and `EddyIcon`. The second needs the installed web
dependencies and creates black alpha templates at 28 × 28 points, with artwork
contained inside 26 × 26 points, at 1x/2x/3x in `eddy-ios/assets/tab-icons/`.
Only those bundled exports are imported by the app.

iOS uses template rendering and the native tab's selected/unselected tint.
Keep the tab monochrome; use the color artwork in ordinary brand-icon slots.
Before distribution, check the native Today tab on a small iPhone in light,
dark, Increase Contrast, and Reduce Transparency, selected and unselected.
Inspect all three rays, both river gaps, and alignment with the other tabs.

## Art direction

- Neo-Brutalist mascot sticker style
- Thick near-black outlines and chunky, readable shapes
- Flat colors centered on `#163F4A`, `#F07052`, `#FAFAFA`, and `#39A0CA`
- Coral blade sunglasses and the established Eddy character design
- One clear action or prop per icon, optimized for small-size recognition
- No words, watermarks, detailed scenery, or photorealistic elements

The Today, AI assistant, weather, water droplet, POI, boat ramp, USGS gauge, hazard,
campground, outfitter, lodging, river, alert/watch, and offline-map icons are mascot-free utility
symbols that use the same palette and bold sticker treatment without depicting
Eddy.

These are source concepts rather than final iOS asset-catalog exports. Final asset
sizes and transparency can be derived after the preferred icons are selected.

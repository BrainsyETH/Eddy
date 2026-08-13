# Verified identifiers — Clearwater Dam tailwater (`swl-clearwater-dam`)

Written **2026-08-13**, retroactively. Clearwater's release was wired to the
Black River by migration `00198` in July 2026, before the tailwater process
existed and before anything read a verification artifact — so its identifiers
reached production without ever being recorded. This file is the record, and
the reason the identifier test checks every tailwater rather than only new ones:
a gate with a hole in it is not a gate.

River-reach identifiers for the Black are in `verified-identifiers-black.md`;
this file covers the dam and the water it controls.

## USACE / CWMS

### `swl-clearwater-dam` — Black River below Clearwater Dam ✅
- CWMS office `SWL`, location `Clearwater_Dam`.
- Registered as a `provider='usace'` gauge station whose `discharge_cfs` is the
  dam's total release, per `00198`.
- **No SWPA code, and that is a fact rather than a gap.** Clearwater is flood
  control with no powerhouse: no turbines, no generation flow, no tailwater
  temperature, no generation schedule. A tailwater with nothing to say about
  generation is a supported shape, not an incomplete one.
- Drainage area at the dam: **UNKNOWN**. Not read off a USACE document, so not
  written here as though it were. `drainage_area_sqmi` on the release station
  stays null, which means `tailwater_gauge_drainage_divergence` cannot evaluate
  this project — correctly silent rather than confidently wrong.

## USGS

### 07063000 — Black River at Poplar Bluff, MO ✅ role: downstream
- Drainage **1,245 sq mi**, verified on the USGS site service 2026-08-13.
- ~40 river miles below the dam.
- The measured agreement that makes it a fair description of this release:
  **3,561 cfs released against 3,380 gauged on 2026-07-27 — about 5% apart.**
  That number is why Clearwater is the calibration reference for how close a
  downstream gauge can sit to a release, and why 33% more drainage does not by
  itself disqualify a gauge.

## DO NOT WIRE

Nothing identified. Recorded explicitly rather than omitted: an absent section
is indistinguishable from an unasked question, and the Bull Shoals artifact
shows what this section looks like when the answer is not empty.

## Not verified — open

- Clearwater Dam's drainage area, from a USACE source.
- Whether any gauge sits between the dam and Poplar Bluff. The reach was
  onboarded before "what is the nearest downstream gauge, and what enters
  before it" was a required question.

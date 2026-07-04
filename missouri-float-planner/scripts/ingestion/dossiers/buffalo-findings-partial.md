# Buffalo River — Partial Research Findings (run 1, incomplete)

> The deep-research workflow (run wf_0588c66d-ee8) gathered and adversarially
> verified these claims, but its **synthesis step failed on a session token
> limit** before writing the dossier JSON. This file salvages what was
> confirmed so run 2 doesn't repeat it. NOT the dossier — the dossier still
> needs assembling once the NPS/USGS calibration pages are captured.

## Verified claims (adversarial 2–3/3 vote)

**Upper reach (Ponca–Pruitt) — float time & season**
- Ponca → Kyle's Landing: **10.7 river miles, ~4–6 hours** (Buffalo Outdoor
  Center). Speed-calibration anchor for the Upper reach.
  https://www.buffaloriver.com/float-the-buffalo/ponca-to-kyles-landing/
- Upper Buffalo floatable season: **March through June**, occasionally into
  July with rain. Confirms the rain-driven, seasonal character. (same source)

**Low-water behavior — QUALITATIVE ONLY (no numeric anchor)**
- When too low to launch at Ponca, outfitter moves put-in 2 mi down to Steel
  Creek (8 mi to Kyle's). **No gauge name, number, or unit stated — reference
  gauge and level UNSTATED.** (same source)

**NPS regulations (authority: NPS – Buffalo National River)**
Source (all): https://www.nps.gov/buff/planyourvisit/river-rules.htm
- PFD (USCG-approved) for every person aboard; **children under 13 must wear
  one** while aboard any vessel.
- **Glass** prohibited within 100 ft of any river/stream (and caves, trails,
  waterways); exceptions for designated campgrounds/picnic sites/vehicles.
- **Polystyrene (Styrofoam)** — cups, plates, coolers, ice chests, containers
  — prohibited while floating/camping, except developed areas.
- Vessels carrying food/beverage must have an attached closable **mesh litter
  bag**; food/beverage kept in sealed cooler or spill-proof container.

## KEY FINDING FOR CALIBRATION STRATEGY (surfaced, not yet resolved)

Outfitter pages describe an **operational daily go/no-go call** ("the GM
decides Ponca vs. Steel Creek each morning by water level"; levels update
every 5 min on the site) rather than publishing **fixed numeric gauge
cutoffs**. Implication: the "research-anchors-the-levels" approach may find
few published numeric threshold anchors on *outfitter* sites for the Buffalo.
The numeric floatability cutoffs almost certainly live on the two authoritative
sources the synthesis step never reached:
  1. NPS river-levels / floatability page (nps.gov/buff) — top priority
  2. USGS "Buffalo National River Floating Conditions" data product
     https://www.usgs.gov/data/buffalo-national-river-floating-conditions-arkansas
Run 2 must target these two pages first and capture their per-gauge floatable
ranges verbatim — that is where the safety-critical anchors are.

## Still entirely missing (for run 2 / manual capture)

- NPS + USGS per-gauge floatable-level guidance (the calibration core)
- Per-reach threshold anchors with datums (none numeric captured yet)
- Access points list, NHD feature id, park-code confirmation (expected `buff`)
- Middle/Lower reach float times; hazards (named rapids, flash-flood specifics)
- Local knowledge / crowding / seasonality beyond the upper reach

Verified gauge site numbers already banked separately in
`verified-identifiers-buffalo.md` (7 USGS stations, primary-source checked).

## Source leads for the NUMERIC anchors (run-2 / next-fetch targets)

Run-1 gap = no numeric per-gauge floatable ranges. Search located exactly which
pages publish them. These are the fetch targets for the numeric thresholds
(all pending — see environment note below):

- **Wild Bill's Outfitter — "River Floating Levels & Guide"**
  https://www.wildbillsoutfitter.com/floating-levels-guides
  (an outfitter page that DOES appear to publish per-gauge numeric floatable
  ranges, unlike buffaloriver.com's operational-call framing — high priority)
- **Buffalo National River Float Guide Dashboard (ArcGIS)**
  https://www.arcgis.com/apps/dashboards/3606e2401fdd428cbbdff9518cbe11af
- **USGS Buffalo River floating-conditions viewers**
  https://wise.er.usgs.gov/dp/buffaloriver/  and  https://ar.water.usgs.gov/buffaloriver/
- **Buffalo National River Partners levels page** https://bnrpartners.org/riverlevels
- **buffaloriverfieldguide.com/float-conditions**

Qualitative confirmation from search (not a numeric anchor, but directional):
the **Upper District is the most level-sensitive** — "too low and you'll drag,
too high and the bluffs become hazardous," and "recommended floating levels are
available by river gauge." Consistent with the rain_flashy classification.

## ENVIRONMENT NOTE (why numeric capture is pending)

As of this run, direct WebFetch from the working environment returns HTTP 403
for nps.gov, usgs.gov/data, AND the outfitter pages — the fetch egress is
degraded, not the sites. WebSearch works; the deep-research workflow's own
agents use a separate fetch path (they read buffaloriver.com successfully in
run 1). So the numeric-anchor capture should be done EITHER by the workflow
agents (run 2, targeting the pages above) OR from an environment whose fetch
egress can reach these domains. Do not conclude the numbers don't exist — they
do; they're just not fetchable from here right now.

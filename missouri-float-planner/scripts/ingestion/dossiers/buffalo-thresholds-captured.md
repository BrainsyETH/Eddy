# Buffalo River — NPS Floatability Chart (captured verbatim)

> Source: Wild Bill's Outfitter "River Floating Levels & Guide"
> https://www.wildbillsoutfitter.com/floating-levels-guides — the page states
> "recommended floating levels by the river gauge … courtesy of NPS." So the
> authority is the **National Park Service**; Wild Bill's republishes it.
> Captured from user-supplied screenshots (IMG_8909 / IMG_8910), 2026-07-03.
> **All values are gage height in FEET.** These are the [signoff] calibration
> anchors — verbatim below, proposed mapping and open decisions after.

## Verbatim (4 gauge/launch reference points)

**Ponca / Steel Creek Launches**
- Very Low: Below 2.0'
- Low but Floatable: 2.0' to 2.4'
- Ample Water for Floating: 2.5' to 4.9'
- Experienced Floaters Only: 5.0' to 6.0'
- Flood Stage, River Closed: Over 6.0'

**Highway 7 Bridge / Pruitt**
- Very Low: Below 4.4'
- Low but Floatable: 4.4' to 4.7'
- Ample Water for Floating: 4.8' to 6.6'
- Experienced Floaters Only: 6.7' to 8.0'
- Flood Stage, River Closed: Over 8.0'

**Grinder's Ferry / Tyler Bend**
- Very Low: Below 3.3'
- Low but Floatable: 3.3' to 3.83'
- Ample Water for Floating: 3.83' to 7.94'
- Experienced Floaters Only: 7.94' to 11.76'
- Flood Stage, River Closed: Over 11.76'

**Dillard's Ferry / Buffalo Point**
- Very Low: Below 2.0'
- Low but Floatable: 2.0' to 3.4'
- Ample Water for Floating: 3.5' to 5.9'
- Experienced Floaters Only: 6.0' to 10.0'
- Flood Stage, River Closed: Over 10.0'

## Proposed mapping → our 7-level river_gauges columns (all ft)

NPS uses **5 float tiers**; we have **6** (too_low / low / good / flowing / high
/ dangerous). NPS "Ample Water for Floating" covers both our `good` and
`flowing`. The chart gives no split point, so `good` collapses to a thin
transitional band between "Low but Floatable" top and "Ample" bottom. Values
below are strictly increasing (passes validate_river_data threshold_order).

| Gauge ref | too_low | low | optimal_min | optimal_max | high | dangerous | binding confidence |
|-----------|---------|-----|-------------|-------------|------|-----------|--------------------|
| Ponca / Steel Creek | 2.0 | 2.4 | 2.5 | 4.9 | 5.0 | 6.0 | **HIGH** → USGS 07055660 (Ponca) |
| Hwy 7 / Pruitt      | 4.4 | 4.7 | 4.8 | 6.6 | 6.7 | 8.0 | gauge # UNVERIFIED (Pruitt/Hwy7) |
| Grinder's Ferry / Tyler Bend | 3.3 | 3.83 | 3.9 | 7.9 | 7.94 | 11.76 | gauge # UNVERIFIED (~St. Joe 07056000?) |
| Dillard's Ferry / Buffalo Point | 2.0 | 3.4 | 3.5 | 5.9 | 6.0 | 10.0 | gauge # UNVERIFIED (~Harriet 07056700?) |

Notes on the mapping:
- **Semantic fit is excellent**: "Experienced Floaters Only" → `high` (use
  caution), "Flood Stage, River Closed" → `dangerous`. The NPS "River Closed"
  cutoff is a real operational closure — the strongest possible `dangerous`
  anchor.
- **Tyler Bend** had coincident boundaries in the source (3.83 top-of-low =
  bottom-of-ample; 7.94 top-of-ample = bottom-of-experienced). Nudged
  optimal_min to 3.9 and optimal_max to 7.9 to keep strict ordering; the raw
  verbatim numbers are preserved above. Confirm at sign-off.

## OPEN DECISIONS for [signoff] before ingest

1. **Datum binding (3 of 4).** Only Ponca→07055660 is high-confidence. Which
   USGS site number does each of Hwy7/Pruitt, Grinder's Ferry/Tyler Bend, and
   Dillard's Ferry/Buffalo Point read against? These launch-area labels are NPS
   reference points, not necessarily our 7 verified gauge names. MUST confirm
   the gauge→number binding before these thresholds can drive a badge (the
   whole point of referenceGaugeIsPolled). The "live interactive map" the page
   links likely names the gauges.
2. **good/flowing split.** Accept the thin-`good`-band collapse (above), or
   define a real good vs. flowing split within "Ample Water" per river.
3. **Second source.** This is NPS-authoritative but a single *published* source
   (via Wild Bill's). Cross-check against the USGS "Buffalo National River
   Floating Conditions" product for independent confirmation of the high/
   dangerous cutoffs (satisfies the two-source rule).

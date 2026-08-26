# Verified Identifiers — Bull Shoals Dam tailwater (White River, AR) · swl-bull-shoals-dam

Primary-source transcription from the CWMS Data API (office **SWL**) and USGS
NWIS, probed live **2026-08-24**. Companion to
`verified-identifiers-tailwater-swl-norfork-dam.md` and
`verified-identifiers-tailwater-swl-table-rock-dam.md`.

This file is the one the `nameplate` comment in `usace-registry.ts` has cited
since 2026-08-12. It was referenced before it was written; this is it.

## Why this dossier exists

The White River below Bull Shoals Dam is being ingested as its own river
(`white`, state AR, `river_type = dam_tailwater`,
`controlling_dam_id = swl-bull-shoals-dam`) rather than as a reach, because
`controlling_dam_id` and `state` are both river-level columns and
`shared/dam-types.ts` already allows it: "a tailwater that is its own river
needs no reach."

## Extent, from the managing agency

**Bull Shoals Dam → Arkansas Highway 58 bridge at Guion**, 90.46 river miles.
Not a product choice — the Arkansas Game & Fish Commission's Bull Shoals
Tailwater page states it manages the trout fishery "from Bull Shoals Dam to
the Arkansas Highway 58 Bridge at Guion." Fetched 2026-08-24.

The figure is the measured length of the NHD slice
`build-tailwater-geometry.ts` emits between those two endpoints, which is what
`rivers.length_miles` carries. It read "~78" here until 2026-08-26 — an estimate
written before the geometry was cut, left standing beside the number the cut
produced. Secondary sources put the trout water at 90–92 miles, which the
measured slice agrees with and the estimate did not.

## CWMS locations (from /locations?office=SWL)

- `Bull_Shoals_Dam` — 36.3657191 / -92.574845. ← registry lat/lon.
- `Bull_Shoals_Dam-Tailwater` — **36.36482056353 / -92.578535671997**.
  ← the `gauge_stations.location` for the release station.
- `Bull_Shoals_Dam-Tailwater_Right_Bank` — 36.3657191 / -92.574845.
- `Bull_Shoals_DO` — 36.365 / -92.575, public-name "White R - Bull Shoals DO".
- `Bull_Shoals_Dam-Tailwater_Radar` — **0.0 / 0.0**. Null island; see caveats.

## Registry series (transcribed verbatim, all probed 2026-08-24)

30-hour window, hourly. Range is over that window, so it spans a full
idle-to-generation cycle.

### release ✅ `Bull_Shoals_Dam.Flow-Res Out.Ave.1Hour.1Hour.Regi-Comp`
- 30 points, **713 → 20,707 cfs**. Last value 20,707 cfs.
### generationFlow ✅ `Bull_Shoals_Dam.Flow-Plant.Ave.1Hour.1Hour.CCP-Comp`
- 30 points, 713 → 20,707 cfs. **Identical to release at full generation** —
  at 20,707 cfs the two agree exactly, because the minimum-flow supplement
  drops to zero while the units run (see below). They are NOT redundant at the
  bottom of the cycle.
### poolElevation ✅ `Bull_Shoals_Dam-Headwater.Elev.Inst.1Hour.0.Decodes-rev` (ft)
- 657.9 ft. (Normal pool was raised 654 → 659 ft in 2013 to support minimum
  flow — the lake level itself is part of the trout-habitat regime.)
### tailwaterElevation ✅ `Bull_Shoals_Dam-Tailwater.Elev-Downstream.Inst.1Hour.0.Decodes-rev` (ft)
- **451 → 458 ft over 30 hours.** Consistent with the 7.67 ft swing measured
  2026-08-12 and recorded in `docs/TAILWATER_PLAN.md`.
### tailwaterTempF ✅ `Bull_Shoals_Dam-Tailwater.Temp-Water.Inst.1Hour.0.Decodes-rev` (F)
- **55.2 °F**, range 55–56 over 30 hours. In late August. The hypolimnetic
  release measured.

## Not in the registry, but verified live and worth having

### `Bull_Shoals_Dam.Flow-Min_Flow.Ave.1Hour.1Hour.Sum-MRandLeak` (cfs)
- 30 points, **0 → 800 cfs**. Reads 0 while generating and 800 while idle.
  The suffix decodes as *minimum release and leakage*.
- This is the Corps' own published minimum flow — the 2009 Minimum Flow
  Initiative floor — as a live series rather than a number in a press release.
  Corroborates the "700–900 cfs" figure reported in secondary sources.
- **It is a floor, not a rating.** It says what the Corps guarantees, not what
  is safe to wade or float. It must not be used as a condition threshold.

## USGS sites below this dam (NWIS, probed 2026-08-24)

The finding that shapes the whole ingest: **there is no USGS discharge or
stage gauge in the Bull Shoals tailwater.** The three sites below the dam are
water-quality monitors.

| Site | Name | Parameters | Latest |
| --- | --- | --- | --- |
| 07054501 | White River at Bull Shoals Dam near Flippin | 00010, 00300 | 12.9 °C, 5.2 mg/L |
| 07054502 | White River below Bull Shoals Dam at Bull Shoals | 00010, 00300 | 13.0 °C, 6.2 mg/L |
| 07054527 | White River below Bull Shoals Dam near Fairview | 00010, 00300 | 13.9 °C, 7.3 mg/L |
| 07057370 | White River near Norfork, AR | **00060, 00065** | 1,940 cfs, 4.69 ft |
| 07060500 | White River at Calico Rock, AR | 00060, 00065, 00010, 00045 | — |

00010 = water temperature, 00300 = dissolved oxygen, 00060 = discharge,
00065 = gauge height, 00045 = precipitation.

**Therefore the release station is the primary gauge**, exactly as
`00198_usace_tailwater_stations.sql` argued for Clearwater: the total release
below a dam IS a river discharge at a point on the river. 07057370 is wired as
`role = 'downstream'` — it sits ~35 river miles down and above the Norfork
confluence, so it measures this reach's water but not at its head.

Note the downstream temperature gradient in the table above: 12.9 → 13.9 °C
over the first few miles. The tailwater warms as it runs, which is why the
angling water has a downstream limit at all.

## Condition rating — NOT FOUND (2026-08-24)

Searched for a citable, location-specific rating mapping release cfs to
wade/float safety. **None exists from any agency.**

- **AGFC Bull Shoals Tailwater page** — fetched and read in full. Management,
  regulations, licensing and the Guion boundary. No cfs figures, no unit
  counts, no wading guidance.
- **AGFC tailwater PDF** (`tp_norforktailwater2010.pdf`) — a map brochure.
  Font-subset graphics, no extractable body text, no numbers.
- **USACE Little Rock water-control site** (`swl-wc.usace.army.mil`, which
  hosts the White River FAQ) — unreachable: DNS timeout, then TLS failure.
  Same class of failure `docs/dam-expansion.md` records for `nwk-wc`.
- **Guide and resort sites** — carry numbers (wade under ~1,000 cfs; 800–2,000
  "ideal"; float above 2,000; ~3,200–3,300 cfs per generator) but are
  commercial, mutually inconsistent, and unreliable: one Taneycomo page claims
  six turbines surge to "up to 1,000 cfs" at a four-unit plant measured at
  6,760 cfs the same day.

**Consequence:** `white` lands `active = false` with all `level_*` NULL and
`condition_rating_source` NULL. `validate_river_data()` raises
`missing_thresholds` at severity **error** for an active river whose primary
gauge has no ladder, so this river cannot be activated until a rating is
sourced and approved. That is the correct outcome, not a gap to paper over.

## Facts

- Nameplate **8 × 340 MW combined**. Unchanged from the 2026-08-12 verification
  recorded in the registry comment; SWPA schedules the same plant against 391.
- `tailwaterFishery: 'trout'` — 55.2 °F in August is the fact itself.
- `generationOnCfs: 100` holds: the observed idle floor is the 800 cfs
  minimum-flow release, 8× above the threshold, and the lowest generating hour
  in the window was far above it.

## Caveats for whoever reads this next

- **CWMS coordinates are not uniformly trustworthy.**
  `Bull_Shoals_Dam-Tailwater_Radar` and `Table_Rock_Dam-Tailwater_Right_Bank`
  publish **0.0 / 0.0**, and `Bull_Shoals_Dam-Tainter_Gate_11` publishes
  longitude `+92.57484444` — the wrong hemisphere. The rule in
  `docs/dam-expansion.md` ("lat/lon from CWMS `/locations`, not a gazetteer")
  still holds for the locations this dossier names, all of which are sane, but
  it is not safe to apply blindly to every row the endpoint returns.
- **The catalog `like` parameter is a regex over the full id and needs a
  trailing `.*`.** `like=Bull_Shoals_Dam` returns `total: 0`;
  `like=Bull_Shoals_Dam.*` returns 220 entries. `fetchCatalog()` in
  `src/lib/usace/resolve.ts` appends it correctly — a hand-probe must too, or
  it will conclude a live project publishes nothing.

# Verified Identifiers — Table Rock Dam tailwater (Lake Taneycomo, MO) · swl-table-rock-dam

Primary-source transcription from the CWMS Data API (office **SWL**) and USGS
NWIS, probed live **2026-08-24**. Companion to the Bull Shoals and Norfork
tailwater dossiers.

`docs/TAILWATER_PLAN.md` names Taneycomo as reach #1 — "the single highest-
demand tailwater in the footprint … already the reason `/dams` exists as a
standalone surface." This is the identifier work for it.

## Extent, and the thing that makes this one different

**Table Rock Dam → Powersite (Ozark Beach) Dam at Forsyth**, ~22 miles.

Taneycomo is not a free-flowing tailwater over that whole distance. It is an
impoundment — Powersite Dam has held it since 1913, and Table Rock was built
on top of it in 1958 — so it behaves as a cold riverine tailwater at the top
and as flatwater at the bottom, with the transition somewhere below Fall Creek.
The riverine, wadeable, trout-managed water is the upper end.

`river_type` is a river-level column, so this row lands **`dam_tailwater`**:
Table Rock's generation is what drives the whole thing, including the lake
level at the Powersite end. A `flatwater` reach for the lower end is the
natural follow-up and is exactly what `river_sections.river_type` is for — the
Black already carries a reach that overrides its river's type.

**Powersite is not in the registry and is not needed for this ingest.** It is
Liberty Utilities', not the Corps' — the registry's Bagnell comment already
names it as "the next dam that will want" a non-CWMS metrics source. It bounds
this river; it does not control it.

## CWMS locations (from /locations?office=SWL)

- `Table_Rock_Dam` — 36.5953888 / -93.3110611. ← registry lat/lon.
- `Table_Rock_Dam-Tailwater` — **36.5950454 / -93.3069401**.
  ← the `gauge_stations.location` for the release station.
- `Table_Rock_Dam-Turbine1..4` — individually located, 36.5961–36.5966 /
  -93.3100 to -93.3102. The four units are separately surveyed.
- `Table_Rock_Dam-House_Unit` — 36.5964138 / -93.3103944.
- `Table_Rock_Dam-Tailwater_Right_Bank` — **0.0 / 0.0**. Null island.
- `Table_Rock_Dam-Tainter_Gate_2` — longitude **-92.3110611**, one degree east
  of every other gate on the same dam. Wrong.

## Registry series (transcribed verbatim, all probed 2026-08-24)

### release ✅ `Table_Rock_Dam.Flow-Res Out.Ave.1Hour.1Hour.Regi-Comp`
- 30 points, **20 → 5,270 cfs**. Last 4,610 cfs.
### generationFlow ✅ `Table_Rock_Dam.Flow-Plant.Ave.1Hour.1Hour.CCP-Comp`
- 30 points, 20 → 5,270 cfs. Last 4,610 cfs. Tracks release exactly — no
  minimum-flow supplement series exists at this project, unlike Bull Shoals.
### poolElevation ✅ `Table_Rock_Dam-Headwater.Elev.Inst.1Hour.0.Decodes-rev` (ft)
- 914.4 ft. (This is the reading `00198_usace_tailwater_stations.sql` warns
  about: a value like this in `gauge_height_ft` would trip the flood-stage
  override in `shared/condition-ladder.ts` and paint the river red. Reservoir
  state stays out of `gauge_readings`.)
### tailwaterElevation ✅ `Table_Rock_Dam-Tailwater.Elev-Downstream.Inst.1Hour.0.Decodes-rev` (ft)
- **703 → 708 ft over 30 hours.** Consistent with the 8.19 ft swing measured
  2026-08-12 in `docs/TAILWATER_PLAN.md` — the largest in the footprint.
### tailwaterTempF ✅ `Table_Rock_Dam-Tailwater.Temp-Water.Inst.1Hour.0.Decodes-rev` (F)
- **53.6 °F**, range 52–54 over 30 hours.

## Also live, not in the registry

- `Table_Rock_Dam-Tailwater.Flow.Inst.1Hour.0.CCP-Comp` — 366 → 6,760 cfs.
  A computed tailwater flow, distinct from `Flow-Res Out`. Not wired; noted so
  the next reader does not rediscover it.
- No `Flow-Min_Flow` series exists at Table Rock. Bull Shoals has one; this
  project does not. Do not assume the minimum-flow programme is uniform across
  the White River projects.

## USGS sites on Taneycomo (NWIS, probed 2026-08-24)

| Site | Name | Parameters | Latest |
| --- | --- | --- | --- |
| 07053450 | White River bl Table Rock Dam near Branson, MO | 00010, 00095, 00300 | 11.9 °C, 5.1 mg/L |
| 07053600 | Lake Taneycomo at School of the Ozarks, MO | 00010, 00095, 00300, **62615** | 12.7 °C, 9.2 mg/L, **701.42 ft** |
| 07053820 | Lake Taneycomo at Ozark Beach Dam, MO | **62615** | **701.00 ft** |
| 07053690 | Turkey Creek near Hollister, MO | 00060, 00065 | tributary |
| 07053810 | Bull Creek near Walnut Shade, MO | 00060, 00065 | tributary |

62615 = lake/reservoir elevation above NGVD 1929.

**Third tailwater, third time: no USGS discharge or stage gauge in the
tailwater itself.** The pattern holds across all three projects. The release
station is the primary gauge.

What Taneycomo has that the other two do not is **lake elevation at both ends**
— 701.42 ft at School of the Ozarks and 701.00 ft at Ozark Beach Dam, a 0.42 ft
difference across roughly 18 miles of impoundment. On a lake that is the
honest surface reading, and the two sites together describe the water better
than either alone. 00095 (specific conductance) is catalogued at two sites but
returned no current values in the probe window — treat as unavailable.

The DO gradient is worth recording: **5.1 mg/L** immediately below Table Rock
against **9.2 mg/L** ten miles down at School of the Ozarks. The release comes
out of the lake oxygen-poor and re-aerates as it runs. That difference is the
argument for carrying DO at more than one point on a tailwater.

## Condition rating — NOT FOUND (2026-08-24)

Searched for a citable, location-specific rating mapping release cfs to
wade/float safety on Taneycomo. **None exists.**

- **MDC** publishes Taneycomo regulations (release all rainbows 12–20" from
  Table Rock Dam to Fall Creek) and prospect reports. No numeric flow rating.
- **USACE** operates a recorded generation line at 417-336-5083 giving lake
  level, units running and current cfs. A phone number is not a rating, and it
  is not machine-readable.
- **Guide and resort sites** carry numbers and are unreliable here in a way
  that can be demonstrated rather than asserted: one claims that with six
  turbines running water surges "up to 1,000 cubic feet per second." Table Rock
  is a **four**-unit plant, and it was measured at **6,760 cfs** on the same day
  that page was read. Both halves of the claim are wrong. This is the single
  clearest reason not to build a safety ladder out of secondary sources.

**Consequence:** `taneycomo` lands `active = false`, all `level_*` NULL,
`condition_rating_source` NULL.

## Facts

- Nameplate **4 × 200 MW combined**. Unchanged.
- `tailwaterFishery: 'trout'` — 53.6 °F at the dam in August.
- `generationOnCfs: 100` holds: observed idle floor 20 cfs, lowest generating
  hour far above 100.

# Big Sugar Creek — Phase 2 research notes (2026-11-02)

Companion to `big-sugar-creek.json` (RESEARCH DRAFT, not signed off). Every
readiness criterion is still `pending`. Nothing was written to a database.

## Overall confidence

- **Gauge identity: high.** USGS metadata, NWPS and moherp all agree on 07188653.
- **Public access at Deep Ford: high.** The MDC place page, the area map PDF and MDC's
  Boat Ramps, Parking Lots and Entry Points layers agree.
- **Corridor: medium.** One public pair is clear. Every upstream put-in rests on historical
  guide text.
- **Calibration: low.** There are no ceiling anchors at all.
- **Hazards: medium-low.** The structures are named, but none is positioned or described for passage.

**Correction to the brief.** The 2026-10-29 MDC Atlas snapshot *does* contain an MDC
access on Big Sugar Creek: **Deep Ford Access** (Area_ID 8512, Boat Ramps layer
36.616707, -94.352531; `agency-gis/2026-10-29/mdc-features.json`, OBJECTID 7). The
features carry no stream name. That is probably why the candidate review did not
associate the access with Big Sugar. MDC's page says
"Big Sugar Creek" and floatmissouri places it at guide mile 20.4.

## Recommended corridor and endpoints

**Deep Ford Access (MDC) → City of Pineville Elk River Access (City/MDC cooperative).**
The trip is about 4.1 mi (moherp trip log, 2014). It runs about 3.9 guide miles on Big Sugar
to the Little Sugar confluence, then 0.26 mi on the Elk. It is the **only** pair with
agency-verified public access at both ends. Its take-out is on Eddy's Elk record, so it
needs connected routing across the confluence. That routing does not exist and must not
be promised until built and validated.

| Endpoint | Guide mi | Status | Evidence |
|---|---|---|---|
| Deep Ford Access | 20.4 | **Public, verified** | MDC page: gravel canoe/kayak launch, parking, no camping, 4 AM–10 PM, launching allowed 24 h |
| City of Pineville Elk River Access | Elk 0.26 | **Public, verified** (already approved on the Elk) | MDC cooperative-access page |
| Cyclone low-water bridge | 14.6 | **Held** | Guide: "best put-in for normal water". 2018 reader comment: private property, restricted parking |
| Powell bridges / Hwy E | 5.5 / 6.0 | **Held** | Guide text only |
| Roller Bridge (Hwy 90 & KK) | 0.0 | **Held, excluded** | High water only |
| Crag O' Lea low-water bridge | 20.9 | **Held** (hazard on the trip) | Guide: "good access"; 2015 article launched here |
| Big Elk Floats & Camping | (Elk) | **Held**, private, published terms | $40/boat Big Sugar shuttle; put-in not named |
| Sugar Island Camp & Canoe | ~22–23 (inferred) | **Held**, private | Site unreachable; no verified terms |
| Big Sugar Creek State Park | — | **Excluded** | Official page lists no creek access. A 2022 report says a launch was only planned |

The longer trips locals run (Cyclone → Pineville, 9.7–9.9 mi; Powell → Cyclone) are
the better product. They cannot be offered until a legal upstream launch is found.

## Rated vs unrated: recommend **unrated** (readings-only, cfs at 07188653)

Trusted anchors exist at the polled gauge, but they are **floors only**.

- moherp OBSERVED: Low begins at **50 cfs**, Good begins at **80 cfs**.
- moherp OBSERVED gives **none** for High, Flood or Poor.

Under `classifyReading`, a ladder with only these two anchors grades every reading from
80 cfs up to the NWS flood-stage override (10 ft ≈ 3,500 cfs) as **"Good"**. This creek
reached action stage (2,190 cfs) and crested at 30,900 cfs in 2013. A "Good" badge in a
rising flash flood is the Wave-1 failure (Gasconade) that the README warns about.

No source gives a floater do-not-float level:

- moherp has no High/Flood rating.
- Big Elk, Shady Beach and MCFA publish no level guidance.
- No American Whitewater reach was found.

The sample is also thin: 7 trip rows from 4 contributors, 2005–2020, none from
July–September. The gauge is about 15 guide miles above Deep Ford. Unrated keeps the
measured discharge, hydrograph and the official flood-stage override, and claims nothing
more. Revisit a rated release once an outfitter or owner do-not-float level exists. The
floors should be re-checked against Eddy `community_reports`.

**Candidate (not ingested) anchors, for a future rated release:** too-low/low boundary
50 cfs and low/good boundary 80 cfs at 07188653. Both are moherp OBSERVED, trusted tier.
Mapping them onto Eddy's `too_low`/`low`/`optimal_min` fields is a sign-off decision.

## Rejected or insufficient numbers

| Number | Source | Why |
|---|---|---|
| Flood 930 / High 410 / Good 171 / Low 70 / Poor 19 cfs | moherp **ESTIMATED** | Rejected by rule: ESTIMATED is never a threshold |
| USGS daily percentiles (e.g. medians of 146 cfs May 1, 11 cfs Oct 1) | USGS stats | Used only to describe seasons; never a threshold |
| Action 8 ft (2,190 cfs); minor 10 ft (3,500); moderate 15 ft (9,400); major 20 ft (19,850) | NWPS BSGM7 | Flood hydrology, cross-check only. The 10 ft override applies automatically. It is not a floater ceiling |
| "4.5 at the gauge"; "over 6–7 at the Powell gauge" for kayak/raft | Ozark Anglers forum (search snippets; page returned 403) | Unreachable, undated, unit unstated (presumably ft) |

## Biggest source disagreements

1. **Cyclone access.** The guide calls it "good access… many floats start here". A 2018
   reader comment on the same page reports private property and restricted parking.
2. **Low/Good boundary.** moherp's observed Good floor is 80 cfs, yet a "Good"
   Deep Ford→Elk trip was logged at 48 cfs. Two 66–81 cfs trips were self-rated "between
   low and good". The lower reach may float at lower Powell readings.
3. **Character.** MCFA calls the creek "spring-fed". The gauge record (about 5–11 cfs in
   autumn, crests above 30,000 cfs) says rain-driven and flashy. `riverType` is
   `rain_flashy` and `isSpringFed` is left null.
4. **"No MDC access"** (brief) vs Deep Ford in the same snapshot (see the correction above).

## Decisions the owner must make

1. Accept **unrated** for the initial release, or hold Big Sugar until a ceiling exists.
2. Choose the corridor shape:
   - (a) build cross-confluence routing for Deep Ford → Pineville;
   - (b) list Big Sugar with Deep Ford as an access but no planner pair (the Cowskin pattern);
   - (c) wait for a legal Cyclone or Powell launch.
3. Confirm Little Sugar 07188838 stays out of `gauges[]` (it enters only in the last 0.26 mi).
4. Confirm the alert counties (McDonald; Barry for the headwaters).
5. Accept 86152947 as the representative NHD id. Big Sugar is mostly artificial-path
   segments in HUC 11070208.

## Questions for a local outfitter or expert

- Where do Big Elk and Sugar Island put private boats in on Big Sugar? Is launching and
  parking at Cyclone or Powell legal and tolerated, and who owns the banks?
- At what Powell reading (cfs or ft) do you stop renting or shuttling Big Sugar for high
  water? At what reading do you call it too low?
- How do you run Crag O' Lea low-water bridge? Which side do you portage, and at what level
  does it become dangerous? Are there other low-water crossings or fences below Deep Ford?
- At the channel split above Pineville (guide mile 23.9), which channel reaches the
  City of Pineville access? Is either blocked by wood?
- How fast does the creek rise after heavy rain upstream (Barry County / Arkansas)?

## Could not reach (blocked or unusable)

- `forums.arkansascanoeclub.com`: DNS blocked in this session. These are the trip reports
  with strainer and Crag O' Lea detail.
- `forums.ozarkanglers.com`: HTTP 403.
- `sugarislandcanoe.com`: proxy refused the connection.
- `paddling.com` and `forums.paddling.com`: paywall redirect.
- Pea Ridge Times on PressReader (2022 state-park launch plans): HTTP 403.
- American Whitewater: gauge page 404, and the search API returns HTML. No Big Sugar reach was found.
- `overpass-api.de`: connection reset. The kumi mirror worked once but timed out on the
  corridor structure query, so OSM corroboration of bridges and the slipway is missing.
- Hipcamp: JavaScript-only.
- The MDC Wildlife Code page fetched was a proposed amendment. Whether a smallmouth special
  management area covers Big Sugar is **unverified** and is not claimed.

## Addendum 2026-11-02: private landings on Big Sugar itself

The owner located Big Rock Park as the Google Maps "Big Rock Camp Grounds" pin
(plus code `8687JMCF+95`, 36.62094, -94.32706). Measured on the TNM mainstem
(headwaters = 0):

| Place | Eddy mile | Distance from channel | Status |
|---|---|---|---|
| Powell Bridge / USGS 07188653 | 25.26 | 29 m / 2 m | Held: no launch source |
| Creekside Campground (274 Creekside Rd, Powell) | ~25.9 | ~100 m (address point) | Held: private, no published terms |
| Big Rock Camp Grounds (Big Rock Park) | 38.97 | 81 m | Held: private, location owner-confirmed |
| MDC Deep Ford Access | 40.45 | 58 m | Public, verified |
| Ables Sugar Island Camp | ~42.5 | ~200 m (address point) | Held: private, no published terms |
| Big Sugar/Little Sugar confluence | 44.06 | — | Elk begins |

Big Rock and Sugar Island share an operator. Published landing terms from that
operator would give single-river pairs the current planner can route:
Big Rock → Deep Ford (~1.5 mi), Deep Ford → Sugar Island (~2 mi) and
Big Rock → Sugar Island (~3.5 mi). That would remove the dependence on the
cross-river Pineville take-out. Address-point positions are approximate;
launch pins still need imagery placement and review.

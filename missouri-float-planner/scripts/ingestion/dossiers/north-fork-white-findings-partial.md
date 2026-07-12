# North Fork River — distilled research (draft, pre-signoff)
Full sourced JSON in the agent task output file (backstop).

## Identity
- MO, Ozarks. spring_fed_float. Class I–II (few III at high water). 109 mi total, ~50 mi floatable (Hwy 76 → Tecumseh).
- GNIS **77861**. HUC 11010006. NHD ComID **7650991** / reachcode 11010006000122 (at Tecumseh gauge); whole-river PID UNKNOWN(toVerify).
- Strongly spring-fed (Blue, North Fork, Rainbow/Double, Althea springs) → stable clear/cold base flow; but flash-flood capable (2017 flood). **Blue Ribbon wild rainbow trout** (Rainbow Spring→Patrick Bridge).

## Gauges (USGS-verified)
- **07057500 North Fork River near Tecumseh** — PRIMARY. 36.62303,-92.24814 NAD83, Ozark Co, drainage 561 sqmi, params 00060(cfs)+00065(ft), NWS LID **TNZM7** (action 18 / minor flood 20 ft — CROSS-CHECK ONLY). Best for lower/main reach; OVER-READS the upper reach (springs enter downstream).
- 07058000 Bryant Creek near Tecumseh — SEPARATE tributary (drainage 570), its own float community; NOT the mainstem. If ever added, needs its own moherp pull.

## Thresholds — rep gauge 07057500, moherp OBSERVED **cfs** (COMPLETE except danger)
- too_low: <285 cfs  | low: 285–475 cfs  | optimal_min: 475, optimal_max: 628 cfs  | high: 628–1000 cfs
- **dangerous: UNKNOWN** — no outfitter/AW/MDC do-not-float number; highest logged trip 1230 cfs rated only "High". Agent proxy ~1000 cfs (LOW confidence). NWS flood 20 ft = cross-check only (~10× floatable stage ~2.3–3.65 ft).
- All bands explicitly moherp OBSERVED (community); estimated rejected. ✅ This is the most complete ladder of the 4.
- ft↔cfs NOT converted (only approx observed pairs: 282≈2.30ft, 564≈2.68, 811≈3.23, 1230≈3.65). Rating-curve URL flagged.

## Access (coords all UNKNOWN — MDC gives directions not lat/lon)
- Upper: Hwy 76 (mi0), Topaz (6.6), Osborn Ford (12.2), Hale Ford (14.8), Hebron MDC (18.7), Twin Bridges (24.1).
- Lower/main: Hammond USFS (29.2, construction?), **The Falls Class I–II ledge (mi36)**, Blair Bridge MDC (39.2), Patrick Bridge MDC (42.1), **Dawt Mill DAM (mi47 — PORTAGE)**, Tecumseh COE (49.5, ≈36.6230,-92.2481 from gauge).

## Services (6 — contacts captured)
- River of Life Farm (Dora — stilted treehouse cabins, ResNexus), Twin Bridges Canoe & Campground (mi24), Pettit's Canoe & Campground (Caulfield — oldest on the river), Sunburst Ranch (Caulfield), Dawt Mill Resort (Tecumseh — historic mill), USFS North Fork Recreation Area (Hammond campground). All outfitter/campground/cabin mixes; lat/lon UNKNOWN (geocode from addresses).

## Sign-off / gaps
- dangerous anchor unsourced (call outfitters for high-water cutoff) — same pattern as James/Elk but here even the outfitters don't publish one.
- Access coords all UNKNOWN; whole-river NHD PID; post-2017 trout-area boundaries.
- NOTE: unlike James/Elk, North Fork's calibration is natively in **cfs** and nearly complete — no unit-mixing problem; just needs the danger cap.

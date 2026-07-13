# Elk River — distilled research (draft, pre-signoff)
Full sourced JSON in the agent task output file (backstop).

## Identity
- MO, Ozarks far-SW (McDonald Co). Class I–II. ~35 mi total; ~20–23 mi floatable (Pineville→OK line).
- GNIS **01092538**. HUC 11070208. NHD = ~100 flowline segments, NO single Permanent_Identifier (representative mainstem PIDs 86154849 / 86155179 / 86154487). Use GNIS or a representative reach as the app id (toVerify).
- Formation: **Big Sugar Creek + Little Sugar Creek at Pineville** (agent CORRECTED my brief's "Indian Creek"; Indian Creek joins downstream ~mi30, ~doubles flow).
- **Hydrology: recommend `rain_flashy`, not spring_fed_float** — clear spring-influenced base flow but strongly flash-flood prone (Big Sugar swings ~20 → 20,000 cfs). Product decision.

## Gauges (USGS-verified)
- **07189000 Elk River near Tiff City** — PRIMARY. 36.63146,-94.58689 NAD83, McDonald Co, drainage 851 sqmi, params 00060(cfs)+00065(ft), NWS LID **TIFM7** (action 13 / minor flood 15 ft — CROSS-CHECK ONLY). ⚠ BIAS: gauge is ~mi45 near OK line, BELOW Indian Creek confluence → OVER-READS the popular Pineville→Noel upper reach.
- 07188653 Big Sugar Creek near Powell — SECONDARY (feeder/tributary, not mainstem). drainage UNKNOWN(toVerify). Do NOT transfer its cfs to the mainstem.
- Indian Creek gauge: CONFLICTING (07188885 near Lanagan vs 07188870 at Anderson) — toVerify.

## Thresholds — rep gauge 07189000, outfitter key in FEET (Elk River Floats Gauge Key PDF)
- too_low ≈ <3.5 ft (≈<238 cfs) — rafts/tubes drag; full 12-mi trip closed
- low ≈ 238 cfs @ 3.56 ft — single moherp OBSERVED "Low", 2010 (STALE)
- optimal_min / optimal_max = **UNKNOWN** — no moherp OBSERVED "Good" on the mainstem; ESTIMATED 482 cfs REJECTED
- high ≈ 6 ft — outfitter closes upper/full trips
- **dangerous ≈ 6 ft+** — outfitter "no watercraft" on upper/full (lower short reach only); recreation anchor, NOT NWS flood (15 ft)
- ESTIMATED rejected: Poor≤66 / Low 250 / Good 482 / High 818 / Flood 3569 cfs

## Access points (coords mostly APPROX/UNKNOWN)
- City of Pineville access (upper); US-71 bridge ~mi24.5; MDC Mount Shira ~mi32; Noel/Shadow Lake (**low-head DAM ~mi35.8 — PORTAGE**); Sycamore Landing (take-out); MDC Cowskin (Hwy 43 ~mi45, at the gauge). Concrete low-water bridge ~mi30.7 hazard.

## Services (7 — all with phone/address/website/booking)
- Elk River Floats (Noel HQ, FareHarbor; runs Wayside/Kozy Kamp/Eagles Nest/Trestle Park), Kozy Kamp (Pineville), Eagles Nest (Noel), Big Elk Floats & Camping (Pineville), River Ranch Resort (Noel — largest, 45+ yr), Shady Beach Campground (Noel), Two Sons Floats & Camping (Noel). Mostly outfitter+campground+cabins.

## Sign-off / gaps
- `rain_flashy` vs spring_fed_float classification (recommend rain_flashy).
- Unit: badge on gage HEIGHT (ft, matches outfitter danger) vs cfs (moherp low). Recommend ft.
- OPTIMAL window unproven (only 1 stale "Low" observed point) — needs calibration or conservative badge.
- Tiff City over-read of the upper reach (quantify).
- NHD single PID; access coords; Big Sugar drainage; Indian Creek gauge id.

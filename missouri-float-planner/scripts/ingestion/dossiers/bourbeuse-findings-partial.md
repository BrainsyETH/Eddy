# Bourbeuse River (MO) — Research Findings (WebSearch tier, run 2)

> **Method note.** Direct page fetch (WebFetch/curl/workflow-fetch) is hard-blocked
> by this environment's egress policy (403 CONNECT). The **WebSearch tool works**,
> and returns a synthesized read of the search index. Everything below was gathered
> that way. Confidence tags:
> - `CONFIRMED-ID` = gauge site#↔name↔NWS-ID cross-checked across ≥2 search results.
> - `SEARCH-DERIVED` = a number that appeared in a search synthesis, single-source,
>   **must be verified against the source page** before it drives live warnings.
> - `PARTIAL` = search returned an incomplete/possibly-conflated set.

## Gauges (CONFIRMED-ID — names/numbers cross-checked; lat/lon still to fetch)

| USGS site | Name | NWS ID | Notes |
|---|---|---|---|
| 07015720 | Bourbeuse River near High Gate, MO | HTGM7 | upper river |
| 07015750 | Bourbeuse River near Owensville, MO | — | upper–mid |
| 07016400 | Bourbeuse River above Union, MO | — | just above Union |
| 07016500 | Bourbeuse River at Union, MO | UNNM7 | Hwy 50 bridge; lower-river reference; params: discharge (00060), gage height (00065), precipitation; record to 1897; Rolla Field Office |

- ⚠️ **"near Noser Mill" (07016000)** — the brief's guess; **search could not confirm this site exists.** Do NOT ingest. Verify separately or drop.
- Still to fetch per gauge: exact lat/lon, datum, current active parameter list.

## Reach anchor — floatability keyed to Union (07016500), UNIT = cfs

`SEARCH-DERIVED, single-source (reads like OzarkAnglers overview), VERIFY`
- `< 40 cfs` — most riffles must be walked
- `40–70 cfs` — riffles runnable with considerable bottom-scraping
- `70–120 cfs` — low but floatable; a few wide riffles scrape
- Normal **Jun–Nov** flow at Union: **60–150 cfs** (low-to-marginal range)
- Typical low flows: **30–60 cfs** (floating difficult)
- **Minimum comfortable ≈ 70 cfs**
- Gauge caveat from source: Union gauge reliable for the entire lower river
  EXCEPT the Noser Mill → Spring Creek stretch runs lower than the rest.
- Reference gauge STATED (Union 07016500); unit STATED (cfs). ✓ meets rules.

## NWS flood categories — Union UNNM7 (PARTIAL — do not treat as danger anchor yet)

`SEARCH-DERIVED, PARTIAL`
- Flood stage ≈ **15 ft**; **minor flooding at ~17 ft** (numbers slightly
  inconsistent in synthesis — 15 vs 17). Clean action/minor/moderate/major
  split NOT obtained. **Needs source-page fetch (water.noaa.gov/gauges/unnm7).**

## Access points + mileage (INCOMPLETE)

- MCFA Bourbeuse page exists (missouricanoe.org/bourbeuse-river/) but the
  mileage table did not surface in snippets. Outfitter identified:
  **Devil's Back Floats** (canoe/kayak/camping on the Bourbeuse).
- Towns along river: Union, Owensville, Sullivan.
- **Open:** full put-in→take-out reach table w/ river-miles + float hours.

## River character (consistent with brief; partly source-touched)

- Slow, low-gradient, extremely meandering tributary of the Meramec; Class I;
  smallmouth/largemouth/catfish/sunfish; fewer crowds than the spring rivers.
- Runoff-influenced, drops into low/marginal float range through summer–fall
  (see cfs bands above). Floatable window skews spring / after rain.
- Named hazards (per brief, not yet source-confirmed): low-water bridges,
  logjams/strainers — common on this river.

## Open questions → next fetch pass (unblocked env)

1. Confirm/deny 07016000 "near Noser Mill"; get lat/lon for all confirmed gauges.
2. Verify the Union cfs floatability bands against the OzarkAnglers source page.
3. Clean NWS UNNM7 flood category set (action/minor/moderate/major in ft).
4. Full MCFA/MDC reach mileage + access-point table with float times.

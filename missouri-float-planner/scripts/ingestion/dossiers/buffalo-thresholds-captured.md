# Buffalo River — NPS Float-Level Thresholds (AUTHORITATIVE, cfs)

> Source: NPS "BUFF Float Guide" official dashboard (nps.maps.arcgis.com,
> app BUFF_Resource_River_Ga...), "Tables & Graphs" tab. Captured from
> user-supplied screenshots (IMG_8913/8914/8915), 2026-07-03/04.
> The dashboard states: "Tables show discharge (cfs) ranges used to determine
> float levels. The USGS gage names above each table are also links [to] …
> discharge (cfs)". So these are **NPS's own float thresholds, per USGS gauge,
> in discharge (cfs)** — the top calibration source, not an outfitter proxy.
> **This SUPERSEDES the Wild Bill's stage (ft) chart** for calibration (see
> reconciliation note below). threshold_unit = **cfs** (poll param 00060).

## NPS float-level tables (verbatim, cfs)

| Gauge (USGS)            | Very Low | Low      | Moderate   | High        | Flood   |
|------------------------|----------|----------|------------|-------------|---------|
| Boxley (07055646)      | < 200    | 200–350  | 350–1500   | 1500–6500   | > 6500  |
| Ponca (07055660)       | < 100    | 100–200  | 200–900    | 900–1600    | > 1600  |
| Pruitt (USGS # TBD)    | < 100    | 100–200  | 200–1000   | 1000–2000   | > 2000  |
| St. Joe (07056000)     | < 40     | 40–200   | 200–3000   | 3000–8000   | > 8000  |
| Harriet (07056700)     | < 60     | 60–200   | 200–3000   | 3000–9370   | > 9370  |

NPS category legend (from the Levels tab): Flood=Red, High=Orange,
Moderate=Green, Low=Blue, Very Low=Black, Equipment Error=Gray.

## Live-dashboard cross-validation (2nd source = NPS's own live readings)

Every gauge's live reading reproduced its NPS category via these cfs tables,
which is the two-source corroboration for the high/dangerous cutoffs:

| Gauge  | Live flow | Live category | Table check |
|--------|-----------|---------------|-------------|
| Boxley | 42.2 cfs  | Very Low      | < 200 ✓ |
| Ponca  | 73.7 cfs  | Very Low      | < 100 ✓ |
| Pruitt | 98.1 cfs  | Very Low      | < 100 ✓ |
| St. Joe| 382 cfs   | Moderate      | 200–3000 ✓ |
| Harriet| 516 cfs   | Moderate      | 200–3000 ✓ |

## Mapping → our 7 levels (cfs) with good/flowing split

NPS "Moderate" = our `good` + `flowing`. Per owner decision, keep them
separate: **good = lower third of Moderate, flowing (ideal) = upper two-thirds**
(best-effort; refine with local knowledge). Columns (all cfs, strictly ordered):

| Reach → gauge | too_low | low | optimal_min | optimal_max | high | dangerous |
|---------------|---------|-----|-------------|-------------|------|-----------|
| Hailstone → Boxley 07055646   | 200 | 350 | 730  | 1500 | 1500 | 6500 |
| Upper → Ponca 07055660        | 100 | 200 | 430  | 900  | 900  | 1600 |
| Middle → St. Joe 07056000     | 40  | 200 | 1130 | 3000 | 3000 | 8000 |
| Lower → Harriet 07056700      | 60  | 200 | 1130 | 3000 | 3000 | 9370 |

- too_low = NPS Very Low upper bound; low = start of Moderate; optimal_min =
  good/flowing split (lower-third point); optimal_max = high = start of NPS
  High; dangerous = NPS Flood (a real "River Closed" closure — strongest
  possible dangerous anchor).
- Pruitt (200–1000 Moderate) is the upper–middle boundary gauge; recorded here
  but the 4 reaches map to Boxley/Ponca/St.Joe/Harriet. Pruitt's USGS number
  still to confirm (not in the verified-7 list).

## Reconciliation: why we dropped the stage (ft) chart

The earlier Wild Bill's chart gave stage (ft) cutoffs (Ponca "Ample 2.5–4.9 ft").
At the live reading Ponca = 3.7 ft would read "Ample/floatable" on that chart,
but NPS's own flow-based product calls 73.7 cfs "Very Low." The ft chart is a
looser, republished secondary; the NPS cfs tables are authoritative AND
self-consistent with the live dashboard. We calibrate in **cfs**. (Keep the ft
chart only as a rough stage cross-reference; do not drive the badge from it.)

## Remaining before ingest
- Confirm the app polls discharge (00060) for all four gauges — it does (USGS
  provider fetches 00060 + 00065). threshold_unit = cfs.
- Find the Pruitt gauge USGS number if a finer upper/middle split is wanted.
- good/flowing split is best-effort — flag for a local-knowledge pass.

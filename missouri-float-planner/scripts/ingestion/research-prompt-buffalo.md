# Research Brief: Buffalo National River (Arkansas) — Onboarding Dossier

> Instance of the river-research template for eddy.guide's Phase 1 pilot.
> Output feeds `scripts/ingestion/dossier.ts` → verification → ingestion.
> For future rivers: copy this file, swap the river-specific sections
> (reaches, known sources, safety profile), keep the rules verbatim.

---

## Mission

Produce a complete, source-cited onboarding dossier for the **Buffalo National
River, Arkansas** — a float-trip conditions platform is adding it as its first
river outside Missouri. The dossier drives (a) live water-condition thresholds
shown to the public, (b) float-time estimates, (c) an AI guide's local
knowledge, and (d) access-point and regulation pages.

**This is safety-relevant research.** The Buffalo is a rain-driven, flashy
river with a real flash-flood fatality history. People will use the resulting
condition badge to decide whether to put a family on the water. Accuracy and
honest uncertainty beat completeness everywhere in this brief.

## Non-negotiable rules

1. **Every fact carries its source URL.** No source, no fact. Prefer primary
   sources (NPS, USGS, AGFC) over blogs; name the outfitter when citing one.
2. **Never invent identifiers.** USGS site numbers, NHD feature IDs, and NPS
   park codes must be transcribed from a page you actually found. If you
   cannot find one, write `UNKNOWN` and add it to `toVerify` — a wrong ID is
   far worse than a missing one.
3. **Capture the reference datum on every water-level number.** Outfitters and
   guides quote levels against different references: a specific USGS gauge in
   feet, CFS, a different gauge than you assume, or their own staff gauge /
   bridge marker. For every threshold statement record: the number, the unit
   (ft vs cfs — never guess), and **which gauge or datum it refers to**,
   quoting the source's own words about the reference. If the source doesn't
   say which gauge, record the number but mark the reference `UNSTATED`.
4. **Corroboration for danger levels.** Any number that would drive the
   `high` or `dangerous` level needs **at least two independent sources**
   (NPS + an outfitter counts; two pages from the same outfitter does not).
   Single-source danger numbers go in with `confidence: low` and a note.
5. **Distinguish what the source said from what you infer.** Interpolations,
   unit conversions, and syntheses are allowed but must be labeled as yours.
6. **Record dates.** Water guidance changes; note when a page was last
   updated if visible, and flag anything that looks stale (pre-2020).

## MANDATORY primary calibration sources — capture BOTH, verbatim, per gauge

These two pages are where the numeric floatable-level anchors actually live.
Run 1 confirmed that **outfitters do NOT publish fixed numeric gauge cutoffs**
— they make a daily operational go/no-go call (e.g. "move Ponca → Steel Creek
this morning"). So the safety-critical `high`/`dangerous`/`too_low` numbers
must come from these two authorities, not outfitter prose. Every research run
MUST fetch and capture both, per gauge, before anything else:

1. **NPS Buffalo National River river-levels / floatability guidance**
   (nps.gov/buff — the "river levels" / district-floatability page, NOT the
   generic paddling pages). Capture the exact gauge→floatable-range statements
   verbatim with the URL. Single most authoritative calibration source.
2. **USGS "Buffalo National River Floating Conditions — Arkansas" data product**
   (https://www.usgs.gov/data/buffalo-national-river-floating-conditions-arkansas
   and its live viewer). USGS publishes its own per-gauge floatability
   thresholds for this river — the independent second source that lets the
   `high`/`dangerous` anchors clear the two-source corroboration bar.

If either page cannot be reached or has no numeric per-gauge ranges, say so
explicitly in `openQuestions` and `toVerify` — do not backfill the gap from
outfitter prose or Ozark assumptions.

## Priority sources (after the two above)

- **NPS — Buffalo National River (nps.gov/buff)**: beyond the river-levels page,
  also capture safety pages (flash-flood guidance), concessioner list,
  regulations (PFDs, glass, camping), closures.
- **USGS**: gauge inventory for the Buffalo — expected sites include Boxley,
  Ponca, Pruitt, Carver, Hasty, St. Joe, Harriet / Buffalo City area. For each:
  site number, exact name, coordinates, parameters (00060 discharge / 00065
  gage height), drainage area, period of record. (Seven site numbers already
  verified in dossiers/verified-identifiers-buffalo.md — cross-check, don't
  re-derive.)
- **American Whitewater (americanwhitewater.org)**: runnable ranges and gauge
  correlations for the upper reaches (Hailstone, Ponca–Kyle's). **Reference
  only — read and cite, do not bulk-copy; their terms prohibit harvesting.**
- **Outfitters/concessioners** (each publishes level guidance and float
  times): Buffalo Outdoor Center (Ponca), Lost Valley Canoe, Buffalo River
  Outfitters (St. Joe), Wild Bill's Outfitter (Yellville/Maumee), Dirst Canoe
  Rental, Silver Hill Canoe. Capture their minimum/ideal/too-high statements
  *with the gauge they reference* and their published trip durations.
- **Arkansas sources**: AGFC access info, arkansas.com trip guides, Buffalo
  River Handbook (Kenneth Smith) if excerpted online, Tim Ernst guides.

## The reaches (research per-section, this is the core)

The Buffalo changes character along its ~135 miles. Structure everything
below by reach. Standard division (adjust if sources use a better one, and
say so):

| Reach | Approx. extent | Expected character |
|---|---|---|
| Hailstone / Upper Wilderness | Boxley area headwaters | Creek run, rain-only, advanced |
| Upper | Ponca → Pruitt (Kyle's, Erbie, Ozark) | The classic: floatable after rain, spring season, Class I–II, flashy |
| Middle | Pruitt → Tyler Bend / Gilbert | Longer season, mellower |
| Lower | Gilbert → Buffalo City (White River) | Near year-round, big pools, flatwater feel |

Per reach, fill:

1. **Representative gauge** — which USGS gauge best reflects floatability on
   this reach, per NPS/outfitter usage ("Ponca gauge" vs "Pruitt gauge" etc.),
   plus any bias notes (tributaries entering between gauge and reach).
2. **Threshold anchors** — every level statement you can find, mapped to:
   `too_low` (not floatable) / `low` (scraping but floatable) / ideal range
   min & max / `high` (caution) / `dangerous` (do not float / park closure
   level). Record each as: level, value, unit, reference gauge, source,
   corroborating sources, confidence. The NPS floatability cutoffs and
   outfitter no-run levels are the anchors that matter most.
3. **Published float times** — put-in → take-out, distance, hours (range if
   given), craft type, source. Get at least: Ponca→Kyle's, Kyle's→Erbie or
   Pruitt, Tyler Bend area trips, and one lower-river trip.
4. **Hydrology character** — spring-fed or rain-driven, typical rain-to-rise
   lag if stated anywhere, how fast it drops after a rise, seasonal window
   (when is it reliably floatable vs rain-dependent).
5. **Hazards** — named rapids (e.g. Gray Rock, Crisis Curve area), flash-flood
   history specifics, strainers, the Hailstone's committing nature. Verbatim
   NPS safety language where available.
6. **Local knowledge** — crowding patterns (Ponca on spring weekends),
   scenery landmarks (Big Bluff, Hemmed-in Hollow), camping norms, water
   temperature, anything an honest local guide would tell a first-timer.

## River-wide items

- **Identity**: NHD Permanent Identifier for the Buffalo River flowline
  (hydro.nationalmap.gov / NHDPlus HR); total river miles; the NPS park code
  (expected `buff` — confirm on nps.gov or the NPS API docs).
- **Jurisdiction**: NPS-managed extent vs. the state-managed headwaters
  (Ozark NF section); regulations list with authority + URL (PFD rules, glass
  ban, permits if any, drone rules, camping); seasonal or event closures;
  Arkansas stream-access law in one paragraph (navigability doctrine — this
  gets reused for every future Arkansas river).
- **Access points**: every named put-in/take-out with GPS if published
  (NPS launch list is authoritative): Boxley, Ponca low-water bridge, Steel
  Creek, Kyle's Landing, Erbie, Ozark, Pruitt, Hasty, Carver, Mt. Hersey,
  Woolum, Tyler Bend, Grinders Ferry, Gilbert, Maumee North/South, Dillard's
  Ferry (Hwy 14), Buffalo Point, Rush, and the White River confluence
  take-outs. Ownership (NPS vs other), fees, ramp vs gravel bar, road notes.
  Coordinates are *proposals* — a human places every point on the map.
- **Weather reference point**: the town best representing river weather
  (candidates: Jasper for upper, Marshall/Yellville for lower — pick one,
  justify).
- **NWS alert search terms**: the Arkansas counties the river runs through
  (expect Newton, Searcy, Marion, Baxter) plus town and river names.

## Output format

Return **one JSON document** matching the field spec below, followed by a
short narrative appendix (max 1 page) covering: overall confidence, the
biggest disagreements between sources, and what a local expert should be
asked to resolve.

```
{
  name, slug: "buffalo", state: "AR", country: "US",
  timezone: "America/Chicago", region, nhdFeatureId, difficultyRating,
  description, riverType: "rain_flashy",
  parkCode, managingAuthority,
  regulations: [{ text, authority, sourceUrl, effectiveDate? }],
  permits: [{ value, source, confidence }],
  accessLaw: { value, source, confidence },
  seasonalClosures: [{ value, source, confidence }],
  gauges: [{ provider: "usgs", siteId, name, lat, lon, paramsAvailable,
             drainageAreaSqMi?, positionRiverMile?, servesSections,
             knownBias? }],
  sections: [{
    slug, name, description,
    putIn: { name, lat?, lon? }, takeOut: { name, lat?, lon? },
    publishedLengthMiles?,
    representativeGauge: { siteId, rationale, knownBias? },
    thresholds: [{ level: too_low|low|optimal_min|optimal_max|high|dangerous,
                   value, unit: ft|cfs, referenceGauge,
                   referenceGaugeIsPolled: true|false,
                   source, corroboratingSources?, confidence }],
    publishedFloatTimes: [{ reachLabel, distanceMiles?, hoursTypical?,
                            hoursLow?, hoursHigh?, vessel?, source }],
    characteristics: { isSpringFed, hydroType, primaryHazards,
                       lowWaterMeaning, risingWaterHazards,
                       rainLagHours?, rainLagNote?, dropRateNote? },
    hazards: [{ value, source, confidence }],
    localKnowledge: [string]
  }],
  accessPoints: [{ name, type, lat?, lon?, ownership?, section?,
                   feeRequired?, notes?, source }],
  weatherPoint: { city, lat, lon },
  alertSearchTerms: [string],
  research: { date, sourcesConsulted: [urls],
              openQuestions: [string], toVerify: [string] }
}
```

## What NOT to do

- Do not average conflicting threshold numbers into one — record both with
  sources and let the calibration review resolve them.
- Do not convert ft↔cfs yourself unless a source provides the rating; if you
  must note an approximate correspondence, label it as inference.
- Do not fill gaps with typical-Ozark assumptions — the whole point of this
  river is that it does NOT behave like a Missouri spring-fed float stream.
- Do not summarize NPS safety language into something softer than the
  original.

# Bourbeuse River (MO) — Partial Research Findings (run 1, URL-discovery only)

> Deep-research run wf_eb1f0b14-4d4: 3 angles, 15 sources fetched, **0 claims
> extracted — every source returned empty**. The fetch egress was fully
> degraded during this run (worse than St. Francis run 1, where a couple
> non-gov pages still extracted). So this file is **URL discovery only**: the
> search phase surfaced real candidate gauge/source URLs, but NOTHING was read
> or verified. Every item below is a LEAD to fetch from an unblocked
> environment — no site number, level, or fact here is confirmed.

## Candidate gauges (from USGS monitoring-location URLs the search returned)

These are the `waterdata.usgs.gov/monitoring-location/USGS-<n>/` URLs surfaced
for "Bourbeuse River" — real USGS URLs, but the pages did not load, so the
name/reach/params of each is UNCONFIRMED. Do NOT ingest until each is opened:

- **07016500** — expected "Bourbeuse River at Union, MO" (long-record lower gauge; NWS **UNNM7** = Union). CANDIDATE.
- **07016400** — CANDIDATE (near Union / upstream).
- **07015000** — CANDIDATE (older/historic record — verify still active).
- **07015720** — CANDIDATE (upper Bourbeuse).
- **07015750** — CANDIDATE (upper Bourbeuse).
- NWS gauge **UNNM7** (Union) — water.noaa.gov/gauges/unnm7 — flood categories not captured.

## Source leads (found by search, NOT read — fetch from unblocked env)

- MDC/MCFA reach + access + mileage: https://missouricanoe.org/bourbeuse-river/
- Ozark Anglers overview: https://forums.ozarkanglers.com/waters/rivers/bourbeuse-river/bourbeuse-river-overview-r398/
- Southwest Paddler (Meramec basin, Bourbeuse): http://southwestpaddler.com/docs/meramec4.html
- Paddle St. Louis trip report (Hwy 44 → Guths Mill Dam): https://paddlestlouis.com/2018/07/29/bourbeuse-river-hwy-44-to-guths-mill-dam/
- Float Missouri outfitter directory: https://www.floatmissouri.com/plan/outfitter/
- Union flood-stage news (emissourian): over-flood-stage-in-Union article (context for danger anchor)

## Status

No dossier written from this run — building a stub from zero extracted content
would be fabrication. When egress recovers, either re-run the harness or fetch
the six source leads directly; targets: confirm the Union gauge (07016500 /
UNNM7) name+params, MCFA mileage table, outfitter floatable-stage guidance, and
NWS UNNM7 flood categories. Bourbeuse character (per the brief, not yet
source-confirmed): slow, meandering, runoff-fed, summer low-water, logjam/
strainer hazards — treat as `spring_fed_float`'s turbid cousin, likely its own
low-gradient profile.

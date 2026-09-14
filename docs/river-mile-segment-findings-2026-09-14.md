# Implausible river-mile segments — what each one actually is

Companion to [`river-access-data-audit-2026-09-14.md`](river-access-data-audit-2026-09-14.md).
Queries and manifests: [`river-access-data-audit-2026-09-14-queries.sql`](river-access-data-audit-2026-09-14-queries.sql).

Migration `20260914175427_a_quoted_mile_answers_to_the_river_line.sql` added
`mileage_segment_implausible`, which now reports three rivers. This note records
what each finding turned out to be, because **the first reading of them was
wrong in a way that would have destroyed good data**, and the next person to
open these findings should not repeat it.

A finding names a **segment**. A segment has two endpoints and a line between
them, so it condemns one of three things — the upstream mile, the downstream
mile, or a coordinate — and the rule cannot tell you which.

## The correction that was nearly made

The audit read the stored-vs-geometry disagreement as a stale mile and proposed
writing Williams Ford Access from `12.20` to ≈`20.80`, derived from its river's
median offset. Every step of that is defensible and the conclusion is wrong.

**The mile is right.** MDC's own description of the access chains the published
index across three consecutive points:

| | published relation | stored |
| --- | --- | --- |
| Big John Access | — | `1.30` |
| Williams Ford Access | 10.9 mi downstream of Big John | `12.20` |
| Moon Valley Access | 10.1 mi downstream of Williams Ford | `22.30` |

`1.30 + 10.9 = 12.20` and `12.20 + 10.1 = 22.30`. The editorial index is
self-consistent and matches the source. Writing `20.80` would have replaced a
correct published mile with a number reverse-engineered from a bad coordinate.

**The coordinate is wrong.** MDC's directions are "From Windyville, take Route
MM **west** 2 miles, then Indian Creek Loop south, then Benton Branch Road
south." The stored point is `(37.68460, -92.88300)` — **2.57 mi east** of
Windyville, on the wrong side. It sits 1.55 line-miles above Moon Valley where
the index needs about ten. Its latitude matches the USGS *Niangua River at
Windyville* gauge (`37.68430556`) to four decimals while its longitude differs
by `0.04°`, which is what a transcription error looks like rather than a
misjudged placement.

**Blocked, deliberately.** The replacement coordinate needs MDC Atlas, the area
PDF at `mdc.mo.gov/media/80138`, or the 2017 area management plan. Every
`mdc.mo.gov` fetch is refused by this environment's egress proxy. A coordinate
inferred from the mile would be circular — the mile is the thing it is supposed
to corroborate — so nothing was written.

One trap worth naming: Eddy's own blog already republishes "mile 12.2", so a web
search for the figure returns Eddy quoting itself. The evidence above is the
MDC **chain**, not the bare number.

## The other findings

None has an isolable bad row, and none should be "fixed" on the strength of the
rule alone.

**niangua — the Bennett Spring cluster** (3 of the river's 4 segments).
Riverfront Campground → Bennett Spring Access → Hidden Valley Outfitters sit at
published miles 30.0 / 30.2 / 30.5 while the line spreads them over 1.5 mi.
Deviations from the river's median offset are +1.61 / +1.07 / +0.60 — all inside
its ordinary spread of −2.16…+1.61. Either the published index rounds hard where
businesses cluster at a state park, or one coordinate is off. The data does not
distinguish those, and three points within half a published mile is exactly where
a one-decimal index is least trustworthy.

**huzzah — Dillard Mill → Highway 49 Bridge.** Stored `0.10` and `0.20` against
1.44 mi of line. Two round numbers at the top of a float read as placeholders
rather than an index. Check whether the Huzzah has a published mile system at
all before assigning one.

**meramec — Campbell Bridge → Riverview Ranch.** 0.20 published against 0.53 of
line. Neither endpoint deviates materially (Campbell Bridge is +0.45 against a
river median of −22.79). The likeliest reading is one-decimal rounding on a short
segment that happens to fall just past the half-mile floor.

## Two pending points fail the same test

`mileage_segment_implausible` only sees `approved` rows, so it cannot warn about
these until they are published — the wrong order. Both are on the upper Niangua,
the same stretch as Williams Ford, and both were in the candidate approval set:

- **Charity Access** — stored `0.10`, geometry mile `6.27`. Deviation ≈ +19
  against the river median. Mile and coordinate cannot both be right.
- **Big John Access** — stored `1.30`, geometry mile `26.27`. The offset matches
  the river, but it sits 20 line-miles below Charity while the index puts them
  1.2 miles apart.

Hold both until the upper-Niangua coordinates are sourced. Run the ratio query
from the appendix over any future approval batch before publishing it; it is one
query and it is the only pre-publication check available.

## What would settle each one

| Finding | Source that settles it |
| --- | --- |
| Williams Ford coordinate | MDC Atlas / `mdc.mo.gov/media/80138` / 2017 area management plan |
| Bennett Spring cluster | The published Niangua float chart, at one-decimal resolution, plus each operator's own stated mile |
| Huzzah top-of-float | Whether a published Huzzah mile index exists; if not, these are geometry miles and should say so |
| Meramec Campbell Bridge | The Meramec float chart; likely no defect |
| Charity / Big John | Same as Williams Ford — the upper-Niangua access coordinates |

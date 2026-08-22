# Dam expansion survey — TVA, Nashville District, Ameren, Powersite

**Status: measurements + decisions, 2026-08-15.** Companion to
`WATER_REGIMES_STRATEGY.md` (why regulated water) and `TAILWATER_PLAN.md`
(what to build next in the Ozarks). This documents a live survey of the three
candidate expansions east and north of the shipped SWPA/CWMS footprint, what
shipped from it, and what was deliberately not built. Everything dated was
measured against the live source that day; re-deriving it costs an afternoon.

**Outcome in one line:** the Nashville District's three Cumberland trout dams
(Wolf Creek, Center Hill, Dale Hollow) are in the registry as of this survey;
TVA is deferred behind two named prerequisites; Ameren's observed half is
already ingestible and its schedule source was unreachable; Powersite is a gap
in Taneycomo's model, not an expansion, and needs a non-CWMS provider design.

---

## 1. Corps of Engineers, Nashville District (LRN) — shipped

### The strategy doc was wrong about LRN

`WATER_REGIMES_STRATEGY.md` said "LRN publishes nothing" (July 2026 survey).
Measured 2026-08-15: **622 locations, 300 flow series, live** — hourly values
stamped the same day. The likely cause of the miss: LRN keys observed series
on NWS handbook station ids (`RWNK2-WOLF_CREEK`), not on project names, so a
probe by dam name finds only forecast series and a probe by the SWL/SWT
naming conventions finds nothing. The doc now carries a dated correction.

### The schedule is a CWMS timeseries — no scraper needed

The finding that decided this expansion. LRN writes its forward release
schedule INTO CWMS as hourly series versioned `celrn-cwms-forecast`:

```
Wolf Creek Dam-Turbines.Flow.Ave.1Hour.1Hour.celrn-cwms-forecast
  121 hourly points on read, ~9 days ahead, ALREADY IN CFS
  2026-08-13 03:00Z  15,840   (full load)
  2026-08-13 05:00Z       0   (units off)
  2026-08-13 17:00Z   3,560   (ramping up)
  2026-08-13 21:00Z  15,560
```

Textbook peaking blocks, per component (`-Turbines`, `-Spillway`,
`-Sluice Gates`, `-Orifice Gates`, plus bare `.Flow` total and `.Flow-In`
inflow forecasts). Compare what SWPA required: an HTML scraper, a weekday
file picker, a fail-closed date check, and a MW→cfs conversion that is ±10%
at steady state and unusable on ramp hours. Here the published quantity IS
cfs — there is no conversion to distrust.

Two hazards for whoever renders this as a schedule:

- **The forecast series retains its past, byte-identical to the observed
  series** (three hours spot-checked exactly equal). Anything reading it must
  slice at *now*, or it presents a plan as a record — the exact violation the
  pattern strip's design exists to prevent.
- **`DamScheduleDay` is SWPA-shaped.** `ScheduledHour.megawatts` is required
  and `isRamp` means "don't trust the cfs estimate" — at LRN there are no
  megawatts and the cfs on a ramp hour is as published as any other. Feeding
  LRN's forecast through `schedule` needs a type change that reaches iOS over
  the wire, which is why v1 ships the verified forecast ids in
  `releaseForecast` and renders no schedule. That follow-up is real design
  work, not transcription.

### Observed series: a third district vocabulary, on split stations

Everything observed is hourly `man-rev` on handbook ids, with **two prefixes
per project** — a tailwater/powerhouse station and a dam/pool station:

| Project | Powerhouse/tailwater station | Dam/pool station | Forecast location |
|---|---|---|---|
| Wolf Creek | `RWNK2-WOLF_CREEK` | `WLCK2-WOLF_CREEK` | `Wolf Creek Dam` |
| Center Hill | `CETT1-CENTER_HILL` | `CEHT1-CENTER_HILL` | `Center Hill Dam` |
| Dale Hollow | `DHTT1-DALE_HOLLOW` | `DLHT1-DALE_HOLLOW` | `Dale Hollow Dam` |

The parameter vocabulary is new again: `Flow-Turbine` (not `Flow-Plant`/
`Flow-Power`), `Elev-Pool` (not `Elev` on `-Headwater`), `Elev-Tail` (not
`Elev-Downstream` on `-Tailwater`), `Temp-Water-Tail`. None of it is in
`resolve.ts` SPECS, and the split-prefix model does not fit `ParamPair`
(which appends a suffix to one location; it cannot swap prefixes). So the
three registry entries enumerate every series explicitly and omit
`cdaLocation`, keeping resolution structurally off — a renamed series 404s
loudly instead of quietly matching the wrong namespace. Teaching the
resolver LRN's vocabulary is its own change, with
`scripts/check-usace-resolver.ts` run before it ships.

Also load-bearing: **`man-rev` is the live version at LRN, not merely the
reviewed one.** `RWNK2`'s `dcp-rev` tailwater stage died 2025-10-24 while
`man-rev` is current. The one exception is tailwater temperature, which
exists only as 30-minute `dcp-rev` (live at Center Hill and Dale Hollow;
Wolf Creek's sensor has been dead since 2022-02).

### Measurements that set the registry values

12 days of hourly `Flow-Turbine` per dam (2026-08-03..15, ~300 points each):

| Dam | Idle hours read | Noise with units off | Smallest real unit-hour | Max observed |
|---|---|---|---|---|
| Wolf Creek | exactly 0 | none | 3,550 cfs | 19,800 cfs |
| Center Hill | exactly 0 | 25–50 cfs occasional | 2,525 cfs | 7,604 cfs |
| Dale Hollow | exactly 0 | 25–50 cfs occasional | 1,580 cfs | 4,870 cfs |

`generationOnCfs: 100` for all three: clears the noise, 15× under the
smallest unit. Tailwater temperature read **50.45 °F (Center Hill)** and
**50.7 °F (Dale Hollow)** on 2026-08-15 — in August, the deep-draw trout
fact measured directly. History depth: `man-rev` served the full 12-day
window, so the pattern-strip cron backfills completely on its first run.

Nameplates (all verified 2026-08-15): Wolf Creek 6×45 = 270 MW (DOE recon
report), Center Hill 3×45 = 135 MW (the "155 MW" in one trade headline was a
projection; the plant profile and the Corps' marker both say 135), Dale
Hollow 3×18 = 54 MW (Corps project history).

Everything is stamped `US/Central` — the Cumberland runs on SWPA's clock, so
none of the Central-day arithmetic in `shared/` changes. This is the single
biggest cost difference from TVA.

### What LRN does NOT give

- **No MW/cfs reference pair.** Cumberland power is marketed by SEPA, which
  publishes no loading page and no project table. `generationReference`
  stays absent; the console renders raw cfs instead of "about N generators'
  worth". The types were built for this absence; the pages are just thinner.
- **No `%-Flood Pool`** at any of the three projects.
- **Five more projects deliberately unwired**: Old Hickory, Cordell Hull,
  Cheatham, Barkley (navigation mainstem — the Arkansas River L&D argument
  applies), Percy Priest (metro reservoir), Laurel (KY, has `Flow-Turbine`
  too). Same discipline as the index: adding one is an argument, not an
  accident.
- **No tailwater links.** The Cumberland, Caney Fork and Obey are not Eddy
  rivers, so the dams stand alone — the registry's "most dams have none"
  case. Onboarding the Caney Fork as a reach is where the LRN forecast work
  would start to pay properly.

### Side finding: TVA is inside LRN's CWMS

LRN's catalog carries `tva-raw` hourly flow at Kentucky, Barkley (canal),
Great Falls and Pickwick, `tva-qpf` 6-hour forecasts, and — more interesting
— **`tva-fct` hourly Energy (MWh) forecasts ~2 days ahead at the Corps'
own Cumberland projects** (`RWNK2-WOLF_CREEK.Energy.Total.1Hour.1Hour.tva-fct`
read to 2026-08-17 on 2026-08-15). TVA dispatches the interconnected system,
and its dispatch forecasts leak into the federal API. Not a substitute for
TVA's own 49-dam schedule, but it corroborates the same lesson as SAM's
`Raw-APCO`/`Raw-GPC`: CWMS aggregates beyond the Corps.

---

## 2. TVA — right prize, wrong timing

Measured 2026-08-15, all from this build environment:

- `www.tva.com/environment/lake-levels/*` → **403** (Cloudflare challenge
  page), with and without a browser user agent, on every dam page tried.
- `api.tva.gov` → **526**.
- The CWMS side channel above is 5 flow series plus energy forecasts — not
  the hourly generation schedule for 49 dams.

A residential connection may fare better, but an ingestion path that needs
residential egress is not an ingestion path — the SWPA scraper's whole
posture (fail closed, government page, no contract) presumed the page would
at least *serve*. TVA ingestion starts as an anti-bot negotiation, for
safety-adjacent data.

Two further costs stack on top, and the second one decides it:

1. **Eastern time.** `CENTRAL_TIME_ZONE` in `shared/dam-schedule-copy.ts`,
   the `scheduleTimeZone?: 'America/Chicago'` literal in `dam-types.ts`, and
   the DST anchoring in `DamPatternDay` all assume one zone. Parameterizing
   is tractable but touches both apps and the wire.
2. **Eddy carries no eastern rivers.** `tailwater` needs a `riverSlug` into
   curated `river_sections`; South Holston or Norris would ship as dam pages
   with no water below them — exactly the lead `TAILWATER_PLAN.md` argues
   against. The curation, not the fetch, is the real cost, and it is the
   same cost that capped the Ozark flagship list at three.

**Verdict: after the timezone parameterization and at least one eastern
reach exist — not before.** When it happens, the LRN work has already built
the "schedule without SWPA's shape" muscle.

---

## 3. Ameren Missouri — Bagnell Dam (Osage) — SOURCE FOUND

**The 503 was a red herring: the legacy `.aspx` app is dead, and its
replacement is a live, unauthenticated JSON API.** Found 2026-08-15 by
following the case-insensitive redirect off the old path
(`apps.ameren.com/hydroelectric/...` lowercase → 301) to the new hydro pages,
whose Angular bundle (`www.ameren.com/hydroelectric/main.*.js`) names the
backend. All verified live with values that cross-check:

```
GET www.ameren.com/api/ameren/Hydroelectric/
  getHeadWaterTailWaterReportData?startDate=MM/DD/YYYY&endDate=…&interval=1h|15m&zone=
    -> [{dateTimeStamp, headWaterLevel, tailWaterLevel, discharge, intakeDO, intakeTDG}]
       hourly AND 15-minute; pool 659.31 ft / tailwater 555.70 ft /
       1,555 cfs read live. Timestamps are America/Chicago LOCAL —
       confirmed against the SHEF feed's GMT stamps (00:00 ↔ 05:00Z,
       identical values).
  getBagnellDamDailyReportData?startDate=…&endDate=…
    -> {dischargeData: hourly cfs,
        levelandFlowData: {hstDamHeadLevelAtMidnight: 705.51,   ← TRUMAN pool
                           damOutflow: 1509.2,                  ← TRUMAN release
                           lakeOzarkInflowYesterday, lakeOzarkInflow7DayAve,
                           prescribedMinFlow: 1142,             ← FERC minimum
                           bagnellDamDischargeYesterday,
                           bagnellDamAnticipatedDischargeToday: 8000}}  ← a PLAN
  getDailyShefitGMTReport?interval=1h|15m
    -> SHEF text (HF/HT/QR), GMT — the NWS-format twin of the first endpoint.
  (Also present, same shape: getkeokukReportData — Ameren's Mississippi
   River plant at Keokuk — and TaumSauk*ReportData.)
```

What this buys, beyond Bagnell itself:

- **Truman completes.** The Kansas City district publishes nothing to CWMS,
  so Eddy's Truman is SWPA-schedule-only. `levelandFlowData` adds an
  observed daily pool level and outflow for it — from Ameren, who watch it
  because it feeds their lake.
- **A forward number exists.** `bagnellDamAnticipatedDischargeToday` is
  Ameren's own stated plan — daily, not hourly, but it is the first
  non-federal published *intent* in the footprint. Future hourly dates
  return null; there is no hourly forward schedule.
- **Water quality on the tailwater** (intake DO and total dissolved gas) —
  no other dam in the registry has either.

Caveats before anyone builds on it: same posture as the SWPA scraper — an
informational endpoint with no version, no contract, and Imperva/Incapsula
in front (it did not challenge plain GETs from this survey's egress, but a
Vercel egress must be tested before committing). And Bagnell is a
NON-FEDERAL dam: the registry is USACE-shaped (office union, CWMS fetch
paths), so carrying it means the same "second provider" design Powersite
needs — this API just makes that design worth doing sooner, since one
provider now covers both a rich Bagnell and the Truman gap.

Warmwater fishery below, so under the dam section's stated tie-breaker (the
wading trout angler wins) it queued behind LRN — correctly, as it turned
out. With LRN shipped, this is the best-value next dam.

---

## 4. Powersite (Ozark Beach) — a gap in Taneycomo, not an expansion

Powersite Dam — Liberty Utilities' Ozark Beach project — holds the bottom of
Lake Taneycomo; Table Rock holds the top. `TAILWATER_PLAN.md` models
Taneycomo as purely Table-Rock-driven, and it is not: stage at Branson is set
by the release into the lake AND the pool Powersite maintains below it. Two
USGS gauges already sit on the lake:

- `07053600` Lake Taneycomo at School of the Ozarks (mid-lake)
- `07053820` Lake Taneycomo at Ozark Beach Dam (at Powersite)

**The blocker is architectural, not data.** The dam layer's metrics are
CWMS-only: `DamSnapshot.metrics` is assembled exclusively from CDA fetches,
and Powersite publishes nothing to CWMS. Giving it a pool-elevation metric
means teaching the dam assembler a second provider (USGS-backed
`DamMetricValue`), which is a design decision about what the registry *is* —
worth its own pass, not a bolt-on. Until then, the honest way to carry
Powersite's effect is through the Taneycomo reach work itself (plan step 4),
where the two lake gauges are ordinary reach gauges — and where the lag
calibration (plan step 1) will need them anyway.

---

## Sequencing decided by this survey

| # | Step | Status |
|---|---|---|
| 1 | LRN trout trio: registry entries, floors, docs, dossiers | **shipped with this survey** |
| 2 | Pattern-strip history accumulating for the three (cron picks them up automatically) | automatic |
| 3 | LRN forecast rendering | **shipped, as windows** — see below |
| 4 | Resolver SPECS: LRN vocabulary + split-prefix locations | **shipped** — `cdaLocations` on the registry, LRN spellings in SPECS (bare `Flow` ranked last), smoke run 2026-08-15: LRN resolves 23/27, the 18 prior dams byte-identical to baseline |
| 5 | Ameren: Bagnell + Truman-completion via the found JSON API | **shipped** — `ameren-bagnell-dam` with live pool/tailwater/discharge, Truman's observed pool+outflow riding along; `amerenMetrics` is the non-CWMS provider shape Powersite will reuse |
| 6 | Powersite: non-CWMS metric provider design; Taneycomo reach carries it meanwhile | with TAILWATER_PLAN step 4 |
| 7 | TVA | after timezone parameterization + first eastern reach |

**How step 3 shipped.** Not through `DamScheduleDay` — its required megawatts
and `isRamp` hedge are SWPA's shape, and widening them would have broken every
shipped iOS build reading `megawatts === 0` (null reads as generating, the
dangerous direction). Instead the forecast rides a NEW optional field,
`DamSnapshot.generationForecast`: contiguous generating/idle **windows in
absolute UTC instants**, built server-side from the `-Turbines` forecast
series with the same `generationOnCfs` floor the observed chip uses. Old
clients ignore the unknown field and keep today's behavior; new clients render
it through `shared/dam-forecast-copy.ts` (day grouping, next-change sentence,
midnight-tonight correction — instants make the DST cases disappear rather
than needing handling). One measured fact underpins the builder: CWMS `Ave`
stamps are **period-ending** — verified by the instantaneous tailwater stage
already being +3.1 ft at the instant of the first nonzero turbine stamp.
"Windows in instants" is also the shape `ScheduleProvider` wants long-term;
SWPA's hour-ending rows are now the source-specific case, not the model.
